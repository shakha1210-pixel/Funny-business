import { randomUUID } from "node:crypto";
import type { Session } from "../core/session-registry.js";
import type { SessionCreationJournal } from "../core/session-creation-journal.js";
import type { SessionMessage } from "../core/session-message-store.js";
import type { SessionMessageRegistry } from "../core/session-message-registry.js";
import type { SessionChange, SessionRegistry } from "../core/session-registry.js";
import type { Workspace, WorkspaceChange, WorkspaceRegistry, WorkspaceRegistrySnapshot } from "../core/workspace-registry.js";
import type { FilesystemGrant, FilesystemListing, FilesystemOperation, FilesystemReadResult, WorkspaceFilesystem } from "../core/workspace-filesystem.js";

export interface WorkspaceFeedMessage {
  readonly type: "snapshot" | "change";
  readonly revision: number;
  readonly workspaces?: readonly Workspace[];
  readonly change?: WorkspaceChange;
}

export interface WorkspaceWatchOptions {
  readonly signal?: AbortSignal;
  readonly maxQueue?: number;
}

export interface SessionFeedMessage {
  readonly type: "snapshot" | "change";
  readonly revision: number;
  readonly sessions?: readonly Session[];
  readonly change?: SessionChange;
}

export interface SessionWatchOptions {
  readonly signal?: AbortSignal;
  readonly maxQueue?: number;
}

export interface WorkspaceHost {
  list(): readonly Workspace[];
  create(path: string, title?: string): Promise<Workspace>;
  rename(id: string, title: string): Promise<Workspace>;
  unregister(id: string): Promise<boolean>;
  listSessions(workspaceId: string): readonly Session[];
  createSession(workspaceId: string, title?: string): Promise<Session>;
  renameSession(sessionId: string, title: string): Promise<Session>;
  archiveSession(sessionId: string): Promise<Session>;
  listMessages(sessionId: string): Promise<readonly SessionMessage[]>;
  appendUserMessage(sessionId: string, content: string): Promise<SessionMessage>;
  listFilesystemGrants(workspaceId: string): readonly FilesystemGrant[];
  grantFilesystemAccess(workspaceId: string, operations?: readonly FilesystemOperation[]): Promise<FilesystemGrant>;
  revokeFilesystemAccess(grantId: string): Promise<boolean>;
  listFiles(workspaceId: string, path?: string, cursor?: string, limit?: number): Promise<FilesystemListing>;
  readFile(workspaceId: string, path: string, expectedVersion?: string): Promise<FilesystemReadResult>;
  watch(options?: WorkspaceWatchOptions): AsyncIterable<WorkspaceFeedMessage>;
  watchSessions(workspaceId: string, options?: SessionWatchOptions): AsyncIterable<SessionFeedMessage>;
}

function snapshotMessage(state: WorkspaceRegistrySnapshot): WorkspaceFeedMessage {
  return { type: "snapshot", revision: state.revision, workspaces: state.workspaces };
}

/** Adapts domain registries to the transport-neutral application host contract. */
export class RegistryWorkspaceHost implements WorkspaceHost {
  readonly #registry: WorkspaceRegistry;
  readonly #sessions: SessionRegistry;
  readonly #journal: SessionCreationJournal;
  readonly #messages: SessionMessageRegistry;
  readonly #filesystem: WorkspaceFilesystem | undefined;
  #creationTail: Promise<void> = Promise.resolve();

  constructor(
    registry: WorkspaceRegistry,
    sessions: SessionRegistry,
    journal: SessionCreationJournal,
    messages: SessionMessageRegistry,
    filesystem?: WorkspaceFilesystem,
  ) {
    this.#registry = registry;
    this.#sessions = sessions;
    this.#journal = journal;
    this.#messages = messages;
    this.#filesystem = filesystem;
  }

  list(): readonly Workspace[] {
    return this.#registry.list();
  }

  create(path: string, title?: string): Promise<Workspace> {
    return this.#registry.create(path, title);
  }

  rename(id: string, title: string): Promise<Workspace> {
    return this.#registry.rename(id, title);
  }

  unregister(id: string): Promise<boolean> {
    return this.#registry.unregister(id);
  }

  listSessions(workspaceId: string): readonly Session[] {
    const workspace = this.#registry.get(workspaceId);
    if (!workspace) throw new Error("Workspace not found: " + workspaceId);
    return workspace.sessionIds.map((id) => {
      const session = this.#sessions.get(id);
      if (!session) throw new Error("Workspace references missing Session: " + id);
      return session;
    });
  }

  async createSession(workspaceId: string, title?: string): Promise<Session> {
    const operation = this.#creationTail.then(async () => {
      await this.recoverPendingSessionCreation();
      const workspace = this.#registry.get(workspaceId);
      if (!workspace) throw new Error("Workspace not found: " + workspaceId);
      const sessionId = randomUUID();
      await this.#journal.save({ schemaVersion: 1, workspaceId, sessionId });

      let session: Session;
      try {
        session = await this.#sessions.create(workspace.path, title, sessionId);
        await this.#registry.attachSession(workspaceId, session.id);
      } catch (error) {
        try {
          await this.#sessions.discard(sessionId);
          await this.#journal.clear();
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Session creation failed; durable recovery is pending");
        }
        throw error;
      }

      // Attachment is committed. A failed journal cleanup must never trigger compensation
      // that would delete a Session already referenced by the Workspace.
      try { await this.#journal.clear(); } catch { /* recovered before the next operation or on startup */ }
      return session;
    });
    this.#creationTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  /** Reconciles the one write-ahead operation before the host accepts requests. */
  async recoverPendingSessionCreation(): Promise<void> {
    const pending = await this.#journal.load();
    if (!pending) return;
    const workspace = this.#registry.get(pending.workspaceId);
    const session = this.#sessions.get(pending.sessionId);
    const attached = workspace?.sessionIds.includes(pending.sessionId) ?? false;

    if (attached && !session) {
      throw new Error("Recovery found a Workspace attachment without its Session: " + pending.sessionId);
    }
    if (session && workspace && !attached) {
      await this.#sessions.discard(pending.sessionId);
    }
    // If the Workspace was unregistered after a successful attachment, preserve the
    // Session: unregister is intentionally non-destructive and must never erase user work.
    await this.#journal.clear();
  }

  /** Watches one Workspace's Sessions with an atomic baseline and bounded resynchronization. */
  async *watchSessions(workspaceId: string, options: SessionWatchOptions = {}): AsyncGenerator<SessionFeedMessage> {
    const maxQueue = options.maxQueue ?? 64;
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 1) {
      throw new RangeError("Session watch maxQueue must be a positive safe integer");
    }
    if (options.signal?.aborted) return;

    const queue: SessionFeedMessage[] = [];
    let revision = 0;
    let wake: (() => void) | undefined;
    let closed = false;
    const notify = () => {
      const pending = wake;
      wake = undefined;
      pending?.();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      notify();
    };
    const currentSessions = (): readonly Session[] => {
      return this.#registry.get(workspaceId) ? this.listSessions(workspaceId) : [];
    };
    const makeSnapshot = (): SessionFeedMessage => ({
      type: "snapshot",
      revision: ++revision,
      sessions: currentSessions(),
    });
    const enqueue = (message: SessionFeedMessage) => {
      if (closed) return;
      if (queue.length >= maxQueue) queue.splice(0, queue.length, makeSnapshot());
      else queue.push(message);
      notify();
    };

    const sessionSubscription = this.#sessions.subscribe((change) => {
      const workspace = this.#registry.get(workspaceId);
      if (workspace?.sessionIds.includes(change.sessionId)) {
        enqueue({ type: "change", revision: ++revision, change });
      }
    });
    const workspaceSubscription = this.#registry.subscribe((change) => {
      if (change.workspaceId === workspaceId) enqueue(makeSnapshot());
    });
    const onAbort = () => close();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const baseline = this.listSessions(workspaceId);
      yield { type: "snapshot", revision: 0, sessions: baseline };
      while (!closed) {
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => { wake = resolve; });
      }
    } finally {
      close();
      options.signal?.removeEventListener("abort", onAbort);
      sessionSubscription.unsubscribe();
      workspaceSubscription.unsubscribe();
    }
  }

  renameSession(sessionId: string, title: string): Promise<Session> {
    return this.#sessions.rename(sessionId, title);
  }

  archiveSession(sessionId: string): Promise<Session> {
    return this.#sessions.archive(sessionId);
  }

  listMessages(sessionId: string): Promise<readonly SessionMessage[]> {
    return this.#messages.list(sessionId);
  }

  appendUserMessage(sessionId: string, content: string): Promise<SessionMessage> {
    return this.#messages.appendUserMessage(sessionId, content);
  }

  listFilesystemGrants(workspaceId: string): readonly FilesystemGrant[] {
    if (!this.#filesystem) throw new Error("Filesystem service unavailable");
    return this.#filesystem.listGrants(workspaceId);
  }

  grantFilesystemAccess(workspaceId: string, operations?: readonly FilesystemOperation[]): Promise<FilesystemGrant> {
    if (!this.#filesystem) throw new Error("Filesystem service unavailable");
    return this.#filesystem.grant(workspaceId, operations);
  }

  revokeFilesystemAccess(grantId: string): Promise<boolean> {
    if (!this.#filesystem) throw new Error("Filesystem service unavailable");
    return this.#filesystem.revoke(grantId);
  }

  listFiles(workspaceId: string, path?: string, cursor?: string, limit?: number): Promise<FilesystemListing> {
    if (!this.#filesystem) throw new Error("Filesystem service unavailable");
    return this.#filesystem.list(workspaceId, path, { ...(cursor ? { cursor } : {}), ...(limit ? { limit } : {}) });
  }

  readFile(workspaceId: string, path: string, expectedVersion?: string): Promise<FilesystemReadResult> {
    if (!this.#filesystem) throw new Error("Filesystem service unavailable");
    return this.#filesystem.read(workspaceId, path, expectedVersion);
  }

  async *watch(options: WorkspaceWatchOptions = {}): AsyncGenerator<WorkspaceFeedMessage> {
    const maxQueue = options.maxQueue ?? 64;
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 1) {
      throw new RangeError("Workspace watch maxQueue must be a positive safe integer");
    }
    if (options.signal?.aborted) return;

    const queue: WorkspaceFeedMessage[] = [];
    let wake: (() => void) | undefined;
    let closed = false;
    const notify = () => {
      const pending = wake;
      wake = undefined;
      pending?.();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      notify();
    };

    const subscription = this.#registry.subscribe((change) => {
      if (closed) return;
      const message: WorkspaceFeedMessage = { type: "change", revision: change.revision, change };
      if (queue.length >= maxQueue) {
        queue.splice(0, queue.length, snapshotMessage(this.#registry.getSnapshot()));
      } else {
        queue.push(message);
      }
      notify();
    });

    const onAbort = () => close();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      yield snapshotMessage(subscription.snapshot);
      while (!closed) {
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => { wake = resolve; });
      }
    } finally {
      close();
      options.signal?.removeEventListener("abort", onAbort);
      subscription.unsubscribe();
    }
  }
}
