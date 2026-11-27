# Funny-business — Task Chain & Engineering Log

This is the single living task ledger. Keep it adjacent to the root README. Update it after each meaningful change; do not create a new dated Markdown log for every task. The architecture handbook is the canonical specification; this file records status, dependencies, verification, and the next link in the chain.

## Current checkpoint

**Active milestone:** Cross-platform SQLite benchmark and persistence decision.

The Workspace, Session, browser host, read-only filesystem, and user-message capture vertical slices exist. A real model provider, assistant messages, tool execution, and resumable agent runs do not exist yet.

## Active chain

1. [x] Consolidate project documentation into this task ledger, root README, and root architecture handbook.
2. [x] Generate and merge pnpm lockfile (PR #1); next enable frozen lockfile installs and CI caching.
3. [x] Generate and merge Cargo.lock + exact Rust toolchain pin (PR #2).
4. [x] Run the initial SQLite FULL-sync benchmark matrix on Ubuntu, Windows, and macOS (run 45915331479); preserve its results as provisional historical evidence.
5. [x] Fix benchmark summarization to group by OS + synchronous mode + adapter/mode (PR #6); add FULL/NORMAL regression coverage.
6. [x] Rerun the corrected benchmark on all three OSes and inspect all 90 JSON samples plus per-OS summary.md artifacts (run 45971533752).
7. [ ] Review the benchmark methodology and validate FULL/NORMAL behavior on representative local devices; then decide whether to select a persistence host/binding, only after package, license, crash-recovery, and cross-platform evidence.
8. [x] Specify AgentRun/message/event schema, provider contract, state machine, and restart-interruption policy in the pure domain contract.
9. [ ] Implement host-owned run coordinator with deterministic test provider, cancellation, durable events, and restart reconciliation (blocked on a production transaction boundary).
10. [ ] Add assistant/tool message persistence and API/feed/UI projections.
11. [ ] Add real local model adapter only after host/provider boundary and safety contracts pass.
12. [ ] Add hosted provider through host-owned credentials and explicit network policy.
13. [ ] Only then expand tool execution, permission approvals, and OS sandbox integration.

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
- [x] Initial manual SQLite benchmark workflow completed on Ubuntu/Windows/macOS (run 45915331479); 15 JSON results per OS plus summary.md inspected.
- [x] Benchmark summarizer now separates OS + synchronous mode + adapter/mode groups; PR #6 merged at `b3f68f6353d5712af86a89b65d34fc67bfcfc8fc`.
- [x] Corrected SQLite benchmark completed on Ubuntu/Windows/macOS (run 45971533752); 30 JSON results and summary.md per OS inspected. Results remain provisional hosted-runner evidence, not a binding decision.

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

## Historical benchmark evidence (run 45915331479)

All matrix jobs succeeded; each OS artifact contained 15 JSON result files (5 repetitions × 3 modes) and `summary.md`. Median ops/s (min–max):

| OS | Node sync | Node worker | Rust rusqlite |
|---|---:|---:|---:|
| Linux | 4,690.6 (4,404.6–5,018.5) | 4,640.4 (3,908.2–4,793.4) | 5,833.7 (5,594.6–6,078.9) |
| macOS | 4,100.9 (2,710.3–5,105.3) | 3,573.6 (1,965.1–6,062.3) | 5,543.3 (4,846.2–7,393.7) |
| Windows | 157.1 (146.2–169.9) | 161.0 (146.8–168.0) | 154.5 (69.0–155.7) |

Windows throughput was roughly 150–161 ops/s across all three adapters, while Linux/macOS were roughly 3,500–5,800 ops/s. The shared Windows slowdown suggests an OS/runner/storage-sync effect rather than a Node-only issue; its cause is not yet established. The main-thread sync run's single zero-delay timer, scheduled before the measured 5,000-transaction workload, was delayed by a median ~31.8 s before its callback could run. This is a pre-scheduled timer callback delay, not a recurring heartbeat or UI-frame latency. Node worker mode instead measured a recurring 10 ms main-thread heartbeat, whose maximum delay was around 15.9 ms. These are different probes and are not directly comparable. The results show that synchronous work blocks the event loop until it completes and that the worker workload allowed the separate heartbeat to continue; they do not establish production UI latency or performance. Hosted runner noise, OS/filesystem differences, and the narrow microbenchmark limit conclusions. Keep the binding unselected pending methodology review and representative local-device tests.

## Corrected FULL vs NORMAL benchmark evidence (run 45971533752)

All three matrix jobs and artifact uploads succeeded. Each OS artifact contains 30 JSON files (5 repetitions × 2 synchronous modes × 3 adapter/mode combinations) plus `summary.md`. Artifacts: Ubuntu `15184429349`, macOS `15185945714`, Windows `15185648618`.

Median throughput in ops/s (min–max), grouped by OS and synchronous mode:

| OS | Sync | Node main-thread | Node worker-thread | Rust rusqlite |
|---|---|---:|---:|---:|
| Linux | FULL | 2,700.8 (2,448.1–3,067.7) | 2,679.9 (1,610.1–3,719.0) | 3,236.6 (1,914.4–3,670.9) |
| Linux | NORMAL | 4,314.4 (3,551.5–5,010.1) | 4,356.8 (4,004.7–5,169.1) | 4,394.9 (3,943.2–4,814.8) |
| macOS | FULL | 3,198.3 (1,343.7–3,982.0) | 2,798.3 (1,546.2–3,073.1) | 3,212.5 (1,070.8–4,097.7) |
| macOS | NORMAL | 7,630.1 (5,708.6–9,388.2) | 6,940.5 (5,545.9–9,090.1) | 10,126.5 (7,993.3–10,701.3) |
| Windows | FULL | 104.2 (78.0–119.1) | 105.4 (96.9–134.1) | 105.7 (70.9–135.6) |
| Windows | NORMAL | 487.8 (264.7–569.2) | 391.6 (232.0–581.7) | 489.8 (381.2–523.6) |

The main-thread synchronous runs measured a single zero-delay timer scheduled immediately before the 5,000-transaction workload. Median pre-scheduled timer callback delay (ms): Linux FULL 1,851.63 / NORMAL 1,159.24; macOS FULL 1,563.93 / NORMAL 655.63; Windows FULL 47,988.24 / NORMAL 10,251.50. This is the time until the event loop can run that callback after synchronous work; it is not a frame-time, input-latency, or recurring heartbeat metric. Worker-thread runs measured a separate recurring 10 ms main-thread heartbeat; median maximum callback delays (ms): Linux FULL 1.20 / NORMAL 1.20; macOS FULL 5.57 / NORMAL 4.60; Windows FULL 15.86 / NORMAL 15.74. These probes use different methods and must not be compared as the same metric.

Within this workload, NORMAL increased median throughput relative to FULL on all OSes, while FULL remained the more conservative durability setting. The pre-scheduled timer delay shows that a synchronous main-thread workload prevents the event loop from running the queued timer until the work completes. The worker heartbeat shows that its recurring timer continued during the worker-owned workload, but it is a distinct probe; this supports further evaluation of worker ownership without claiming a direct latency comparison or a UI responsiveness guarantee. This is not sufficient to select an adapter or weaken durability: NORMAL has different durability trade-offs, and no crash/power-loss or user-device performance conclusion follows from this throughput microbenchmark.

Windows throughput remained far below Linux/macOS across all adapters and both sync modes. The common platform effect suggests runner, filesystem, or storage-sync factors may contribute, but the cause is unproven. Hosted CI runners are noisy; compare adapters only within the same OS, sync mode, and identical workload/settings. Keep SQLite unselected pending methodology review, representative local-device tests, crash-recovery validation, package/license review, and an explicit durability decision.

## Current limitations / blockers

- No production Agent Runtime, assistant messages, tool messages, model provider, or resumable run execution.
- User messages and Session metadata are separate JSON stores; cross-store atomicity is not guaranteed.
- SQLite remains a spike/evaluation candidate, not production persistence; runs 45915331479 and 45971533752 are hosted-runner evidence only, with the latter separating FULL and NORMAL.
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
