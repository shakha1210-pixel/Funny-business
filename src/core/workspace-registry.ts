import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { realpath, stat } from "node:fs/promises";

export interface Workspace {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly sessionIds: readonly string[];
}

export interface WorkspaceStore {
  load(): Promise<readonly Workspace[]>;
  /** Must atomically replace the persisted snapshot or leave the previous snapshot intact. */
  save(workspaces: readonly Workspace[]): Promise<void>;
}

export interface SessionHeader {
  readonly id: string;
  readonly cwd: string;
}

export interface SessionHeaderReader {
  getHeader(sessionId: string): Promise<SessionHeader | undefined>;
}

export type CanonicalizeDirectory = (path: string) => Promise<string>;

export interface WorkspaceRegistryOptions {
  readonly store: WorkspaceStore;
  readonly sessions: SessionHeaderReader;
  readonly canonicalizeDirectory?: CanonicalizeDirectory;
  readonly createId?: () => string;
  readonly now?: () => number;
}

async function canonicalizeExistingDirectory(path: string): Promise<string> {
  const canonical = await realpath(resolve(path));
  const metadata = await stat(canonical);
  if (!metadata.isDirectory()) throw new Error("Workspace path is not a directory: " + path);
  return canonical;
}

function snapshot(items: readonly Workspace[]): Workspace[] {
  return items.map((item) => ({
    ...item,
    sessionIds: [...item.sessionIds],
  }));
}

export class WorkspaceRegistry {
  readonly #store: WorkspaceStore;
  readonly #sessions: SessionHeaderReader;
  readonly #canonicalize: CanonicalizeDirectory;
  readonly #createId: () => string;
  readonly #now: () => number;
  #items = new Map<string, Workspace>();
  #initialized = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: WorkspaceRegistryOptions) {
    this.#store = options.store;
    this.#sessions = options.sessions;
    this.#canonicalize = options.canonicalizeDirectory ?? canonicalizeExistingDirectory;
    this.#createId = options.createId ?? randomUUID;
    this.#now = options.now ?? Date.now;
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async initialize(): Promise<void> {
    return this.#exclusive(async () => {
      if (this.#initialized) return;
      const loaded = await this.#store.load();
      const next = new Map<string, Workspace>();
      const paths = new Set<string>();
      for (const item of loaded) {
        const canonical = await this.#canonicalize(item.path);
        if (next.has(item.id)) throw new Error("Duplicate Workspace id: " + item.id);
        if (paths.has(canonical)) throw new Error("Duplicate Workspace path: " + canonical);
        paths.add(canonical);
        next.set(item.id, { ...item, path: canonical, sessionIds: [...item.sessionIds] });
      }
      this.#items = next;
      this.#initialized = true;
    });
  }

  #assertInitialized(): void {
    if (!this.#initialized) throw new Error("WorkspaceRegistry.initialize() must be called first");
  }

  list(): readonly Workspace[] {
    this.#assertInitialized();
    return snapshot([...this.#items.values()]);
  }

  get(id: string): Workspace | undefined {
    this.#assertInitialized();
    const item = this.#items.get(id);
    return item ? snapshot([item])[0] : undefined;
  }

  create(path: string, title?: string): Promise<Workspace> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const canonical = await this.#canonicalize(path);
      if ([...this.#items.values()].some((item) => item.path === canonical)) {
        throw new Error("Workspace already exists for path: " + canonical);
      }
      const now = this.#now();
      const item: Workspace = {
        id: this.#createId(),
        path: canonical,
        title: title?.trim() || basename(canonical) || canonical,
        createdAt: now,
        updatedAt: now,
        sessionIds: [],
      };
      if (this.#items.has(item.id)) throw new Error("Workspace id collision: " + item.id);
      const next = new Map(this.#items);
      next.set(item.id, item);
      await this.#store.save(snapshot([...next.values()]));
      this.#items = next;
      return snapshot([item])[0]!;
    });
  }

  rename(id: string, title: string): Promise<Workspace> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const current = this.#items.get(id);
      if (!current) throw new Error("Workspace not found: " + id);
      const normalized = title.trim();
      if (!normalized) throw new Error("Workspace title cannot be empty");
      if (normalized === current.title) return snapshot([current])[0]!;
      const updated: Workspace = { ...current, title: normalized, updatedAt: this.#now() };
      const next = new Map(this.#items);
      next.set(id, updated);
      await this.#store.save(snapshot([...next.values()]));
      this.#items = next;
      return snapshot([updated])[0]!;
    });
  }

  attachSession(workspaceId: string, sessionId: string): Promise<Workspace> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      const current = this.#items.get(workspaceId);
      if (!current) throw new Error("Workspace not found: " + workspaceId);
      if (current.sessionIds.includes(sessionId)) return snapshot([current])[0]!;
      const header = await this.#sessions.getHeader(sessionId);
      if (!header) throw new Error("Session not found: " + sessionId);
      const sessionPath = await this.#canonicalize(header.cwd);
      if (sessionPath !== current.path) {
        throw new Error("Session working directory does not match Workspace path");
      }
      const updated: Workspace = {
        ...current,
        sessionIds: [sessionId, ...current.sessionIds],
        updatedAt: this.#now(),
      };
      const next = new Map(this.#items);
      next.set(workspaceId, updated);
      await this.#store.save(snapshot([...next.values()]));
      this.#items = next;
      return snapshot([updated])[0]!;
    });
  }

  /** Unregisters only the Workspace record; it never deletes project files or Sessions. */
  unregister(id: string): Promise<boolean> {
    return this.#exclusive(async () => {
      this.#assertInitialized();
      if (!this.#items.has(id)) return false;
      const next = new Map(this.#items);
      next.delete(id);
      await this.#store.save(snapshot([...next.values()]));
      this.#items = next;
      return true;
    });
  }
}
