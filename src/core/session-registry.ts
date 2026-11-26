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
  #items = new Map<string, Session>();
  #initialized = false;
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

  create(cwd: string, title?: string): Promise<Session> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const canonical = await this.#canonicalize(cwd);
      const now = this.#now();
      const item: Session = {
        id: this.#createId(),
        cwd: canonical,
        title: title?.trim() || "New session — " + (basename(canonical) || canonical),
        createdAt: now,
        updatedAt: now,
        status: "active",
      };
      if (this.#items.has(item.id)) throw new Error("Session id collision: " + item.id);
      const next = new Map(this.#items);
      next.set(item.id, item);
      await this.#store.save(clone([...next.values()]));
      this.#items = next;
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
      return true;
    });
  }
}
