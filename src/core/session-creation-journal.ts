import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface PendingSessionCreation {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly sessionId: string;
}

export interface SessionCreationJournal {
  load(): Promise<PendingSessionCreation | undefined>;
  save(entry: PendingSessionCreation): Promise<void>;
  clear(): Promise<void>;
}

/** A single-operation write-ahead journal for the Session -> Workspace attachment protocol. */
export class JsonSessionCreationJournal implements SessionCreationJournal {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async load(): Promise<PendingSessionCreation | undefined> {
    let source: string;
    try {
      source = await readFile(this.#filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      throw new Error("Session creation journal contains invalid JSON", { cause: error });
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Session creation journal has an invalid root value");
    }
    const item = parsed as Record<string, unknown>;
    if (item.schemaVersion !== 1 || typeof item.workspaceId !== "string" ||
      !item.workspaceId || typeof item.sessionId !== "string" || !item.sessionId) {
      throw new Error("Session creation journal contains an invalid operation");
    }
    return { schemaVersion: 1, workspaceId: item.workspaceId, sessionId: item.sessionId };
  }

  async save(entry: PendingSessionCreation): Promise<void> {
    const directory = dirname(this.#filePath);
    const temporaryPath = join(directory, ".session-creation.tmp-" + randomUUID());
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let published = false;
    try {
      await mkdir(directory, { recursive: true });
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify(entry, null, 2) + "\n", "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.#filePath);
      published = true;
      if (process.platform !== "win32") {
        const directoryHandle = await open(directory, "r");
        try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      }
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      if (!published) await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async clear(): Promise<void> {
    const directory = dirname(this.#filePath);
    await rm(this.#filePath, { force: true });
    if (process.platform !== "win32") {
      const directoryHandle = await open(directory, "r");
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    }
  }
}
