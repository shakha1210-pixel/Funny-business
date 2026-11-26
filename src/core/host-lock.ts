import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, open, readFile, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

interface HostLockOwner {
  readonly schemaVersion: 1;
  readonly pid: number;
  readonly hostname: string;
  readonly startedAt: string;
  readonly token: string;
}

export class HostLockError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HostLockError";
  }
}

/**
 * Cross-platform single-host guard using the filesystem's atomic directory creation.
 *
 * This is deliberately fail-closed: a lock left by a crash is not automatically
 * reclaimed based on PID or timestamps. It requires operator verification.
 */
export class JsonHostLock {
  readonly #directory: string;
  readonly #ownerFile: string;
  readonly #token = randomUUID();
  #acquired = false;

  constructor(dataDirectory: string) {
    this.#directory = join(dataDirectory, ".host.lock");
    this.#ownerFile = join(this.#directory, "owner.json");
  }

  async acquire(): Promise<void> {
    if (this.#acquired) throw new HostLockError("Host lock is already acquired by this instance");

    const parent = this.#directory.slice(0, Math.max(
      this.#directory.lastIndexOf("/"),
      this.#directory.lastIndexOf("\\"),
    ));
    await mkdir(parent, { recursive: true });

    try {
      await mkdir(this.#directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        let ownerDescription = "owner metadata unavailable";
        try {
          const owner = JSON.parse(await readFile(this.#ownerFile, "utf8")) as Partial<HostLockOwner>;
          if (owner.schemaVersion === 1 && typeof owner.pid === "number" &&
              typeof owner.hostname === "string" && typeof owner.startedAt === "string") {
            ownerDescription = "pid " + owner.pid + " on " + owner.hostname + ", started " + owner.startedAt;
          }
        } catch {
          // Do not infer that a lock is stale from missing or malformed metadata.
        }
        throw new HostLockError(
          "Funny-business data directory is already locked (" + ownerDescription +
          "). If the owner crashed, verify that no Funny-business process is using this directory, " +
          "then remove the stale .host.lock directory manually.",
          { cause: error },
        );
      }
      throw new HostLockError("Could not acquire the Funny-business host lock", { cause: error });
    }

    const owner: HostLockOwner = {
      schemaVersion: 1,
      pid: process.pid,
      hostname: hostname(),
      startedAt: new Date().toISOString(),
      token: this.#token,
    };
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(this.#ownerFile, "wx", 0o600);
      await handle.writeFile(JSON.stringify(owner, null, 2) + "\n", "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      this.#acquired = true;
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      // The directory is ours because this instance created it. Remove only our
      // incomplete acquisition; never remove a directory observed as pre-existing.
      await unlink(this.#ownerFile).catch(() => undefined);
      await rmdir(this.#directory).catch(() => undefined);
      throw new HostLockError("Could not persist host lock ownership metadata", { cause: error });
    }
  }

  async release(): Promise<void> {
    if (!this.#acquired) return;
    let owner: Partial<HostLockOwner>;
    try {
      owner = JSON.parse(await readFile(this.#ownerFile, "utf8")) as Partial<HostLockOwner>;
    } catch (error) {
      throw new HostLockError("Host lock ownership metadata is unavailable; refusing to release an unverified lock", {
        cause: error,
      });
    }
    if (owner.token !== this.#token) {
      throw new HostLockError("Host lock ownership changed; refusing to release another owner's lock");
    }
    await unlink(this.#ownerFile);
    await rmdir(this.#directory);
    this.#acquired = false;
  }
}
