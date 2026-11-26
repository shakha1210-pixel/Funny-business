import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { WorkspaceHost } from "../host/workspace-host.js";

const DEFAULT_PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public");
const RUNTIME_STARTED_AT = performance.now();
const ASSETS: Readonly<Record<string, { file: string; contentType: string }>> = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
};

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("Request body exceeds 64 KiB limit");
    chunks.push(buffer);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

async function handleWorkspaceApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  registry?: WorkspaceHost,
): Promise<void> {
  if (!registry) {
    sendJson(response, 503, { error: "Workspace service unavailable" });
    return;
  }
  const method = request.method ?? "GET";
  if (method === "POST" || method === "PATCH" || method === "DELETE") {
    const origin = request.headers.origin;
    const expectedOrigin = request.headers.host ? "http://" + request.headers.host : "";
    if (origin && origin !== expectedOrigin) {
      sendJson(response, 403, { error: "Cross-origin Workspace mutations are not allowed" });
      return;
    }
    if (method !== "DELETE" && !request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
      sendJson(response, 415, { error: "Workspace mutations require application/json" });
      return;
    }
  }
  try {
    const workspaceSessions = pathname.match(/^\/api\/workspaces\/([^/]+)\/sessions$/);
    if (workspaceSessions && method === "GET") {
      const workspaceId = decodeURIComponent(workspaceSessions[1]!);
      sendJson(response, 200, { sessions: registry.listSessions(workspaceId) });
      return;
    }
    if (workspaceSessions && method === "POST") {
      const workspaceId = decodeURIComponent(workspaceSessions[1]!);
      const body = await readJson(request);
      if (body.title !== undefined && typeof body.title !== "string") {
        sendJson(response, 400, { error: "title must be a string" });
        return;
      }
      const session = await registry.createSession(workspaceId, body.title as string | undefined);
      sendJson(response, 201, { session });
      return;
    }
    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && method === "PATCH") {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      const body = await readJson(request);
      if (typeof body.title !== "string") {
        sendJson(response, 400, { error: "title must be a string" });
        return;
      }
      sendJson(response, 200, { session: await registry.renameSession(sessionId, body.title) });
      return;
    }
    const archiveMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/archive$/);
    if (archiveMatch && method === "POST") {
      const sessionId = decodeURIComponent(archiveMatch[1]!);
      sendJson(response, 200, { session: await registry.archiveSession(sessionId) });
      return;
    }
    if (pathname === "/api/workspaces" && method === "GET") {
      sendJson(response, 200, { workspaces: registry.list() });
      return;
    }
    if (pathname === "/api/workspaces" && method === "POST") {
      const body = await readJson(request);
      if (typeof body.path !== "string" || !body.path.trim()) {
        sendJson(response, 400, { error: "A non-empty path is required" });
        return;
      }
      if (body.title !== undefined && typeof body.title !== "string") {
        sendJson(response, 400, { error: "title must be a string" });
        return;
      }
      const workspace = await registry.create(body.path, body.title as string | undefined);
      sendJson(response, 201, { workspace });
      return;
    }
    const match = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
    if (match && method === "PATCH") {
      const id = decodeURIComponent(match[1]!);
      const body = await readJson(request);
      if (typeof body.title !== "string") {
        sendJson(response, 400, { error: "title must be a string" });
        return;
      }
      const workspace = await registry.rename(id, body.title);
      sendJson(response, 200, { workspace });
      return;
    }
    if (match && method === "DELETE") {
      const id = decodeURIComponent(match[1]!);
      const removed = await registry.unregister(id);
      if (!removed) {
        sendJson(response, 404, { error: "Workspace not found" });
        return;
      }
      sendJson(response, 200, { removed: true, id });
      return;
    }
    if (pathname.startsWith("/api/workspaces") || pathname.startsWith("/api/sessions")) {
      sendJson(response, 405, { error: "Method or Workspace/Session API route not supported" });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace operation failed";
    const status = /not found/i.test(message) ? 404 :
      /already exists|collision/i.test(message) ? 409 :
      /required|cannot be empty|must be|valid JSON|64 KiB/i.test(message) ? 400 : 500;
    sendJson(response, status, { error: message });
  }
}

export function createUiServer(
  publicDir = DEFAULT_PUBLIC_DIR,
  workspaces?: WorkspaceHost,
): Server {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD" && method !== "POST" && method !== "PATCH" && method !== "DELETE") {
      response.writeHead(405, { Allow: "GET, HEAD, POST, PATCH, DELETE" }).end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/workspaces") || url.pathname.startsWith("/api/sessions")) {
      await handleWorkspaceApi(request, response, url.pathname, workspaces);
      return;
    }
    if (url.pathname === "/api/health") {
      sendJson(response, 200, { status: "ok", ui: "prototype" });
      return;
    }
    if (url.pathname === "/api/diagnostics" && method === "GET") {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();
      sendJson(response, 200, {
        runtime: {
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          uptimeMs: Math.round(performance.now() - RUNTIME_STARTED_AT),
          memoryBytes: {
            residentSet: memory.rss,
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            external: memory.external,
            arrayBuffers: memory.arrayBuffers,
          },
          cumulativeCpuTimeMicros: { user: cpu.user, system: cpu.system },
        },
      });
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const asset = ASSETS[url.pathname];
    if (!asset) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }

    try {
      const body = await readFile(resolve(publicDir, asset.file));
      response.writeHead(200, {
        "Content-Type": asset.contentType,
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-cache",
      });
      response.end(method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("UI asset unavailable");
    }
  });
}

export async function listenUiServer(
  server: Server,
  port = Number(process.env.PORT ?? 4317),
): Promise<{ host: "127.0.0.1"; port: number }> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("UI server did not bind to a TCP port");
  return { host: "127.0.0.1", port: address.port };
}
