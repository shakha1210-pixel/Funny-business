import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'funny-business-summarizer-test-'));
const script = fileURLToPath(new URL('./summarize.mjs', import.meta.url));
const sample = (platform, adapter, executionMode, opsPerSecond, p95, p99, synchronous = 'FULL') => ({
  benchmark: 'sqlite-session-create-transaction-v1',
  adapter,
  executionMode,
  platform,
  synchronous,
  opsPerSecond,
  totalMs: 1000,
  preScheduledTimerDelayMs: 12.5,
  openMs: 2,
  transactionMs: { p95, p99 },
});

try {
  const linux = join(directory, 'linux');
  const windows = join(directory, 'windows');
  await mkdir(linux);
  await mkdir(windows);
  await writeFile(join(linux, 'node-full-1.json'), JSON.stringify(sample('linux', 'node:sqlite DatabaseSync', 'main-thread-sync', 100, 2, 3)));
  await writeFile(join(linux, 'node-full-2.json'), JSON.stringify(sample('linux', 'node:sqlite DatabaseSync', 'main-thread-sync', 200, 4, 6)));
  await writeFile(join(linux, 'node-normal-1.json'), JSON.stringify(sample('linux', 'node:sqlite DatabaseSync', 'main-thread-sync', 300, 2, 3, 'NORMAL')));
  await writeFile(join(linux, 'node-normal-2.json'), JSON.stringify(sample('linux', 'node:sqlite DatabaseSync', 'main-thread-sync', 400, 4, 6, 'NORMAL')));
  await writeFile(join(linux, 'rust-1.json'), JSON.stringify(sample('linux', 'rusqlite', undefined, 150, 3, 5)));
  await writeFile(join(linux, 'rust-2.json'), JSON.stringify(sample('linux', 'rusqlite', undefined, 170, 4, 6)));
  const workerSample = {
    ...sample('win32', 'node:sqlite DatabaseSync', 'worker-thread', 300, 1, 2),
    preScheduledTimerDelayMs: 999,
    mainThread: { heartbeatTicks: 10, maxHeartbeatDelayMs: 7.25 },
  };
  await writeFile(join(windows, 'node-1.json'), JSON.stringify(workerSample));
  await writeFile(join(windows, 'node-2.json'), JSON.stringify({ ...workerSample, opsPerSecond: 320 }));

  const complete = spawnSync(process.execPath, [script, directory, '--expected-repeats=2'], { encoding: 'utf8' });
  assert.equal(complete.status, 0, complete.stderr);
  assert.match(complete.stdout, /linux \| FULL \| node:sqlite DatabaseSync \/ main-thread-sync \| 2 \|/);
  assert.match(complete.stdout, /linux \| NORMAL \| node:sqlite DatabaseSync \/ main-thread-sync \| 2 \|/);
  assert.match(complete.stdout, /windows \| FULL \| node:sqlite DatabaseSync \/ worker-thread \| 2 \|/);
  assert.match(complete.stdout, /linux \| FULL \| rusqlite \/ rust-native \| 2 \|/);
  assert.match(complete.stdout, /160\.0 \(150\.0–170\.0\)/);
  assert.match(complete.stdout, /12\.50 ms median \(n=2\)/);
  assert.match(complete.stdout, /7\.25 ms median \(n=2\)/);
  assert.match(complete.stdout, /Pre-scheduled timer delay \| Worker heartbeat max delay/);
  assert.doesNotMatch(complete.stdout, /999\.00 ms/);

  const incomplete = spawnSync(process.execPath, [script, directory, '--expected-repeats=5'], { encoding: 'utf8' });
  assert.equal(incomplete.status, 2);
  assert.match(incomplete.stderr, /do not have the expected repetition count/);

  await writeFile(join(directory, 'bad.json'), '{not json');
  const malformed = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /Invalid benchmark JSON/);

  console.log('SQLite benchmark summarizer tests passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
