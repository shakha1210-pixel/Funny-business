import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const migrationVersion = 1;
const migrationSql = `
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    canonical_path TEXT NOT NULL UNIQUE
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE workspace_sessions (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    PRIMARY KEY (workspace_id, session_id)
  );

  CREATE TABLE change_log (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE operation_receipts (
    operation_id TEXT PRIMARY KEY,
    operation_kind TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    change_sequence INTEGER NOT NULL
  );
`;
const migrationChecksum = createHash('sha256').update(migrationSql).digest('hex');

function openDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const foreignKeys = db.prepare('PRAGMA foreign_keys').get();
  assert.equal(foreignKeys.foreign_keys, 1, 'SQLite foreign-key enforcement must be enabled');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = db.prepare(
    'SELECT checksum FROM schema_migrations WHERE version = ?',
  ).get(migrationVersion);

  if (applied) {
    if (applied.checksum !== migrationChecksum) {
      db.close();
      throw new Error(`Migration ${migrationVersion} checksum mismatch`);
    }
    return db;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(migrationSql);
    db.prepare(
      'INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)',
    ).run(migrationVersion, migrationChecksum, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }

  return db;
}

function createSessionAtomically(db, input, { afterStep, commit = () => db.exec('COMMIT') } = {}) {
  const prior = db.prepare(
    'SELECT session_id, change_sequence FROM operation_receipts WHERE operation_id = ?',
  ).get(input.operationId);

  if (prior) {
    return {
      sessionId: prior.session_id,
      changeSequence: prior.change_sequence,
      replayed: true,
    };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      'INSERT INTO sessions(id, cwd, created_at) VALUES (?, ?, ?)',
    ).run(input.sessionId, input.cwd, input.createdAt);
    afterStep?.('session-inserted');

    db.prepare(
      'INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?, ?)',
    ).run(input.workspaceId, input.sessionId);
    afterStep?.('membership-inserted');

    const change = db.prepare(
      'INSERT INTO change_log(operation_id, event_type, entity_id, created_at) VALUES (?, ?, ?, ?)',
    ).run(input.operationId, 'session.created', input.sessionId, input.createdAt);
    afterStep?.('change-log-inserted');

    const sequence = Number(change.lastInsertRowid);
    db.prepare(
      'INSERT INTO operation_receipts(operation_id, operation_kind, session_id, change_sequence) VALUES (?, ?, ?, ?)',
    ).run(input.operationId, 'session.create', input.sessionId, sequence);
    afterStep?.('receipt-inserted');

    commit();
    return { sessionId: input.sessionId, changeSequence: sequence, replayed: false };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

async function withDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'funny-business-sqlite-spike-'));
  const filename = join(directory, 'spike.sqlite');
  const databases = [];
  const db = openDatabase(filename);
  databases.push(db);
  t.after(async () => {
    for (const database of databases) {
      try { database.close(); } catch {}
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    filename,
    db,
    registerDatabase(database) {
      databases.push(database);
    },
  };
}

test('SQLite vertical slice commits atomically and resumes its durable sequence after reopen', async (t) => {
  const { filename, db, registerDatabase } = await withDatabase(t);

  db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run(
    'workspace-1',
    '/projects/demo',
  );

  const input = {
    operationId: 'op-create-session-1',
    workspaceId: 'workspace-1',
    sessionId: 'session-1',
    cwd: '/projects/demo',
    createdAt: '2026-11-27T00:00:00.000Z',
  };

  const result = createSessionAtomically(db, input);
  assert.equal(result.replayed, false);
  assert.equal(result.changeSequence, 1);

  const retry = createSessionAtomically(db, input);
  assert.deepEqual(retry, { ...result, replayed: true });

  assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM workspace_sessions').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM operation_receipts').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM change_log').get().count, 1);

  db.close();
  const reopened = openDatabase(filename);
  registerDatabase(reopened);

  const receipt = reopened.prepare(
    'SELECT session_id, change_sequence FROM operation_receipts WHERE operation_id = ?',
  ).get(input.operationId);
  assert.equal(receipt.session_id, 'session-1');
  assert.equal(receipt.change_sequence, 1);

  const changes = reopened.prepare(
    'SELECT sequence, operation_id, event_type, entity_id FROM change_log ORDER BY sequence',
  ).all();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].sequence, 1);
  assert.equal(changes[0].operation_id, input.operationId);
  assert.equal(changes[0].event_type, 'session.created');
  assert.equal(changes[0].entity_id, 'session-1');
  assert.equal(
    reopened.prepare('SELECT checksum FROM schema_migrations WHERE version = ?').get(1).checksum,
    migrationChecksum,
  );
});

test('foreign-key failure rolls back every write in the Session transaction', async (t) => {
  const { db } = await withDatabase(t);

  assert.throws(() => createSessionAtomically(db, {
    operationId: 'op-invalid-workspace',
    workspaceId: 'missing-workspace',
    sessionId: 'session-rollback',
    cwd: '/projects/missing',
    createdAt: '2026-11-27T00:00:00.000Z',
  }));

  assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM workspace_sessions').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM operation_receipts').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM change_log').get().count, 0);
});

test('a Session can belong to only one Workspace', async (t) => {
  const { db } = await withDatabase(t);

  db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run('w1', '/p/one');
  db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run('w2', '/p/two');
  db.prepare('INSERT INTO sessions(id, cwd, created_at) VALUES (?, ?, ?)').run(
    'shared-session',
    '/p/one',
    '2026-11-27T00:00:00.000Z',
  );
  db.prepare('INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?, ?)').run(
    'w1',
    'shared-session',
  );

  assert.throws(() => db.prepare(
    'INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?, ?)',
  ).run('w2', 'shared-session'));

  assert.equal(
    db.prepare('SELECT count(*) AS count FROM workspace_sessions WHERE session_id = ?')
      .get('shared-session').count,
    1,
  );
});


test('injected failures at each pre-commit write boundary roll back the whole operation', async (t) => {
  const { db } = await withDatabase(t);
  db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run('w-fault', '/fault');
  const stages = [
    'session-inserted',
    'membership-inserted',
    'change-log-inserted',
    'receipt-inserted',
  ];

  for (const [index, stage] of stages.entries()) {
    assert.throws(() => createSessionAtomically(db, {
      operationId: `op-fault-${index}`,
      workspaceId: 'w-fault',
      sessionId: `s-fault-${index}`,
      cwd: '/fault',
      createdAt: '2026-11-27T00:00:00.000Z',
    }, {
      afterStep(current) {
        if (current === stage) throw new Error(`injected failure at ${stage}`);
      },
    }), new RegExp(stage));

    assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 0);
    assert.equal(db.prepare('SELECT count(*) AS count FROM workspace_sessions').get().count, 0);
    assert.equal(db.prepare('SELECT count(*) AS count FROM operation_receipts').get().count, 0);
    assert.equal(db.prepare('SELECT count(*) AS count FROM change_log').get().count, 0);
  }
});

test('process death before COMMIT leaves no partial rows after SQLite recovery', async (t) => {
  const { filename, db, registerDatabase } = await withDatabase(t);
  db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run('w-crash', '/crash');
  db.close();

  const child = `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(${JSON.stringify(filename)});
    db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
    db.prepare('INSERT INTO sessions(id, cwd, created_at) VALUES (?, ?, ?)')
      .run('s-crash-before-commit', '/crash', '2026-11-27T00:00:00.000Z');
    db.prepare('INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?, ?)')
      .run('w-crash', 's-crash-before-commit');
    db.prepare('INSERT INTO change_log(operation_id, event_type, entity_id, created_at) VALUES (?, ?, ?, ?)')
      .run('op-crash-before-commit', 'session.created', 's-crash-before-commit', '2026-11-27T00:00:00.000Z');
    db.prepare('INSERT INTO operation_receipts(operation_id, operation_kind, session_id, change_sequence) VALUES (?, ?, ?, ?)')
      .run('op-crash-before-commit', 'session.create', 's-crash-before-commit', 1);
    process.exit(71);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], { encoding: 'utf8' });
  assert.equal(result.status, 71, result.stderr);

  const recovered = openDatabase(filename);
  registerDatabase(recovered);
  assert.equal(recovered.prepare('SELECT count(*) AS count FROM sessions').get().count, 0);
  assert.equal(recovered.prepare('SELECT count(*) AS count FROM workspace_sessions').get().count, 0);
  assert.equal(recovered.prepare('SELECT count(*) AS count FROM operation_receipts').get().count, 0);
  assert.equal(recovered.prepare('SELECT count(*) AS count FROM change_log').get().count, 0);
});

test('process death after COMMIT but before notification is recovered from the durable receipt and change log', async (t) => {
  const { filename, db, registerDatabase } = await withDatabase(t);
  db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run('w-postcommit', '/postcommit');
  db.close();

  const child = `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(${JSON.stringify(filename)});
    db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
    db.prepare('INSERT INTO sessions(id, cwd, created_at) VALUES (?, ?, ?)')
      .run('s-postcommit', '/postcommit', '2026-11-27T00:00:00.000Z');
    db.prepare('INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?, ?)')
      .run('w-postcommit', 's-postcommit');
    const change = db.prepare('INSERT INTO change_log(operation_id, event_type, entity_id, created_at) VALUES (?, ?, ?, ?)')
      .run('op-postcommit', 'session.created', 's-postcommit', '2026-11-27T00:00:00.000Z');
    db.prepare('INSERT INTO operation_receipts(operation_id, operation_kind, session_id, change_sequence) VALUES (?, ?, ?, ?)')
      .run('op-postcommit', 'session.create', 's-postcommit', Number(change.lastInsertRowid));
    db.exec('COMMIT');
    process.exit(72);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], { encoding: 'utf8' });
  assert.equal(result.status, 72, result.stderr);

  const recovered = openDatabase(filename);
  registerDatabase(recovered);
  const receipt = recovered.prepare(
    'SELECT session_id, change_sequence FROM operation_receipts WHERE operation_id = ?',
  ).get('op-postcommit');
  assert.equal(receipt.session_id, 's-postcommit');
  assert.equal(receipt.change_sequence, 1);
  assert.equal(recovered.prepare('SELECT count(*) AS count FROM change_log').get().count, 1);

  const replay = createSessionAtomically(recovered, {
    operationId: 'op-postcommit',
    workspaceId: 'w-postcommit',
    sessionId: 's-postcommit',
    cwd: '/postcommit',
    createdAt: '2026-11-27T00:00:00.000Z',
  });
  assert.deepEqual(replay, { sessionId: 's-postcommit', changeSequence: 1, replayed: true });
  assert.equal(recovered.prepare('SELECT count(*) AS count FROM sessions').get().count, 1);
  assert.equal(recovered.prepare('SELECT count(*) AS count FROM change_log').get().count, 1);
});

test('lost COMMIT acknowledgement is resolved by reopening and reading the original operation receipt', async (t) => {
  const { filename, db, registerDatabase } = await withDatabase(t);
  db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run('w-unknown', '/unknown');

  const input = {
    operationId: 'op-unknown-outcome',
    workspaceId: 'w-unknown',
    sessionId: 's-unknown-outcome',
    cwd: '/unknown',
    createdAt: '2026-11-27T00:00:00.000Z',
  };

  assert.throws(() => createSessionAtomically(db, input, {
    commit() {
      db.exec('COMMIT');
      throw new Error('simulated lost COMMIT acknowledgement');
    },
  }), /lost COMMIT acknowledgement/);

  db.close();
  const recovered = openDatabase(filename);
  registerDatabase(recovered);
  const receipt = recovered.prepare(
    'SELECT session_id, change_sequence FROM operation_receipts WHERE operation_id = ?',
  ).get(input.operationId);
  assert.equal(receipt.session_id, input.sessionId);
  assert.equal(receipt.change_sequence, 1);

  const replay = createSessionAtomically(recovered, input);
  assert.deepEqual(replay, {
    sessionId: input.sessionId,
    changeSequence: 1,
    replayed: true,
  });
});
