const toast = document.querySelector("#toast");
let toastTimer;
let workspaces = [];
let selectedWorkspaceId = null;
let sessions = [];
let selectedSessionId = null;
let messages = [];
let filesystemGrant = null;
let filesystemPath = "";
let sessionEvents = null;

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    notify(button.dataset.view === "workspace" ? "Workspace view" : button.dataset.view[0].toUpperCase() + button.dataset.view.slice(1) + " module is coming next");
  });
});
document.querySelector("#sidebar-toggle").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("collapsed");
  document.querySelector(".app-shell").classList.toggle("sidebar-hidden");
});
document.querySelector("#agent-collapse").addEventListener("click", () => {
  document.querySelector("#agent-panel").classList.toggle("collapsed");
  document.querySelector(".app-shell").classList.toggle("agent-hidden");
});

const dialog = document.querySelector("#workspace-dialog");
function openWorkspaceDialog() {
  dialog.showModal();
  document.querySelector("#workspace-path").focus();
}
["#open-project", "#add-project", "#create-project"].forEach((selector) => {
  document.querySelector(selector)?.addEventListener("click", openWorkspaceDialog);
});
["#close-workspace-dialog", "#cancel-workspace"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => dialog.close());
});

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Local host request failed");
  return result;
}

function updateWorkspaceContext(workspace) {
  document.querySelector("#workspace-switcher").replaceChildren();
  const dot = document.createElement("span");
  dot.className = "workspace-dot";
  const name = document.createTextNode(" " + (workspace?.title || "No workspace selected") + " ");
  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "⌄";
  document.querySelector("#workspace-switcher").append(dot, name, chevron);
  document.querySelector("#agent-context-workspace").textContent = workspace?.title || "No workspace selected";
}

function renderWorkspaces() {
  const grid = document.querySelector("#project-grid");
  grid.replaceChildren();
  for (const workspace of workspaces) {
    const card = document.createElement("article");
    card.className = "project-card" + (workspace.id === selectedWorkspaceId ? " selected-project" : "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", String(workspace.id === selectedWorkspaceId));
    const top = document.createElement("div");
    top.className = "project-card-top";
    const symbol = document.createElement("div");
    symbol.className = "project-symbol purple-bg";
    symbol.textContent = workspace.title.slice(0, 2).toUpperCase();
    const local = document.createElement("span");
    local.className = "more-button";
    local.textContent = "LOCAL";
    top.append(symbol, local);
    const title = document.createElement("h3");
    title.textContent = workspace.title;
    const description = document.createElement("p");
    description.textContent = workspace.path;
    const foot = document.createElement("div");
    foot.className = "project-card-foot";
    const status = document.createElement("span");
    status.textContent = "● Registered";
    const count = document.createElement("span");
    count.textContent = workspace.sessionIds.length + " sessions";
    foot.append(status, count);
    card.append(top, title, description, foot);
    const select = () => selectWorkspace(workspace.id);
    card.addEventListener("click", select);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
    grid.append(card);
  }

  const add = document.createElement("article");
  add.className = "project-card dashed-card";
  add.id = "create-project";
  add.tabIndex = 0;
  add.setAttribute("role", "button");
  const plus = document.createElement("div");
  plus.className = "plus-circle";
  plus.textContent = "＋";
  const heading = document.createElement("h3");
  heading.textContent = "Add a workspace";
  const copy = document.createElement("p");
  copy.textContent = "Open a folder or connect a repository";
  add.append(plus, heading, copy);
  add.addEventListener("click", openWorkspaceDialog);
  add.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openWorkspaceDialog();
  });
  grid.append(add);
  updateWorkspaceContext(workspaces.find((item) => item.id === selectedWorkspaceId));
}

async function selectWorkspace(id) {
  selectedWorkspaceId = id;
  selectedSessionId = null;
  renderWorkspaces();
  await loadSessions();
  await loadMessages();
  await loadFilesystem();
  connectSessionFeed();
}

function renderSessions() {
  const container = document.querySelector("#recent-sessions");
  container.replaceChildren();
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  if (!workspace) {
    const empty = document.createElement("div");
    empty.className = "task-row";
    empty.textContent = "Select a workspace";
    container.append(empty);
    sessions = [];
    return;
  }
  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task-row";
    empty.textContent = "No sessions yet";
    container.append(empty);
    return;
  }
  for (const session of sessions) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "task-row" + (session.id === selectedSessionId ? " active-task" : "");
    const indicator = document.createElement("span");
    indicator.className = "task-indicator " + (session.status === "active" ? "running" : "done");
    const title = document.createElement("span");
    title.textContent = session.title;
    const time = document.createElement("span");
    time.className = "task-time";
    time.textContent = session.status === "archived" ? "archived" : "active";
    row.append(indicator, title, time);
    row.addEventListener("click", () => {
      selectedSessionId = session.id;
      renderSessions();
      void loadMessages();
      notify("Selected session: " + session.title);
    });
    container.append(row);
  }
}

function connectSessionFeed() {
  if (sessionEvents) {
    sessionEvents.close();
    sessionEvents = null;
  }
  const workspaceId = selectedWorkspaceId;
  if (!workspaceId || typeof EventSource === "undefined") return;

  const stream = new EventSource("/api/workspaces/" + encodeURIComponent(workspaceId) + "/sessions/events");
  sessionEvents = stream;
  stream.addEventListener("snapshot", (event) => {
    if (selectedWorkspaceId !== workspaceId) return;
    try {
      const message = JSON.parse(event.data);
      sessions = Array.isArray(message.sessions) ? message.sessions : [];
      if (selectedSessionId && !sessions.some((item) => item.id === selectedSessionId)) selectedSessionId = null;
      renderSessions();
    } catch {
      notify("Received an invalid Session update from the local host.");
    }
  });
  stream.addEventListener("change", (event) => {
    if (selectedWorkspaceId !== workspaceId) return;
    try {
      const change = JSON.parse(event.data).change;
      if (change.kind === "removed") {
        sessions = sessions.filter((item) => item.id !== change.sessionId);
      } else if (change.session) {
        const index = sessions.findIndex((item) => item.id === change.session.id);
        if (index >= 0) sessions[index] = change.session;
        else sessions.unshift(change.session);
      }
      if (selectedSessionId && !sessions.some((item) => item.id === selectedSessionId)) selectedSessionId = null;
      renderSessions();
    } catch {
      notify("Received an invalid Session update from the local host.");
    }
  });
}

async function loadSessions() {
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  if (!workspace) {
    sessions = [];
    renderSessions();
    return;
  }
  try {
    const result = await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/sessions");
    sessions = result.sessions;
    if (selectedSessionId && !sessions.some((item) => item.id === selectedSessionId)) selectedSessionId = null;
    renderSessions();
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not load sessions");
  }
}

async function loadWorkspaces() {
  try {
    const result = await api("/api/workspaces");
    workspaces = result.workspaces;
    if (!workspaces.some((item) => item.id === selectedWorkspaceId)) selectedWorkspaceId = workspaces[0]?.id ?? null;
    renderWorkspaces();
    await loadSessions();
    await loadMessages();
    await loadFilesystem();
    connectSessionFeed();
  } catch {
    notify("Could not load Workspace data from the local host.");
  }
}

document.querySelector("#workspace-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const path = document.querySelector("#workspace-path").value.trim();
  const title = document.querySelector("#workspace-title").value.trim();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, ...(title ? { title } : {}) }),
    });
    dialog.close();
    event.currentTarget.reset();
    await loadWorkspaces();
    await selectWorkspace(result.workspace.id);
    notify("Workspace added: " + result.workspace.title);
  } catch (error) {
    notify(error instanceof Error ? error.message : "Workspace could not be added");
  } finally {
    submit.disabled = false;
  }
});

async function loadFilesystem() {
  const browser = document.querySelector("#file-browser");
  const actions = document.querySelector("#filesystem-actions");
  const preview = document.querySelector("#file-preview");
  browser.replaceChildren();
  preview.hidden = true;
  preview.textContent = "";
  filesystemGrant = null;
  filesystemPath = "";
  actions.replaceChildren();
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  if (!workspace) {
    browser.textContent = "Select a Workspace first.";
    return;
  }
  try {
    const result = await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/access-grants");
    if (selectedWorkspaceId !== workspace.id) return;
    filesystemGrant = result.grants.find((grant) => grant.operations.includes("list")) ?? null;
    if (!filesystemGrant) {
      const grantButton = document.createElement("button");
      grantButton.className = "secondary-button small";
      grantButton.textContent = "Grant read-only access";
      grantButton.addEventListener("click", grantFilesystemAccess);
      actions.append(grantButton);
      browser.textContent = "No file access grant. Grant list/read access to inspect this Workspace. No files are modified.";
      return;
    }
    const revokeButton = document.createElement("button");
    revokeButton.className = "text-button";
    revokeButton.textContent = "Revoke access";
    revokeButton.addEventListener("click", revokeFilesystemAccess);
    actions.append(revokeButton);
    await renderFilesystemDirectory();
  } catch (error) {
    browser.textContent = error instanceof Error ? error.message : "Filesystem service unavailable.";
  }
}

async function grantFilesystemAccess() {
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  if (!workspace) return;
  try {
    await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/access-grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations: ["list", "read"] }),
    });
    notify("Read-only file access granted for " + workspace.title);
    await loadFilesystem();
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not grant file access");
  }
}

async function revokeFilesystemAccess() {
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  if (!workspace || !filesystemGrant) return;
  try {
    await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/access-grants/" + encodeURIComponent(filesystemGrant.id) + "/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    notify("Workspace file access revoked");
    await loadFilesystem();
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not revoke file access");
  }
}

async function renderFilesystemDirectory() {
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  const browser = document.querySelector("#file-browser");
  const preview = document.querySelector("#file-preview");
  const requestedPath = filesystemPath;
  if (!workspace || !filesystemGrant) return;
  browser.replaceChildren();
  preview.hidden = true;
  const toolbar = document.createElement("div");
  toolbar.className = "file-toolbar";
  const pathLabel = document.createElement("span");
  pathLabel.className = "file-path";
  pathLabel.textContent = "/" + filesystemPath;
  toolbar.append(pathLabel);
  if (filesystemPath) {
    const up = document.createElement("button");
    up.className = "text-button";
    up.textContent = "Up";
    up.addEventListener("click", () => {
      filesystemPath = filesystemPath.split("/").slice(0, -1).join("/");
      void renderFilesystemDirectory();
    });
    toolbar.append(up);
  }
  browser.append(toolbar);
  try {
    const query = new URLSearchParams({ path: requestedPath });
    const result = await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/files?" + query.toString());
    if (selectedWorkspaceId !== workspace.id || filesystemPath !== requestedPath) return;
    if (!result.entries.length) {
      const empty = document.createElement("p");
      empty.className = "file-browser-empty";
      empty.textContent = "This folder is empty.";
      browser.append(empty);
      return;
    }
    for (const entry of result.entries) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "file-entry";
      row.disabled = entry.kind === "symlink" || entry.kind === "other";
      const glyph = document.createElement("span");
      glyph.className = "file-entry-kind";
      glyph.textContent = entry.kind === "directory" ? "▰" : entry.kind === "symlink" ? "↗" : "·";
      const name = document.createElement("span");
      name.className = "file-entry-name";
      name.textContent = entry.name;
      const detail = document.createElement("span");
      detail.className = "file-entry-detail";
      detail.textContent = entry.kind === "file" ? formatBytes(entry.size) : entry.kind;
      row.append(glyph, name, detail);
      if (entry.kind === "directory") {
        row.addEventListener("click", () => {
          filesystemPath = [filesystemPath, entry.name].filter(Boolean).join("/");
          void renderFilesystemDirectory();
        });
      } else if (entry.kind === "file" && filesystemGrant.operations.includes("read")) {
        row.addEventListener("click", () => void previewWorkspaceFile(entry.name, entry.version));
      }
      browser.append(row);
    }
  } catch (error) {
    const failure = document.createElement("p");
    failure.className = "file-browser-empty";
    failure.textContent = error instanceof Error ? error.message : "Could not list this directory.";
    browser.append(failure);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function previewWorkspaceFile(name, version) {
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  if (!workspace || !filesystemGrant?.operations.includes("read")) return;
  const path = [filesystemPath, name].filter(Boolean).join("/");
  const query = new URLSearchParams({ path, ...(version ? { version } : {}) });
  const preview = document.querySelector("#file-preview");
  try {
    const result = await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/file?" + query.toString());
    if (selectedWorkspaceId !== workspace.id) return;
    preview.textContent = result.file.content;
    preview.hidden = false;
    preview.dataset.path = result.file.path;
    preview.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not read file");
  }
}

async function createSession() {
  const workspace = workspaces.find((item) => item.id === selectedWorkspaceId);
  if (!workspace) {
    notify("Add or select a Workspace first.");
    openWorkspaceDialog();
    return;
  }
  try {
    const result = await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    selectedSessionId = result.session.id;
    await loadWorkspaces();
    await loadSessions();
    await loadMessages();
    document.querySelector("#agent-input").focus();
    notify("Session created: " + result.session.title);
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not create Session");
  }
}

["#new-chat", "#start-task"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", createSession);
});
document.querySelector("#resume-task").addEventListener("click", () => {
  const latest = sessions.find((item) => item.status === "active");
  if (!latest) return createSession();
  selectedSessionId = latest.id;
  loadSessions();
  void loadMessages();
  document.querySelector("#agent-input").focus();
  notify("Resumed session: " + latest.title);
});
document.querySelector("#workspace-switcher").addEventListener("click", () => {
  if (workspaces.length < 2) return notify("Add another Workspace to switch projects.");
  const current = workspaces.findIndex((item) => item.id === selectedWorkspaceId);
  void selectWorkspace(workspaces[(current + 1) % workspaces.length].id);
});

document.querySelector("#search-button").addEventListener("click", () => notify("Workspace search will be connected to the host index."));
document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#agent-input").value = button.dataset.prompt;
    document.querySelector("#agent-input").focus();
  });
});
async function loadMessages() {
  const container = document.querySelector("#agent-messages");
  const emptyIcon = document.querySelector(".agent-empty-icon");
  const emptyHeading = document.querySelector(".agent-body > h3");
  const emptyCopy = document.querySelector(".agent-body > p");
  const suggestions = document.querySelector(".suggestion-list");
  container.replaceChildren();
  messages = [];
  if (!selectedSessionId) {
    emptyIcon.hidden = false;
    emptyHeading.hidden = false;
    emptyCopy.hidden = false;
    suggestions.hidden = false;
    return;
  }
  try {
    const result = await api("/api/sessions/" + encodeURIComponent(selectedSessionId) + "/messages");
    messages = result.messages;
    for (const message of messages) {
      const bubble = document.createElement("article");
      bubble.className = "message-bubble user-message";
      const role = document.createElement("div");
      role.className = "message-role";
      role.textContent = "YOU";
      const content = document.createElement("p");
      content.textContent = message.content;
      const time = document.createElement("time");
      time.textContent = new Date(message.createdAt).toLocaleString();
      bubble.append(role, content, time);
      container.append(bubble);
    }
    const hasMessages = messages.length > 0;
    emptyIcon.hidden = hasMessages;
    emptyHeading.hidden = hasMessages;
    emptyCopy.hidden = hasMessages;
    suggestions.hidden = hasMessages;
    container.scrollTop = container.scrollHeight;
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not load conversation");
  }
}

document.querySelector("#send-prompt").addEventListener("click", async () => {
  const input = document.querySelector("#agent-input");
  const content = input.value.trim();
  if (!content) return notify("Write a task first.");
  if (!selectedSessionId) return notify("Create or select a Session first.");
  const button = document.querySelector("#send-prompt");
  button.disabled = true;
  try {
    await api("/api/sessions/" + encodeURIComponent(selectedSessionId) + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    input.value = "";
    await loadMessages();
    notify("Message saved to this Session. Agent execution is not connected yet.");
  } catch (error) {
    notify(error instanceof Error ? error.message : "Message could not be saved");
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#agent-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.querySelector("#send-prompt").click();
  }
});

window.addEventListener("pagehide", () => sessionEvents?.close());
loadWorkspaces();
fetch("/api/health").then((response) => response.json()).then((health) => {
  if (health.status !== "ok") notify("Local UI health check failed.");
}).catch(() => notify("Local UI health check unavailable."));
