import assert from "node:assert/strict";
import test from "node:test";
import { createServiceKey } from "./plugin.js";
import { PluginManager } from "./plugin-manager.js";

test("mounts plugins and exposes typed services", async () => {
  const manager = new PluginManager();
  const counter = createServiceKey<number>("counter");

  await manager.mount({
    id: "counter-provider",
    version: "0.1.0",
    setup(context) {
      context.services.provide(counter, 42);
    },
  });

  await manager.mount({
    id: "counter-consumer",
    version: "0.1.0",
    dependencies: ["counter-provider"],
    setup(context) {
      assert.equal(context.services.get(counter), 42);
    },
  });

  assert.deepEqual(manager.list().map((plugin) => plugin.id), [
    "counter-provider",
    "counter-consumer",
  ]);
  await manager.shutdown();
});

test("rolls back registered services when setup fails", async () => {
  const manager = new PluginManager();
  const service = createServiceKey<string>("temporary");

  await assert.rejects(
    manager.mount({
      id: "broken-plugin",
      version: "0.1.0",
      setup(context) {
        context.services.provide(service, "temporary");
        throw new Error("setup failed");
      },
    }),
    /setup failed/,
  );

  await manager.mount({
    id: "recovery-plugin",
    version: "0.1.0",
    setup(context) {
      context.services.provide(service, "recovered");
    },
  });

  assert.equal(manager.list().length, 1);
  await manager.shutdown();
});

test("does not unmount a dependency while a dependent is active", async () => {
  const manager = new PluginManager();
  await manager.mount({ id: "base", version: "1.0.0", setup: () => undefined });
  await manager.mount({
    id: "feature",
    version: "1.0.0",
    dependencies: ["base"],
    setup: () => undefined,
  });

  await assert.rejects(manager.unmount("base"), /active dependents/);
  await manager.shutdown();
  assert.equal(manager.list().length, 0);
});
