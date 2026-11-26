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
