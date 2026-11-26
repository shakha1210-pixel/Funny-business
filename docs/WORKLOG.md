# Funny-business Work Log

Update this file with meaningful research, implementation, tests, and blockers.

## 2026-11-26 — Bootstrap and first core implementation

### Completed
- Confirmed repository: shakha1210-pixel/Funny-business.
- Confirmed default branch: main; repository was empty before bootstrap.
- Confirmed push permission through the connected GitHub integration.
- Set Windows, macOS, and Linux as first-class targets.
- Inspected DeepSeek Harness README, architecture guide, development guide, Cordis primer, safety notice, plugin-manager reference, base-bundle reference, tools reference, LICENSE, THIRD_PARTY_NOTICES, and package manifest.
- Added README, architecture, roadmap, security baseline, and upstream research notes.
- Added TypeScript/Node project manifest and compiler configuration.
- Implemented initial typed plugin contracts, service registry, and plugin lifecycle manager.
- Added initial lifecycle tests and a GitHub Actions matrix for Ubuntu, Windows, and macOS.
- Added .gitignore for build artifacts and local runtime data.

### DeepSeek Harness findings
- Describes an everything-is-a-plugin architecture built on Cordis.
- Cordis centers on context services, declared service dependencies, typed events, and reversible registration effects.
- Events have explicit dispatch semantics: emit, waterfall, parallel, serial, or bail.
- Model adapter, tool registry, session log, and agent loop are replaceable plugin contributions.
- Runtime composition uses profiles, bundles, and ordered patch layers.
- Plugin management is permission-gated; the upstream plugin-manager README documents danger-full-access or per-call approval.
- The shared base bundle includes model access, tools, durable sessions, and workspace safety defaults.
- The tool system uses a shared registry, validation, scoped restrictions, and a guarded execution pipeline.
- Upstream is developer-preview software with breaking changes and no security audit.
- Its safety notice warns that sandboxing and approval prompts reduce risk but do not guarantee isolation.
- Its development guide describes native Windows development and optional WSL 2; each OS environment needs its own toolchain and validation.
- Upstream LICENSE is MIT; THIRD_PARTY_NOTICES lists vendored packages and other dependencies with their own license terms.

### Verification status
- Source files and workflow were committed to GitHub.
- GitHub combined commit status currently reports no status entries for the latest documentation commit; no successful CI run has been verified yet.
- Tests and builds have NOT yet been executed in a local checkout or confirmed by CI.
- The first CI run will provide initial cross-platform validation.

### Not done yet
- No DeepSeek Harness source code has been copied.
- No full package-by-package upstream source audit is complete.
- No desktop UI, model adapter, notebook gateway, or real OS-level sandbox exists yet.
- No dependency lockfile has been generated.

### Next actions
1. Inspect Cordis tutorial and upstream plugin-manager/service-scope implementation and tests.
2. Review exact upstream source provenance and third-party notices before any source reuse.
3. Decide Cordis versus the independent minimal plugin kernel.
4. Run CI and fix any TypeScript/test issues.
5. Add event bus, config, structured logging, and health checks.
6. Add workspace and Git worktree support.

## 2026-11-27 — Workspace reverse engineering, first pass

### Completed
- Inspected DeepSeek Harness workspace subsystem contract and package reference.
- Inspected the public Workspace type contract and selected Workspace Controller, filesystem, and UI workspace documentation.
- Recorded reviewed upstream revision `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`.
- Added `docs/research/WORKSPACE-REVERSE-ENGINEERING.md` with the evidence ledger, source map, domain invariants, persistence/recovery design, session membership, archive/pin behavior, filesystem boundary, and Funny Business proposals.

### Confirmed findings
- Workspace is a durable project-directory record, not a Session and not a sandbox.
- Stable Workspace ID is separate from canonical path identity.
- Session membership is validated against the Session header cwd; the ordered membership account remains the ownership record.
- Workspace unregister/delete is non-destructive: it does not delete folders, files, or session histories.
- Registry mutations are serialized; multi-write changes use a pending-mutation recovery marker.
- Workspace domain, filesystem capability, and process execution isolation are separate concerns.

### Still not done
- No upstream implementation code copied.
- No full source-level audit of Workspace registry/entity/domain or tests yet.
- No Funny Business Workspace implementation yet.
- No cross-platform path/symlink tests yet.

### Next actions
1. Inspect upstream Workspace `index.ts`, `entity.ts`, `spec.ts`, `paths.ts`, and tests.
2. Inspect filesystem policy/local backend implementation and tests, especially symlink containment and stale-write guards.
3. Inspect UI workspace tree/picker state and race handling.
4. Write a Funny Business Workspace ADR and implement the first independent domain module with tests.

## 2026-11-27 — Documentation structure cleanup

### Completed
- Added `docs/README.md` as the central documentation index.
- Added `docs/INSTRUCTIONS.md` for contributor and AI-agent rules, research discipline, security expectations, and change workflow.
- Updated the root `README.md` to act as a concise project entry point linking to the documentation index.
- Confirmed project Markdown documents are organized under `docs/`, with upstream research under `docs/research/`.

### Not done
- No bulk merge into one oversized Markdown file; each topic retains one canonical document.
- No ADR has been created yet; `docs/adr/` will be introduced when the first architecture decision is ready.


## 2026-11-27 — Workspace source and test-suite review

### Completed
- Inspected the upstream Workspace implementation: `index.ts`, `entity.ts`, `spec.ts`, `paths.ts`, and `types.ts`.
- Inspected the upstream Workspace test suite and catalogued its coverage across bootstrap, path handling, persistence recovery, ordering, membership, archive/pin, default initialization, and follow-up lifecycle.
- Confirmed mandatory Session-persistence startup dependency, header-only bootstrap, serialized mutation semantics, explicit pending-operation recovery, and non-destructive unregister behavior.
- Recorded implementation-level findings and remaining gaps in `docs/research/WORKSPACE-REVERSE-ENGINEERING.md`.

### New design observations
- Entity writes are serialized at the storage table update chain; no-op writes are avoided.
- Windows path qualification has explicit drive-relative and UNC handling.
- Archive/pin are registry-global navigation state, separate from Workspace Session ownership.
- Archive checks active work by default; explicit stop mode persists archive state before provider stop requests.
- Failure-injection tests are a useful model for our own persistence/recovery test strategy.

### Not done
- No upstream implementation code copied.
- No Workspace Controller, filesystem local backend/policy, or UI picker/tree source audit yet.
- No Funny Business Workspace code or ADR yet.
- No local build/test or successful CI result verified.

### Next actions
1. Inspect Workspace Controller implementation and tests, especially event/stream ordering and reconnect behavior.
2. Inspect filesystem policy/local backend and tests, focusing on symlink traversal, containment, and stale-write protection.
3. Inspect UI picker/tree state and cancellation/race handling.
4. Then write ADR-0001 for Funny Business Workspace boundaries and implement the smallest independently designed domain module.


## 2026-11-27 — Workspace Host Controller review

### Completed
- Inspected the Workspace Controller Host implementation: command adapter, Remote service, feed producer, and browser-safe request/result types.
- Inspected Host controller tests for command serialization, stable error mapping, baseline/increment feeds, permission filtering, reconnect, and disposal.
- Recorded the controller findings and Funny Business implications in `docs/research/WORKSPACE-REVERSE-ENGINEERING.md`.

### Confirmed findings
- The registry remains the single authoritative Workspace owner; controller code adapts commands and transport types.
- Reconnecting clients receive a complete baseline before incremental changes.
- Stream access filtering is applied to both Workspace and Session identities.
- Permission loss for a previously delivered Workspace triggers a filtered state replacement rather than a false deletion.
- Remote errors have stable codes and structured details; unexpected internal failures propagate.

### Not done
- Filesystem policy/local backend and UI tree/picker implementation remain to be reviewed.
- No Funny Business Workspace implementation or ADR yet.


## 2026-11-27 — Filesystem and Workspace UI reverse-engineering

### Completed
- Reviewed the backend-neutral filesystem contract, local filesystem provider, sandbox containment adapter, observation policy, and selected tests.
- Confirmed realpath-based target identity, missing-ancestor resolution, no-follow lstat, version guards, per-target mutation locks, atomic staging/publication, and explicit partial move outcomes.
- Confirmed the sandbox adapter is a trusted-code path fence, not a kernel isolation boundary; arbitrary process execution needs a separate OS-level sandbox.
- Sampled Workspace tree/picker UI and Host directory-picker contracts: UI projections are separate from domain ownership, and directory picking is an optional capability.
- Recorded findings in `docs/research/WORKSPACE-REVERSE-ENGINEERING.md`.

### Not done
- No upstream source copied.
- No Funny Business Workspace/filesystem implementation or ADR yet.
- No local build/test or successful CI result verified.
- UI source review remains selective, not exhaustive.

### Next actions
1. Consolidate Workspace, controller, filesystem, and UI findings into ADR-0001.
2. Define Funny Business Workspace, filesystem access grant, and execution sandbox boundaries.
3. Inspect current Funny Business starter code before adding modules; build and test in a real checkout/CI.
4. Implement the minimal Workspace domain and tests first; add filesystem provider only after its contract is settled.


## 2026-11-27 — ADR-0001 proposed

### Completed
- Consolidated Workspace domain, filesystem contract/provider, permission, execution sandbox, and UI/transport boundaries into `docs/adr/0001-workspace-domain-boundaries.md`.
- Added ADR index entry and updated Phase 0 research status.
- ADR status is **Proposed**; it records the current architecture direction and open decisions, not a claim that all implementation details are settled.

### Next
- Validate existing TypeScript core in a real checkout/CI before adding the Workspace domain.
- Review and accept/revise ADR-0001, then implement the smallest Workspace registry with tests.


## 2026-11-27 — First cross-platform CI validation

### Completed
- Audited the current TypeScript core: plugin contracts, service registry, PluginManager, tests, package manifest, compiler settings, and CI workflow.
- Found CI setup failures before dependency installation: pnpm version was specified in both package.json and the setup action, then setup-node cache failed because no pnpm lockfile existed.
- Removed the duplicate pnpm version declaration from the workflow and temporarily disabled pnpm caching until a lockfile is committed.
- Verified GitHub Actions run [45887128892](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45887128892): install, typecheck, tests, and build all succeeded on Ubuntu, macOS, and Windows.

### Core audit notes
- The current PluginManager has a small, understandable dependency-aware lifecycle and initial rollback tests.
- Follow-up hardening is still needed for concurrent mount/unmount/shutdown calls, idempotent disposal, and preserving failed-to-dispose plugins as visible degraded state rather than silently dropping them.
- A committed pnpm lockfile is still needed for reproducible dependency resolution; caching remains disabled until then.
- CI success validates the current starter core only; it does not validate Workspace or UI functionality, which have not yet been implemented.

### Next actions
1. Harden PluginManager concurrency and disposal semantics with regression tests.
2. Commit a pnpm lockfile and restore dependency caching.
3. Translate the researched Workspace and interface behavior into Funny Business domain/UI specifications.
4. Implement Workspace domain and persistence before wiring the UI projection.


## 2026-11-27 — Plugin lifecycle hardening and first Workspace domain

### Completed
- Serialized PluginManager mount, unmount, and shutdown operations to prevent same-ID races and overlapping lifecycle mutations.
- Changed failed plugin disposal behavior: the plugin remains visible in the manager, successful cleanup steps are not repeated, and failed cleanup steps can be retried by a later shutdown.
- Added regression tests for concurrent mount, concurrent unmount, and disposal retry/failure visibility.
- Added an independent WorkspaceRegistry domain with an injected persistence contract, Session-header reader, canonical-directory resolver, stable Workspace identity, canonical-path uniqueness, rename, Session attachment validation, and non-destructive unregister.
- Mutations persist the next snapshot before publishing it in memory, so a failed store write does not expose an uncommitted state.
- Added Workspace Registry tests for initialization, canonical uniqueness, Session cwd validation, persistence failure, and unregister behavior.
- Added `docs/INTERFACE-SPEC.md` defining the independent Funny Business application frame, Workspace flows, state ownership, visual direction, and UI milestones.
- Updated the package test command to include both core and Workspace suites.
- Verified GitHub Actions run [45887644976](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45887644976): install, typecheck, all tests, and build succeeded on Ubuntu, macOS, and Windows.

### Explicit limitations
- Workspace persistence is currently an interface contract plus in-memory test adapter; no durable disk/database adapter or crash-recovery journal exists yet.
- The UI specification is written, but no renderer, visual components, or desktop shell has been implemented yet.
- The default directory canonicalizer uses realpath/stat; OS-specific symlink and path-edge tests still need dedicated coverage.
- No pnpm lockfile has been committed yet; dependency caching remains disabled.

### Next actions
1. Implement a durable Workspace store with atomic snapshot writes, schema versioning, and interrupted-write recovery.
2. Add path/symlink and persistence failure-injection tests on all three OS runners.
3. Build the first UI shell and Workspace navigator against a host controller, keeping renderer state non-authoritative.
4. Add a pnpm lockfile using a real pnpm install environment and re-enable CI caching.


## 2026-11-27 — Durable Workspace store and first UI prototype

### Completed
- Added `JsonWorkspaceStore` with schema version 1, record validation, duplicate-ID detection, staged exclusive temp-file writes, file fsync, atomic rename, and POSIX directory fsync.
- Added tests for empty-store initialization, round-trip persistence, corrupt JSON, and unsupported schema rejection.
- Added a loopback-only Node HTTP server with an explicit static asset allowlist, GET/HEAD-only handling, basic security headers, and a local health endpoint.
- Added the first responsive Funny Business workspace UI prototype: global rail, Workspace navigator, project overview, activity, agent panel, task composer, and responsive collapse behavior.
- Added prototype interactions for navigation, panel collapse, suggestion prompts, and task composition. The agent, file tree, Git status, and Workspace actions are illustrative UI data and are not yet connected to host services.
- Wired the local UI server into application startup and added server boundary tests.
- Kept fonts local/system-backed to preserve the local-first behavior and avoid third-party font requests.
- Verified GitHub Actions run [45888181882](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45888181882): dependency install, typecheck, tests, and build succeeded on Ubuntu, macOS, and Windows.

### Explicit limitations
- JSON snapshot persistence is atomic for one file but does not yet provide cross-process locking, a multi-record mutation journal, or schema migrations beyond rejecting unknown versions.
- The UI is a static interactive prototype. Workspace data, project tree, task history, model state, and Git status are currently sample presentation data.
- The agent composer does not invoke a model or execute tools.
- The server binds to loopback only and serves an allowlisted set of assets; no remote access or authentication is implemented.
- No desktop shell has been selected.

### Next actions
1. Add Workspace host API endpoints and connect the UI to real registry snapshots and mutations.
2. Replace sample project/task/model status with live host state.
3. Add a proper state feed with baseline plus ordered updates and cancellation/reconnect handling.
4. Add path/symlink and crash-recovery tests; decide if/when SQLite replaces JSON snapshots.
5. Generate and commit pnpm-lock.yaml in a real pnpm environment, then restore CI dependency caching.


## 2026-11-27 — Workspace API integration

### Completed
- Added local host API routes for listing, registering, renaming, and unregistering Workspaces.
- Connected application startup to the durable JSON Workspace registry under `FUNNY_HOME` or the user's `~/.funny-business` data directory.
- Connected the UI project list to live Workspace registry data and added an explicit folder-path registration dialog.
- Added request body size limits, JSON validation, same-origin checks for browser mutations, JSON-only mutation requests, and stable HTTP error responses.
- Kept the HTTP server bound to 127.0.0.1 and static assets allowlisted; no arbitrary filesystem-serving route exists.
- Added host API tests including cross-origin mutation rejection.
- Verified GitHub Actions run [45888660504](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45888660504): typecheck, tests, and build passed on Ubuntu, macOS, and Windows.

### Current behavior and limitations
- Workspace list/create/rename/unregister now use the actual host registry and persistent store.
- The UI still displays illustrative Git, model, task, and agent status; those services do not exist yet.
- Session attachment API is available in the domain but application startup currently has no Session persistence provider, so no Sessions can be attached through the running app yet.
- Directory registration currently requires the user to enter an existing absolute path; native folder picker is not implemented.
- Cross-process store locking and a durable mutation journal are not implemented.

### Next actions
1. Add native directory picker capability and path validation UX.
2. Add Session domain and persistence, then wire Session attachment and recent task projections.
3. Add reconnect-safe Workspace state feed and renderer-side selected Workspace switching.
4. Implement filesystem provider and safe file browser only after explicit access grants are designed.
5. Add a pnpm lockfile and re-enable dependency caching.


## 2026-11-27 — Desktop-first direction

### Completed
- Confirmed product direction: installed desktop application is the primary experience; browser UI remains a development and test mode.
- Added ADR-0002 proposing Tauri 2 as the preferred desktop shell because it uses the platform WebView and provides a native host, while requiring a measured vertical slice before acceptance.
- Kept the current TypeScript/Node core independent of the shell; the ADR requires a measured decision between a managed TypeScript sidecar and a narrower Rust-host split.
- Added lightweight-performance requirements: lazy activation, cancellable background work, and measurements for startup, idle memory/CPU, Workspace load, process count, and package size.

### Not done
- No Tauri dependency, Rust host, native directory picker, or desktop package has been implemented yet.
- No runtime or package-size benchmark has been run; Tauri remains a proposed direction, not an accepted implementation decision.

### Next actions
1. Build a minimal Tauri 2 vertical slice that loads the existing UI.
2. Expose a native folder picker through a narrow typed capability.
3. Run the same Workspace contract through desktop and browser-dev adapters.
4. Compare runtime split options and capture cross-platform startup, idle resource, and package-size baselines.


## 2026-11-27 — On-demand runtime diagnostics

### Completed
- Added a loopback-host `GET /api/diagnostics` endpoint reporting runtime version/platform, uptime, process memory breakdown, and cumulative CPU time.
- Kept diagnostics on-demand: no timer, polling loop, profiler, or additional background worker is started.
- Added endpoint tests for response shape and non-negative resource counters.
- Added `docs/PERFORMANCE.md` with lightweight-runtime principles and a reproducible cross-platform baseline procedure.
- Linked the performance guide from the documentation index.

### Measurement notes
- CPU counters are cumulative process user/system microseconds, not instantaneous utilization.
- Memory counters are process snapshots, not total machine usage.
- Numeric performance budgets remain unset until comparable Windows, macOS, and Linux baselines are measured.

### Not done
- No desktop shell or packaged binary exists yet.
- No startup, idle, Workspace-load, or installer-size benchmark has been run.
- Diagnostics have not yet been verified by CI after this change.

### Next actions
1. Verify diagnostics and tests in the cross-platform CI matrix.
2. Build the first Tauri shell vertical slice and decide how the TypeScript host is packaged and supervised.
3. Add an OS-native directory picker behind a narrow host capability.
4. Measure idle resource use and cold startup before setting numeric budgets.


## 2026-11-27 — Workspace host adapter boundary

### Completed
- Added the transport-neutral `WorkspaceHost` capability contract and `RegistryWorkspaceHost` adapter.
- Changed the loopback HTTP server to depend on the host contract rather than the concrete WorkspaceRegistry implementation.
- Composed application startup through the registry adapter, keeping domain rules out of the transport layer.
- Added an adapter contract test covering list, create, rename, and unregister behavior.
- Added the new host test to the package test script.
- Updated architecture and roadmap to record the shared host boundary and the remaining state-feed/desktop work.

### Verification
- The preceding diagnostics change passed GitHub Actions run [45889505687](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45889505687) on Ubuntu, macOS, and Windows.
- The host-adapter commits are newer than that run; their typecheck, tests, and build have not yet been verified by CI.
- No local checkout/build was run in this environment.

### Not done
- No Tauri shell, native folder picker, or desktop package exists yet.
- No reconnect-safe state feed or Session persistence exists yet.
- The browser transport still uses the current loopback HTTP server; the host contract is the seam for a future Tauri transport.

### Next actions
1. Verify the host-adapter change in the cross-platform CI matrix.
2. Add contract-level tests that can be reused by desktop and browser adapters.
3. Implement a reconnect-safe Workspace snapshot/event feed with bounded queues and cancellation.
4. Add Session domain and persistence, then selected-Workspace UI state.
5. Build the first Tauri shell and native folder picker against narrow host capabilities.



## 2026-11-27 — Reconnect-safe Workspace state feed

### Completed
- Added monotonically increasing Workspace revisions and typed created/updated/removed events to the authoritative registry.
- Registry events publish only after the next snapshot has been persisted and committed in memory; no-op operations and failed writes do not emit changes.
- Added an atomic subscribe-plus-baseline operation so a client cannot miss a mutation between taking its initial snapshot and registering for updates.
- Extended the transport-neutral Workspace host with an async watch feed: baseline snapshot followed by ordered incremental changes.
- Bounded each subscriber queue; overflow replaces the queued backlog with a complete current snapshot instead of silently dropping events.
- Added AbortSignal cancellation and iterator cleanup so disconnected consumers release their registry listeners.
- Added tests for baseline ordering, create/rename/unregister revisions, overflow resynchronization, and cancellation.
- Updated architecture and roadmap to record the feed contract.

### Guarantees and limitations
- Revisions are process-local and restart from zero after registry initialization; they are not durable event-log offsets.
- The feed is currently an in-process host capability. HTTP streaming and Tauri event transport adapters are not implemented yet.
- Queue capacity is per subscriber and configurable; the default is 64 pending messages.
- Workspace state remains authoritative in the registry; renderer projections must replace their state when receiving a snapshot.

### Verification
- GitHub Actions run for this milestone is pending; no local checkout/build was run in this environment.

### Next actions
1. Verify typecheck, tests, and build on Ubuntu, macOS, and Windows through CI.
2. Add Session domain/persistence and selected-Workspace state on top of the host/feed contract.
3. Design the filesystem access-grant and safe file-operation contracts before exposing a file tree.
4. Add durable mutation recovery and cross-process store coordination before multi-process desktop/sidecar operation.



## 2026-11-27 — Session domain and persistence foundation

### Completed
- Added an independent Session domain registry with stable IDs, canonical working directories, titles, timestamps, and active/archived status.
- Added serialized Session mutations and persistence-before-publication semantics, with defensive copies returned to callers.
- Added a versioned JSON Session store using a same-directory temporary file, restrictive file mode, file fsync, atomic rename, and POSIX directory fsync.
- Connected SessionRegistry as the authoritative Session header reader used by WorkspaceRegistry; Workspace attachment still verifies canonical working-directory equality.
- Extended the host adapter with Session listing, creation, rename, and archive capabilities.
- Session creation is coordinated by the host: persist Session metadata, attach its ID to the Workspace, and compensate by discarding the Session if attachment fails.
- Added local HTTP endpoints for Workspace Session listing/creation and Session rename/archive.
- Added tests for Session persistence/restart, canonicalization, failure atomicity, host integration, and HTTP lifecycle.
- Updated the architecture and roadmap to distinguish Session metadata from future conversation history and agent execution state.

### Guarantees and limitations
- Session metadata is persisted independently from Workspace metadata; each JSON snapshot is atomic, but the two-file operation is not a cross-store transaction.
- A process crash between Session creation and Workspace attachment may leave an unreferenced Session. Startup reconciliation and a durable transaction journal remain required before claiming crash-safe multi-store consistency.
- Workspace unregister does not delete Sessions or project files; Sessions remain durable and may become unassigned.
- This milestone does not yet store messages, model responses, tool calls, token usage, checkpoints, or resumable agent execution.
- The current Session store does not provide cross-process locking or schema migrations beyond rejecting unsupported versions.
- The Session API is a local development transport; no renderer session UI or Tauri adapter is implemented yet.

### Verification
- Workspace State Feed CI passed on Ubuntu, macOS, and Windows in run [45890723915](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45890723915).
- Session domain, Workspace membership validation, host/API, and UI changes passed GitHub Actions on Ubuntu, macOS, and Windows in run [45892156857](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45892156857).
- No local checkout/build was run in this environment.

### Next actions
1. Verify Session domain, host, and HTTP API on Ubuntu, macOS, and Windows.
2. Add crash reconciliation for unreferenced/missing Session IDs and define cross-store recovery before multi-process runtime.
3. Implement selected Workspace and Session UI state with state-feed-driven updates.
4. Add conversation/message persistence and an explicit agent-run lifecycle separately from Session metadata.
5. Design filesystem access grants and safe file operations before exposing the file tree.



## 2026-11-27 — Selected Workspace and Session UI wiring

### Completed
- Replaced hardcoded recent-task placeholders with Session records loaded from the selected Workspace.
- Made Workspace cards keyboard-accessible selection controls with a visible selected state.
- Connected the Workspace switcher to cycle through registered Workspaces.
- Connected New task / Start a task to create and attach a durable Session through the local host API.
- Added Session selection and resume behavior in the sidebar; prompt composition now requires a selected Session.
- Kept the UI honest about the remaining limitation: prompts are not yet persisted as messages and the agent runtime is not connected.
- Added focus-visible and selected-state styling for keyboard navigation.

### Limitations
- Selected Workspace/Session state is currently in-memory UI state and resets to the first Workspace on reload.
- The UI refreshes Session lists after explicit actions; live Session state streaming is not implemented.
- The agent composer does not yet create messages or invoke a model/tool.
- Native folder picker and filesystem browsing are still pending.

### Verification
- UI changes passed GitHub Actions typecheck, tests, and build on Ubuntu, macOS, and Windows in run [45892041841](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45892041841).
- No local browser or desktop visual test was run in this environment.



### Startup integrity hardening
- Workspace initialization now revalidates persisted Session references against the initialized Session registry.
- Startup rejects missing/invalid Session headers, duplicate Session IDs within a Workspace, cross-Workspace duplicate membership, and canonical working-directory mismatches.
- Added regression tests proving invalid persisted relationships fail initialization before the Workspace registry becomes available.


## 2026-11-27 — Durable Session creation recovery

### Completed
- Added a versioned, atomically replaced write-ahead journal for the single Session-create/Workspace-attach operation.
- Assigned the Session ID before persistence so the recovery record can identify the exact operation even if the process stops immediately after writing the Session snapshot.
- Serialized Session creation in the host and reconcile any previous pending operation before starting another one.
- Added startup recovery after both registries initialize and before the local UI server begins accepting requests.
- Recovery discards an unreferenced Session only when its original Workspace still exists; it preserves already attached Sessions and preserves Sessions whose Workspace was later unregistered.
- Recovery fails closed when a Workspace references a missing Session, and failed compensation leaves the journal available for another recovery attempt.
- Fixed the post-commit cleanup boundary: failure to remove the journal after a successful attachment never deletes a Session that the Workspace already references.
- Added tests for journal persistence/validation and recovery of interrupted, committed, unregistered-Workspace, and inconsistent states.

### Guarantees and limitations
- The journal is a single-pending-operation write-ahead record, not a general event log.
- The protocol protects the current single-host-process runtime. It does not provide cross-process locking or safe concurrent writers from multiple Funny Business processes.
- Workspace and Session snapshots remain separate files; this protocol coordinates the current Session creation workflow only.
- A Session preserved after its Workspace is unregistered is intentionally unassigned, not deleted.
- No local build or test was run in this environment; GitHub Actions is the verification source for this change.

### Next actions
1. Run typecheck, tests, and build on Ubuntu, macOS, and Windows.
2. Add a broader storage-coordination design covering cross-process locks, stale lock recovery, and future schema migrations before enabling multiple host processes.
3. Add Session revisioned feeds and use them to keep the browser Session list synchronized without manual refresh.
4. Continue with explicit filesystem access grants and safe file operations before implementing the file explorer.

- CI caught two HTTP test fixtures still constructing the host without its newly required journal; updated them to use the durable journal and to assert the generated opaque Session ID rather than a registry-injected ID.

### Verification
- Final implementation and recovery regression tests passed GitHub Actions run [45892902755](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45892902755) on Ubuntu, macOS, and Windows: dependency install, typecheck, tests, and build all succeeded.
- No local checkout/build was run in this environment.


## 2026-11-27 — Repository and documentation consistency audit

### Reviewed
- Re-read the documentation index, project instructions, architecture, roadmap, security baseline, performance guide, interface specification, both ADRs, root README, and the current implementation files for Session creation recovery and host startup.
- Checked the complete repository tree: project Markdown remains under `docs/`, with research and ADRs in their dedicated directories.
- Checked the latest main-branch GitHub Actions run [45892991167](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45892991167): Ubuntu, Windows, and macOS jobs all succeeded.

### Consistency fixes
- Removed a duplicated Session capability limitation in the architecture document.
- Fixed a literal escaped newline accidentally embedded in the Phase 2 roadmap checklist.
- Updated the roadmap next milestone: Session crash recovery is implemented and CI-verified; Session live updates and cross-process coordination are now the remaining work.
- Updated the root README and interface specification to distinguish implemented Session metadata navigation from the not-yet-implemented conversation/agent runtime.
- Updated ADR-0001's context and implementation sequence to reflect the current Workspace/Session host rather than describing the pre-implementation prototype.

### Current verified boundaries
- The Session creation journal covers one pending Session-create/Workspace-attach operation in a single host process. It is not a general transaction manager and does not coordinate multiple processes.
- Workspace and Session JSON snapshots remain separate stores; there is no cross-process lock, schema migration framework, or pnpm lockfile yet.
- Session state streaming, filesystem access grants/provider, native folder picker, Tauri shell, conversation persistence, and agent execution remain unimplemented.
- No local checkout/build was run; the cited GitHub Actions run is the observed cross-platform verification.


## 2026-11-27 — Revisioned Session feed and live browser updates

### Completed
- Added process-local monotonic revisions and typed created/updated/removed events to SessionRegistry; events publish only after the Session snapshot is persisted and committed.
- Added synchronous subscribe-plus-baseline snapshots to prevent a Session feed from missing a change between initial load and listener registration.
- Added a Workspace-scoped host Session feed that combines Session changes with Workspace membership changes, uses bounded queues, replaces overflow with an authoritative snapshot, and supports AbortSignal cancellation/cleanup.
- Exposed the feed through a loopback Server-Sent Events endpoint at `/api/workspaces/:id/sessions/events`; disconnects abort the underlying host subscription.
- Connected the browser Session list to EventSource snapshots and incremental Session changes, including automatic reconnect behavior supplied by the browser runtime.
- Added registry, host, overflow, cancellation, and HTTP event-stream tests.

### Verification
- GitHub Actions run [45894245336](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45894245336) passed dependency installation, typecheck, tests, and build on Ubuntu, Windows, and macOS.
- Earlier CI attempts caught an implicit-any type in a feed test assertion; the assertion was explicitly typed and the final matrix passed.
- No local checkout/build or manual visual browser test was run.

### Guarantees and limitations
- Session feed revisions are process-local and restart from zero; they are not durable event-log offsets.
- Feed state is authoritative only for the current host process. Multi-process writes and cross-process event delivery remain unsupported.
- The SSE route is loopback-only through the existing server binding; no remote transport or Tauri event adapter exists yet.
- Selected Workspace and Session navigation state remains in-memory in the browser UI.

### Next actions
1. Design and implement safe cross-process storage coordination or a single-host guard before supporting multiple host processes.
2. Add a pnpm lockfile and restore deterministic dependency caching.
3. Define filesystem access grants and safe file operations before exposing file browsing.
4. Continue toward the Tauri vertical slice only after host capability contracts remain stable.


## 2026-11-27 — Cross-process storage coordination study

### Completed
- Added `docs/research/STORAGE-COORDINATION.md` to document the current single-host constraint, JSON lost-update risk, process-local feed limits, and cross-platform failure requirements.
- Compared an OS-backed single-host lock, a transactional shared database, and lock-file leases.
- Recorded a validation direction: use a supported OS-level lock as an interim single-writer guard if available; evaluate SQLite plus a host-level Workspace/Session transaction coordinator before introducing multiple writers. A PID/mtime lock-file lease is not accepted as a production correctness boundary.
- Linked the study from the documentation index and roadmap.

### Not implemented
- No cross-process lock has been added. The one-host-per-`FUNNY_HOME` rule remains an operational constraint, not an enforced guarantee.
- No SQLite dependency, migration system, or durable cross-process event log has been added.


## 2026-11-27 — Fail-closed single-host data-directory guard

### Completed
- Added `JsonHostLock`, an atomic-directory guard at `FUNNY_HOME/.host.lock` with restrictive owner metadata and a random ownership token.
- Wired startup so the guard is acquired before either Workspace or Session JSON registry is loaded; startup failures attempt cleanup, and normal shutdown releases only a lock whose ownership token still matches.
- Added a clear contention diagnostic with owner PID/hostname/start time. These fields are diagnostic only and are not used to infer stale ownership.
- Added tests for contention, normal release/reacquisition, incomplete/stale lock fail-closed behavior, owner-token mismatch, and contention from a separate Node process.
- Updated the architecture, security baseline, README, roadmap, and storage-coordination study to state the implemented guarantee and its limits.

### Guarantees and limitations
- Atomic directory creation prevents competing host processes on supported local filesystems from both acquiring the same guard.
- This is not a kernel-managed advisory lock. Abrupt process termination leaves a stale lock directory; automatic PID/timestamp reclamation is deliberately not implemented. The operator must verify that no process still uses the data directory before manually removing `.host.lock`.
- Network filesystem semantics are not covered. The guard does not enable multi-writer operation or replace a transactional store.
- A native lock with automatic OS release remains a desktop-host investigation item.

### Verification
- GitHub Actions run [45894986543](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45894986543) passed the complete Ubuntu, macOS, and Windows matrix, including dependency installation, typecheck, tests, and build.
- The first separate-process fixture used stdin EOF as its child lifetime signal and exited with Node code 13 on all platforms; it was replaced with a bounded child lifetime and the final matrix passed.
- No local checkout/build was run in this environment.


## 2026-11-27 — Dependency reproducibility bootstrap

### Completed
- Audited `package.json` and the cross-platform CI workflow: pnpm 10.0.0 is declared, but no pnpm lockfile is committed and CI currently resolves semver ranges on each run.
- Added a manual-only GitHub Actions workflow that generates `pnpm-lock.yaml` with the declared pnpm version, disables dependency lifecycle scripts, and opens a reviewable PR from a separate automation branch.
- Restricted the bootstrap workflow to manual dispatch from `main`; it does not write generated dependency state directly to the protected development branch.
- Added `docs/research/DEPENDENCY-REPRODUCIBILITY.md` describing the current gap and the safe bootstrap/merge sequence.

### Verification and limitations
- Workflow and documentation files were committed to GitHub.
- The lockfile has **not** been generated yet; a maintainer must manually run the bootstrap workflow and review its PR.
- The existing CI remains unchanged until the generated lockfile is merged. Frozen installs and dependency caching are the next step after that merge.
- No local install/build/test was run in this environment.


## 2026-11-27 — Transactional persistence design and JSON staging hardening

### Completed
- Audited the current Workspace and Session store implementations, registries, host transaction journal, startup sequence, and cross-platform CI workflow.
- Confirmed that the current Session-create journal coordinates one two-record workflow but is not a general Workspace/Session transaction coordinator.
- Added proposed ADR-0003 describing a unified SQLite-backed transaction boundary, relational membership model, durable change sequence, JSON import, migration, backup, and acceptance tests. The ADR is **Proposed**; no database dependency or migration has been introduced.
- Fixed a cleanup gap in `JsonWorkspaceStore`: if staging succeeds but atomic replacement fails, the unpublished temporary snapshot is now removed.
- Added a regression test that forces the replacement operation to fail and verifies no temporary snapshot is left behind.
- Fixed a malformed literal newline in the documentation index and indexed the new ADR.

### Important implementation note
- An atomic rename can publish the new file before a later directory-fsync error is reported. The current store interface does not distinguish “not committed” from “published but durability uncertain”; this commit-point ambiguity must be addressed in the future shared transaction coordinator rather than hidden by optimistic error handling.
- SQLite remains the preferred candidate, not a final binding/runtime choice. The pnpm lockfile must be generated and reviewed before introducing a new dependency.

### Verification
- Source, test, ADR, and documentation changes were committed to GitHub.
- Cross-platform CI for the latest commits is pending at the time of this entry.
- No local checkout/build/test was run in this environment.


## 2026-11-27 — Transaction coordinator contract and commit ambiguity

### Completed
- Extended ADR-0003 with a normative, database-independent coordinator contract: stable operation IDs, idempotent retries, transaction phases, projection/event ordering, and explicit commit outcome semantics.
- Defined three commit outcomes: not committed, committed, and unknown. Unknown outcomes must be resolved through database recovery and a durable operation receipt; the host must fail closed while the outcome remains unresolved.
- Added a failure-injection matrix covering validation, transaction statements, commit-response loss, projection failures, listener failures, process crashes, and caller retries.
- Clarified that durable change-log replay is at-least-once across reconnects; consumers deduplicate by durable sequence/operation ID. Exactly-once transport is not claimed.
- Kept the current JSON journal as a compatibility mechanism; no SQLite dependency or runtime migration was introduced.

### Verification and limitations
- Documentation-only change. No local build/test was run.
- Latest main-branch CI observed before this entry: run [45896991314](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45896991314) completed successfully.
- The pnpm lockfile bootstrap workflow has not yet produced a merged lockfile; SQLite binding evaluation remains gated on that step.


## 2026-11-27 — SQLite binding/runtime evaluation

### Completed
- Compared Node 22 built-in `node:sqlite`, `better-sqlite3` v13, and a Tauri/Rust SQLite host path against the current TypeScript host, proposed Tauri 2 shell, Windows/macOS/Linux targets, and host-only database security boundary.
- Recorded official runtime maturity and API constraints: Node 22.16 `node:sqlite` remains Stability 1.1 (Active development), and its DatabaseSync/StatementSync APIs execute synchronously.
- Reviewed better-sqlite3 v13 Node-API migration and its published platform-specific package targets; native packaging and unsupported architecture source-build behavior remain spike acceptance criteria.
- Confirmed the Tauri v2 SQL plugin is SQLx-backed and supports Windows, macOS, and Linux, but its documented JavaScript guest bindings must not be exposed as the app's general renderer database interface.
- Added `docs/research/SQLITE-BINDING-EVALUATION.md` with a candidate matrix, provisional recommendation, required cross-platform spike, performance/security measurements, and blockers.
- Updated ADR-0003 and the documentation index to link the evaluation and make the host-only SQL boundary explicit.

### Provisional conclusion
- No binding selected and no dependency added. Carry two viable architecture paths into the spike: a TypeScript host using built-in `node:sqlite` (with `better-sqlite3` as fallback), or a Rust-owned Tauri host with a matching Node dev adapter behind the same transaction contract.
- The Node built-in option must pass an API-stability and event-loop-blocking assessment. The Rust option must prove that domain invariants are not duplicated across runtimes.

### Verification and limitations
- Documentation-only change; no local build/test or packaging spike was run.
- The pnpm lockfile bootstrap remains a prerequisite before adding an npm SQLite dependency.
- Official references reviewed: Node.js v22.16 SQLite docs, Tauri v2 SQL plugin docs/source, and better-sqlite3 v13 release/package metadata.

## 2026-11-27 — SQLite Node vertical-slice spike

### Completed
- Added an isolated `spikes/sqlite-node/vertical-slice.test.mjs` test using Node's built-in `node:sqlite`; no third-party dependency or production store replacement was introduced.
- Implemented a checksummed schema migration and schema for Workspaces, Sessions, unique Session membership, operation receipts, and an ordered durable change log.
- Exercised Session creation, Workspace attachment, operation receipt, and change-log insertion in one `BEGIN IMMEDIATE` transaction.
- Added idempotent operation-ID retry behavior, foreign-key rollback verification, unique Session-membership enforcement, and close/reopen durable-sequence verification.
- Wired the spike into the existing `pnpm run test` script so the Ubuntu, Windows, and macOS CI matrix executes it.
- Added `docs/research/SQLITE-VERTICAL-SLICE.md` and indexed it in the documentation hub.

### Verification and limitations
- Verified GitHub Actions run [45898898484](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45898898484): install, typecheck, all tests, and build passed on Ubuntu, Windows, and macOS.
- The first cross-platform run exposed a Windows-only `EBUSY` cleanup failure because SQLite handles remained open when the temporary database directory was removed. The test helper now closes all handles before cleanup; the follow-up matrix passed.
- Node emitted its expected ExperimentalWarning for `node:sqlite`; API maturity remains an explicit production risk.
- This is a contract smoke test, not a performance benchmark or production persistence implementation. Commit-ambiguity/crash injection, concurrent-process behavior, backup/restore, Node event-loop delay, packaging, and Rust/Tauri comparison remain open.
- No SQLite dependency was added; the pnpm lockfile remains a separate reproducibility blocker for third-party native bindings.

## 2026-11-27 — SQLite failure-injection and crash-recovery spike

### Implemented
- Extended the isolated Node built-in SQLite spike with injected exceptions after Session insert, Workspace membership insert, change-log insert, and operation receipt insert; each pre-commit failure must leave all transaction rows absent.
- Added child-process termination before COMMIT and verified reopening the database yields no partial Session, membership, receipt, or change-log rows.
- Added child-process termination immediately after COMMIT and before notification; restart recovers the durable receipt/change-log, and replaying the same operation ID does not duplicate the mutation.
- Simulated a lost COMMIT acknowledgement after the database had committed; the connection is closed, a fresh connection is opened, and the operation receipt resolves the committed result.
- Simulated a pre-COMMIT failure; after reopening, the absent receipt confirms the operation was not committed and a retry with the same ID is safe.
- Rejects reusing an operation ID with a different Session payload.
- Updated the SQLite vertical-slice research and ADR-0003 acceptance criteria.

### Scope and verification
- These are process-crash and adapter-boundary simulations, not power-loss or real storage I/O fault tests.
- The spike still does not implement the production transaction coordinator, in-memory projection rebuild, event notification, multi-process concurrency, WAL backup/restore, or a Rust/Tauri adapter.
- The new test commit must pass the full Ubuntu, Windows, and macOS CI matrix before being treated as verified.

