import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostLockError, JsonHostLock } from "./host-lock.js";

test("host lock excludes a second owner and releases cleanly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-host-lock-"));
  try {
    const first = new JsonHostLock(directory);
    const second = new JsonHostLock(directory);
    await first.acquire();
    const owner = JSON.parse(await readFile(join(directory, ".host.lock", "owner.json"), "utf8"));
    assert.equal(owner.schemaVersion, 1);
    assert.equal(owner.pid, process.pid);
    await assert.rejects(second.acquire(), (error: unknown) => {
      assert.ok(error instanceof HostLockError);
      assert.match(error.message, /already locked/);
      return true;
    });
    await first.release();
    await second.acquire();
    await second.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("host lock fails closed on a stale or incomplete lock directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-host-lock-stale-"));
  try {
    const lockDirectory = join(directory, ".host.lock");
    await mkdir(lockDirectory);
    await assert.rejects(new JsonHostLock(directory).acquire(), (error: unknown) => {
      assert.ok(error instanceof HostLockError);
      assert.match(error.message, /owner metadata unavailable/);
      assert.match(error.message, /remove the stale \.host\.lock directory manually/);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("host lock refuses to release when ownership metadata changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-host-lock-owner-"));
  try {
    const lock = new JsonHostLock(directory);
    await lock.acquire();
    const ownerPath = join(directory, ".host.lock", "owner.json");
    const owner = JSON.parse(await readFile(ownerPath, "utf8"));
    await writeFile(ownerPath, JSON.stringify({ ...owner, token: "another-owner" }));
    await assert.rejects(lock.release(), /ownership changed/);
    assert.equal(await readFile(ownerPath, "utf8").then(() => true), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("host lock excludes a separate Node process sharing the same data directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-host-lock-process-"));
  const moduleUrl = new URL("./host-lock.ts", import.meta.url).href;
  const script = [
    "import { JsonHostLock } from " + JSON.stringify(moduleUrl) + ";",
    "const lock = new JsonHostLock(" + JSON.stringify(directory) + ");",
    "await lock.acquire();",
    "console.log('LOCK_READY');",
    "await new Promise((resolve) => setTimeout(resolve, 1000));",
    "await lock.release();",
  ].join("\n");
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    const [ready] = await once(child.stdout, "data");
    assert.match(String(ready), /LOCK_READY/);
    await assert.rejects(new JsonHostLock(directory).acquire(), /already locked/);
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
    const next = new JsonHostLock(directory);
    await next.acquire();
    await next.release();
  } finally {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
