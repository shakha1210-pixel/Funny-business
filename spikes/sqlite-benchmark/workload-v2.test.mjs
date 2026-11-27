import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DATASET,
  MIXED_OPERATION_WEIGHTS,
  WORKLOAD_CONTRACT_VERSION,
  createMixedOperations,
  createWorkloadDescriptor,
} from "./workload-v2.mjs";

test("workload descriptor is versioned and has a stable fingerprint", () => {
  const first = createWorkloadDescriptor({ seed: "fixture-1" });
  const second = createWorkloadDescriptor({ seed: "fixture-1" });

  assert.equal(first.contractVersion, WORKLOAD_CONTRACT_VERSION);
  assert.equal(first.workload, "mixed-application-v1");
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.dataset, DEFAULT_DATASET);
  assert.equal(MIXED_OPERATION_WEIGHTS.reduce((sum, item) => sum + item.weight, 0), 100);
});

test("same seed and dimensions produce byte-for-byte equivalent operations", () => {
  const options = {
    count: 500,
    seed: "repeatable-fixture",
    dataset: { workspaceCount: 3, sessionsPerWorkspace: 5 },
  };

  assert.deepEqual(createMixedOperations(options), createMixedOperations(options));
});

test("different seeds produce different operation streams", () => {
  const first = createMixedOperations({ count: 100, seed: "seed-a" });
  const second = createMixedOperations({ count: 100, seed: "seed-b" });

  assert.notDeepEqual(first, second);
});

test("operation IDs are unique and every generated reference belongs to the declared dataset", () => {
  const dataset = {
    workspaceCount: 2,
    sessionsPerWorkspace: 3,
    messagesPerSession: 4,
    runsPerSession: 2,
  };
  const operations = createMixedOperations({ count: 1000, seed: "bounds", dataset });
  const ids = new Set(operations.map((operation) => operation.operationId));

  assert.equal(ids.size, operations.length);
  for (const operation of operations) {
    if (operation.workspaceId) {
      assert.match(operation.workspaceId, /^workspace-[01]$/);
    }
    if (operation.sessionId) {
      assert.match(operation.sessionId, /^workspace-[01]-session-[0-2]$/);
    }
    if (operation.messageId?.includes("-message-")) {
      assert.match(operation.messageId, /^workspace-[01]-session-[0-2]-message-[0-3]$/);
    }
    if (operation.runId?.includes("-run-")) {
      assert.match(operation.runId, /^workspace-[01]-session-[0-2]-run-[0-1]$/);
    }
  }
});

test("message and event payloads match the declared UTF-8 byte distribution", () => {
  const operations = createMixedOperations({
    count: 5000,
    seed: "payloads",
    dataset: { userMessageBytes: 128, assistantMessageBytes: 512, eventPayloadBytes: 96 },
  });
  const user = operations.find((item) => item.type === "message.append" && item.role === "user");
  const assistant = operations.find((item) => item.type === "message.append" && item.role === "assistant");
  const lifecycle = operations.find((item) => item.type === "run.lifecycle.append");

  assert.ok(user);
  assert.ok(assistant);
  assert.ok(lifecycle);
  assert.equal(Buffer.byteLength(user.content, "utf8"), 128);
  assert.equal(Buffer.byteLength(assistant.content, "utf8"), 512);
  assert.equal(Buffer.byteLength(lifecycle.eventPayload, "utf8"), 96);
  assert.deepEqual(lifecycle.events, ["queued", "started", "completed"]);
});

test("invalid counts and dataset dimensions are rejected", () => {
  assert.throws(() => createMixedOperations({ count: 0 }), /count must be a positive safe integer/);
  assert.throws(
    () => createWorkloadDescriptor({ dataset: { workspaceCount: 0 } }),
    /workspaceCount must be a positive safe integer/,
  );
});
