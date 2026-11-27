/**
 * Versioned, deterministic workload contract for SQLite benchmark v2.
 *
 * This is benchmark-only synthetic data. It does not define or change production
 * persistence schemas, and it deliberately models assistant/run records that
 * the current JSON prototype does not yet persist.
 */

export const WORKLOAD_CONTRACT_VERSION = 1;

export const DEFAULT_DATASET = Object.freeze({
  workspaceCount: 8,
  sessionsPerWorkspace: 32,
  messagesPerSession: 40,
  runsPerSession: 8,
  userMessageBytes: 256,
  assistantMessageBytes: 1024,
  eventPayloadBytes: 128,
});

export const MIXED_OPERATION_WEIGHTS = Object.freeze([
  Object.freeze({ type: "workspace.read", weight: 8 }),
  Object.freeze({ type: "session.read", weight: 12 }),
  Object.freeze({ type: "message.read", weight: 10 }),
  Object.freeze({ type: "run.feed.read", weight: 5 }),
  Object.freeze({ type: "workspace.rename", weight: 2 }),
  Object.freeze({ type: "session.rename", weight: 3 }),
  Object.freeze({ type: "message.append", role: "user", weight: 20 }),
  Object.freeze({ type: "message.append", role: "assistant", weight: 20 }),
  Object.freeze({ type: "run.lifecycle.append", weight: 20 }),
]);

const TOTAL_WEIGHT = MIXED_OPERATION_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(name + " must be a positive safe integer");
  }
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, length) {
  return Math.floor(random() * length);
}

function chooseOperation(random) {
  let slot = Math.floor(random() * TOTAL_WEIGHT);
  for (const item of MIXED_OPERATION_WEIGHTS) {
    if (slot < item.weight) return item;
    slot -= item.weight;
  }
  throw new Error("Invalid mixed workload weight table");
}

function makeContent(byteLength, character) {
  return character.repeat(byteLength);
}

export function createWorkloadDescriptor({ seed = "funny-business-sqlite-v2-v1", dataset = {} } = {}) {
  const dimensions = { ...DEFAULT_DATASET, ...dataset };
  for (const [name, value] of Object.entries(dimensions)) assertPositiveInteger(value, name);
  const descriptor = {
    contractVersion: WORKLOAD_CONTRACT_VERSION,
    workload: "mixed-application-v1",
    seed: String(seed),
    dataset: dimensions,
    operationMix: MIXED_OPERATION_WEIGHTS,
    transactionPolicy: "one-logical-operation-per-transaction",
  };
  return Object.freeze({
    ...descriptor,
    fingerprint: fingerprint(descriptor),
  });
}

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Creates the exact same operation sequence for the same seed, count, and dataset.
 * The returned operations are adapter-neutral descriptions, not SQL statements.
 */
export function createMixedOperations({ count, seed = "funny-business-sqlite-v2-v1", dataset = {} }) {
  assertPositiveInteger(count, "count");
  const descriptor = createWorkloadDescriptor({ seed, dataset });
  const random = createRandom(seed);
  const { workspaceCount, sessionsPerWorkspace, messagesPerSession, runsPerSession,
    userMessageBytes, assistantMessageBytes, eventPayloadBytes } = descriptor.dataset;
  const operations = [];

  for (let index = 0; index < count; index += 1) {
    const selected = chooseOperation(random);
    const workspaceIndex = pick(random, workspaceCount);
    const sessionIndex = pick(random, sessionsPerWorkspace);
    const workspaceId = "workspace-" + workspaceIndex;
    const sessionId = workspaceId + "-session-" + sessionIndex;
    const operationId = "mixed-op-" + index;

    switch (selected.type) {
      case "workspace.read":
        operations.push({ index, operationId, type: selected.type, workspaceId });
        break;
      case "session.read":
        operations.push({ index, operationId, type: selected.type, workspaceId, sessionId });
        break;
      case "message.read":
        operations.push({
          index, operationId, type: selected.type, sessionId,
          messageId: sessionId + "-message-" + pick(random, messagesPerSession),
        });
        break;
      case "run.feed.read":
        operations.push({
          index, operationId, type: selected.type, sessionId,
          runId: sessionId + "-run-" + pick(random, runsPerSession),
          limit: 50,
        });
        break;
      case "workspace.rename":
        operations.push({
          index, operationId, type: selected.type, workspaceId,
          title: "Workspace " + workspaceIndex + " revision " + index,
        });
        break;
      case "session.rename":
        operations.push({
          index, operationId, type: selected.type, workspaceId, sessionId,
          title: "Session " + sessionIndex + " revision " + index,
        });
        break;
      case "message.append": {
        const bytes = selected.role === "user" ? userMessageBytes : assistantMessageBytes;
        operations.push({
          index, operationId, type: selected.type, sessionId,
          messageId: operationId + "-message",
          role: selected.role,
          content: makeContent(bytes, selected.role === "user" ? "u" : "a"),
        });
        break;
      }
      case "run.lifecycle.append":
        operations.push({
          index, operationId, type: selected.type, sessionId,
          runId: operationId + "-run",
          eventPayload: makeContent(eventPayloadBytes, "e"),
          events: ["queued", "started", "completed"],
        });
        break;
      default:
        throw new Error("Unsupported workload operation: " + selected.type);
    }
  }

  return operations;
}
