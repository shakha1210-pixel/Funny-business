import type { Workspace } from "../core/workspace-registry.js";
import type { WorkspaceRegistry } from "../core/workspace-registry.js";

/**
 * Transport-neutral Workspace capability exposed by an application host.
 * Renderers depend on this contract, never on the registry or filesystem directly.
 */
export interface WorkspaceHost {
  list(): readonly Workspace[];
  create(path: string, title?: string): Promise<Workspace>;
  rename(id: string, title: string): Promise<Workspace>;
  unregister(id: string): Promise<boolean>;
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
}
