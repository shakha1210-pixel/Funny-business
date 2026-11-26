import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceRegistry, type Workspace, type WorkspaceStore } from "./workspace-registry.js";

class MemoryStore implements WorkspaceStore {
  items: readonly Workspace[] = [];
  failNextSave = false;
  async load() { return this.items; }
  async save(items: readonly Workspace[]) {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("disk unavailable");
    }
    this.items = structuredClone(items);
  }
}

const canonicalize = async (path: string) => path.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();

function setup() {
  const store = new MemoryStore();
  const headers = new Map([
    ["session-a", { id: "session-a", cwd: "/work/project" }],
    ["session-b", { id: "session-b", cwd: "/other/project" }],
  ]);
  let id = 0;
  let now = 100;
  const registry = new WorkspaceRegistry({
    store,
    sessions: { getHeader: async (sessionId) => headers.get(sessionId) },
    canonicalizeDirectory: canonicalize,
    createId: () => "ws-" + ++id,
    now: () => ++now,
  });
  return { registry, store };
}

test("requires initialization and creates canonical unique workspaces", async () => {
  const { registry } = setup();
  assert.throws(() => registry.list(), /initialize/);
  await registry.initialize();
  const created = await registry.create("/Work/Project/");
  assert.equal(created.path, "/work/project");
  assert.equal(created.title, "project");
  await assert.rejects(registry.create("/work/project"), /already exists/);
});

test("attaches only Sessions whose canonical cwd matches the Workspace", async () => {
  const { registry } = setup();
  await registry.initialize();
  const workspace = await registry.create("/work/project");
  const attached = await registry.attachSession(workspace.id, "session-a");
  assert.deepEqual(attached.sessionIds, ["session-a"]);
  await assert.rejects(
    registry.attachSession(workspace.id, "session-b"),
    /does not match/,
  );
  assert.deepEqual(registry.get(workspace.id)?.sessionIds, ["session-a"]);
});

test("persists before publishing mutations and preserves state on write failure", async () => {
  const { registry, store } = setup();
  await registry.initialize();
  const workspace = await registry.create("/work/project");
  store.failNextSave = true;
  await assert.rejects(registry.rename(workspace.id, "renamed"), /disk unavailable/);
  assert.equal(registry.get(workspace.id)?.title, "project");
});

test("unregister removes only the Workspace record", async () => {
  const { registry, store } = setup();
  await registry.initialize();
  const workspace = await registry.create("/work/project");
  await registry.attachSession(workspace.id, "session-a");
  assert.equal(await registry.unregister(workspace.id), true);
  assert.equal(registry.get(workspace.id), undefined);
  assert.deepEqual(store.items, []);
});

test("startup rejects persisted Workspace references to missing Sessions", async () => {
  const store = new MemoryStore();
  store.items = [{
    id: "workspace-1",
    path: "/work/project",
    title: "Project",
    createdAt: 1,
    updatedAt: 1,
    sessionIds: ["missing-session"],
  }];
  const registry = new WorkspaceRegistry({
    store,
    sessions: { getHeader: async () => undefined },
    canonicalizeDirectory: canonicalize,
  });
  await assert.rejects(registry.initialize(), /missing or invalid Session/);
  assert.throws(() => registry.list(), /initialize/);
});

test("startup rejects persisted Session membership with a mismatched working directory", async () => {
  const store = new MemoryStore();
  store.items = [{
    id: "workspace-1",
    path: "/work/project",
    title: "Project",
    createdAt: 1,
    updatedAt: 1,
    sessionIds: ["session-1"],
  }];
  const registry = new WorkspaceRegistry({
    store,
    sessions: { getHeader: async (id) => ({ id, cwd: "/other/project" }) },
    canonicalizeDirectory: canonicalize,
  });
  await assert.rejects(registry.initialize(), /does not match Workspace path/);
});
