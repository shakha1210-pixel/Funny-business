import { homedir } from "node:os";
import { join } from "node:path";
import { PluginManager } from "./core/plugin-manager.js";
import { WorkspaceRegistry } from "./core/workspace-registry.js";
import { JsonWorkspaceStore } from "./core/workspace-store-json.js";
import { SessionRegistry } from "./core/session-registry.js";
import { JsonSessionStore } from "./core/session-store-json.js";
import { createUiServer, listenUiServer } from "./ui/server.js";
import { RegistryWorkspaceHost } from "./host/workspace-host.js";

async function main(): Promise<void> {
  const home = process.env.FUNNY_HOME ?? join(homedir(), ".funny-business");
  const sessions = new SessionRegistry({
    store: new JsonSessionStore(join(home, "sessions.json")),
  });
  await sessions.initialize();

  const workspaces = new WorkspaceRegistry({
    store: new JsonWorkspaceStore(join(home, "workspaces.json")),
    sessions,
  });
  await workspaces.initialize();

  const plugins = new PluginManager();
  const workspaceHost = new RegistryWorkspaceHost(workspaces, sessions);
  const server = createUiServer(undefined, workspaceHost);
  const address = await listenUiServer(server);
  console.info("Funny-business core starting");
  console.info("Mounted plugins:", plugins.list().length);
  console.info("Registered Workspaces:", workspaces.list().length);
  console.info("Stored Sessions:", sessions.list().length);
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
