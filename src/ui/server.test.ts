import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUiServer, listenUiServer } from "./server.js";

test("serves only allowlisted local UI assets and health endpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-ui-"));
  const server = createUiServer(directory);
  try {
    await writeFile(join(directory, "index.html"), "<h1>Funny Business</h1>");
    const address = await listenUiServer(server, 0);
    const base = `http://${address.host}:${address.port}`;

    const page = await fetch(base + "/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Funny Business/);

    const health = await fetch(base + "/api/health");
    assert.deepEqual(await health.json(), { status: "ok", ui: "prototype" });

    assert.equal((await fetch(base + "/../../package.json")).status, 404);
    assert.equal((await fetch(base + "/app.js", { method: "POST" })).status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
});


test("exposes Workspace list, create, rename, and unregister through the host API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-api-"));
  const { WorkspaceRegistry } = await import("../core/workspace-registry.js");
  const store = {
    items: [],
    async load() { return this.items; },
    async save(items: typeof this.items) { this.items = structuredClone(items); },
  };
  const registry = new WorkspaceRegistry({
    store,
    sessions: { getHeader: async () => undefined },
    canonicalizeDirectory: async (path) => path.replace(/\\/$/, ""),
    createId: () => "workspace-api-test",
  });
  await registry.initialize();
  const server = createUiServer(directory, registry);
  try {
    const address = await listenUiServer(server, 0);
    const base = `http://${address.host}:${address.port}`;
    const createdResponse = await fetch(base + "/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/projects/demo", title: "Demo" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { workspace: { id: string; title: string } };
    assert.equal(created.workspace.title, "Demo");

    const list = await fetch(base + "/api/workspaces");
    const listed = await list.json() as { workspaces: Array<{ id: string }> };
    assert.equal(listed.workspaces.length, 1);

    const renamed = await fetch(base + "/api/workspaces/workspace-api-test", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed" }),
    });
    assert.equal(renamed.status, 200);

    const removed = await fetch(base + "/api/workspaces/workspace-api-test", { method: "DELETE" });
    assert.equal(removed.status, 200);
    assert.equal(registry.list().length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
});
