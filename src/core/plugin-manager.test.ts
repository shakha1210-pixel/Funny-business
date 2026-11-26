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


test("serializes concurrent mounts with the same plugin id", async () => {
  const manager = new PluginManager();
  let setupCount = 0;
  let releaseSetup!: () => void;
  const gate = new Promise<void>((resolve) => { releaseSetup = resolve; });

  const first = manager.mount({
    id: "same-id",
    version: "1.0.0",
    async setup() {
      setupCount += 1;
      await gate;
    },
  });
  const second = manager.mount({
    id: "same-id",
    version: "1.0.0",
    setup() { setupCount += 1; },
  });

  releaseSetup();
  await first;
  await assert.rejects(second, /already mounted/);
  assert.equal(setupCount, 1);
  await manager.shutdown();
});

test("keeps a plugin visible when disposal fails and retries failed cleanup", async () => {
  const manager = new PluginManager();
  let attempts = 0;
  await manager.mount({
    id: "flaky-disposer",
    version: "1.0.0",
    setup() {
      return () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary cleanup failure");
      };
    },
  });

  await assert.rejects(manager.shutdown(), /failed to stop/);
  assert.deepEqual(manager.list().map((plugin) => plugin.id), ["flaky-disposer"]);
  assert.equal(attempts, 1);

  await manager.shutdown();
  assert.equal(manager.list().length, 0);
  assert.equal(attempts, 2);
  await assert.rejects(
    manager.mount({ id: "too-late", version: "1.0.0", setup: () => undefined }),
    /shutting down/,
  );
});

test("does not dispose a plugin twice when concurrent unmounts race", async () => {
  const manager = new PluginManager();
  let disposeCount = 0;
  await manager.mount({
    id: "once",
    version: "1.0.0",
    setup() {
      return async () => {
        await Promise.resolve();
        disposeCount += 1;
      };
    },
  });

  await Promise.all([manager.unmount("once"), manager.unmount("once")]);
  assert.equal(disposeCount, 1);
  assert.equal(manager.list().length, 0);
});
