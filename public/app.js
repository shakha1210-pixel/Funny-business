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
["#open-project", "#add-project", "#create-project", "#workspace-switcher"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => notify("Workspace host API is being connected; folder access is not requested by this prototype."));
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
