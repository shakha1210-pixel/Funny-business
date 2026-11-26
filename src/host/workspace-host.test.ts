import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceRegistry, type Workspace, type WorkspaceStore } from "../core/workspace-registry.js";
import { SessionRegistry, type Session, type SessionStore } from "../core/session-registry.js";
import { RegistryWorkspaceHost } from "./workspace-host.js";

class MemoryWorkspaceStore implements WorkspaceStore {
  #items: readonly Workspace[] = [];
  async load() { return this.#items; }
  async save(items: readonly Workspace[]) { this.#items = structuredClone(items); }
}

class MemorySessionStore implements SessionStore {
  #items: readonly Session[] = [];
  async load() { return this.#items; }
  async save(items: readonly Session[]) { this.#items = structuredClone(items); }
}

async function createHost() {
  let workspaceId = 0;
  let sessionId = 0;
  const sessions = new SessionRegistry({
    store: new MemorySessionStore(),
    canonicalizeDirectory: async (path) => path,
    createId: () => `session-${++sessionId}`,
    now: () => 123,
  });
  await sessions.initialize();
  const registry = new WorkspaceRegistry({
    store: new MemoryWorkspaceStore(),
    sessions,
    canonicalizeDirectory: async (path) => path,
    createId: () => `workspace-${++workspaceId}`,
    now: () => 123,
  });
  await registry.initialize();
  return { registry, sessions, host: new RegistryWorkspaceHost(registry, sessions) };
}

test("registry adapter exposes the shared Workspace host contract", async () => {
  const { host } = await createHost();
  assert.deepEqual(host.list(), []);
  const created = await host.create("/project", "Project");
  assert.equal(created.id, "workspace-1");
  assert.deepEqual(host.list().map(({ id }) => id), ["workspace-1"]);

  const renamed = await host.rename(created.id, "Renamed");
  assert.equal(renamed.title, "Renamed");
  assert.equal(await host.unregister(created.id), true);
  assert.deepEqual(host.list(), []);
});

test("host creates durable Sessions and attaches only matching Workspace paths", async () => {
  const { host, registry, sessions } = await createHost();
  const workspace = await host.create("/project", "Project");
  const created = await host.createSession(workspace.id, "Planning");
  assert.equal(created.cwd, workspace.path);
  assert.equal(created.title, "Planning");
  assert.deepEqual(registry.get(workspace.id)?.sessionIds, [created.id]);
  assert.deepEqual(host.listSessions(workspace.id).map(({ id }) => id), [created.id]);
  assert.equal((await sessions.getHeader(created.id))?.cwd, workspace.path);

  const renamed = await host.renameSession(created.id, "Architecture");
  assert.equal(renamed.title, "Architecture");
  const archived = await host.archiveSession(created.id);
  assert.equal(archived.status, "archived");
});

test("Workspace watch starts with an atomic baseline and ordered persisted changes", async () => {
  const { host } = await createHost();
  const iterator = host.watch()[Symbol.asyncIterator]();
  const baseline = await iterator.next(undefined);
  assert.equal(baseline.value?.type, "snapshot");
  assert.equal(baseline.value?.revision, 0);
  assert.deepEqual(baseline.value?.workspaces, []);

  const created = await host.create("/one", "One");
  const createEvent = await iterator.next(undefined);
  assert.equal(createEvent.value?.type, "change");
  assert.equal(createEvent.value?.revision, 1);
  assert.equal(createEvent.value?.change?.kind, "created");
  assert.equal(createEvent.value?.change?.workspace?.id, created.id);

  await host.rename(created.id, "Renamed");
  const renameEvent = await iterator.next(undefined);
  assert.equal(renameEvent.value?.revision, 2);
  assert.equal(renameEvent.value?.change?.kind, "updated");
  assert.equal(renameEvent.value?.change?.workspace?.title, "Renamed");

  await host.unregister(created.id);
  const removeEvent = await iterator.next(undefined);
  assert.equal(removeEvent.value?.revision, 3);
  assert.equal(removeEvent.value?.change?.kind, "removed");
  assert.equal(removeEvent.value?.change?.workspace, undefined);
  await iterator.return?.(undefined);
});

test("Workspace watch replaces an overflowing queue with an authoritative snapshot", async () => {
  const { host } = await createHost();
  const iterator = host.watch({ maxQueue: 1 })[Symbol.asyncIterator]();
  await iterator.next(undefined);

  await host.create("/one", "One");
  await host.create("/two", "Two");
  const replacement = await iterator.next(undefined);
  assert.equal(replacement.value?.type, "snapshot");
  assert.equal(replacement.value?.revision, 2);
  assert.deepEqual(replacement.value?.workspaces?.map((workspace) => workspace.path), ["/one", "/two"]);
  await iterator.return?.(undefined);
});

test("Workspace watch cancellation releases a pending iterator read", async () => {
  const { host } = await createHost();
  const controller = new AbortController();
  const iterator = host.watch({ signal: controller.signal })[Symbol.asyncIterator]();
  await iterator.next(undefined);

  const pending = iterator.next(undefined);
  controller.abort();
  const result = await pending;
  assert.equal(result.done, true);
  await host.create("/after-cancel", "After cancel");
});
