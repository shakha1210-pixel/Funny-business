import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceRegistry, type Workspace, type WorkspaceStore } from "../core/workspace-registry.js";
import { RegistryWorkspaceHost } from "./workspace-host.js";

class MemoryStore implements WorkspaceStore {
  #items: readonly Workspace[] = [];
  async load() { return this.#items; }
  async save(items: readonly Workspace[]) { this.#items = structuredClone(items); }
}

function createHost() {
  let id = 0;
  const registry = new WorkspaceRegistry({
    store: new MemoryStore(),
    sessions: { getHeader: async () => undefined },
    canonicalizeDirectory: async (path) => path,
    createId: () => `workspace-${++id}`,
    now: () => 123,
  });
  return registry.initialize().then(() => ({ registry, host: new RegistryWorkspaceHost(registry) }));
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
  assert.deepEqual(replacement.value?.workspaces?.map(({ path }) => path), ["/one", "/two"]);
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
