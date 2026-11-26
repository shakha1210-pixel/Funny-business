import assert from "node:assert/strict";
import test from "node:test";
import {
  recoverInterruptedAgentRun,
  transitionAgentRun,
  type AgentRun,
} from "./agent-runtime-contract.js";

function run(status: AgentRun["status"] = "queued"): AgentRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    operationId: "operation-1",
    status,
    createdAt: 100,
    ...(status === "running" ? { startedAt: 105 } : {}),
  };
}

test("queued run can start and records provider identity without secrets", () => {
  const started = transitionAgentRun(run(), "running", 110, {
    providerId: "test-provider",
    modelId: "deterministic-v1",
  });
  assert.equal(started.status, "running");
  assert.equal(started.startedAt, 110);
  assert.equal(started.providerId, "test-provider");
  assert.equal(started.modelId, "deterministic-v1");
  assert.equal(started.finishedAt, undefined);
});

test("running run can complete and terminal timestamp is recorded", () => {
  const started = transitionAgentRun(run(), "running", 110);
  const completed = transitionAgentRun(started, "completed", 120);
  assert.equal(completed.status, "completed");
  assert.equal(completed.startedAt, 110);
  assert.equal(completed.finishedAt, 120);
  assert.throws(() => transitionAgentRun(completed, "running", 130), /Invalid AgentRun transition/);
});

test("failed run requires structured failure and rejects failure on other states", () => {
  assert.throws(() => transitionAgentRun(run(), "failed", 110), /requires structured failure/);
  const failed = transitionAgentRun(run("running"), "failed", 120, {
    failure: { code: "PROVIDER_UNAVAILABLE", message: "Provider unavailable", retryable: true },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure?.code, "PROVIDER_UNAVAILABLE");
  assert.equal(failed.finishedAt, 120);
  assert.throws(() => transitionAgentRun(run(), "cancelled", 110, {
    failure: { code: "X", message: "x", retryable: false },
  }), /only valid for a failed/);
});

test("queued and running runs recover as interrupted, never replayed", () => {
  for (const status of ["queued", "running"] as const) {
    const original = run(status);
    const recovered = recoverInterruptedAgentRun(original, 150);
    assert.equal(recovered.status, "interrupted");
    assert.equal(recovered.finishedAt, 150);
    assert.equal(original.status, status);
  }
});

test("terminal runs remain unchanged during startup recovery", () => {
  const completed = transitionAgentRun(run("running"), "completed", 120);
  assert.deepEqual(recoverInterruptedAgentRun(completed, 150), completed);
});

test("running records require a start timestamp and transitions cannot predate it", () => {
  const invalid = { ...run("running") };\n  delete invalid.startedAt;
  assert.throws(() => transitionAgentRun(invalid, "completed", 120), /must have a valid startedAt/);
  assert.throws(() => transitionAgentRun(run("running"), "completed", 104), /cannot precede its start/);
});

test("transition timestamps must be finite and not precede creation", () => {
  assert.throws(() => transitionAgentRun(run(), "running", 99), /must be finite/);
  assert.throws(() => transitionAgentRun(run(), "running", Number.NaN), /must be finite/);
});
