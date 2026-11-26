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

  constructor(logger: Logger = defaultLogger) {
    this.#logger = logger;
  }

  list(): readonly MountedPlugin[] {
    return [...this.#mounted.values()];
  }

  async mount(plugin: PluginDefinition): Promise<void> {
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

      const mounted: MountedPlugin = {
        id: plugin.id,
        version: plugin.version,
        dependencies: [...(plugin.dependencies ?? [])],
        dispose: async () => {
          const errors: unknown[] = [];
          for (const dispose of [...disposers].reverse()) {
            try {
              await dispose();
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
    } catch (error) {
      for (const dispose of disposers.reverse()) {
        try {
          await dispose();
        } catch (cleanupError) {
          this.#logger.error("Plugin setup rollback failed", {
            id: plugin.id,
            error: String(cleanupError),
          });
        }
      }
      throw error;
    }
  }

  async unmount(pluginId: string): Promise<void> {
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

    await plugin.dispose();
    this.#mounted.delete(pluginId);
    this.#logger.info("Plugin unmounted", { id: pluginId });
  }

  async shutdown(): Promise<void> {
    const errors: unknown[] = [];
    while (this.#mounted.size) {
      const leaf = [...this.#mounted.values()].find(
        (candidate) => ![...this.#mounted.values()].some((other) =>
          other.dependencies.includes(candidate.id),
        ),
      );
      if (!leaf) {
        throw new Error("Plugin dependency cycle detected during shutdown");
      }
      try {
        await this.unmount(leaf.id);
      } catch (error) {
        errors.push(error);
        this.#mounted.delete(leaf.id);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "One or more plugins failed to stop");
    }
  }
}
