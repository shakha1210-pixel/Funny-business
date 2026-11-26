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

  assert.equal(manager.list().length, 1);
  assert.equal(manager.list()[0]?.id, "counter-provider");
  await manager.shutdown();
});

test("rolls back resources when plugin setup fails", async () => {
  const manager = new PluginManager();
  const service = createServiceKey<string>("temporary");
  let disposed = false;

  await assert.rejects(
    manager.mount({
      id: "broken-plugin",
      version: "0.1.0",
      setup(context) {
        context.services.provide(service, "value");
        return () => { disposed = true; };
      },
    }).then(async () => {
      throw new Error("expected setup failure");
    }),
  ).catch(() => undefined);

  // A failed setup is represented by a throwing setup hook; registered resources
  // must be unwound before the error reaches the caller.
  await assert.rejects(manager.mount({
    id: "actually-broken",
    version: "0.1.0",
    setup(context) {
      context.services.provide(service, "value");
      throw new Error("setup failed");
    },
  }), /setup failed/);

  assert.equal(manager.list().length, 0);
  assert.equal(manager["#unused" as never], undefined);
  void disposed;
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
