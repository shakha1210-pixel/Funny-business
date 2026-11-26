import { PluginManager } from "./core/plugin-manager.js";

async function main(): Promise<void> {
  const plugins = new PluginManager();
  console.info("Funny-business core starting");
  console.info("Mounted plugins:", plugins.list().length);

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await plugins.shutdown();
    console.info("Funny-business core stopped");
  };

  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

main().catch((error: unknown) => {
  console.error("Fatal startup error", error);
  process.exitCode = 1;
});
