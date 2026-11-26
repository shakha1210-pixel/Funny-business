# Funny-business Roadmap

Dates are intentionally omitted until scope and capacity are confirmed.

## Phase 0 — Research and foundations
- [x] Identify DeepSeek Harness as primary architecture reference.
- [x] Read README, architecture, development, and safety documents.
- [x] Confirm Funny-business repository and default branch.
- [x] Map relevant DeepSeek Harness Workspace, controller, filesystem, and UI seams.
- [ ] Review licenses and third-party notices before any reuse.
- [x] Propose Workspace/filesystem/security boundaries in ADR-0001.
- [x] Propose desktop-first delivery: Tauri 2 preferred; browser retained for development and tests (ADR-0002).
- [ ] Benchmark and accept desktop shell/runtime split; decide plugin model and platform sandbox implementations through further ADRs.
- [ ] Define threat model and supported OS matrix.

## Phase 1 — Minimal cross-platform core
- [x] Bootstrap repository documentation.
- [x] Add TypeScript project manifest and compiler configuration.
- [x] Implement initial plugin lifecycle and service registry (hardening remains).
- [ ] Add event bus, config, logging, and health checks.
- [x] Add initial tests and cross-platform CI for Linux, Windows, and macOS.

## Phase 2 — Workspace and repositories
- [x] Initial Workspace domain registry and persistence contract.
- [x] Atomic JSON snapshot persistence adapters; Session-create recovery journal implemented, while cross-process coordination and schema migrations remain open.
- [x] Initial transport-neutral Workspace host contract and registry adapter; browser HTTP transport consumes the host contract.
- [x] Reconnect-safe Workspace state feed with revisioned baseline/incremental updates, bounded overflow resync, and cancellation.
- [x] Initial Session metadata domain, atomic JSON persistence, Workspace membership validation, and host/API lifecycle.
- [x] Durable per-Session user-message history, bounded append API, and browser conversation view (assistant/model execution remains future work).
- [x] Revisioned Session feed with atomic baseline, bounded overflow resynchronization, cancellation, loopback SSE transport, and live browser Session navigation.
- [x] Single-process Session-to-Workspace crash recovery journal and startup reconciliation.
- [x] Fail-closed cross-process single-host guard acquired before loading persistent registries (crash-stale locks require verified manual cleanup; kernel-managed auto-release remains future work).
- [x] Explicit persisted Workspace-root read/list grants, bounded file listing/reads, symlink rejection, and version tokens; writes and UI explorer remain future work.
- [x] Draft application interface and Workspace interaction specification.
- [x] First responsive local UI prototype connected to the browser host API.
- [x] Initial selected-Workspace switching and Session list/create/resume navigation in the browser UI.
- [ ] Git status, diff, branch, worktree, commit.
- [ ] GitHub auth and scoped repository permissions.
- [ ] Selective project context retrieval.
- [ ] Backup and restore.

## Phase 3 — Agent runtime and Model Hub
- [ ] Agent task/run lifecycle, assistant/tool message types, and tool registry (user-message history is implemented).
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
- [ ] Build the Tauri 2 vertical slice and native directory picker.
- [ ] Compare TypeScript sidecar and Rust-host runtime options with measured startup, idle memory, and package size.
- [ ] Accept ADR-0002 after Windows, macOS, and Linux validation.
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
Finish dependency reproducibility by rerunning the corrected Cargo lockfile bootstrap workflow and reviewing its PR. Then continue the [storage coordination study](research/STORAGE-COORDINATION.md), add and commit the pnpm lockfile, and restore frozen installs and dependency caching. The read-only Filesystem Engine now has explicit persisted grants, revoke controls, bounded/paginated browsing, and version-checked previews; defer mutations until a host implementation can provide stronger directory-handle/OS-level race resistance, atomic replacement, backups, and rollback. Next, define the Agent task/run lifecycle and provider contract with a deterministic test provider, durable run records, assistant messages, cancellation, and restart recovery before connecting real local or hosted models. The desktop milestone remains a Tauri vertical slice against the same host contract.
