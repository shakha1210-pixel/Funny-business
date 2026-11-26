import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonWorkspaceStore } from "./workspace-store-json.js";
import type { Workspace } from "./workspace-registry.js";

const sample: Workspace = {
  id: "workspace-1",
  path: "/projects/demo",
  title: "Demo",
  createdAt: 10,
  updatedAt: 20,
  sessionIds: ["session-1"],
};

test("loads an empty store and atomically round-trips Workspace snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-store-"));
  try {
    const path = join(directory, "state", "workspaces.json");
    const store = new JsonWorkspaceStore(path);
    assert.deepEqual(await store.load(), []);
    await store.save([sample]);
    const loaded = await store.load();
    assert.deepEqual(loaded, [sample]);
    assert.match(await readFile(path, "utf8"), /"schemaVersion": 1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects corrupt and unsupported Workspace store files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-store-"));
  try {
    const path = join(directory, "workspaces.json");
    const store = new JsonWorkspaceStore(path);
    await writeFile(path, "{not-json");
    await assert.rejects(store.load(), /invalid JSON/);
    await writeFile(path, JSON.stringify({ schemaVersion: 99, workspaces: [] }));
    await assert.rejects(store.load(), /Unsupported or invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
