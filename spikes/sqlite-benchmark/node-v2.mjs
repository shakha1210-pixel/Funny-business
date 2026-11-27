/**
 * SQLite benchmark v2 Node adapter.
 *
 * Executes the versioned adapter-neutral mixed workload against the canonical
 * benchmark-only schema. It does not touch production persistence.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createMixedOperations, createWorkloadDescriptor } from "./workload-v2.mjs";

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

async function fileBytes(path) {
  try { return (await stat(path)).size; } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

function insertSeed(db, dataset) {
  const now = 1_700_000_000_000;
  const insertWorkspace = db.prepare(
    "INSERT INTO workspaces(id, canonical_path, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertSession = db.prepare(
    "INSERT INTO sessions(id, cwd, title, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, 'active')",
  );
  const attachSession = db.prepare(
    "INSERT INTO workspace_sessions(workspace_id, session_id, attached_at) VALUES (?, ?, ?)",
  );
  const insertMessage = db.prepare(
    "INSERT INTO messages(id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertRun = db.prepare(
    "INSERT INTO agent_runs(id, session_id, operation_id, status, created_at, started_at, finished_at) VALUES (?, ?, ?, 'completed', ?, ?, ?)",
  );
  const insertEvent = db.prepare(
    "INSERT INTO run_events(id, run_id, sequence, occurred_at, event_type, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    for (let w = 0; w < dataset.workspaceCount; w += 1) {
      const workspaceId = `workspace-${w}`;
      insertWorkspace.run(workspaceId, `/benchmark/workspace-${w}`, `Workspace ${w}`, now, now);
      for (let s = 0; s < dataset.sessionsPerWorkspace; s += 1) {
        const sessionId = `${workspaceId}-session-${s}`;
        insertSession.run(sessionId, `/benchmark/workspace-${w}`, `Session ${s}`, now, now, "active");
        attachSession.run(workspaceId, sessionId, now);
        for (let m = 0; m < dataset.messagesPerSession; m += 1) {
          insertMessage.run(
            `${sessionId}-message-${m}`, sessionId, m % 2 ? "assistant" : "user",
            m % 2 ? "a".repeat(dataset.assistantMessageBytes) : "u".repeat(dataset.userMessageBytes),
            now + m,
          );
        }
        for (let r = 0; r < dataset.runsPerSession; r += 1) {
          const runId = `${sessionId}-run-${r}`;
          const runTime = now + dataset.messagesPerSession + r * 3;
          insertRun.run(runId, sessionId, `seed-run-op-${runId}`, runTime, runTime, runTime + 2);
          for (const [index, eventType] of ["queued", "started", "completed"].entries()) {
            insertEvent.run(
              `${runId}-event-${index + 1}`, runId, index + 1, runTime + index,
              eventType, JSON.stringify({ seed: true, payload: "e".repeat(dataset.eventPayloadBytes) }),
            );
          }
        }
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function createExecutor(db) {
  const statements = {
    workspaceRead: db.prepare("SELECT id, title, updated_at FROM workspaces WHERE id = ?"),
    sessionRead: db.prepare("SELECT id, title, status, updated_at FROM sessions WHERE id = ?"),
    messageRead: db.prepare("SELECT id, role, content, created_at FROM messages WHERE id = ? AND session_id = ?"),
    runFeed: db.prepare(
      "SELECT id, sequence, event_type, occurred_at FROM run_events WHERE run_id = ? ORDER BY sequence LIMIT ?",
    ),
    workspaceRename: db.prepare("UPDATE workspaces SET title = ?, updated_at = ? WHERE id = ?"),
    sessionRename: db.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?"),
    messageInsert: db.prepare(
      "INSERT INTO messages(id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ),
    runInsert: db.prepare(
      "INSERT INTO agent_runs(id, session_id, operation_id, status, created_at) VALUES (?, ?, ?, 'queued', ?)",
    ),
    runUpdate: db.prepare(
      "UPDATE agent_runs SET status = ?, started_at = ?, finished_at = ? WHERE id = ? AND session_id = ?",
    ),
    eventInsert: db.prepare(
      "INSERT INTO run_events(id, run_id, sequence, occurred_at, event_type, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    changeInsert: db.prepare(
      "INSERT INTO change_log(operation_id, event_type, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ),
    receiptInsert: db.prepare(
      "INSERT INTO operation_receipts(operation_id, operation_kind, session_id, entity_id, change_sequence, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ),
  };

  function recordMutation(operation, { kind, eventType, entityType, entityId, sessionId, now }) {
    const change = statements.changeInsert.run(operation.operationId, eventType, entityType, entityId, now);
    statements.receiptInsert.run(
      operation.operationId, kind, sessionId, entityId, Number(change.lastInsertRowid), now,
    );
  }

  return (operation) => {
    const now = Date.now();
    switch (operation.type) {
      case "workspace.read":
        statements.workspaceRead.get(operation.workspaceId);
        return "read";
      case "session.read":
        statements.sessionRead.get(operation.sessionId);
        return "read";
      case "message.read":
        statements.messageRead.get(operation.messageId, operation.sessionId);
        return "read";
      case "run.feed.read":
        statements.runFeed.all(operation.runId, operation.limit);
        return "read";
      case "workspace.rename":
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = statements.workspaceRename.run(operation.title, now, operation.workspaceId);
          if (Number(result.changes) !== 1) throw new Error("workspace rename target missing");
          const sessionId = `${operation.workspaceId}-session-0`;
          recordMutation(operation, {
            kind: "workspace.rename", eventType: "workspace.renamed",
            entityType: "workspace", entityId: operation.workspaceId, sessionId, now,
          });
          db.exec("COMMIT");
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
        return "write";
      case "session.rename":
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = statements.sessionRename.run(operation.title, now, operation.sessionId);
          if (Number(result.changes) !== 1) throw new Error("session rename target missing");
          recordMutation(operation, {
            kind: "session.rename", eventType: "session.renamed",
            entityType: "session", entityId: operation.sessionId, sessionId: operation.sessionId, now,
          });
          db.exec("COMMIT");
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
        return "write";
      case "message.append":
        db.exec("BEGIN IMMEDIATE");
        try {
          statements.messageInsert.run(
            operation.messageId, operation.sessionId, operation.role, operation.content, now,
          );
          recordMutation(operation, {
            kind: "message.append", eventType: "message.created",
            entityType: "message", entityId: operation.messageId, sessionId: operation.sessionId, now,
          });
          db.exec("COMMIT");
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
        return "write";
      case "run.lifecycle.append":
        db.exec("BEGIN IMMEDIATE");
        try {
          statements.runInsert.run(operation.runId, operation.sessionId, operation.operationId, now);
          statements.eventInsert.run(
            `${operation.runId}-event-1`, operation.runId, 1, now, "queued",
            JSON.stringify({ payload: operation.eventPayload }),
          );
          statements.runUpdate.run("running", now + 1, null, operation.runId, operation.sessionId);
          statements.eventInsert.run(
            `${operation.runId}-event-2`, operation.runId, 2, now + 1, "started", null,
          );
          statements.runUpdate.run("completed", now + 1, now + 2, operation.runId, operation.sessionId);
          statements.eventInsert.run(
            `${operation.runId}-event-3`, operation.runId, 3, now + 2, "completed", null,
          );
          recordMutation(operation, {
            kind: "run.lifecycle.append", eventType: "agent_run.completed",
            entityType: "agent_run", entityId: operation.runId, sessionId: operation.sessionId, now: now + 2,
          });
          db.exec("COMMIT");
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
        return "write";
      default:
        throw new Error(`unsupported workload operation: ${operation.type}`);
    }
  };
}

async function main() {
  const iterations = Number(arg("iterations", "5000"));
  const warmup = Number(arg("warmup", "500"));
  const seed = arg("seed", "funny-business-sqlite-v2-v1");
  const synchronous = arg("synchronous", "FULL").toUpperCase();
  if (!Number.isSafeInteger(iterations) || iterations < 1 ||
      !Number.isSafeInteger(warmup) || warmup < 0 ||
      !["FULL", "NORMAL"].includes(synchronous)) {
    throw new Error("iterations must be positive, warmup non-negative, and synchronous FULL|NORMAL");
  }

  const descriptor = createWorkloadDescriptor({ seed });
  const operations = createMixedOperations({ count: iterations + warmup, seed });
  const directory = await mkdtemp(join(tmpdir(), "funny-business-sqlite-v2-"));
  const filename = join(directory, "benchmark.sqlite");
  const walFilename = filename + "-wal";
  let db;
  try {
    const schema = await readFile(new URL("./schema-v2.sql", import.meta.url), "utf8");
    const openStarted = performance.now();
    db = new DatabaseSync(filename);
    db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = ${synchronous};`);
    db.exec(schema);
    const openMs = performance.now() - openStarted;
    insertSeed(db, descriptor.dataset);
    const execute = createExecutor(db);

    for (let i = 0; i < warmup; i += 1) execute(operations[i]);
    const receiptsBefore = db.prepare("SELECT count(*) AS count FROM operation_receipts").get().count;
    const changesBefore = db.prepare("SELECT count(*) AS count FROM change_log").get().count;
    const dbBytesBefore = await fileBytes(filename);
    const walBytesBefore = await fileBytes(walFilename);
    const memoryBefore = process.memoryUsage().rss;
    const cpuBefore = process.cpuUsage();
    const readSamples = [];
    const writeSamples = [];
    const operationSamples = [];
    const counts = { read: 0, write: 0 };
    const benchmarkStarted = performance.now();

    for (let i = warmup; i < operations.length; i += 1) {
      const operation = operations[i];
      const started = performance.now();
      const kind = execute(operation);
      const elapsed = performance.now() - started;
      operationSamples.push(elapsed);
      counts[kind] += 1;
      (kind === "read" ? readSamples : writeSamples).push(elapsed);
    }

    const totalMs = performance.now() - benchmarkStarted;
    const dbBytesAfter = await fileBytes(filename);
    const walBytesAfter = await fileBytes(walFilename);
    const memoryAfter = process.memoryUsage().rss;
    const cpu = process.cpuUsage(cpuBefore);
    const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
    const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
    const receipts = db.prepare("SELECT count(*) AS count FROM operation_receipts").get().count;
    const changeRows = db.prepare("SELECT count(*) AS count FROM change_log").get().count;
    const checkpointStarted = performance.now();
    const checkpoint = db.prepare("PRAGMA wal_checkpoint(PASSIVE)").get();
    const checkpointMs = performance.now() - checkpointStarted;

    if (integrity !== "ok" || foreignKeyViolations.length !== 0) {
      throw new Error("SQLite integrity validation failed");
    }
    const measuredReceipts = receipts - receiptsBefore;
    const measuredChanges = changeRows - changesBefore;
    if (receipts !== changeRows || counts.write !== measuredReceipts || measuredReceipts !== measuredChanges) {
      throw new Error(`receipt/change-log mismatch: measuredWrites=${counts.write}, measuredReceipts=${measuredReceipts}, measuredChanges=${measuredChanges}`);
    }

    const result = {
      benchmark: "sqlite-mixed-application-v1",
      contractVersion: descriptor.contractVersion,
      workload: descriptor.workload,
      workloadFingerprint: descriptor.fingerprint,
      seed: descriptor.seed,
      dataset: descriptor.dataset,
      operationMix: descriptor.operationMix,
      transactionPolicy: descriptor.transactionPolicy,
      adapter: "node:sqlite DatabaseSync",
      executionMode: "main-thread-sync",
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      journal: "WAL",
      synchronous,
      iterations,
      warmup,
      openMs: Number(openMs.toFixed(3)),
      totalMs: Number(totalMs.toFixed(3)),
      operationsPerSecond: Number((iterations / (totalMs / 1000)).toFixed(1)),
      operationCounts: counts,
      latencyMs: {
        operation: { p50: percentile(operationSamples, 0.5), p95: percentile(operationSamples, 0.95), p99: percentile(operationSamples, 0.99) },
        read: { p50: percentile(readSamples, 0.5), p95: percentile(readSamples, 0.95), p99: percentile(readSamples, 0.99) },
        write: { p50: percentile(writeSamples, 0.5), p95: percentile(writeSamples, 0.95), p99: percentile(writeSamples, 0.99) },
      },
      storageBytes: { databaseBefore: dbBytesBefore, databaseAfter: dbBytesAfter, walBefore: walBytesBefore, walAfter: walBytesAfter },
      checkpoint: {
        mode: "PASSIVE",
        durationMs: Number(checkpointMs.toFixed(3)),
        busy: checkpoint.busy,
        logFrames: checkpoint.log,
        checkpointedFrames: checkpoint.checkpointed,
      },
      process: {
        rssDeltaBytes: memoryAfter - memoryBefore,
        cpuUserMs: Number((cpu.user / 1000).toFixed(3)),
        cpuSystemMs: Number((cpu.system / 1000).toFixed(3)),
      },
      integrity: { result: integrity, foreignKeyViolations: foreignKeyViolations.length },
      verified: { operationReceipts: receipts, changeLogRows: changeRows, measuredReceipts, measuredChangeLogRows: measuredChanges },
    };
    console.log(JSON.stringify(result));
  } finally {
    try { db?.close(); } catch {}
    await rm(directory, { recursive: true, force: true });
  }
}

await main();
