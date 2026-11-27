# Funny-business — Task Chain & Engineering Log

This is the single living task ledger. Keep it adjacent to the root README. Update it after each meaningful change; do not create a new dated Markdown log for every task. The architecture handbook is the canonical specification; this file records status, dependencies, verification, and the next link in the chain.

## Current checkpoint

**Active milestone:** Cross-platform SQLite benchmark and persistence decision.

The Workspace, Session, browser host, read-only filesystem, and user-message capture vertical slices exist. A real model provider, assistant messages, tool execution, and resumable agent runs do not exist yet.

## Active chain

1. [x] Consolidate project documentation into this task ledger, root README, and root architecture handbook.
2. [x] Generate and merge pnpm lockfile (PR #1); next enable frozen lockfile installs and CI caching.
3. [x] Generate and merge Cargo.lock + exact Rust toolchain pin (PR #2).
4. [x] Dispatch SQLite benchmark workflow on Ubuntu, Windows, and macOS; inspect all JSON and summary.md artifacts (run 45915331479; all 3 OS jobs and artifacts succeeded).
5. [ ] Investigate cross-platform SQLite FULL-sync latency and validate on representative devices; then select persistence host/binding only after package, license, crash-recovery, and cross-platform evidence.
6. [x] Specify AgentRun/message/event schema, provider contract, state machine, and restart-interruption policy in the pure domain contract.
7. [ ] Implement host-owned run coordinator with deterministic test provider, cancellation, durable events, and restart reconciliation (blocked on a production transaction boundary).
9. [ ] Add assistant/tool message persistence and API/feed/UI projections.
10. [ ] Add real local model adapter only after host/provider boundary and safety contracts pass.
11. [ ] Add hosted provider through host-owned credentials and explicit network policy.
12. [ ] Only then expand tool execution, permission approvals, and OS sandbox integration.

## Completed foundations

### Repository and documentation
- [x] TypeScript/Node 22 project bootstrap and cross-platform CI.
- [x] Root README and initial documentation index/instructions/architecture/roadmap/security/performance/interface documents.
- [x] DeepSeek Harness public architecture study and independent implementation policy.
- [x] Workspace reverse-engineering evidence ledger and proposed domain boundaries.

### Core domain and host
- [x] Typed plugin contracts, service registry, plugin lifecycle, dependency handling, setup rollback.
- [x] Workspace registry, canonical path identity, serialized mutations, persistence abstraction.
- [x] Atomic JSON Workspace and Session snapshots; schema validation and temp-file cleanup on failed publish.
- [x] Session registry, Session lifecycle, Workspace membership invariants.
- [x] Session creation journal and startup recovery.
- [x] Single-host atomic-directory guard with ownership token; stale locks fail closed and require verified manual cleanup.
- [x] Transport-neutral WorkspaceHost and Workspace/Session revisioned feeds with bounded overflow snapshots and cancellation.
- [x] Loopback HTTP API, static asset allowlist, security headers, body limits, Origin mismatch rejection, SSE.
- [x] Browser Workspace and Session navigation, creation, selection, live updates.

### Filesystem and messages
- [x] Persisted Workspace-root read/list grants, explicit grant/revoke.
- [x] Bounded directory enumeration, pagination, directory-bound cursors, bounded UTF-8 reads, stale-version checks, symlink rejection.
- [x] Browser file explorer with grant/revoke, navigation, load-more, preview, stale-request guards.
- [x] Per-Session JSON user-message history, 64 KiB limit, serialized appends, archived Session write rejection.
- [x] Pure Agent Runtime contracts: AgentRun/AgentMessage/event/provider types, strict state transitions, and interrupted-run startup policy (no executor or persistence yet).
- [ ] Assistant/tool message persistence and the durable Agent Runtime coordinator (not implemented).

### Persistence research and reproducibility
- [x] SQLite binding evaluation and isolated Node node:sqlite transaction vertical slice.
- [x] Injected rollback failures, pre/post-COMMIT child-process crash tests, lost-COMMIT-ack receipt recovery.
- [x] SQLite multi-process contention, WAL reader/writer, checkpoint and backup/restore smoke tests.
- [x] Node sync/worker and Rust benchmark harnesses plus dependency-free summarizer and CI tests.
- [x] pnpm-lock.yaml generated with pnpm 10.0.0 and merged through PR #1.
- [x] Rust Cargo.lock and exact rust-toolchain.toml (1.100.0) merged through PR #2.
- [x] Manual SQLite benchmark workflow completed on Ubuntu/Windows/macOS (run 45915331479); 15 JSON results per OS plus summary.md inspected. Results are provisional hosted-runner evidence, not a binding decision.

## Verification ledger

- [x] GitHub Actions run 45911318923 — Agent Runtime contract + lifecycle tests, typecheck, full tests, benchmark smoke checks, and build; Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45912851778 — post-pnpm-lockfile CI, success.
- [x] GitHub Actions run 45913548321 — post-Cargo.lock SQLite Rust spike check on main, success.
- [x] GitHub Actions run 45911210929 — Agent Runtime contract documentation and task-chain update, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45911208613 — Agent Runtime contract handbook update, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45908460276 — documentation checkpoint, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45908448152 — roadmap checkpoint, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45908372776 — directory-bound pagination documentation, success.
- [x] GitHub Actions run 45908368516 — filesystem research documentation, success.
- [x] GitHub Actions run 45908355746 — cursor reuse rejection, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45908291287 — filesystem HTTP error mapping, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45902058380 — SQLite crash/failure-injection vertical slice, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45898898484 — SQLite transaction vertical slice, Ubuntu/Windows/macOS success.
- [x] GitHub Actions run 45896887710 — JSON persistence cleanup and host foundations, Ubuntu/Windows/macOS success.

Historical failed runs were corrected by later commits; do not count superseded failures as current failures. No local checkout/build/test has been run in this environment. Only observed GitHub Actions results are claimed.

## Benchmark evidence (run 45915331479)

All matrix jobs succeeded; each OS artifact contained 15 JSON result files (5 repetitions × 3 modes) and `summary.md`. Median ops/s (min–max):

| OS | Node sync | Node worker | Rust rusqlite |
|---|---:|---:|---:|
| Linux | 4,690.6 (4,404.6–5,018.5) | 4,640.4 (3,908.2–4,793.4) | 5,833.7 (5,594.6–6,078.9) |
| macOS | 4,100.9 (2,710.3–5,105.3) | 3,573.6 (1,965.1–6,062.3) | 5,543.3 (4,846.2–7,393.7) |
| Windows | 157.1 (146.2–169.9) | 161.0 (146.8–168.0) | 154.5 (69.0–155.7) |

Windows throughput was roughly 150–161 ops/s across all three adapters, while Linux/macOS were roughly 3,500–5,800 ops/s. The shared Windows slowdown suggests an OS/runner/storage-sync effect rather than a Node-only issue; its cause is not yet established. Node main-thread sync blocked the event loop for a median ~31.8 s over 5,000 measured transactions; Node worker mode kept the main-thread heartbeat max delay around 15.9 ms. This supports worker ownership when using synchronous SQLite, but does not establish production performance. Hosted runner noise, OS/filesystem differences, and the narrow microbenchmark limit conclusions. Keep the binding unselected pending methodology review and representative local-device tests.

## Current limitations / blockers

- No production Agent Runtime, assistant messages, tool messages, model provider, or resumable run execution.
- User messages and Session metadata are separate JSON stores; cross-store atomicity is not guaranteed.
- SQLite remains a spike/evaluation candidate, not production persistence; benchmark run 45915331479 is preliminary evidence only.
- pnpm-lock.yaml and Cargo.lock are merged, but the main Node CI install has not yet been switched to frozen-lockfile mode.
- No real OS sandbox, process execution broker, permission approval UI, or credential vault.
- Filesystem adapter is read-only and retains intermediate-component TOCTOU risk.
- Browser UI is a prototype; native desktop shell and end-to-end browser automation are not complete.
- Git/GitHub/model/notebook UI areas may still contain placeholders.

## Decision rules for task updates

- A task is complete only after code/docs are committed and the relevant verification result is observed.
- Record exact workflow run IDs and platforms; do not claim local tests.
- Keep one active milestone and an ordered next-action chain.
- When a dependency blocks work, record the blocker and continue with a safe independent task.
- Do not silently change an architecture proposal into an accepted decision.
- Do not remove a limitation from this file until tests and implementation close it.
