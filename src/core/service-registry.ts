import type { Disposer, ServiceKey, ServiceRegistry } from "./plugin.js";

export class DefaultServiceRegistry implements ServiceRegistry {
  readonly #values = new Map<string, unknown>();

  has<T>(key: ServiceKey<T>): boolean {
    return this.#values.has(key.id);
  }

  get<T>(key: ServiceKey<T>): T {
    if (!this.#values.has(key.id)) {
      throw new Error("Service not registered: " + key.id);
    }
    return this.#values.get(key.id) as T;
  }

  provide<T>(key: ServiceKey<T>, value: T): Disposer {
    if (this.#values.has(key.id)) {
      throw new Error("Service already registered: " + key.id);
    }
    this.#values.set(key.id, value);
    return () => {
      if (this.#values.get(key.id) === value) this.#values.delete(key.id);
    };
  }
}
