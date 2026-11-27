# Funny-business — Architecture & Engineering Handbook

Status: living specification, version 0.2-draft. Targets: Windows, macOS, Linux.

This is the canonical technical document. It consolidates system architecture, interface contracts, security baseline, performance guidance, architecture decisions, and research findings. Proposals are not implemented features; implementation status lives in TASKS.md.

## 1. Product vision

Funny-business is an independent, local-first, cross-platform AI workspace and development environment. It combines project Workspaces, durable Sessions, an agent runtime, local and hosted model providers, repository/GitHub integrations, notebook/compute gateways, plugins, and carefully controlled self-evolution.

The browser UI is currently a local development/test client. Desktop-first delivery is the target; Tauri 2 is the preferred candidate, not yet an accepted production decision. The implementation must remain visually and structurally independent from products studied for architectural learning.

### Product principles
- Windows, macOS, and Linux are first-class targets.
- Local project files remain local; remote sync and external writes are explicit.
- Providers, tools, gateways, plugins, and UI panels are replaceable behind narrow contracts.
- The host owns authoritative state, permissions, persistence, and execution policy.
- Untrusted code runs outside the privileged core with OS-enforced resource and permission limits.
- Self-evolution uses isolated branches/worktrees, tests, review, approval, health checks, and rollback.
- Prefer lazy activation, bounded work, event-driven updates, and measured performance.

## 2. System architecture

    EXPERIENCE: Desktop UI | Local Web UI | CLI | Notebook / Project views
                                |
    HOST / APPLICATION CORE: Lifecycle | Config | Events | Policy | Persistence
                                |
    DOMAIN: Workspaces | Sessions | Messages | Agent Runs | Artifacts
                                |
    AGENT RUNTIME: Planner | Context | Model Router | Tool Registry | Run Control
                                |
    PROVIDERS: Local Models | Hosted Models | Deterministic Test Provider
                                |
    GATEWAYS: Git | GitHub | Jupyter | Kaggle | Storage | Browser | APIs
                                |
    CONTROL PLANE: Permission Broker | Sandbox Supervisor | Secret Store
                   Approval Queue | Resource Limits | Audit | Backup / Rollback
                                |
    LOCAL DATA: Projects | Repositories | Environments | Models
                Datasets | Notebooks | Artifacts | Logs

### Host boundary
- Domain services own invariants; UI and transport adapters are projections/clients.
- Renderers never access registries, stores, arbitrary filesystem paths, secrets, or process APIs directly.
- The current Node development host binds only to loopback and adapts host contracts to HTTP/SSE.
- A future Tauri adapter must expose narrow typed commands and reuse domain policy; it must not duplicate Workspace or permission rules in Rust and TypeScript.
- The UI may cache state, but host-owned state is authoritative.
- Workspace identity, filesystem authorization, and process isolation are distinct boundaries.

## 3. Domain contracts and current implementation

### Workspace
A Workspace is a durable record for a canonical project directory, not a Session and not a security boundary. It has a stable ID, canonical path, title, timestamps, and ordered Session IDs.
- Canonicalize existing directories; aliases resolving to the same canonical directory collide.
- Validate Session membership against the Session's canonical working directory.
- Startup rejects missing, duplicate, multiply attached, or path-mismatched Session references.
- Unregister removes only the Workspace registry record. It never deletes project files, Session records, or conversation history.
- Workspace registry membership does not grant filesystem access.

### Session
A Session is an independently identified unit of work with canonical cwd, title, timestamps, and active/archived status. Session metadata is stored independently from Workspace registration.
- Session registry initializes before Workspace registry.
- Mutations are serialized and persisted before in-memory publication.
- Session creation currently uses a durable pending-operation journal to coordinate Session creation and Workspace attachment. This is a narrow recovery protocol, not a general multi-record transaction.
- Startup recovery preserves an already attached Session and preserves Sessions if their Workspace was unregistered.
- The host acquires a single-host data-directory guard before loading stores. A crash may leave a stale lock; manual cleanup is allowed only after verifying no process still owns the directory.

### Conversation messages
The current message vertical slice persists ordered user messages in one atomic JSON snapshot per Session under the application data directory. Filenames are SHA-256-derived opaque identifiers, not user-controlled paths.
- User message size is bounded (64 KiB UTF-8 by default).
- Concurrent appends are serialized per Session.
- Archived Sessions reject new messages.
- The current message schema only supports role user.
- Assistant messages, tool messages, run linkage, streaming deltas, and resumable execution are not implemented.
- Message snapshots are atomic individually, but are not transactionally coupled to Session/Workspace snapshots or the SQLite spike.

### Host feeds
Workspace and Session feeds provide atomic baseline-plus-subscription, ordered in-process revisions, bounded queues, overflow replacement snapshots, and cancellation. Loopback SSE adapts the Workspace-scoped Session feed to the browser UI. Revisions are process-local and reset on restart; they are not a durable event log and do not provide multi-process delivery.

## 4. Filesystem capability model

The first host-owned filesystem adapter is explicitly read-only.
- A persisted grant is scoped to one Workspace root and explicit operations (list, read); missing grants deny access.
- Grants are revoked explicitly and pruned when the Workspace is unregistered or its canonical root changes. A grant is never silently rebound to a different path.
- Relative paths reject absolute paths, drive paths, traversal segments, empty/dot segments, backslashes, and NUL.
- Symlink entries are visible as disabled; traversal rejects symlink components.
- File reads require regular files and use O_NOFOLLOW for the final component where supported.
- Directory enumeration is capped at 5,000 entries; pages default to 200 and cap at 500. Cursors are bound to the target directory identity and metadata version.
- UTF-8 preview reads are bounded (1 MiB default) and use metadata-derived version tokens to reject stale reads.
- The UI supports explicit grant/revoke, directory navigation, pagination, and bounded preview.

**Critical residual risk:** portable Node filesystem APIs do not provide a race-free openat-style chain for intermediate components. Symlink swaps and TOCTOU races remain possible between validation and open. O_NOFOLLOW only protects the final component where supported. This adapter is not an OS sandbox and must not be exposed to untrusted remote clients. Do not add writes, deletes, moves, or untrusted agent access until a native host can provide stronger directory-handle guarantees, atomic replacement, backups, and rollback.

## 5. Agent runtime — contract foundation implemented; coordinator not yet implemented

The first provider/storage-neutral contract slice now lives in src/core/agent-runtime-contract.ts with transition tests in src/core/agent-runtime-contract.test.ts. It defines AgentRun, AgentMessage, ordered AgentRunEvent, provider request/event contracts, AbortSignal propagation, and a strict state-transition helper. The helper enforces terminal-state immutability, timestamps, structured failure details, and startup recovery of queued/running runs to interrupted. This is domain scaffolding only: no run coordinator, persistence adapter, provider implementation, tool executor, HTTP route, or UI execution flow exists. Do not mistake the current message composer for an agent.

### Core entities
- AgentRun: stable run ID, Session ID, operation/idempotency ID, status, timestamps, provider/model identity (non-secret), cancellation/failure metadata, and durable sequence references.
- Message: stable ID, Session ID, role (user, assistant, tool), content or structured payload, timestamp, optional run ID, and optional tool-call correlation.
- Run event: ordered, typed lifecycle event such as queued, started, assistant delta, tool requested, approval required, tool result, completed, failed, cancelled, or interrupted.

### Lifecycle
Proposed statuses: queued → running → completed | failed | cancelled; persisted running runs discovered after restart become interrupted unless a future provider explicitly supports safe resumption. Never silently repeat a model request after a crash.

### Provider boundary
A provider receives a normalized request and AbortSignal, and emits typed deltas/events. It must not receive renderer authority, raw filesystem paths without a grant, or credentials from UI state. Provider credentials remain in host-owned secret storage. Start with a deterministic test provider for contract tests; do not ship a fake model as production behavior. If no real provider is configured, the host must return a clear unavailable response rather than pretending a run executed.

### Execution and safety
- The host owns run creation, state transitions, persistence, cancellation, and event publication.
- Persist the user message and run acceptance coherently before reporting accepted work.
- Persist assistant/tool messages and terminal run state with a defined commit boundary.
- Cancellation uses AbortController and must be reflected durably; cancellation is best-effort once an external provider has accepted a request.
- Tool calls are proposals until validated by a host-owned tool registry and permission broker.
- Destructive/external actions require approval; tool execution runs in an OS-enforced sandbox with resource limits.
- On startup, reconcile incomplete runs and never blindly reissue external side effects.
- Keep audit, secrets, permission evaluation, sandbox supervision, and recovery protected from self-modification.

### Storage dependency
The current JSON stores are separate atomic snapshots and cannot atomically commit a user message, run, assistant response, and event sequence. The SQLite spike demonstrates a candidate transaction contract, not a production store. Do not build a misleading durable run lifecycle on top of unrelated JSON writes. First choose and validate the production persistence adapter/transaction coordinator, or explicitly scope a safe prototype with crash semantics documented.

## 6. Persistence and transaction strategy

### Current state
- Workspace and Session metadata use versioned JSON snapshots with staged temp files, fsync, and atomic rename.
- Session creation/Workspace attachment uses a durable pending marker and startup reconciliation.
- Message history uses separate per-Session JSON snapshots.
- A single-host atomic-directory guard prevents two app hosts opening the same data directory. It is not a kernel advisory lock or multi-writer design.
- JSON stores do not yet provide general schema migrations or multi-process locking.

### SQLite evaluation
An isolated Node 22 node:sqlite vertical slice currently verifies:
- versioned schema migration with checksum;
- foreign-key constraints and unique Session membership;
- Session + Workspace membership + operation receipt + change-log writes in one transaction;
- idempotent operation-ID replay and payload mismatch rejection;
- rollback on injected failures;
- child-process death before COMMIT and immediately after COMMIT;
- recovery from a lost COMMIT acknowledgement by reopening and querying the operation receipt;
- two-process writer contention, WAL reader/writer behavior, checkpoint behavior, and VACUUM INTO backup/restore smoke tests.

This is contract-level test evidence, not proof of power-loss durability, production performance, or selected runtime binding. The Node and Rust benchmark harnesses and a manual Ubuntu/Windows/macOS GitHub Actions matrix workflow exist. The workflow now runs repeated Node sync, Node worker-thread, and Rust transactions under both WAL + synchronous=FULL and WAL + synchronous=NORMAL, emitting per-OS JSON results and a summary. The first FULL-only run (45915331479) is retained as historical evidence. A summarizer defect initially combined FULL and NORMAL samples; PR #6 fixed the grouping key to include OS, synchronous mode, and adapter/mode, and added regression coverage. Corrected run 45971533752 completed successfully on Ubuntu, Windows, and macOS. Each OS produced 30 JSON files (five repetitions × two synchronous modes × three adapter/mode combinations) plus summary.md.

Corrected median throughput (ops/s, with min–max) is:

| OS | Sync | Node main-thread | Node worker-thread | Rust rusqlite |
|---|---|---:|---:|---:|
| Linux | FULL | 2,700.8 (2,448.1–3,067.7) | 2,679.9 (1,610.1–3,719.0) | 3,236.6 (1,914.4–3,670.9) |
| Linux | NORMAL | 4,314.4 (3,551.5–5,010.1) | 4,356.8 (4,004.7–5,169.1) | 4,394.9 (3,943.2–4,814.8) |
| macOS | FULL | 3,198.3 (1,343.7–3,982.0) | 2,798.3 (1,546.2–3,073.1) | 3,212.5 (1,070.8–4,097.7) |
| macOS | NORMAL | 7,630.1 (5,708.6–9,388.2) | 6,940.5 (5,545.9–9,090.1) | 10,126.5 (7,993.3–10,701.3) |
| Windows | FULL | 104.2 (78.0–119.1) | 105.4 (96.9–134.1) | 105.7 (70.9–135.6) |
| Windows | NORMAL | 487.8 (264.7–569.2) | 391.6 (232.0–581.7) | 489.8 (381.2–523.6) |

The main/UI-thread probe medians (ms) were Linux FULL 1,851.63 main / 1.20 worker and NORMAL 1,159.24 main / 1.20 worker; macOS FULL 1,563.93 main / 5.57 worker and NORMAL 655.63 main / 4.60 worker; Windows FULL 47,988.24 main / 15.86 worker and NORMAL 10,251.50 main / 15.74 worker. These are specific to the benchmark's 5,000-transaction workload and are not general UI latency guarantees.

Within this workload, NORMAL increased median throughput relative to FULL on all three OSes, but NORMAL has a different durability trade-off and these numbers do not justify weakening the durability setting. Worker-thread execution kept the probe around 1–16 ms while main-thread synchronous execution showed much larger delays, supporting worker ownership if a synchronous SQLite API is used and UI responsiveness matters. Windows remained much slower than Linux/macOS across all adapters and modes; a shared runner/filesystem/storage-sync effect is plausible but unproven. Hosted CI runners are noisy: compare adapters only within the same OS, sync mode, and identical workload/settings. This evidence does not select a binding or prove power-loss durability or production performance. SQLite remains an evaluation candidate; JSON remains the active production prototype store. Before a binding decision, review methodology and validate on representative local devices, including crash-recovery, packaging, and license evidence.

### Normative transaction coordinator contract
1. Validate: normalize input and check domain invariants.
2. Prepare: allocate stable entity and operation IDs; construct immutable changes.
3. Begin: acquire the serialized writer and start transaction.
4. Apply: write domain records, membership constraints, operation receipt, and change log.
5. Commit: the only logical publication point.
6. Project: update/rebuild in-memory projections from committed data.
7. Notify: publish ordered durable-sequence events only after projection coherence.
8. Return: return the committed result; notification failure cannot undo a commit.

Commit outcomes must distinguish not committed, committed, and unknown. For an unknown outcome, reopen/recover and query the original operation receipt. Never compensate, blindly retry with a new ID, or publish speculative events. If still unresolved, fail closed. Consumers deduplicate by durable sequence/operation ID; do not claim exactly-once transport.

### SQLite binding candidates
- Node 22 built-in node:sqlite: synchronous API and Active Development stability; evaluate event-loop impact and worker ownership.
- better-sqlite3: mature synchronous Node-API option with prebuild coverage; validate platform/package provenance and fallback compilation.
- Rust rusqlite/SQLx under Tauri: narrow native host adapter candidate; avoid duplicating domain rules or exposing SQL to renderer.
- Tauri SQL plugin guest API is not an acceptable direct renderer database boundary.
No binding has been selected. pnpm-lock.yaml (pnpm 10.0.0) and Rust Cargo.lock plus rust-toolchain.toml (1.100.0) are merged. Corrected benchmark run 45971533752 is complete; review its cross-platform outlier and validate on representative devices before recording an evidence-based decision in a new ADR.

## 7. Plugin and extension architecture

Plugins declare stable ID, version, dependencies, services/events, requested permissions, and setup/teardown hooks. Activation is transactional: failed setup disposes registered resources in reverse order. Plugins cannot grant themselves permissions.

Potential categories: model provider, agent tool, gateway, workspace provider, notebook provider, UI extension, skill pack, storage provider. Plugin isolation and manifest compatibility are not implemented yet. A plugin process is not automatically a sandbox.

## 8. Interface contract

### Application frame
- Global rail: Workspaces, repositories, models, notebooks, extensions, settings.
- Workspace navigator: project context, Sessions, search, pin/archive navigation.
- Main work surface: files, diffs, notebooks, terminal output, previews, artifacts.
- Agent panel: conversation, run state, tool activity, approvals, outputs.
- Collapsible utility area: terminal, logs, diagnostics, background task status.

### State ownership
| Concern | Authority |
|---|---|
| Workspace identity/path/membership | Host Workspace Registry |
| Session metadata/lifecycle | Host Session Registry |
| Conversation messages and run state | Host message store / Agent Runtime |
| Files and file versions | Filesystem provider |
| Grants and revocation | Permission broker / host capability service |
| Process and notebook isolation | Sandbox supervisor |
| Navigation, expanded tree, selected tab | UI client |
| Search/grouped views | Derived UI projection |

### Interaction rules
- First launch offers create Workspace, open existing folder, or connect repository; do not scan the machine.
- Folder access is requested only after user intent.
- Switching Workspaces changes context, not permissions.
- Unregister clearly explains that project files and Session history remain.
- Show loading, empty, error, stale, and permission-revoked states explicitly.
- Long-running operations expose cancellation and structured activity.
- Destructive/external operations require explicit approval.
- Keep keyboard navigation, visible focus, semantic controls, sufficient contrast, and reduced-motion support.

Visual direction: dark-first neutral developer workspace, restrained accents, dense but readable hierarchy, responsive/collapsible panels. The current browser UI is a prototype; desktop shell and native directory picker remain future work.

## 9. Security baseline and threat model

Treat model output, generated code/commands, plugins, repositories, notebooks, datasets, browser content, and remote responses as untrusted.

Required controls:
1. Least privilege and default deny.
2. Grants scoped to a resource and operation.
3. Secrets stored in OS-backed credential storage; redact from prompts and logs.
4. Untrusted execution in disposable OS-enforced isolation with filesystem, network, CPU, memory, and time limits.
5. Explicit approval for external writes, destructive operations, and privileged changes.
6. Audit tool calls, permission decisions, extension versions, and evolution diffs.
7. Backup before activation or destructive changes.
8. Stop-all, revoke-grants, disable-extension, terminate-sandbox, and restore-last-known-good controls.
9. Protected control plane: permission evaluation, secret handling, sandbox supervision, audit, recovery/rollback, and provenance verification cannot be weakened by the agent without privileged human review.

A child process or path wrapper is not a secure sandbox. Use OS-level primitives (restricted users, namespaces/containers, job objects, or VMs) and document residual risks per platform. Never commit tokens, embed credentials in URLs, print secrets, or ask users to paste long-lived secrets into chat. Prefer documented OAuth/device flows and minimum scopes.

## 10. Performance and diagnostics

Status: instrumentation exists; numeric budgets are not established.

Principles:
- Lazy-start model servers, notebook kernels, Git watchers, indexers, and plugin processes.
- Prefer event-driven updates and cancellable work over permanent polling.
- Bound reads, search results, caches, queues, and concurrency.
- Avoid loading whole project trees or files when a requested slice is enough.
- Release subscriptions and idle workers when their owning view/capability closes.
- Measure before optimizing.

The loopback GET /api/diagnostics endpoint returns an on-demand snapshot: Node version, OS/architecture, host uptime, RSS, V8 heap, external/ArrayBuffer memory, and cumulative process CPU microseconds. It is not a sampler or production monitoring API and must not be network-exposed.

For each OS, record OS version, CPU/RAM, Node version, revision, cold start to interactive, idle diagnostics, representative Workspace load, background process count, and installer size. Repeat at least three times; report median and range. Numeric startup/RSS/CPU/package budgets remain open until reproducible cross-platform baselines exist.

## 11. Research provenance and design lessons

### DeepSeek Harness
Reviewed public repository https://github.com/deepseek-ai/deepseek-harness, revision 4b399c39a6d1479cd84ca591b4d7c88e24d38a96. Observed concepts: Cordis service/event scopes, typed event dispatch modes, plugin lifecycle cleanup, dependency ordering, model/tool/session contributions, profiles/bundles/patch layers, permission-gated plugin management. Upstream itself warns it is developer-preview software and that sandbox/approval mechanisms do not guarantee isolation. Funny-business uses these as architectural study points only; no upstream implementation source has been copied. Any future reuse requires exact license/provenance review and preserved notices.

### Workspace reverse-engineering
Public Workspace contract and selected implementation/tests were studied. Key observed patterns: stable Workspace identity separate from canonical path; Session header cwd validation; ordered membership; header-only bootstrap; serialized mutations; durable pending marker for multi-write recovery; non-destructive unregister; controller baseline/increment feed; filesystem capability separated from process sandbox. Funny-business implementation is independently authored and has its own explicit invariants.

### Architecture decision summaries
- Workspace/filesystem/execution separation: Workspace identity, filesystem grants, and OS process isolation are distinct. A Workspace is not a security boundary.
- Desktop shell: Tauri 2 is the preferred candidate; browser mode remains for development/tests. Acceptance depends on measured startup, idle memory, package size, OS integration, and sandbox feasibility. Not yet accepted.
- Transactional persistence: SQLite is the preferred candidate for atomic multi-record operations and durable change sequence, but binding/runtime and packaging remain unselected. JSON remains active until migration acceptance tests pass.

### Dependency reproducibility
packageManager is pinned to pnpm 10.0.0 and pnpm-lock.yaml is merged (PR #1). The Rust benchmark has Cargo.lock and an exact 1.100.0 toolchain pin (PR #2). The Rust check uses the committed lockfile; the main Node CI should next adopt pnpm install --frozen-lockfile and dependency caching.

## 12. Open decisions and explicit non-goals

Open:
- SQLite binding and host ownership split.
- Desktop shell and sidecar/native-host split.
- Per-OS sandbox implementation and threat-model acceptance.
- Durable event retention, backup/restore, export, migration policy.
- Plugin process isolation and compatibility model.
- Performance budgets from real cross-platform baselines.

Non-goals:
- Unrestricted autonomous self-modification.
- Treating a Workspace or child process as a sandbox.
- Renderer-owned SQL, secrets, filesystem, or process authority.
- Silent remote sync or external writes.
- Copying proprietary source or distinctive assets from reference products.
