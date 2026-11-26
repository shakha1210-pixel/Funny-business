import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
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

function createSessionAtomically(db, input) {
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

    db.prepare(
      'INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?, ?)',
    ).run(input.workspaceId, input.sessionId);

    const change = db.prepare(
      'INSERT INTO change_log(operation_id, event_type, entity_id, created_at) VALUES (?, ?, ?, ?)',
    ).run(input.operationId, 'session.created', input.sessionId, input.createdAt);

    const sequence = Number(change.lastInsertRowid);
    db.prepare(
      'INSERT INTO operation_receipts(operation_id, operation_kind, session_id, change_sequence) VALUES (?, ?, ?, ?)',
    ).run(input.operationId, 'session.create', input.sessionId, sequence);

    db.exec('COMMIT');
    return { sessionId: input.sessionId, changeSequence: sequence, replayed: false };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function withDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'funny-business-sqlite-spike-'));
  const filename = join(directory, 'spike.sqlite');
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return { filename, db: openDatabase(filename) };
}

test('SQLite vertical slice commits atomically and resumes its durable sequence after reopen', async (t) => {
  const { filename, db } = await withDatabase(t);
  t.after(() => {
    try { db.close(); } catch {}
  });

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
  t.after(() => {
    try { reopened.close(); } catch {}
  });

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
  t.after(() => {
    try { db.close(); } catch {}
  });

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
  t.after(() => {
    try { db.close(); } catch {}
  });

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
