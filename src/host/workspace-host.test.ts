import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceRegistry, type Workspace, type WorkspaceStore } from "../core/workspace-registry.js";
import { SessionRegistry, type Session, type SessionStore } from "../core/session-registry.js";
import { RegistryWorkspaceHost } from "./workspace-host.js";
import type { PendingSessionCreation, SessionCreationJournal } from "../core/session-creation-journal.js";

class MemoryWorkspaceStore implements WorkspaceStore {
  #items: readonly Workspace[] = [];
  failNextSave = false;
  async load() { return this.#items; }
  async save(items: readonly Workspace[]) {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("workspace store unavailable");
    }
    this.#items = structuredClone(items);
  }
}

class MemorySessionStore implements SessionStore {
  #items: readonly Session[] = [];
  async load() { return this.#items; }
  async save(items: readonly Session[]) { this.#items = structuredClone(items); }
}

class MemorySessionCreationJournal implements SessionCreationJournal {
  pending: PendingSessionCreation | undefined;
  async load() { return this.pending; }
  async save(entry: PendingSessionCreation) { this.pending = structuredClone(entry); }
  async clear() { this.pending = undefined; }
}

async function createHost() {
  let workspaceId = 0;
  let sessionId = 0;
  const workspaceStore = new MemoryWorkspaceStore();
  const sessionStore = new MemorySessionStore();
  const journal = new MemorySessionCreationJournal();
  const sessions = new SessionRegistry({
    store: sessionStore,
    canonicalizeDirectory: async (path) => path,
    createId: () => `session-${++sessionId}`,
    now: () => 123,
  });
  await sessions.initialize();
  const registry = new WorkspaceRegistry({
    store: workspaceStore,
    sessions,
    canonicalizeDirectory: async (path) => path,
    createId: () => `workspace-${++workspaceId}`,
    now: () => 123,
  });
  await registry.initialize();
  return { registry, sessions, workspaceStore, sessionStore, journal, host: new RegistryWorkspaceHost(registry, sessions, journal) };
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

test("host compensates a persisted Session when Workspace attachment fails", async () => {
  const { host, registry, sessions, workspaceStore } = await createHost();
  const workspace = await host.create("/project", "Project");
  workspaceStore.failNextSave = true;
  await assert.rejects(host.createSession(workspace.id, "Will roll back"), /workspace store unavailable/);
  assert.deepEqual(registry.get(workspace.id)?.sessionIds, []);
  assert.deepEqual(sessions.list(), []);
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
  assert.deepEqual(replacement.value?.workspaces?.map((workspace: Workspace) => workspace.path), ["/one", "/two"]);
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

test("startup recovery discards a Session persisted before its Workspace attachment", async () => {
  const { host, registry, sessions, journal } = await createHost();
  const workspace = await host.create("/recovery", "Recovery");
  const session = await sessions.create(workspace.path, "Interrupted", "recovery-session");
  await journal.save({ schemaVersion: 1, workspaceId: workspace.id, sessionId: session.id });

  await host.recoverPendingSessionCreation();
  assert.equal(sessions.get(session.id), undefined);
  assert.deepEqual(registry.get(workspace.id)?.sessionIds, []);
  assert.equal(await journal.load(), undefined);
});

test("startup recovery preserves an already attached Session", async () => {
  const { host, registry, sessions, journal } = await createHost();
  const workspace = await host.create("/committed", "Committed");
  const session = await sessions.create(workspace.path, "Committed", "committed-session");
  await registry.attachSession(workspace.id, session.id);
  await journal.save({ schemaVersion: 1, workspaceId: workspace.id, sessionId: session.id });

  await host.recoverPendingSessionCreation();
  assert.equal(sessions.get(session.id)?.title, "Committed");
  assert.deepEqual(registry.get(workspace.id)?.sessionIds, [session.id]);
  assert.equal(await journal.load(), undefined);
});

test("startup recovery preserves orphan Sessions when their Workspace was unregistered", async () => {
  const { host, registry, sessions, journal } = await createHost();
  const workspace = await host.create("/orphan-safe", "Orphan safe");
  const session = await sessions.create(workspace.path, "Keep me", "preserve-session");
  await registry.attachSession(workspace.id, session.id);
  await registry.unregister(workspace.id);
  await journal.save({ schemaVersion: 1, workspaceId: workspace.id, sessionId: session.id });

  await host.recoverPendingSessionCreation();
  assert.equal(sessions.get(session.id)?.title, "Keep me");
  assert.equal(await journal.load(), undefined);
});

test("startup recovery fails closed if a Workspace references a missing Session", async () => {
  const { host, registry, sessions, journal } = await createHost();
  const workspace = await host.create("/broken", "Broken");
  const session = await sessions.create(workspace.path, "Will go missing", "missing-session");
  await registry.attachSession(workspace.id, session.id);
  await sessions.discard(session.id);
  await journal.save({ schemaVersion: 1, workspaceId: workspace.id, sessionId: session.id });
  await assert.rejects(host.recoverPendingSessionCreation(), /without its Session/);
  assert.notEqual(await journal.load(), undefined);
});
