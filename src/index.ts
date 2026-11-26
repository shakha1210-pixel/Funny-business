import { homedir } from "node:os";
import { join } from "node:path";
import { PluginManager } from "./core/plugin-manager.js";
import { JsonHostLock } from "./core/host-lock.js";
import { WorkspaceRegistry } from "./core/workspace-registry.js";
import { JsonWorkspaceStore } from "./core/workspace-store-json.js";
import { SessionRegistry } from "./core/session-registry.js";
import { JsonSessionStore } from "./core/session-store-json.js";
import { JsonSessionCreationJournal } from "./core/session-creation-journal.js";
import { JsonSessionMessageStore } from "./core/session-message-store.js";
import { SessionMessageRegistry } from "./core/session-message-registry.js";
import { JsonFilesystemGrantStore, WorkspaceFilesystem } from "./core/workspace-filesystem.js";
import { createUiServer, listenUiServer } from "./ui/server.js";
import { RegistryWorkspaceHost } from "./host/workspace-host.js";

async function main(): Promise<void> {
  const home = process.env.FUNNY_HOME ?? join(homedir(), ".funny-business");
  const hostLock = new JsonHostLock(home);
  await hostLock.acquire();

  let server: ReturnType<typeof createUiServer> | undefined;
  let plugins: PluginManager | undefined;
  try {
    // Acquire ownership before reading or initializing any writable registry.
    const sessions = new SessionRegistry({
      store: new JsonSessionStore(join(home, "sessions.json")),
    });
    await sessions.initialize();

    const workspaces = new WorkspaceRegistry({
      store: new JsonWorkspaceStore(join(home, "workspaces.json")),
      sessions,
    });
    await workspaces.initialize();

    plugins = new PluginManager();
    const messages = new SessionMessageRegistry({
      store: new JsonSessionMessageStore(join(home, "messages")),
      sessions,
    });
    const filesystem = new WorkspaceFilesystem({
      workspaces,
      grants: new JsonFilesystemGrantStore(join(home, "filesystem-grants.json")),
    });
    await filesystem.initialize();
    const workspaceHost = new RegistryWorkspaceHost(
      workspaces,
      sessions,
      new JsonSessionCreationJournal(join(home, "session-creation.pending.json")),
      messages,
      filesystem,
    );
    await workspaceHost.recoverPendingSessionCreation();
    server = createUiServer(undefined, workspaceHost);
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
        await plugins!.shutdown();
      } finally {
        try {
          if (server?.listening) {
            await new Promise<void>((resolveClose, reject) => {
              server!.close((error) => error ? reject(error) : resolveClose());
            });
          }
        } finally {
          await hostLock.release();
          console.info("Funny-business core stopped");
        }
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
  } catch (error) {
    try {
      if (server?.listening) {
        await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
      }
    } finally {
      await hostLock.release().catch((releaseError: unknown) => {
        console.error("Host lock cleanup failed", releaseError);
      });
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error("Fatal startup error", error);
  process.exitCode = 1;
});
