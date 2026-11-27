import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

for (const synchronous of ["FULL", "NORMAL"]) {
  test(`Node v2 adapter executes the mixed workload with ${synchronous} durability`, () => {
    const child = spawnSync(process.execPath, [
      "spikes/sqlite-benchmark/node-v2.mjs",
      "--iterations=120",
      "--warmup=20",
      "--seed=node-adapter-smoke",
      `--synchronous=${synchronous}`,
    ], {
      encoding: "utf8",
      timeout: 120_000,
    });

    assert.equal(child.status, 0, child.stderr || child.stdout);
    const result = JSON.parse(child.stdout);
    assert.equal(result.benchmark, "sqlite-mixed-application-v1");
    assert.equal(result.contractVersion, 1);
    assert.equal(result.iterations, 120);
    assert.equal(result.warmup, 20);
    assert.equal(result.synchronous, synchronous);
    assert.equal(result.integrity.result, "ok");
    assert.equal(result.integrity.foreignKeyViolations, 0);
    assert.equal(result.verified.measuredReceipts, result.operationCounts.write);
    assert.equal(result.verified.measuredChangeLogRows, result.operationCounts.write);
    assert.equal(
      result.operationCounts.read + result.operationCounts.write,
      result.iterations,
    );
    assert.ok(result.workloadFingerprint);
    assert.ok(result.latencyMs.read.p99 >= 0);
    assert.ok(result.latencyMs.write.p99 >= 0);
    assert.ok(result.checkpoint.durationMs >= 0);
  });
}
