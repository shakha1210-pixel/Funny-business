import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Workspace, WorkspaceStore } from "./workspace-registry.js";

interface WorkspaceFileV1 {
  readonly schemaVersion: 1;
  readonly workspaces: readonly Workspace[];
}

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    typeof item.path === "string" &&
    typeof item.title === "string" &&
    typeof item.createdAt === "number" &&
    typeof item.updatedAt === "number" &&
    Array.isArray(item.sessionIds) &&
    item.sessionIds.every((id) => typeof id === "string");
}

function parseWorkspaceFile(source: string): Workspace[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error("Workspace store contains invalid JSON", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Workspace store has an invalid root value");
  }
  const document = parsed as Record<string, unknown>;
  if (document.schemaVersion !== 1 || !Array.isArray(document.workspaces)) {
    throw new Error("Unsupported or invalid Workspace store schema");
  }
  if (!document.workspaces.every(isWorkspace)) {
    throw new Error("Workspace store contains an invalid Workspace record");
  }
  const ids = new Set<string>();
  for (const item of document.workspaces) {
    if (ids.has(item.id)) throw new Error("Workspace store contains duplicate id: " + item.id);
    ids.add(item.id);
  }
  return document.workspaces.map((item) => ({
    ...item,
    sessionIds: [...item.sessionIds],
  }));
}

/**
 * Single-file Workspace persistence.
 *
 * A complete snapshot is staged beside the destination, fsynced, and atomically
 * renamed into place. This protects against torn JSON writes; it is not a
 * cross-process mutex or a multi-record transaction journal.
 */
export class JsonWorkspaceStore implements WorkspaceStore {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async load(): Promise<readonly Workspace[]> {
    let source: string;
    try {
      source = await readFile(this.#filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return parseWorkspaceFile(source);
  }

  async save(workspaces: readonly Workspace[]): Promise<void> {
    const directory = dirname(this.#filePath);
    const temporaryPath = join(
      directory,
      ".workspaces.tmp-" + randomUUID(),
    );
    const document: WorkspaceFileV1 = {
      schemaVersion: 1,
      workspaces: workspaces.map((item) => ({
        ...item,
        sessionIds: [...item.sessionIds],
      })),
    };
    const payload = JSON.stringify(document, null, 2) + "\n";

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let published = false;
    try {
      await mkdir(directory, { recursive: true });
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(payload, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.#filePath);
      published = true;

      // Persist the directory entry on POSIX. Windows does not expose the same
      // directory-fsync contract through Node's portable API.
      if (process.platform !== "win32") {
        const directoryHandle = await open(directory, "r");
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      }
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      if (!published) await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
