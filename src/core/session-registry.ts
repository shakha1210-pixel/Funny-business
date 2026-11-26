import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { realpath, stat } from "node:fs/promises";

export interface Session {
  readonly id: string;
  readonly cwd: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: "active" | "archived";
}

export interface SessionStore {
  load(): Promise<readonly Session[]>;
  /** Must atomically replace the persisted snapshot or leave the previous snapshot intact. */
  save(sessions: readonly Session[]): Promise<void>;
}

export interface SessionRegistryOptions {
  readonly store: SessionStore;
  readonly canonicalizeDirectory?: (path: string) => Promise<string>;
  readonly createId?: () => string;
  readonly now?: () => number;
}

export interface SessionRegistrySnapshot {
  readonly revision: number;
  readonly sessions: readonly Session[];
}

export interface SessionChange {
  readonly revision: number;
  readonly kind: "created" | "updated" | "removed";
  readonly sessionId: string;
  readonly session?: Session;
}

export interface SessionSubscription {
  /** Captured atomically with listener registration; later changes arrive through the listener. */
  readonly snapshot: SessionRegistrySnapshot;
  unsubscribe(): void;
}

async function canonicalizeExistingDirectory(path: string): Promise<string> {
  const canonical = await realpath(resolve(path));
  const metadata = await stat(canonical);
  if (!metadata.isDirectory()) throw new Error("Session working directory is not a directory: " + path);
  return canonical;
}

function clone(items: readonly Session[]): Session[] {
  return items.map((item) => ({ ...item }));
}

export class SessionRegistry {
  readonly #store: SessionStore;
  readonly #canonicalize: (path: string) => Promise<string>;
  readonly #createId: () => string;
  readonly #now: () => number;
  readonly #listeners = new Set<(change: SessionChange) => void>();
  #items = new Map<string, Session>();
  #initialized = false;
  #revision = 0;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: SessionRegistryOptions) {
    this.#store = options.store;
    this.#canonicalize = options.canonicalizeDirectory ?? canonicalizeExistingDirectory;
    this.#createId = options.createId ?? randomUUID;
    this.#now = options.now ?? Date.now;
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  #assertInitialized(): void {
    if (!this.#initialized) throw new Error("SessionRegistry.initialize() must be called first");
  }

  async initialize(): Promise<void> {
    return this.#exclusive(async () => {
      if (this.#initialized) return;
      const loaded = await this.#store.load();
      const next = new Map<string, Session>();
      for (const item of loaded) {
        if (next.has(item.id)) throw new Error("Duplicate Session id: " + item.id);
        const cwd = await this.#canonicalize(item.cwd);
        next.set(item.id, { ...item, cwd });
      }
      this.#items = next;
      this.#initialized = true;
    });
  }

  #state(): SessionRegistrySnapshot {
    return { revision: this.#revision, sessions: clone([...this.#items.values()]) };
  }

  #publish(kind: SessionChange["kind"], sessionId: string, session?: Session): void {
    this.#revision += 1;
    const change: SessionChange = {
      revision: this.#revision,
      kind,
      sessionId,
      ...(session ? { session: clone([session])[0]! } : {}),
    };
    for (const listener of this.#listeners) {
      try {
        listener(change);
      } catch {
        // Observers cannot invalidate a mutation that has already been persisted and committed.
      }
    }
  }

  /** Registers the listener and captures its baseline synchronously, preventing a feed race. */
  subscribe(listener: (change: SessionChange) => void): SessionSubscription {
    this.#assertInitialized();
    this.#listeners.add(listener);
    let active = true;
    return {
      snapshot: this.#state(),
      unsubscribe: () => {
        if (!active) return;
        active = false;
        this.#listeners.delete(listener);
      },
    };
  }

  getSnapshot(): SessionRegistrySnapshot {
    this.#assertInitialized();
    return this.#state();
  }

  list(): readonly Session[] {
    this.#assertInitialized();
    return clone([...this.#items.values()]);
  }

  get(id: string): Session | undefined {
    this.#assertInitialized();
    const item = this.#items.get(id);
    return item ? clone([item])[0] : undefined;
  }

  /** Implements the narrow header reader consumed by WorkspaceRegistry. */
  async getHeader(id: string): Promise<{ readonly id: string; readonly cwd: string } | undefined> {
    const item = this.get(id);
    return item ? { id: item.id, cwd: item.cwd } : undefined;
  }

  create(cwd: string, title?: string, requestedId?: string): Promise<Session> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const canonical = await this.#canonicalize(cwd);
      const now = this.#now();
      const item: Session = {
        id: requestedId ?? this.#createId(),
        cwd: canonical,
        title: title?.trim() || "New session — " + (basename(canonical) || canonical),
        createdAt: now,
        updatedAt: now,
        status: "active",
      };
      if (!item.id.trim()) throw new Error("Session id cannot be empty");
      if (this.#items.has(item.id)) throw new Error("Session id collision: " + item.id);
      const next = new Map(this.#items);
      next.set(item.id, item);
      await this.#store.save(clone([...next.values()]));
      this.#items = next;
      this.#publish("created", item.id, item);
      return clone([item])[0]!;
    });
  }

  rename(id: string, title: string): Promise<Session> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const current = this.#items.get(id);
      if (!current) throw new Error("Session not found: " + id);
      const normalized = title.trim();
      if (!normalized) throw new Error("Session title cannot be empty");
      if (normalized === current.title) return clone([current])[0]!;
      const updated: Session = { ...current, title: normalized, updatedAt: this.#now() };
      const next = new Map(this.#items);
      next.set(id, updated);
      await this.#store.save(clone([...next.values()]));
      this.#items = next;
      this.#publish("updated", id, updated);
      return clone([updated])[0]!;
    });
  }

  archive(id: string): Promise<Session> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const current = this.#items.get(id);
      if (!current) throw new Error("Session not found: " + id);
      if (current.status === "archived") return clone([current])[0]!;
      const updated: Session = { ...current, status: "archived", updatedAt: this.#now() };
      const next = new Map(this.#items);
      next.set(id, updated);
      await this.#store.save(clone([...next.values()]));
      this.#items = next;
      this.#publish("updated", id, updated);
      return clone([updated])[0]!;
    });
  }

  /** Compensation hook for a failed Workspace attachment; not exposed as a user delete operation. */
  discard(id: string): Promise<boolean> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      if (!this.#items.has(id)) return false;
      const next = new Map(this.#items);
      next.delete(id);
      await this.#store.save(clone([...next.values()]));
      this.#items = next;
      this.#publish("removed", id);
      return true;
    });
  }
}
