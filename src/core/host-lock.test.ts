import assert from "node:assert/strict";
import test from "node:test";
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
    assert.equal(await readFile(join(lockDirectory, "marker.txt"), "utf8").catch(() => ""), "");
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
