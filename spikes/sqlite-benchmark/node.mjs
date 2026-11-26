import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

async function runBenchmark({ iterations, warmup, journal, synchronous, executionMode }) {
  const directory = await mkdtemp(join(tmpdir(), 'funny-business-sqlite-bench-'));
  const filename = join(directory, 'benchmark.sqlite');
  let db;
  try {
    const openStarted = performance.now();
    db = new DatabaseSync(filename);
    db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = ${journal}; PRAGMA synchronous = ${synchronous};`);
    const openMs = performance.now() - openStarted;
    db.exec(`
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, canonical_path TEXT NOT NULL UNIQUE);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at TEXT NOT NULL);
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
    `);
    db.prepare('INSERT INTO workspaces(id, canonical_path) VALUES (?, ?)').run('workspace-1', '/benchmark/workspace');

    const samples = [];
    const runOne = (index, collect) => {
      const id = `session-${index}`;
      const op = `operation-${index}`;
      const now = '2026-11-27T00:00:00.000Z';
      const started = performance.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        const insertSession = db.prepare('INSERT INTO sessions(id, cwd, created_at) VALUES (?, ?, ?)');
        const insertMembership = db.prepare('INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?, ?)');
        const insertChange = db.prepare('INSERT INTO change_log(operation_id, event_type, entity_id, created_at) VALUES (?, ?, ?, ?)');
        const insertReceipt = db.prepare('INSERT INTO operation_receipts(operation_id, operation_kind, session_id, change_sequence) VALUES (?, ?, ?, ?)');
        insertSession.run(id, '/benchmark/workspace', now);
        insertMembership.run('workspace-1', id);
        const change = insertChange.run(op, 'session.created', id, now);
        insertReceipt.run(op, 'session.create', id, Number(change.lastInsertRowid));
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
      }
      if (collect) samples.push(performance.now() - started);
    };

    for (let i = 0; i < warmup; i += 1) runOne(i, false);
    const rssBefore = process.memoryUsage().rss;
    const eventLoopProbeAt = performance.now();
    let eventLoopTimerAt;
    const eventLoopTimer = new Promise((resolve) => setTimeout(() => {
      eventLoopTimerAt = performance.now();
      resolve();
    }, 0));
    const benchmarkStarted = performance.now();
    for (let i = warmup; i < warmup + iterations; i += 1) runOne(i, true);
    const benchmarkMs = performance.now() - benchmarkStarted;
    await eventLoopTimer;
    const eventLoopStallMs = eventLoopTimerAt - eventLoopProbeAt;
    const rssAfter = process.memoryUsage().rss;
    samples.sort((a, b) => a - b);
    const count = db.prepare('SELECT count(*) AS count FROM sessions').get().count;
    if (count !== warmup + iterations) throw new Error(`row count mismatch: ${count}`);

    return {
      benchmark: 'sqlite-session-create-transaction-v1',
      adapter: 'node:sqlite DatabaseSync',
      executionMode,
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      journal,
      synchronous,
      iterations,
      warmup,
      openMs: Number(openMs.toFixed(3)),
      totalMs: Number(benchmarkMs.toFixed(3)),
      synchronousEventLoopStallMs: Number(eventLoopStallMs.toFixed(3)),
      opsPerSecond: Number((iterations / (benchmarkMs / 1000)).toFixed(1)),
      transactionMs: {
        p50: Number(percentile(samples, 0.50).toFixed(4)),
        p95: Number(percentile(samples, 0.95).toFixed(4)),
        p99: Number(percentile(samples, 0.99).toFixed(4)),
        max: Number(samples.at(-1).toFixed(4)),
      },
      rssDeltaBytes: rssAfter - rssBefore,
      verifiedSessionRows: count,
    };
  } finally {
    try { db?.close(); } catch {}
    await rm(directory, { recursive: true, force: true });
  }
}

if (!isMainThread) {
  const result = await runBenchmark({ ...workerData, executionMode: 'worker-thread' });
  parentPort.postMessage(result);
} else {
  const iterations = Number(arg('iterations', '5000'));
  const warmup = Number(arg('warmup', '500'));
  const journal = arg('journal', 'WAL').toUpperCase();
  const synchronous = arg('synchronous', 'FULL').toUpperCase();
  const mode = arg('mode', 'sync').toLowerCase();
  if (!Number.isSafeInteger(iterations) || iterations < 1 || !Number.isSafeInteger(warmup) || warmup < 0) {
    throw new Error('iterations must be positive and warmup must be non-negative integers');
  }
  if (!['WAL', 'DELETE'].includes(journal) || !['FULL', 'NORMAL'].includes(synchronous) || !['sync', 'worker'].includes(mode)) {
    throw new Error('journal must be WAL|DELETE, synchronous FULL|NORMAL, and mode sync|worker');
  }

  if (mode === 'sync') {
    const result = await runBenchmark({ iterations, warmup, journal, synchronous, executionMode: 'main-thread-sync' });
    console.log(JSON.stringify(result));
  } else {
    let ticks = 0;
    let maxTickDelayMs = 0;
    let expected = performance.now() + 10;
    const interval = setInterval(() => {
      const now = performance.now();
      maxTickDelayMs = Math.max(maxTickDelayMs, now - expected);
      expected = now + 10;
      ticks += 1;
    }, 10);
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { iterations, warmup, journal, synchronous },
    });
    try {
      const result = await new Promise((resolve, reject) => {
        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (code !== 0) reject(new Error(`SQLite benchmark worker exited with code ${code}`));
        });
      });
      result.mainThread = { heartbeatTicks: ticks, maxHeartbeatDelayMs: Number(maxTickDelayMs.toFixed(3)) };
      console.log(JSON.stringify(result));
    } finally {
      clearInterval(interval);
      await worker.terminate();
    }
  }
}
