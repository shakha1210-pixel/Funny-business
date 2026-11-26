import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUiServer, listenUiServer } from "./server.js";

test("serves only allowlisted local UI assets and health endpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-ui-"));
  const server = createUiServer(directory);
  try {
    await writeFile(join(directory, "index.html"), "<h1>Funny Business</h1>");
    const address = await listenUiServer(server, 0);
    const base = `http://${address.host}:${address.port}`;

    const page = await fetch(base + "/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Funny Business/);

    const health = await fetch(base + "/api/health");
    assert.deepEqual(await health.json(), { status: "ok", ui: "prototype" });

    assert.equal((await fetch(base + "/../../package.json")).status, 404);
    assert.equal((await fetch(base + "/app.js", { method: "POST" })).status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
});
