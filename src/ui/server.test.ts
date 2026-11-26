import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUiServer, listenUiServer } from "./server.js";
import { WorkspaceRegistry, type Workspace } from "../core/workspace-registry.js";
import { RegistryWorkspaceHost } from "../host/workspace-host.js";
import { SessionRegistry, type Session, type SessionStore } from "../core/session-registry.js";
import { JsonSessionCreationJournal } from "../core/session-creation-journal.js";
import { JsonSessionMessageStore } from "../core/session-message-store.js";
import { SessionMessageRegistry } from "../core/session-message-registry.js";

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

    const diagnosticsResponse = await fetch(base + "/api/diagnostics");
    assert.equal(diagnosticsResponse.status, 200);
    const diagnostics = await diagnosticsResponse.json() as {
      runtime: {
        node: string;
        platform: string;
        architecture: string;
        uptimeMs: number;
        memoryBytes: { residentSet: number; heapUsed: number; heapTotal: number };
        cumulativeCpuTimeMicros: { user: number; system: number };
      };
    };
    assert.match(diagnostics.runtime.node, /^v\d+/);
    assert.equal(typeof diagnostics.runtime.platform, "string");
    assert.equal(typeof diagnostics.runtime.architecture, "string");
    assert.ok(diagnostics.runtime.uptimeMs >= 0);
    assert.ok(diagnostics.runtime.memoryBytes.residentSet > 0);
    assert.ok(diagnostics.runtime.memoryBytes.heapTotal >= diagnostics.runtime.memoryBytes.heapUsed);
    assert.ok(diagnostics.runtime.cumulativeCpuTimeMicros.user >= 0);
    assert.ok(diagnostics.runtime.cumulativeCpuTimeMicros.system >= 0);

    assert.equal((await fetch(base + "/../../package.json")).status, 404);
    assert.equal((await fetch(base + "/app.js", { method: "POST" })).status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
});


class TestSessionStore implements SessionStore {
  items: readonly Session[] = [];
  async load() { return this.items; }
  async save(items: readonly Session[]) { this.items = structuredClone(items); }
}

test("exposes Workspace and Session lifecycle through the host API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-api-"));
  const store: { items: readonly Workspace[]; load(): Promise<readonly Workspace[]>; save(items: readonly Workspace[]): Promise<void> } = {
    items: [],
    async load() { return this.items; },
    async save(items) { this.items = structuredClone(items); },
  };
  const sessions = new SessionRegistry({
    store: new TestSessionStore(),
    canonicalizeDirectory: async (path) => path.endsWith("/") ? path.slice(0, -1) : path,
    createId: () => "session-api-test",
  });
  await sessions.initialize();
  const registry = new WorkspaceRegistry({
    store,
    sessions,
    canonicalizeDirectory: async (path) => path.endsWith("/") ? path.slice(0, -1) : path,
    createId: () => "workspace-api-test",
  });
  await registry.initialize();
  const messages = new SessionMessageRegistry({ store: new JsonSessionMessageStore(join(directory, "messages")), sessions });
  const server = createUiServer(directory, new RegistryWorkspaceHost(
    registry, sessions, new JsonSessionCreationJournal(join(directory, "pending-session.json")), messages,
  ));
  try {
    const address = await listenUiServer(server, 0);
    const base = `http://${address.host}:${address.port}`;
    const createdResponse = await fetch(base + "/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/projects/demo", title: "Demo" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { workspace: { id: string; title: string } };
    assert.equal(created.workspace.title, "Demo");

    const feedResponse = await fetch(base + "/api/workspaces/workspace-api-test/sessions/events");
    assert.equal(feedResponse.status, 200);
    assert.match(feedResponse.headers.get("content-type") ?? "", /text\/event-stream/);
    const feedReader = feedResponse.body!.getReader();
    const decoder = new TextDecoder();
    const baselineChunk = await feedReader.read();
    assert.match(decoder.decode(baselineChunk.value), /event: snapshot/);
    assert.match(decoder.decode(baselineChunk.value), /"sessions":\[\]/);

    const sessionResponse = await fetch(base + "/api/workspaces/workspace-api-test/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "API Session" }),
    });
    assert.equal(sessionResponse.status, 201);
    const sessionBody = await sessionResponse.json() as { session: { id: string; title: string; cwd: string } };
    assert.match(sessionBody.session.id, /^[0-9a-f-]{36}$/i);
    assert.equal(sessionBody.session.title, "API Session");
    assert.equal(sessionBody.session.cwd, "/projects/demo");

    const updateChunk = await feedReader.read();
    assert.match(decoder.decode(updateChunk.value), /event: snapshot/);
    assert.match(decoder.decode(updateChunk.value), new RegExp(sessionBody.session.id));
    await feedReader.cancel();

    const sessionsResponse = await fetch(base + "/api/workspaces/workspace-api-test/sessions");
    const listedSessions = await sessionsResponse.json() as { sessions: Array<{ id: string }> };
    assert.deepEqual(listedSessions.sessions.map(({ id }) => id), [sessionBody.session.id]);

    const messageResponse = await fetch(base + "/api/sessions/" + sessionBody.session.id + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Persist this task" }),
    });
    assert.equal(messageResponse.status, 201);
    const messageBody = await messageResponse.json() as { message: { id: string; role: string; content: string } };
    assert.equal(messageBody.message.role, "user");
    assert.equal(messageBody.message.content, "Persist this task");

    const messageListResponse = await fetch(base + "/api/sessions/" + sessionBody.session.id + "/messages");
    const messageList = await messageListResponse.json() as { messages: Array<{ content: string }> };
    assert.deepEqual(messageList.messages.map((message) => message.content), ["Persist this task"]);

    const renamedSession = await fetch(base + "/api/sessions/" + sessionBody.session.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed Session" }),
    });
    assert.equal(renamedSession.status, 200);

    const archivedSession = await fetch(base + "/api/sessions/" + sessionBody.session.id + "/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(archivedSession.status, 200);
    const archivedBody = await archivedSession.json() as { session: { status: string } };
    assert.equal(archivedBody.session.status, "archived");

    const list = await fetch(base + "/api/workspaces");
    const listed = await list.json() as { workspaces: Array<{ id: string }> };
    assert.equal(listed.workspaces.length, 1);

    const renamed = await fetch(base + "/api/workspaces/workspace-api-test", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed" }),
    });
    assert.equal(renamed.status, 200);

    const removed = await fetch(base + "/api/workspaces/workspace-api-test", { method: "DELETE" });
    assert.equal(removed.status, 200);
    assert.equal(registry.list().length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
});


test("rejects cross-origin Workspace mutations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "funny-business-origin-"));
  const store: { items: readonly Workspace[]; load(): Promise<readonly Workspace[]>; save(items: readonly Workspace[]): Promise<void> } = {
    items: [],
    async load() { return this.items; },
    async save(items) { this.items = structuredClone(items); },
  };
  const sessions = new SessionRegistry({
    store: new TestSessionStore(),
    canonicalizeDirectory: async (path) => path,
  });
  await sessions.initialize();
  const registry = new WorkspaceRegistry({
    store,
    sessions,
    canonicalizeDirectory: async (path) => path,
  });
  await registry.initialize();
  const messages = new SessionMessageRegistry({ store: new JsonSessionMessageStore(join(directory, "messages")), sessions });
  const server = createUiServer(directory, new RegistryWorkspaceHost(
    registry, sessions, new JsonSessionCreationJournal(join(directory, "pending-session.json")), messages,
  ));
  try {
    const address = await listenUiServer(server, 0);
    const response = await fetch(`http://${address.host}:${address.port}/api/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://attacker.example",
      },
      body: JSON.stringify({ path: "/private/project" }),
    });
    assert.equal(response.status, 403);
    assert.equal(registry.list().length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(directory, { recursive: true, force: true });
  }
});
