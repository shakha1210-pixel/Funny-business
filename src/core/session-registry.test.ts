import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRegistry, type Session, type SessionStore } from "./session-registry.js";
import { JsonSessionStore } from "./session-store-json.js";

class MemoryStore implements SessionStore {
  items: readonly Session[] = [];
  failNextSave = false;
  async load() { return this.items; }
  async save(items: readonly Session[]) {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("disk unavailable");
    }
    this.items = structuredClone(items);
  }
}

function setup() {
  const store = new MemoryStore();
  let id = 0;
  let now = 100;
  const registry = new SessionRegistry({
    store,
    canonicalizeDirectory: async (path) => path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase(),
    createId: () => "session-" + ++id,
    now: () => ++now,
  });
  return { registry, store };
}

test("Session registry persists independent sessions and exposes Workspace headers", async () => {
  const { registry, store } = setup();
  await registry.initialize();
  const created = await registry.create("/Work/Project", "Planning");
  assert.equal(created.id, "session-1");
  assert.equal(created.cwd, "/work/project");
  assert.equal((await registry.getHeader(created.id))?.cwd, "/work/project");
  assert.deepEqual(registry.list(), [created]);

  const renamed = await registry.rename(created.id, "Architecture");
  assert.equal(renamed.title, "Architecture");
  const archived = await registry.archive(created.id);
  assert.equal(archived.status, "archived");
  assert.equal(store.items[0]?.status, "archived");
});

test("Session mutations preserve the committed state when persistence fails", async () => {
  const { registry, store } = setup();
  await registry.initialize();
  const created = await registry.create("/project", "Original");
  store.failNextSave = true;
  await assert.rejects(registry.rename(created.id, "Changed"), /disk unavailable/);
  assert.equal(registry.get(created.id)?.title, "Original");
});

test("Session registry restores canonicalized records after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-sessions-"));
  try {
    const path = join(directory, "state", "sessions.json");
    const first = new SessionRegistry({
      store: new JsonSessionStore(path),
      canonicalizeDirectory: async (value) => value.toLowerCase(),
      createId: () => "persistent-session",
      now: () => 50,
    });
    await first.initialize();
    await first.create("/PROJECT", "Saved session");

    const second = new SessionRegistry({
      store: new JsonSessionStore(path),
      canonicalizeDirectory: async (value) => value.toLowerCase(),
    });
    await second.initialize();
    assert.equal(second.get("persistent-session")?.cwd, "/project");
    assert.equal(second.get("persistent-session")?.title, "Saved session");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Session JSON store rejects corrupt and unsupported data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-session-store-"));
  try {
    const path = join(directory, "sessions.json");
    const store = new JsonSessionStore(path);
    await writeFile(path, "{bad-json");
    await assert.rejects(store.load(), /invalid JSON/);
    await writeFile(path, JSON.stringify({ schemaVersion: 9, sessions: [] }));
    await assert.rejects(store.load(), /Unsupported or invalid/);
    await writeFile(path, JSON.stringify({ schemaVersion: 1, sessions: [{ id: "x" }] }));
    await assert.rejects(store.load(), /invalid Session record/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("Session subscriptions capture a baseline and publish only persisted changes", async () => {
  const { registry, store } = setup();
  await registry.initialize();
  const changes: Array<{ revision: number; kind: string; sessionId: string }> = [];
  const subscription = registry.subscribe((change) => {
    changes.push({ revision: change.revision, kind: change.kind, sessionId: change.sessionId });
  });
  assert.equal(subscription.snapshot.revision, 0);
  assert.deepEqual(subscription.snapshot.sessions, []);

  const created = await registry.create("/project", "Planning");
  assert.deepEqual(changes, [{ revision: 1, kind: "created", sessionId: created.id }]);
  await registry.rename(created.id, "Planning");
  assert.equal(changes.length, 1);

  store.failNextSave = true;
  await assert.rejects(registry.rename(created.id, "Not committed"), /disk unavailable/);
  assert.equal(changes.length, 1);

  await registry.rename(created.id, "Architecture");
  await registry.archive(created.id);
  assert.deepEqual(changes, [
    { revision: 1, kind: "created", sessionId: created.id },
    { revision: 2, kind: "updated", sessionId: created.id },
    { revision: 3, kind: "updated", sessionId: created.id },
  ]);

  subscription.unsubscribe();
  await registry.discard(created.id);
  assert.equal(changes.length, 3);
  assert.equal(registry.getSnapshot().revision, 4);
});
