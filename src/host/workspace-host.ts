import type { Workspace, WorkspaceChange, WorkspaceRegistry, WorkspaceRegistrySnapshot } from "../core/workspace-registry.js";

/**
 * Transport-neutral Workspace capability exposed by an application host.
 * Renderers depend on this contract, never on the registry or filesystem directly.
 */
export interface WorkspaceFeedMessage {
  readonly type: "snapshot" | "change";
  readonly revision: number;
  readonly workspaces?: readonly Workspace[];
  readonly change?: WorkspaceChange;
}

export interface WorkspaceWatchOptions {
  readonly signal?: AbortSignal;
  /** Maximum queued incremental messages before replacing the queue with a full snapshot. */
  readonly maxQueue?: number;
}

export interface WorkspaceHost {
  list(): readonly Workspace[];
  create(path: string, title?: string): Promise<Workspace>;
  rename(id: string, title: string): Promise<Workspace>;
  unregister(id: string): Promise<boolean>;
  watch(options?: WorkspaceWatchOptions): AsyncIterable<WorkspaceFeedMessage>;
}

function snapshotMessage(state: WorkspaceRegistrySnapshot): WorkspaceFeedMessage {
  return { type: "snapshot", revision: state.revision, workspaces: state.workspaces };
}

/** Adapts the domain registry to the host capability contract. */
export class RegistryWorkspaceHost implements WorkspaceHost {
  readonly #registry: WorkspaceRegistry;

  constructor(registry: WorkspaceRegistry) {
    this.#registry = registry;
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
        // Never silently drop state: collapse backlog into a current authoritative replacement.
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
