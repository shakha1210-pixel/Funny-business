import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceRegistry, type Workspace, type WorkspaceStore } from "../core/workspace-registry.js";
import { RegistryWorkspaceHost } from "./workspace-host.js";

class MemoryStore implements WorkspaceStore {
  #items: readonly Workspace[] = [];
  async load() { return this.#items; }
  async save(items: readonly Workspace[]) { this.#items = structuredClone(items); }
}

test("registry adapter exposes the shared Workspace host contract", async () => {
  const registry = new WorkspaceRegistry({
    store: new MemoryStore(),
    sessions: { getHeader: async () => undefined },
    canonicalizeDirectory: async (path) => path,
    createId: () => "workspace-1",
    now: () => 123,
  });
  await registry.initialize();
  const host = new RegistryWorkspaceHost(registry);

  assert.deepEqual(host.list(), []);
  const created = await host.create("/project", "Project");
  assert.equal(created.id, "workspace-1");
  assert.deepEqual(host.list().map(({ id }) => id), ["workspace-1"]);

  const renamed = await host.rename(created.id, "Renamed");
  assert.equal(renamed.title, "Renamed");
  assert.equal(await host.unregister(created.id), true);
  assert.deepEqual(host.list(), []);
});
