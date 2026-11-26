import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { SessionRegistry } from "./session-registry.js";
import type { SessionMessage, SessionMessageStore } from "./session-message-store.js";

export interface SessionMessageRegistryOptions {
  readonly store: SessionMessageStore;
  readonly sessions: SessionRegistry;
  readonly createId?: () => string;
  readonly now?: () => number;
  readonly maxMessageBytes?: number;
}

/** Durable user-message capture; model execution and assistant messages are deliberately separate. */
export class SessionMessageRegistry {
  readonly #store: SessionMessageStore;
  readonly #sessions: SessionRegistry;
  readonly #createId: () => string;
  readonly #now: () => number;
  readonly #maxMessageBytes: number;
  readonly #tails = new Map<string, Promise<void>>();

  constructor(options: SessionMessageRegistryOptions) {
    this.#store = options.store;
    this.#sessions = options.sessions;
    this.#createId = options.createId ?? randomUUID;
    this.#now = options.now ?? Date.now;
    this.#maxMessageBytes = options.maxMessageBytes ?? 64 * 1024;
  }

  async list(sessionId: string): Promise<readonly SessionMessage[]> {
    if (!this.#sessions.get(sessionId)) throw new Error("Session not found: " + sessionId);
    return (await this.#store.load(sessionId)).map((message) => ({ ...message }));
  }

  appendUserMessage(sessionId: string, content: string): Promise<SessionMessage> {
    const previous = this.#tails.get(sessionId) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const session = this.#sessions.get(sessionId);
      if (!session) throw new Error("Session not found: " + sessionId);
      if (session.status !== "active") throw new Error("Cannot append a message to an archived Session");
      if (typeof content !== "string" || !content.trim()) throw new Error("Message content cannot be empty");
      if (Buffer.byteLength(content, "utf8") > this.#maxMessageBytes) {
        throw new Error("Message exceeds the configured byte limit");
      }
      const existing = await this.#store.load(sessionId);
      const message: SessionMessage = {
        id: this.#createId(),
        sessionId,
        role: "user",
        content,
        createdAt: this.#now(),
      };
      await this.#store.save(sessionId, [...existing, message]);
      return { ...message };
    });
    this.#tails.set(sessionId, operation.then(() => undefined, () => undefined));
    return operation;
  }
}
