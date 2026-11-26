# Funny-business Roadmap

Dates are intentionally omitted until scope and capacity are confirmed.

## Phase 0 — Research and foundations
- [x] Identify DeepSeek Harness as primary architecture reference.
- [x] Read README, architecture, development, and safety documents.
- [x] Confirm Funny-business repository and default branch.
- [x] Map relevant DeepSeek Harness Workspace, controller, filesystem, and UI seams.
- [ ] Review licenses and third-party notices before any reuse.
- [x] Propose Workspace/filesystem/security boundaries in ADR-0001.
- [ ] Decide runtime, desktop shell, plugin model, and platform sandbox implementations through further ADRs.
- [ ] Define threat model and supported OS matrix.

## Phase 1 — Minimal cross-platform core
- [x] Bootstrap repository documentation.
- [x] Add TypeScript project manifest and compiler configuration.
- [x] Implement initial plugin lifecycle and service registry (hardening remains).
- [ ] Add event bus, config, logging, and health checks.
- [x] Add initial tests and cross-platform CI for Linux, Windows, and macOS.

## Phase 2 — Workspace and repositories
- [x] Initial Workspace domain registry and persistence contract (durable adapter pending).
- [ ] Durable Workspace store, crash recovery, and safe file operations.
- [x] Draft application interface and Workspace interaction specification.
- [ ] Git status, diff, branch, worktree, commit.
- [ ] GitHub auth and scoped repository permissions.
- [ ] Selective project context retrieval.
- [ ] Backup and restore.

## Phase 3 — Agent runtime and Model Hub
- [ ] Agent task/session model and tool registry.
- [ ] Permission broker.
- [ ] Hosted model adapter.
- [ ] Ollama and llama.cpp adapters.
- [ ] Model capability registry and task-based routing.
- [ ] Local-only project mode.

## Phase 4 — Notebook and compute
- [ ] Local Python environment manager.
- [ ] Local Jupyter gateway.
- [ ] Notebook import/export and artifact tracking.
- [ ] Resource-limited notebook execution.
- [ ] Kaggle adapter based on documented API/CLI capabilities.
- [ ] Additional compute providers.

## Phase 5 — Plugins and gateways
- [ ] Extension manifest and compatibility checks.
- [ ] Install/enable/disable/update lifecycle.
- [ ] Permission declarations and review UI.
- [ ] Per-OS plugin isolation.
- [ ] Gateway catalog and health checks.
- [ ] Sample model, repository, notebook, and storage plugins.

## Phase 6 — Self-evolution
- [ ] Repository self-inspection and change proposals.
- [ ] Branch/worktree-based code generation.
- [ ] Automated tests and security checks.
- [ ] Diff/risk review and approval.
- [ ] Controlled activation, health checks, rollback.

## Phase 7 — Universal desktop release
- [ ] Choose Tauri or Electron from prototype evidence.
- [ ] Windows packaging.
- [ ] macOS packaging and signing/notarization.
- [ ] Linux packaging.
- [ ] Update/rollback mechanism.
- [ ] Cross-platform release CI.

## Deferred
- Unrestricted autonomous self-modification.
- Automatic access to every repository or local folder.
- Arbitrary execution of untrusted notebooks/plugins on the host.
- Training a foundation model from scratch.
- Cloning proprietary GitHub or Kaggle services.
- Assuming unlimited provider quotas or ChatGPT context.

## Next milestone
Implement durable Workspace persistence and host controller, then build the first UI shell and Workspace navigator against that API. Add the pnpm lockfile and restore dependency caching.
