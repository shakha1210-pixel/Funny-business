import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonSessionMessageStore } from "./session-message-store.js";
import { SessionMessageRegistry } from "./session-message-registry.js";
import { SessionRegistry, type Session, type SessionStore } from "./session-registry.js";

class MemorySessionStore implements SessionStore {
  #items: readonly Session[] = [];
  async load() { return this.#items; }
  async save(items: readonly Session[]) { this.#items = structuredClone(items); }
}

async function createSessions() {
  const sessions = new SessionRegistry({
    store: new MemorySessionStore(),
    canonicalizeDirectory: async (path) => path,
    createId: () => "session-1",
    now: () => 100,
  });
  await sessions.initialize();
  const session = await sessions.create("/project", "Project");
  return { sessions, session };
}

test("message registry persists user messages and preserves order across reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-message-registry-"));
  try {
    const { sessions, session } = await createSessions();
    const store = new JsonSessionMessageStore(directory);
    let id = 0;
    const messages = new SessionMessageRegistry({
      store, sessions, createId: () => "message-" + ++id, now: () => 200 + id,
    });
    const first = await messages.appendUserMessage(session.id, "First task");
    const second = await messages.appendUserMessage(session.id, "Second task");
    assert.equal(first.role, "user");
    assert.equal(second.id, "message-2");
    assert.deepEqual((await messages.list(session.id)).map((item) => item.content), ["First task", "Second task"]);

    const reloaded = new SessionMessageRegistry({ store, sessions });
    assert.deepEqual((await reloaded.list(session.id)).map((item) => item.id), ["message-1", "message-2"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("message registry serializes concurrent appends without losing messages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-message-concurrent-"));
  try {
    const { sessions, session } = await createSessions();
    let id = 0;
    const messages = new SessionMessageRegistry({
      store: new JsonSessionMessageStore(directory),
      sessions,
      createId: () => "message-" + ++id,
    });
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      messages.appendUserMessage(session.id, "Task " + index)));
    const saved = await messages.list(session.id);
    assert.equal(saved.length, 20);
    assert.equal(new Set(saved.map((item) => item.id)).size, 20);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("message registry rejects empty, oversized, missing-session, and archived writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-message-validation-"));
  try {
    const { sessions, session } = await createSessions();
    const messages = new SessionMessageRegistry({
      store: new JsonSessionMessageStore(directory), sessions, maxMessageBytes: 8,
    });
    await assert.rejects(messages.appendUserMessage(session.id, "  "), /cannot be empty/);
    await assert.rejects(messages.appendUserMessage(session.id, "123456789"), /byte limit/);
    await assert.rejects(messages.list("missing"), /Session not found/);
    await sessions.archive(session.id);
    await assert.rejects(messages.appendUserMessage(session.id, "archived"), /archived Session/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("message store binds each file to its opaque Session id and rejects corrupt data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-message-corrupt-"));
  try {
    const store = new JsonSessionMessageStore(directory);
    await store.save("session-a", [{
      id: "message-a", sessionId: "session-a", role: "user", content: "hello", createdAt: 1,
    }]);
    assert.equal((await store.load("session-b")).length, 0);
    const files = await import("node:fs/promises").then((fs) => fs.readdir(directory));
    const path = join(directory, files.find((name) => name.endsWith(".json"))!);
    const source = await readFile(path, "utf8");
    await import("node:fs/promises").then((fs) => fs.writeFile(path, source.replace('"session-a"', '"session-b"')));
    await assert.rejects(store.load("session-a"), /invalid Session message store schema/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
