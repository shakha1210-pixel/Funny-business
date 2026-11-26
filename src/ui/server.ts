import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DEFAULT_PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public");
const ASSETS: Readonly<Record<string, { file: string; contentType: string }>> = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
};

export function createUiServer(publicDir = DEFAULT_PUBLIC_DIR): Server {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/health") {
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(method === "HEAD" ? undefined : JSON.stringify({ status: "ok", ui: "prototype" }));
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
