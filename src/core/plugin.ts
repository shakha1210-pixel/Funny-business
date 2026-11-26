export type Disposer = () => void | Promise<void>;

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface ServiceKey<T> {
  readonly id: string;
  readonly __type?: T;
}

export function createServiceKey<T>(id: string): ServiceKey<T> {
  return Object.freeze({ id });
}

export interface ServiceRegistry {
  has<T>(key: ServiceKey<T>): boolean;
  get<T>(key: ServiceKey<T>): T;
  provide<T>(key: ServiceKey<T>, value: T): Disposer;
}

export interface PluginContext {
  readonly services: ServiceRegistry;
  readonly logger: Logger;
}

export interface PluginDefinition {
  readonly id: string;
  readonly version: string;
  readonly dependencies?: readonly string[];
  setup(context: PluginContext): void | Disposer | Promise<void | Disposer>;
}

export interface MountedPlugin {
  readonly id: string;
  readonly version: string;
  readonly dependencies: readonly string[];
  dispose(): Promise<void>;
}
