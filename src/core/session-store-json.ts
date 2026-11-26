import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Session, SessionStore } from "./session-registry.js";

interface SessionFileV1 {
  readonly schemaVersion: 1;
  readonly sessions: readonly Session[];
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.length > 0 &&
    typeof item.cwd === "string" && item.cwd.length > 0 &&
    typeof item.title === "string" && item.title.length > 0 &&
    typeof item.createdAt === "number" && Number.isFinite(item.createdAt) &&
    typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) &&
    (item.status === "active" || item.status === "archived");
}

function parse(source: string): Session[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error("Session store contains invalid JSON", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("Session store has an invalid root value");
  const document = parsed as Record<string, unknown>;
  if (document.schemaVersion !== 1 || !Array.isArray(document.sessions)) {
    throw new Error("Unsupported or invalid Session store schema");
  }
  if (!document.sessions.every(isSession)) throw new Error("Session store contains an invalid Session record");
  const ids = new Set<string>();
  for (const item of document.sessions) {
    if (ids.has(item.id)) throw new Error("Session store contains duplicate id: " + item.id);
    ids.add(item.id);
  }
  return document.sessions.map((item) => ({ ...item }));
}

/** Atomic single-file snapshot store; it does not provide cross-process locking or a mutation journal. */
export class JsonSessionStore implements SessionStore {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async load(): Promise<readonly Session[]> {
    let source: string;
    try {
      source = await readFile(this.#filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return parse(source);
  }

  async save(sessions: readonly Session[]): Promise<void> {
    const directory = dirname(this.#filePath);
    const temporaryPath = join(directory, ".sessions.tmp-" + randomUUID());
    const document: SessionFileV1 = {
      schemaVersion: 1,
      sessions: sessions.map((item) => ({ ...item })),
    };
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let published = false;
    try {
      await mkdir(directory, { recursive: true });
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify(document, null, 2) + "\n", "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.#filePath);
      published = true;
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
