import type {
  Disposer,
  Logger,
  MountedPlugin,
  PluginContext,
  PluginDefinition,
} from "./plugin.js";
import { DefaultServiceRegistry } from "./service-registry.js";

const defaultLogger: Logger = {
  info: (message, fields) => console.info(message, fields ?? {}),
  warn: (message, fields) => console.warn(message, fields ?? {}),
  error: (message, fields) => console.error(message, fields ?? {}),
};

export class PluginManager {
  readonly #mounted = new Map<string, MountedPlugin>();
  readonly #services = new DefaultServiceRegistry();
  readonly #logger: Logger;
  #operationTail: Promise<void> = Promise.resolve();
  #shuttingDown = false;

  constructor(logger: Logger = defaultLogger) {
    this.#logger = logger;
  }

  list(): readonly MountedPlugin[] {
    return [...this.#mounted.values()];
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationTail.then(operation);
    this.#operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  mount(plugin: PluginDefinition): Promise<void> {
    return this.#exclusive(() => this.#mount(plugin));
  }

  async #mount(plugin: PluginDefinition): Promise<void> {
    if (this.#shuttingDown) throw new Error("Plugin manager is shutting down");
    if (this.#mounted.has(plugin.id)) {
      throw new Error("Plugin already mounted: " + plugin.id);
    }
    for (const dependency of plugin.dependencies ?? []) {
      if (!this.#mounted.has(dependency)) {
        throw new Error('Plugin "' + plugin.id + '" requires "' + dependency + '"');
      }
    }

    const disposers: Disposer[] = [];
    const context: PluginContext = {
      services: {
        has: (key) => this.#services.has(key),
        get: (key) => this.#services.get(key),
        provide: (key, value) => {
          const dispose = this.#services.provide(key, value);
          disposers.push(dispose);
          return dispose;
        },
      },
      logger: this.#logger,
    };

    try {
      const pluginDisposer = await plugin.setup(context);
      if (pluginDisposer) disposers.push(pluginDisposer);

      // Successful cleanup steps are removed; failed steps remain retryable.
      const pendingDisposers = [...disposers];
      const mounted: MountedPlugin = {
        id: plugin.id,
        version: plugin.version,
        dependencies: [...(plugin.dependencies ?? [])],
        dispose: async () => {
          const errors: unknown[] = [];
          for (let index = pendingDisposers.length - 1; index >= 0; index -= 1) {
            try {
              await pendingDisposers[index]!();
              pendingDisposers.splice(index, 1);
            } catch (error) {
              errors.push(error);
            }
          }
          if (errors.length) {
            throw new AggregateError(errors, "Plugin disposal failed: " + plugin.id);
          }
        },
      };

      this.#mounted.set(plugin.id, mounted);
      this.#logger.info("Plugin mounted", { id: plugin.id, version: plugin.version });
    } catch (setupError) {
      const cleanupErrors: unknown[] = [];
      for (const dispose of disposers.reverse()) {
        try {
          await dispose();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
          this.#logger.error("Plugin setup rollback failed", {
            id: plugin.id,
            error: String(cleanupError),
          });
        }
      }
      if (cleanupErrors.length) {
        throw new AggregateError(
          [setupError, ...cleanupErrors],
          "Plugin setup and rollback failed: " + plugin.id,
        );
      }
      throw setupError;
    }
  }

  unmount(pluginId: string): Promise<void> {
    return this.#exclusive(() => this.#unmount(pluginId));
  }

  async #unmount(pluginId: string): Promise<void> {
    const plugin = this.#mounted.get(pluginId);
    if (!plugin) return;

    const dependents = [...this.#mounted.values()].filter((candidate) =>
      candidate.dependencies.includes(pluginId),
    );
    if (dependents.length) {
      throw new Error(
        "Cannot unmount " + pluginId + "; active dependents: " +
        dependents.map((item) => item.id).join(", "),
      );
    }

    // Keep the plugin registered if disposal fails, so its degraded state is visible
    // and shutdown can retry the remaining cleanup steps.
    await plugin.dispose();
    this.#mounted.delete(pluginId);
    this.#logger.info("Plugin unmounted", { id: pluginId });
  }

  shutdown(): Promise<void> {
    return this.#exclusive(() => this.#shutdown());
  }

  async #shutdown(): Promise<void> {
    this.#shuttingDown = true;
    const errors: unknown[] = [];
    const attempted = new Set<string>();

    while (this.#mounted.size) {
      const plugins = [...this.#mounted.values()];
      const leaf = plugins.find(
        (candidate) =>
          !attempted.has(candidate.id) &&
          !plugins.some((other) => other.dependencies.includes(candidate.id)),
      );
      if (!leaf) {
        const remaining = plugins.filter((plugin) => !attempted.has(plugin.id));
        if (remaining.length) {
          throw new Error("Plugin dependency cycle detected during shutdown");
        }
        break;
      }

      attempted.add(leaf.id);
      try {
        await this.#unmount(leaf.id);
      } catch (error) {
        errors.push(error);
        // Do not hide or forget a plugin whose cleanup failed.
      }
    }

    if (errors.length) {
      throw new AggregateError(errors, "One or more plugins failed to stop");
    }
  }
}
