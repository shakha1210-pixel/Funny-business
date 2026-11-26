import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonSessionCreationJournal } from "./session-creation-journal.js";

test("Session creation journal durably round-trips and clears pending intent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-journal-"));
  try {
    const path = join(directory, "session-creation.pending.json");
    const journal = new JsonSessionCreationJournal(path);
    const entry = { schemaVersion: 1 as const, workspaceId: "workspace-1", sessionId: "session-1" };
    assert.equal(await journal.load(), undefined);
    await journal.save(entry);
    assert.deepEqual(await journal.load(), entry);
    assert.match(await readFile(path, "utf8"), /session-1/);
    await journal.clear();
    assert.equal(await journal.load(), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Session creation journal rejects corrupt and unsupported records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-journal-invalid-"));
  try {
    const path = join(directory, "pending.json");
    const journal = new JsonSessionCreationJournal(path);
    await writeFile(path, "{broken");
    await assert.rejects(journal.load(), /invalid JSON/);
    await writeFile(path, JSON.stringify({ schemaVersion: 2, workspaceId: "w", sessionId: "s" }));
    await assert.rejects(journal.load(), /invalid operation/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
