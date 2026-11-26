import { PluginManager } from "./core/plugin-manager.js";
import { createUiServer, listenUiServer } from "./ui/server.js";

async function main(): Promise<void> {
  const plugins = new PluginManager();
  const server = createUiServer();
  const address = await listenUiServer(server);
  console.info("Funny-business core starting");
  console.info("Mounted plugins:", plugins.list().length);
  console.info(`Local workspace UI: http://${address.host}:${address.port}`);

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try {
      await plugins.shutdown();
    } finally {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
      console.info("Funny-business core stopped");
    }
  };

  process.once("SIGINT", () => void stop().catch((error) => {
    console.error("Shutdown failed", error);
    process.exitCode = 1;
  }));
  process.once("SIGTERM", () => void stop().catch((error) => {
    console.error("Shutdown failed", error);
    process.exitCode = 1;
  }));
}

main().catch((error: unknown) => {
  console.error("Fatal startup error", error);
  process.exitCode = 1;
});
