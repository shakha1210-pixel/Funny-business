import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, opendir, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { WorkspaceRegistry } from "./workspace-registry.js";

export type FilesystemOperation = "list" | "read";

export interface FilesystemGrant {
  readonly id: string;
  readonly workspaceId: string;
  readonly rootPath: string;
  readonly operations: readonly FilesystemOperation[];
  readonly createdAt: number;
}

export interface FilesystemEntry {
  readonly name: string;
  readonly kind: "file" | "directory" | "symlink" | "other";
  readonly size: number;
  readonly modifiedAt: number;
  readonly version?: string;
}

export interface FilesystemListing {
  readonly entries: readonly FilesystemEntry[];
  readonly directoryVersion: string;
  readonly nextCursor?: string;
}

export interface FilesystemReadResult {
  readonly path: string;
  readonly content: string;
  readonly encoding: "utf8";
  readonly version: string;
  readonly size: number;
}

export interface FilesystemGrantStore {
  load(): Promise<readonly FilesystemGrant[]>;
  save(grants: readonly FilesystemGrant[]): Promise<void>;
}

interface GrantFileV1 {
  readonly schemaVersion: 1;
  readonly grants: readonly FilesystemGrant[];
}

function parseGrantFile(source: string): FilesystemGrant[] {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) { throw new Error("Filesystem grant store contains invalid JSON", { cause: error }); }
  if (typeof value !== "object" || value === null) throw new Error("Filesystem grant store has an invalid root");
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== 1 || !Array.isArray(document.grants)) {
    throw new Error("Unsupported or invalid filesystem grant schema");
  }
  const ids = new Set<string>();
  const grants: FilesystemGrant[] = [];
  for (const item of document.grants) {
    if (typeof item !== "object" || item === null) throw new Error("Invalid filesystem grant record");
    const grant = item as Record<string, unknown>;
    if (typeof grant.id !== "string" || !grant.id ||
      typeof grant.workspaceId !== "string" || !grant.workspaceId ||
      typeof grant.rootPath !== "string" || !isAbsolute(grant.rootPath) ||
      typeof grant.createdAt !== "number" || !Number.isFinite(grant.createdAt) ||
      !Array.isArray(grant.operations) || grant.operations.length === 0 ||
      !grant.operations.every((op) => op === "list" || op === "read")) {
      throw new Error("Invalid filesystem grant record");
    }
    if (ids.has(grant.id)) throw new Error("Duplicate filesystem grant id: " + grant.id);
    ids.add(grant.id);
    grants.push({
      id: grant.id,
      workspaceId: grant.workspaceId,
      rootPath: grant.rootPath,
      createdAt: grant.createdAt,
      operations: [...new Set(grant.operations as FilesystemOperation[])],
    });
  }
  return grants;
}

/** Atomic grant snapshot. The host lock supplies single-process ownership. */
export class JsonFilesystemGrantStore implements FilesystemGrantStore {
  readonly #filePath: string;
  constructor(filePath: string) { this.#filePath = filePath; }

  async load(): Promise<readonly FilesystemGrant[]> {
    try { return parseGrantFile(await (await import("node:fs/promises")).readFile(this.#filePath, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(grants: readonly FilesystemGrant[]): Promise<void> {
    const directory = dirname(this.#filePath);
    const temporary = join(directory, ".filesystem-grants.tmp-" + randomUUID());
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let published = false;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ schemaVersion: 1, grants }, null, 2) + "\n", "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, this.#filePath);
      published = true;
      if (process.platform !== "win32") {
        const dir = await open(directory, "r");
        try { await dir.sync(); } finally { await dir.close(); }
      }
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      if (!published) await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function versionOf(metadata: Awaited<ReturnType<typeof lstat>>): string {
  const value = [
    metadata.dev.toString(), metadata.ino.toString(), metadata.size.toString(),
    metadata.mtimeMs.toString(), metadata.ctimeMs.toString(),
  ].join(":");
  return createHash("sha256").update(value).digest("hex");
}

function resolveRelativePath(input: string): string[] {
  if (typeof input !== "string" || input.includes("\0") || input.includes("\\")) {
    throw new Error("Path must be a relative slash-separated path");
  }
  if (input === "" || input === ".") return [];
  if (isAbsolute(input) || /^[a-zA-Z]:/.test(input)) throw new Error("Absolute paths are not allowed");
  const segments = input.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Path contains an empty, dot, or parent segment");
  }
  return segments;
}

function assertContained(root: string, target: string): void {
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
    throw new Error("Path escapes the granted Workspace root");
  }
}

export interface WorkspaceFilesystemOptions {
  readonly workspaces: WorkspaceRegistry;
  readonly grants: FilesystemGrantStore;
  readonly createId?: () => string;
  readonly now?: () => number;
  readonly maxReadBytes?: number;
  readonly maxListEntries?: number;
}

export class WorkspaceFilesystem {
  readonly #workspaces: WorkspaceRegistry;
  readonly #store: FilesystemGrantStore;
  readonly #createId: () => string;
  readonly #now: () => number;
  readonly #maxReadBytes: number;
  readonly #maxListEntries: number;
  readonly #grants = new Map<string, FilesystemGrant>();
  #initialized = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: WorkspaceFilesystemOptions) {
    this.#workspaces = options.workspaces;
    this.#store = options.grants;
    this.#createId = options.createId ?? randomUUID;
    this.#now = options.now ?? Date.now;
    this.#maxReadBytes = options.maxReadBytes ?? 1024 * 1024;
    this.#maxListEntries = options.maxListEntries ?? 5000;
    if (!Number.isSafeInteger(this.#maxReadBytes) || this.#maxReadBytes < 1) {
      throw new RangeError("maxReadBytes must be a positive safe integer");
    }
    if (!Number.isSafeInteger(this.#maxListEntries) || this.#maxListEntries < 1) {
      throw new RangeError("maxListEntries must be a positive safe integer");
    }
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async initialize(): Promise<void> {
    return this.#exclusive(async () => {
      if (this.#initialized) return;
      const next = new Map<string, FilesystemGrant>();
      const persisted = await this.#store.load();
      for (const grant of persisted) {
        const workspace = this.#workspaces.get(grant.workspaceId);
        // Stale grants are discarded, never rebound to a different Workspace path.
        if (!workspace || workspace.path !== grant.rootPath) continue;
        next.set(grant.id, { ...grant, operations: [...grant.operations] });
      }
      if (next.size !== persisted.length) await this.#store.save([...next.values()]);
      this.#grants.clear();
      for (const [id, grant] of next) this.#grants.set(id, grant);
      this.#initialized = true;
    });
  }

  #assertInitialized(): void {
    if (!this.#initialized) throw new Error("WorkspaceFilesystem.initialize() must be called first");
  }

  listGrants(workspaceId: string): readonly FilesystemGrant[] {
    this.#assertInitialized();
    return [...this.#grants.values()].filter((grant) => grant.workspaceId === workspaceId)
      .map((grant) => ({ ...grant, operations: [...grant.operations] }));
  }

  grant(workspaceId: string, operations: readonly FilesystemOperation[] = ["list", "read"]): Promise<FilesystemGrant> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const workspace = this.#workspaces.get(workspaceId);
      if (!workspace) throw new Error("Workspace not found: " + workspaceId);
      if (!operations.length || !operations.every((op) => op === "list" || op === "read")) {
        throw new Error("Filesystem grant must contain valid operations");
      }
      const id = this.#createId();
      if (!id || this.#grants.has(id)) throw new Error("Filesystem grant id is empty or already exists");
      const grant: FilesystemGrant = {
        id, workspaceId, rootPath: workspace.path,
        operations: [...new Set(operations)], createdAt: this.#now(),
      };
      const next = [...this.#grants.values(), grant];
      await this.#store.save(next);
      this.#grants.set(id, grant);
      return { ...grant, operations: [...grant.operations] };
    });
  }

  revoke(grantId: string): Promise<boolean> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      if (!this.#grants.has(grantId)) return false;
      const next = [...this.#grants.values()].filter((grant) => grant.id !== grantId);
      await this.#store.save(next);
      this.#grants.delete(grantId);
      return true;
    });
  }

  async #authorized(workspaceId: string, operation: FilesystemOperation): Promise<string> {
    this.#assertInitialized();
    const workspace = this.#workspaces.get(workspaceId);
    if (!workspace) throw new Error("Workspace not found: " + workspaceId);
    const grant = [...this.#grants.values()].find((item) =>
      item.workspaceId === workspaceId && item.rootPath === workspace.path && item.operations.includes(operation));
    if (!grant) throw new Error("Filesystem access denied: missing " + operation + " grant");
    const canonicalRoot = await realpath(workspace.path);
    if (canonicalRoot !== grant.rootPath) throw new Error("Workspace root changed; filesystem grant is no longer valid");
    return canonicalRoot;
  }

  async #resolveExisting(root: string, segments: readonly string[]): Promise<{ path: string; metadata: Awaited<ReturnType<typeof lstat>> }> {
    let current = root;
    let metadata = await lstat(root);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("Workspace root is not a safe directory");
    for (const segment of segments) {
      current = join(current, segment);
      assertContained(root, current);
      metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error("Symbolic links are not followed by Workspace filesystem access");
      if (current !== join(root, ...segments) && !metadata.isDirectory()) {
        throw new Error("A path parent is not a directory");
      }
    }
    return { path: current, metadata };
  }

  async list(
    workspaceId: string,
    relativePath = "",
    options: { readonly cursor?: string | undefined; readonly limit?: number | undefined } = {},
  ): Promise<FilesystemListing> {
    const root = await this.#authorized(workspaceId, "list");
    const segments = resolveRelativePath(relativePath);
    const target = await this.#resolveExisting(root, segments);
    if (!target.metadata.isDirectory()) throw new Error("Filesystem target is not a directory");
    const directoryVersion = versionOf(target.metadata);
    const limit = options.limit ?? 200;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError("Filesystem page limit must be between 1 and 500");
    }
    let offset = 0;
    if (options.cursor) {
      let decoded: unknown;
      try { decoded = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")); }
      catch { throw new Error("Invalid filesystem listing cursor"); }
      if (typeof decoded !== "object" || decoded === null ||
        !Number.isSafeInteger((decoded as Record<string, unknown>).offset) ||
        typeof (decoded as Record<string, unknown>).version !== "string") {
        throw new Error("Invalid filesystem listing cursor");
      }
      const cursor = decoded as { offset: number; version: string };
      if (cursor.version !== directoryVersion) throw new Error("Directory changed during pagination; restart listing");
      offset = cursor.offset;
      if (offset < 0 || offset > this.#maxListEntries) throw new Error("Invalid filesystem listing cursor");
    }
    const entries: FilesystemEntry[] = [];
    const directory = await opendir(target.path);
    for await (const item of directory) {
      const name = item.name;
      if (entries.length >= this.#maxListEntries) {
        throw new Error("Directory listing exceeds the configured entry limit");
      }
      const child = join(target.path, name);
      assertContained(root, child);
      try {
        const metadata = await lstat(child);
        if (metadata.isSymbolicLink()) {
          entries.push({ name, kind: "symlink", size: 0, modifiedAt: metadata.mtimeMs });
        } else if (metadata.isDirectory()) {
          entries.push({ name, kind: "directory", size: 0, modifiedAt: metadata.mtimeMs, version: versionOf(metadata) });
        } else if (metadata.isFile()) {
          entries.push({ name, kind: "file", size: metadata.size, modifiedAt: metadata.mtimeMs, version: versionOf(metadata) });
        } else {
          entries.push({ name, kind: "other", size: 0, modifiedAt: metadata.mtimeMs });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
    }
    const afterListing = await lstat(target.path);
    if (afterListing.isSymbolicLink() || versionOf(afterListing) !== directoryVersion) {
      throw new Error("Directory changed during listing; retry");
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const page = entries.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const nextCursor = nextOffset < entries.length
      ? Buffer.from(JSON.stringify({ offset: nextOffset, version: directoryVersion }), "utf8").toString("base64url")
      : undefined;
    return {
      entries: page,
      directoryVersion,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async read(workspaceId: string, relativePath: string, expectedVersion?: string): Promise<FilesystemReadResult> {
    const root = await this.#authorized(workspaceId, "read");
    const segments = resolveRelativePath(relativePath);
    if (!segments.length) throw new Error("A file path is required");
    const target = await this.#resolveExisting(root, segments);
    if (!target.metadata.isFile()) throw new Error("Filesystem target is not a regular file");
    if (target.metadata.size > this.#maxReadBytes) throw new Error("File exceeds the configured read limit");
    const beforeVersion = versionOf(target.metadata);
    if (expectedVersion && expectedVersion !== beforeVersion) throw new Error("File version conflict: target changed");
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    const handle = await open(target.path, flags);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || versionOf(opened) !== beforeVersion) {
        throw new Error("File changed while opening; retry with a fresh listing");
      }
      if (opened.size > this.#maxReadBytes) throw new Error("File exceeds the configured read limit");
      const buffer = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset !== buffer.length) throw new Error("File changed or ended during bounded read");
      const after = await handle.stat();
      if (versionOf(after) !== beforeVersion) throw new Error("File changed during read");
      return { path: segments.join("/"), content: buffer.toString("utf8"), encoding: "utf8", version: beforeVersion, size: buffer.length };
    } finally {
      await handle.close();
    }
  }
}
