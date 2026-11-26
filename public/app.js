const toast = document.querySelector("#toast");
let toastTimer;
let workspaces = [];
let selectedWorkspaceId = null;
let sessions = [];
let selectedSessionId = null;

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
}

async function loadSessions() {
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
  try {
    const result = await api("/api/workspaces/" + encodeURIComponent(workspace.id) + "/sessions");
    sessions = result.sessions;
    if (selectedSessionId && !sessions.some((item) => item.id === selectedSessionId)) selectedSessionId = null;
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
        loadSessions();
        notify("Selected session: " + session.title);
      });
      container.append(row);
    }
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
document.querySelector("#send-prompt").addEventListener("click", () => {
  const input = document.querySelector("#agent-input");
  if (!input.value.trim()) return notify("Write a task first.");
  if (!selectedSessionId) return notify("Create or select a Session first.");
  notify("Prompt captured in the selected Session. Agent runtime is not connected yet.");
});
document.querySelector("#agent-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.querySelector("#send-prompt").click();
  }
});

loadWorkspaces();
fetch("/api/health").then((response) => response.json()).then((health) => {
  if (health.status !== "ok") notify("Local UI health check failed.");
}).catch(() => notify("Local UI health check unavailable."));
