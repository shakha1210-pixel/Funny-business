import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface SessionMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly role: "user";
  readonly content: string;
  readonly createdAt: number;
}

export interface SessionMessageStore {
  load(sessionId: string): Promise<readonly SessionMessage[]>;
  /** Atomically replaces one Session's message snapshot. */
  save(sessionId: string, messages: readonly SessionMessage[]): Promise<void>;
}

interface SessionMessageFileV1 {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly messages: readonly SessionMessage[];
}

function fileName(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex") + ".json";
}

function isMessage(value: unknown, sessionId: string): value is SessionMessage {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.length > 0 &&
    item.sessionId === sessionId && item.role === "user" &&
    typeof item.content === "string" && item.content.length > 0 &&
    typeof item.createdAt === "number" && Number.isFinite(item.createdAt);
}

function parse(source: string, sessionId: string): SessionMessage[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error("Session message store contains invalid JSON", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("Session message store has an invalid root value");
  const document = parsed as Record<string, unknown>;
  if (document.schemaVersion !== 1 || document.sessionId !== sessionId || !Array.isArray(document.messages)) {
    throw new Error("Unsupported or invalid Session message store schema");
  }
  if (!document.messages.every((item) => isMessage(item, sessionId))) {
    throw new Error("Session message store contains an invalid message");
  }
  const ids = new Set<string>();
  for (const message of document.messages) {
    if (ids.has(message.id)) throw new Error("Session message store contains duplicate id: " + message.id);
    ids.add(message.id);
  }
  return document.messages.map((message) => ({ ...message }));
}

/** One atomic, per-Session JSON snapshot. The host lock supplies single-process ownership. */
export class JsonSessionMessageStore implements SessionMessageStore {
  readonly #directory: string;

  constructor(directory: string) {
    this.#directory = directory;
  }

  #path(sessionId: string): string {
    return join(this.#directory, fileName(sessionId));
  }

  async load(sessionId: string): Promise<readonly SessionMessage[]> {
    try {
      return parse(await readFile(this.#path(sessionId), "utf8"), sessionId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(sessionId: string, messages: readonly SessionMessage[]): Promise<void> {
    const path = this.#path(sessionId);
    const temporaryPath = join(this.#directory, ".messages.tmp-" + randomUUID());
    const document: SessionMessageFileV1 = {
      schemaVersion: 1,
      sessionId,
      messages: messages.map((message) => ({ ...message })),
    };
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let published = false;
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify(document, null, 2) + "\n", "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, path);
      published = true;
      if (process.platform !== "win32") {
        const directoryHandle = await open(this.#directory, "r");
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
