# Funny-business Architecture

Version 0.1-draft. Targets: Windows, macOS, Linux.

## Vision
A local-first AI workspace and autonomous development environment combining a modular agent runtime, model hub, project workspace, repository integrations, notebook gateways, and controlled self-evolution. It is not a GitHub or Kaggle clone; it connects to those services through documented APIs, supported CLIs, and adapters.

## Architecture rules
1. The application core owns lifecycle, configuration, events, and policy enforcement.
2. Capabilities are contributed through plugins with explicit manifests and lifecycle hooks.
3. Providers are replaceable behind stable interfaces.
4. User data and application code are stored separately.
5. Untrusted code runs outside the privileged core with resource and permission limits.
6. Self-evolution creates isolated changes, tests them, and requests approval before activation.
7. External writes and destructive actions are auditable and policy-gated.
8. Cross-platform behavior lives behind OS adapters.

## System overview

    EXPERIENCE: Desktop UI | Local Web UI | CLI | Notebook / Project views
                                |
    APPLICATION CORE: Lifecycle | Config | Event Bus | Plugin Registry
                                |
    AGENT RUNTIME: Planner | Context | Tool Router | Sessions
                                |
    MODEL HUB: Local + Hosted Providers | Discovery | Model Routing
                                |
    GATEWAYS: Git | GitHub | Jupyter | Kaggle | Storage | Browser | APIs
                                |
    POLICY: Permission Broker | Sandbox Supervisor | Secret Store
            Approval Queue | Resource Limits | Audit | Backup / Rollback
                                |
    LOCAL DATA: Projects | Repositories | Environments | Models
                Datasets | Notebooks | Artifacts | Logs

## Host adapter boundary

### Single-host data ownership
The Node development host acquires a per-data-directory guard at `FUNNY_HOME/.host.lock` before loading either JSON registry. Acquisition uses atomic directory creation, so competing processes on the same supported local filesystem cannot both pass the guard. The owner record includes a PID, hostname, start timestamp, and random ownership token; release verifies the token before removing the directory. Normal shutdown releases the guard, and startup failures attempt cleanup. A process crash leaves a stale directory by design: the runtime fails closed and requires an operator to verify that no process still owns the data directory before manually removing it. PID/timestamp metadata is diagnostic only and is never used for automatic stale-lock reclamation. This is a cross-process single-host guard, not a kernel advisory lock, a multi-writer database, or a guarantee for arbitrary network filesystems. A native lock with automatic kernel release remains a desktop-host decision.

The application core exposes transport-neutral capability contracts. Renderers and transports depend on these contracts, not directly on domain registries, persistence stores, or operating-system APIs. The initial `WorkspaceHost` contract is adapted from `WorkspaceRegistry` and consumed by the loopback HTTP development transport. The registry publishes monotonically revisioned changes only after persistence succeeds. A watch subscription captures its baseline atomically with listener registration, then delivers ordered changes; bounded queues collapse overflow into a complete authoritative snapshot, and AbortSignal cancellation disposes the listener. A future Tauri adapter must expose the same contract semantics through narrow typed commands; it must not duplicate Workspace policy or grant the renderer direct filesystem/process authority. Keep host adapters thin and test each adapter against the same contract suite.

## Core subsystems

### Plugin runtime
A plugin declares a stable ID, version, dependencies, services/events, requested permissions, and setup/teardown hooks. Activation is transactional: if setup fails, registered resources are disposed in reverse order. Plugins cannot grant themselves permissions.

Initial categories: model-provider, agent-tool, gateway, workspace-provider, notebook-provider, ui-extension, skill-pack, storage-provider.

### Session domain
A Session is a durable, independently identified unit of work with a canonical working directory, title, timestamps, and active/archived lifecycle. Session metadata is stored separately from Workspace registration; a Workspace keeps ordered Session IDs and validates that an attached Session's canonical working directory matches its own. Startup revalidates every persisted membership, rejecting missing, duplicate, multiply attached, or path-mismatched Session references instead of silently hiding inconsistent state. The host coordinates Session creation and Workspace attachment through a durable, single-operation write-ahead journal. It records the target Workspace and preassigned Session ID before creating the Session, then attaches the Session and clears the journal. Startup recovery runs after both registries load and before the UI server accepts requests: an existing unattached Session is discarded only when its Workspace still exists; an already attached Session is preserved; a Session whose Workspace was unregistered is preserved as an unassigned Session; and a Workspace reference to a missing Session fails startup closed. Failed compensation leaves the journal for the next recovery attempt. Journal cleanup failure after a committed attachment never triggers destructive compensation. The journal and each JSON snapshot use staged writes, fsync, and atomic replacement/removal where supported. Session changes publish process-local monotonic revisions only after persistence; the host offers a Workspace-scoped baseline/increment feed with bounded overflow snapshots, cancellation, and a loopback SSE adapter used by the browser UI. These revisions are not durable offsets. Crash recovery and feeds currently assume one host process, not a multi-process transaction or lock: the current runtime now acquires an atomic-directory single-host guard before loading either store; a kernel-managed lock, general multi-record journaling, and schema migrations remain open. Conversation messages now live in a separate per-Session JSON snapshot store under `FUNNY_HOME/messages/`, addressed by a SHA-256-derived opaque filename rather than a user-controlled path. The first vertical slice persists ordered user messages only, enforces a 64 KiB UTF-8 limit, serializes concurrent appends per Session, rejects writes to archived Sessions, and publishes a narrow list/append API through the host. It does not create assistant messages, invoke a model, execute tools, or claim resumable agent state; those remain future agent-runtime work. The separate message snapshots are individually atomic but are not part of the Session/Workspace SQLite transaction yet.

### Agent runtime
Task planning, context assembly from selected project files, tool routing, session history, cancellation, deadlines, retries, and progress events. The agent requests capabilities through policy; it does not receive unrestricted disk, network, or process access.

### Model Hub
Provider adapters initially target Ollama, llama.cpp server, OpenAI-compatible endpoints, and selected hosted APIs. Model metadata records modalities, context window when known, tool/vision/embedding support, local/remote status, and resource estimates. Routing checks actual provider capabilities; it never assumes every model supports every feature.

### Workspace Engine
Project registry, safe file operations, file search, selective context loading, Git-aware diffs, per-project environments, artifacts, datasets, and explicitly registered external folders.

Runtime data root:

    $FUNNY_HOME/
      config/ state/ credentials/ models/
      projects/ repositories/ notebooks/ datasets/
      artifacts/ sandboxes/ logs/ backups/

Secrets, model weights, datasets, and user project content do not belong in the source repository.

### Repository Gateway
Separate generic Git operations from GitHub-specific API features. Support status, diff, branch, worktree, commit, fetch, pull, push, and tags. GitHub adapter handles repository metadata, issues, pull requests, checks, and releases. Credentials use platform credential facilities; never commit tokens or place them in prompts, logs, URLs, or source.

### Notebook and compute gateways
Support local Jupyter/JupyterLab first, then Kaggle and other providers according to documented API/CLI capabilities. Each adapter advertises only operations it truly supports. Imported notebooks are untrusted code and require isolated, resource-limited execution.

### Gateway framework
A gateway manifest declares identity, version, capabilities, permissions, secret requirements, network destinations, resource limits, compatibility, and health checks. Lifecycle: discover, inspect, install, authorize, health-check, enable, update, disable, rollback.

### Self-evolution
Inspect -> propose -> plan -> create branch/worktree -> build -> test -> review diff and risk -> approve -> integrate -> health-check -> rollback if needed.

Permission evaluation, secret handling, sandbox enforcement, audit logging, and recovery are protected control-plane components. The agent may propose changes to them but cannot silently disable or weaken them.

## Lightweight runtime strategy

- Keep the desktop shell thin; domain logic and policy remain in the shared application core.
- Start expensive capabilities on demand and stop them when idle or cancelled.
- Prefer event-driven state delivery over frequent polling.
- Bound project traversal, file reads, search results, caches, queues, and concurrent operations.
- Keep performance diagnostics opt-in and on-demand; do not add background sampling solely for dashboards.
- Establish reproducible per-OS startup, idle resource, Workspace-load, and package-size baselines before setting numeric budgets. See [PERFORMANCE.md](PERFORMANCE.md).

## Cross-platform strategy
Windows 10/11, macOS, and Linux are first-class targets. Credential storage, process supervision, sandboxing, filesystem watching, notifications, GPU discovery, packaging, and updates use OS adapters. Validate each OS independently with native CI.

## Technology direction

| Layer | Initial direction | Status |
|---|---|---|
| Core | TypeScript + Node.js | Chosen for prototype |
| Plugin lifecycle | Small typed kernel; evaluate Cordis | Open |
| Desktop shell | Tauri 2 preferred; benchmark vertical slice before acceptance | Proposed in ADR-0002 |
| UI | React-based | Proposed |
| State | SQLite | Proposed |
| Git | Git CLI | Proposed |
| Local inference | Ollama + llama.cpp adapters | Proposed |
| Notebook | Local Jupyter first | Proposed |
| Tests | Node test runner or Vitest | Open |

## Open decisions
- Cordis adoption versus an independent minimal plugin kernel.
- TypeScript sidecar versus a narrower Rust host/core split (benchmark in ADR-0002).
- Plugin isolation on each operating system.
- Credential vault abstraction.
- Notebook provider sequence after local Jupyter.
- Model capability schema and extension compatibility policy.


## Workspace filesystem adapter
The host owns a read-only Workspace filesystem adapter. It is separate from Workspace identity and Session membership. Access requires an explicit persisted grant scoped to a Workspace's canonical root and one or both of list and read. The adapter rejects traversal and symlink components, bounds listing and file reads, paginates directory entries with directory-version-bound cursors, and exposes opaque metadata-derived version tokens for stale-read checks. The HTTP API is a loopback development surface; the adapter is not an OS sandbox and Node's portable path APIs cannot eliminate every intermediate-component TOCTOU race. See [Workspace Filesystem Engine](research/WORKSPACE-FILESYSTEM.md).
