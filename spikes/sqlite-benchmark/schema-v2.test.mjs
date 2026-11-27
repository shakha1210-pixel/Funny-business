import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const schema = await readFile(new URL("./schema-v2.sql", import.meta.url), "utf8");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  return db;
}

function seedWorkspaceAndSession(db, suffix = "1") {
  db.prepare(`
    INSERT INTO workspaces(id, canonical_path, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run("workspace-" + suffix, "/benchmark/" + suffix, "Workspace " + suffix, 100, 100);
  db.prepare(`
    INSERT INTO sessions(id, cwd, title, created_at, updated_at, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run("session-" + suffix, "/benchmark/" + suffix, "Session " + suffix, 110, 110);
  db.prepare(`
    INSERT INTO workspace_sessions(workspace_id, session_id, attached_at)
    VALUES (?, ?, ?)
  `).run("workspace-" + suffix, "session-" + suffix, 120);
}

test("canonical schema is version 2, strict, and enables foreign keys", () => {
  const db = database();
  try {
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    const tables = db.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => row.name);
    assert.deepEqual(tables, [
      "agent_runs", "change_log", "messages", "operation_receipts",
      "run_events", "sessions", "workspace_sessions", "workspaces",
    ]);
  } finally {
    db.close();
  }
});

test("Workspace path is unique and a Session can belong to at most one Workspace", () => {
  const db = database();
  try {
    seedWorkspaceAndSession(db);
    db.prepare(`
      INSERT INTO workspaces(id, canonical_path, title, created_at, updated_at)
      VALUES ('workspace-2', '/benchmark/2', 'Workspace 2', 100, 100)
    `).run();

    assert.throws(() => db.prepare(`
      INSERT INTO workspaces(id, canonical_path, title, created_at, updated_at)
      VALUES ('workspace-duplicate-path', '/benchmark/1', 'Duplicate', 100, 100)
    `).run());

    assert.throws(() => db.prepare(`
      INSERT INTO workspace_sessions(workspace_id, session_id, attached_at)
      VALUES ('workspace-2', 'session-1', 130)
    `).run());
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM workspace_sessions WHERE session_id = 'session-1'").get().count,
      1,
    );
  } finally {
    db.close();
  }
});

test("messages and AgentRun events enforce domain references and ordered unique event sequences", () => {
  const db = database();
  try {
    seedWorkspaceAndSession(db);
    db.prepare(`
      INSERT INTO agent_runs(id, session_id, operation_id, status, created_at)
      VALUES ('run-1', 'session-1', 'op-run-1', 'queued', 200)
    `).run();
    db.prepare(`
      INSERT INTO messages(id, session_id, run_id, role, content, created_at)
      VALUES ('message-1', 'session-1', 'run-1', 'assistant', 'hello', 210)
    `).run();
    db.prepare(`
      INSERT INTO run_events(id, run_id, sequence, occurred_at, event_type, payload_json)
      VALUES ('event-1', 'run-1', 1, 200, 'queued', '{}')
    `).run();
    db.prepare(`
      INSERT INTO run_events(id, run_id, sequence, occurred_at, event_type)
      VALUES ('event-2', 'run-1', 2, 220, 'started')
    `).run();

    assert.throws(() => db.prepare(`
      INSERT INTO run_events(id, run_id, sequence, occurred_at, event_type)
      VALUES ('event-duplicate-sequence', 'run-1', 2, 230, 'completed')
    `).run());
    assert.throws(() => db.prepare(`
      INSERT INTO messages(id, session_id, run_id, role, content, created_at)
      VALUES ('message-invalid-run', 'session-1', 'missing-run', 'assistant', 'x', 230)
    `).run());
    assert.throws(() => db.prepare(`
      INSERT INTO run_events(id, run_id, sequence, occurred_at, event_type)
      VALUES ('event-invalid-type', 'run-1', 3, 230, 'unknown')
    `).run());
  } finally {
    db.close();
  }
});

test("failed AgentRuns require structured failure details and terminal timestamps cannot precede start", () => {
  const db = database();
  try {
    seedWorkspaceAndSession(db);
    assert.throws(() => db.prepare(`
      INSERT INTO agent_runs(id, session_id, operation_id, status, created_at)
      VALUES ('run-invalid-failure', 'session-1', 'op-invalid-failure', 'failed', 200)
    `).run());

    assert.throws(() => db.prepare(`
      INSERT INTO agent_runs(
        id, session_id, operation_id, status, created_at, started_at, finished_at
      ) VALUES ('run-invalid-time', 'session-1', 'op-invalid-time', 'completed', 200, 240, 230)
    `).run());

    db.prepare(`
      INSERT INTO agent_runs(
        id, session_id, operation_id, status, created_at, started_at, finished_at,
        failure_code, failure_message, failure_retryable
      ) VALUES (
        'run-failed', 'session-1', 'op-failed', 'failed', 200, 210, 220,
        'provider_error', 'Provider failed', 1
      )
    `).run();
  } finally {
    db.close();
  }
});

test("operation receipt must reference the matching committed change-log operation and sequence", () => {
  const db = database();
  try {
    seedWorkspaceAndSession(db);
    const change = db.prepare(`
      INSERT INTO change_log(operation_id, event_type, entity_type, entity_id, created_at)
      VALUES ('op-message-1', 'message.created', 'message', 'message-1', 300)
    `).run();
    const sequence = Number(change.lastInsertRowid);

    db.prepare(`
      INSERT INTO operation_receipts(
        operation_id, operation_kind, session_id, entity_id, change_sequence, created_at
      ) VALUES ('op-message-1', 'message.append', 'session-1', 'message-1', ?, 300)
    `).run(sequence);

    assert.throws(() => db.prepare(`
      INSERT INTO operation_receipts(
        operation_id, operation_kind, session_id, entity_id, change_sequence, created_at
      ) VALUES ('op-message-1', 'message.append', 'session-1', 'message-1', ?, 300)
    `).run(sequence + 1));

    assert.equal(db.prepare("SELECT count(*) AS count FROM operation_receipts").get().count, 1);
  } finally {
    db.close();
  }
});

test("a failed logical write rolls back entity, event, change-log, and receipt rows together", () => {
  const db = database();
  try {
    seedWorkspaceAndSession(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`
        INSERT INTO messages(id, session_id, role, content, created_at)
        VALUES ('message-rollback', 'session-1', 'user', 'hello', 400)
      `).run();
      db.prepare(`
        INSERT INTO change_log(operation_id, event_type, entity_type, entity_id, created_at)
        VALUES ('op-rollback', 'message.created', 'message', 'message-rollback', 400)
      `).run();
      throw new Error("injected failure before receipt");
    } catch (error) {
      db.exec("ROLLBACK");
      assert.match(error.message, /injected failure/);
    }

    for (const table of ["messages", "change_log", "operation_receipts"]) {
      assert.equal(db.prepare("SELECT count(*) AS count FROM " + table).get().count, 0, table);
    }
  } finally {
    db.close();
  }
});
