import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceRegistry, type Workspace, type WorkspaceStore } from "./workspace-registry.js";
import { WorkspaceFilesystem, JsonFilesystemGrantStore, type FilesystemGrant, type FilesystemGrantStore } from "./workspace-filesystem.js";

class MemoryWorkspaceStore implements WorkspaceStore {
  items: readonly Workspace[] = [];
  async load() { return this.items; }
  async save(items: readonly Workspace[]) { this.items = structuredClone(items); }
}
class MemoryGrantStore implements FilesystemGrantStore {
  items: readonly FilesystemGrant[] = [];
  async load() { return this.items; }
  async save(items: readonly FilesystemGrant[]) { this.items = structuredClone(items); }
}

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "funny-filesystem-"));
  const root = join(directory, "workspace");
  await mkdir(root);
  await writeFile(join(root, "hello.txt"), "hello workspace");
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", "inside.txt"), "nested content");
  const workspaces = new WorkspaceRegistry({
    store: new MemoryWorkspaceStore(),
    sessions: { getHeader: async () => undefined },
  });
  await workspaces.initialize();
  const workspace = await workspaces.create(root, "Project");
  const grantStore = new MemoryGrantStore();
  let id = 0;
  const filesystem = new WorkspaceFilesystem({
    workspaces, grants: grantStore, createId: () => "grant-" + ++id, maxReadBytes: 32,
  });
  await filesystem.initialize();
  return { directory, root, workspaces, workspace, grantStore, filesystem };
}

test("filesystem denies listing and reading until an explicit grant exists", async () => {
  const state = await setup();
  try {
    await assert.rejects(state.filesystem.list(state.workspace.id), /access denied/);
    await assert.rejects(state.filesystem.read(state.workspace.id, "hello.txt"), /access denied/);
    const grant = await state.filesystem.grant(state.workspace.id);
    assert.deepEqual(grant.operations, ["list", "read"]);
    assert.equal((await state.filesystem.read(state.workspace.id, "hello.txt")).content, "hello workspace");
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("filesystem lists entries without following symbolic links", async () => {
  const state = await setup();
  try {
    await symlink(join(state.directory, "outside.txt"), join(state.root, "outside-link.txt"));
    await writeFile(join(state.directory, "outside.txt"), "secret");
    await state.filesystem.grant(state.workspace.id);
    const entries = await state.filesystem.list(state.workspace.id);
    assert.equal(entries.find((entry) => entry.name === "hello.txt")?.kind, "file");
    assert.equal(entries.find((entry) => entry.name === "nested")?.kind, "directory");
    assert.equal(entries.find((entry) => entry.name === "outside-link.txt")?.kind, "symlink");
    await assert.rejects(state.filesystem.read(state.workspace.id, "outside-link.txt"), /Symbolic links/);
    await assert.rejects(state.filesystem.list(state.workspace.id, "outside-link.txt"), /Symbolic links/);
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("filesystem rejects traversal, absolute paths, backslashes, and non-files", async () => {
  const state = await setup();
  try {
    await state.filesystem.grant(state.workspace.id);
    for (const path of ["../outside.txt", "/etc/passwd", "nested/../../hello.txt", "nested\\inside.txt"]) {
      await assert.rejects(state.filesystem.read(state.workspace.id, path));
    }
    await assert.rejects(state.filesystem.read(state.workspace.id, "nested"), /regular file/);
    await assert.rejects(state.filesystem.list(state.workspace.id, "hello.txt"), /directory/);
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("filesystem enforces bounded reads and stale version tokens", async () => {
  const state = await setup();
  try {
    await writeFile(join(state.root, "large.txt"), "x".repeat(33));
    await state.filesystem.grant(state.workspace.id);
    await assert.rejects(state.filesystem.read(state.workspace.id, "large.txt"), /read limit/);
    const listing = await state.filesystem.list(state.workspace.id);
    const version = listing.find((entry) => entry.name === "hello.txt")!.version!;
    await writeFile(join(state.root, "hello.txt"), "changed");
    await assert.rejects(state.filesystem.read(state.workspace.id, "hello.txt", version), /version conflict/);
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("filesystem grants persist, reload, and can be revoked", async () => {
  const state = await setup();
  try {
    const store = new JsonFilesystemGrantStore(join(state.directory, "state", "grants.json"));
    const first = new WorkspaceFilesystem({ workspaces: state.workspaces, grants: store, createId: () => "persisted" });
    await first.initialize();
    await first.grant(state.workspace.id, ["list"]);
    const second = new WorkspaceFilesystem({ workspaces: state.workspaces, grants: store });
    await second.initialize();
    assert.equal(second.listGrants(state.workspace.id).length, 1);
    await assert.rejects(second.read(state.workspace.id, "hello.txt"), /access denied/);
    assert.equal(await second.revoke("persisted"), true);
    assert.equal(second.listGrants(state.workspace.id).length, 0);
    assert.deepEqual(JSON.parse(await readFile(join(state.directory, "state", "grants.json"), "utf8")).grants, []);
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("filesystem grant store rejects corrupt and unsupported schemas", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-grant-corrupt-"));
  try {
    const path = join(directory, "grants.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 9, grants: [] }));
    await assert.rejects(new JsonFilesystemGrantStore(path).load(), /schema/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("revoked grant denies subsequent operations", async () => {
  const state = await setup();
  try {
    const grant = await state.filesystem.grant(state.workspace.id);
    assert.equal(await state.filesystem.revoke(grant.id), true);
    await assert.rejects(state.filesystem.list(state.workspace.id), /access denied/);
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});
