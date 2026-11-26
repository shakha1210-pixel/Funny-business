const toast = document.querySelector("#toast");
let toastTimer;
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
["#new-chat", "#start-task", "#resume-task"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => {
    document.querySelector("#agent-input").focus();
    notify("Task composer ready — agent runtime connection is the next integration step.");
  });
});
const dialog = document.querySelector("#workspace-dialog");
function openWorkspaceDialog() {
  dialog.showModal();
  document.querySelector("#workspace-path").focus();
}
["#open-project", "#add-project", "#create-project"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", openWorkspaceDialog);
});
document.querySelector("#workspace-switcher").addEventListener("click", () => notify("Choose a Workspace from the Projects section."));
["#close-workspace-dialog", "#cancel-workspace"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => dialog.close());
});
document.querySelector("#workspace-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const path = document.querySelector("#workspace-path").value.trim();
  const title = document.querySelector("#workspace-title").value.trim();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, ...(title ? { title } : {}) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Workspace could not be added");
    dialog.close();
    event.currentTarget.reset();
    await loadWorkspaces();
    notify("Workspace added: " + result.workspace.title);
  } catch (error) {
    notify(error instanceof Error ? error.message : "Workspace could not be added");
  } finally {
    submit.disabled = false;
  }
});
async function loadWorkspaces() {
  const grid = document.querySelector("#project-grid");
  try {
    const response = await fetch("/api/workspaces");
    if (!response.ok) throw new Error("Workspace service unavailable");
    const result = await response.json();
    grid.replaceChildren();
    for (const workspace of result.workspaces) {
      const card = document.createElement("article");
      card.className = "project-card";
      const top = document.createElement("div");
      top.className = "project-card-top";
      const symbol = document.createElement("div");
      symbol.className = "project-symbol purple-bg";
      symbol.textContent = workspace.title.slice(0, 2).toUpperCase();
      const path = document.createElement("span");
      path.className = "more-button";
      path.textContent = "LOCAL";
      top.append(symbol, path);
      const title = document.createElement("h3");
      title.textContent = workspace.title;
      const description = document.createElement("p");
      description.textContent = workspace.path;
      const foot = document.createElement("div");
      foot.className = "project-card-foot";
      const local = document.createElement("span");
      local.textContent = "● Registered";
      const sessions = document.createElement("span");
      sessions.textContent = workspace.sessionIds.length + " sessions";
      foot.append(local, sessions);
      card.append(top, title, description, foot);
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
    const switcher = document.querySelector(".workspace-switcher");
    switcher.replaceChildren();
    const dot = document.createElement("span");
    dot.className = "workspace-dot";
    const name = document.createTextNode(" " + (result.workspaces[0]?.title || "No workspace selected") + " ");
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "⌄";
    switcher.append(dot, name, chevron);
  } catch {
    notify("Could not load Workspace data from the local host.");
  }
}
loadWorkspaces();
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
  notify("Prompt captured in the prototype. Agent runtime is not connected yet.");
});
document.querySelector("#agent-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.querySelector("#send-prompt").click();
  }
});
fetch("/api/health").then((response) => response.json()).then((health) => {
  if (health.status !== "ok") notify("Local UI health check failed.");
}).catch(() => notify("Local UI health check unavailable."));
