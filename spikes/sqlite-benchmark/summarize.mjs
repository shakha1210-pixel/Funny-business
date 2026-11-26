import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(path);
  }
  return files;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function range(values) {
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}

function normalizePlatform(value) {
  return ({ win32: 'windows', darwin: 'macos' })[value] ?? value;
}

const root = process.argv[2] ?? 'benchmark-results';
const expectedRepeats = Number(option('expected-repeats', '5'));
if (!Number.isSafeInteger(expectedRepeats) || expectedRepeats < 1) {
  throw new Error('--expected-repeats must be a positive integer');
}

const files = await walk(root);
if (files.length === 0) throw new Error(`No JSON benchmark files found under ${root}`);

const groups = new Map();
for (const file of files) {
  let result;
  try {
    result = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid benchmark JSON in ${relative(root, file)}: ${error.message}`);
  }
  if (result.benchmark !== 'sqlite-session-create-transaction-v1'
      || !Number.isFinite(result.opsPerSecond)
      || !Number.isFinite(result.totalMs)
      || !Number.isFinite(result.transactionMs?.p95)
      || !Number.isFinite(result.transactionMs?.p99)) {
    throw new Error(`Unexpected or incomplete benchmark result: ${relative(root, file)}`);
  }

  const platform = normalizePlatform(result.platform);
  const mode = result.executionMode ?? 'rust-native';
  const key = [platform, result.adapter, mode].join('/');
  const samples = groups.get(key) ?? [];
  samples.push({ ...result, source: relative(root, file) });
  groups.set(key, samples);
}

const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log(`SQLite benchmark summary — ${files.length} JSON files`);
console.log(`Expected repetitions per adapter/platform: ${expectedRepeats}`);
console.log('');
console.log('| OS | Adapter / mode | Runs | Median ops/s (min–max) | Median p95 ms | Median p99 ms | Median open ms | Responsiveness probe |');
console.log('|---|---|---:|---:|---:|---:|---:|---|');

for (const [key, samples] of rows) {
  const [platform, adapter, mode] = key.split('/');
  const throughput = samples.map((sample) => sample.opsPerSecond);
  const p95 = samples.map((sample) => sample.transactionMs.p95);
  const p99 = samples.map((sample) => sample.transactionMs.p99);
  const open = samples.map((sample) => sample.openMs).filter(Number.isFinite);
  const probes = samples.flatMap((sample) => {
    if (Number.isFinite(sample.synchronousEventLoopStallMs)) return [sample.synchronousEventLoopStallMs];
    if (Number.isFinite(sample.mainThread?.maxHeartbeatDelayMs)) return [sample.mainThread.maxHeartbeatDelayMs];
    return [];
  });
  const throughputRange = range(throughput);
  const responsiveness = probes.length ? `${median(probes).toFixed(2)} ms median (n=${probes.length})` : 'n/a';
  const runLabel = samples.length === expectedRepeats ? String(samples.length) : `**${samples.length}** (expected ${expectedRepeats})`;
  console.log(`| ${platform} | ${adapter} / ${mode} | ${runLabel} | ${median(throughput).toFixed(1)} (${throughputRange[0].toFixed(1)}–${throughputRange[1].toFixed(1)}) | ${median(p95).toFixed(4)} | ${median(p99).toFixed(4)} | ${open.length ? median(open).toFixed(3) : 'n/a'} | ${responsiveness} |`);
}

console.log('');
console.log('Interpretation: compare adapters only within the same OS and identical workload/settings. Hosted CI runners are noisy; report medians and spread, do not treat this microbenchmark as a complete desktop-runtime decision.');
const incomplete = rows.filter(([, samples]) => samples.length !== expectedRepeats);
if (incomplete.length) {
  console.error(`Warning: ${incomplete.length} adapter/platform group(s) do not have the expected repetition count.`);
  process.exitCode = 2;
}
