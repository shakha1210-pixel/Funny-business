# Funny-business — Task Chain & Engineering Log

This is the single living task ledger. Keep it adjacent to the root README. Update it after each meaningful change; do not create a new dated Markdown log for every task. The architecture handbook is the canonical specification; this file records status, dependencies, verification, and the next link in the chain.

## Current checkpoint

**Active milestone:** Agent Runtime contract and durable run lifecycle.

The Workspace, Session, browser host, read-only filesystem, and user-message capture vertical slices exist. A real model provider, assistant messages, tool execution, and resumable agent runs do not exist yet.

## Active chain

1. [x] Consolidate project documentation into this task ledger, root README, and root architecture handbook.
2. [ ] Finish dependency reproducibility: dispatch pnpm lockfile bootstrap; review and merge its PR; then enable frozen lockfile installs and CI caching.
3. [ ] Dispatch Rust lockfile/toolchain bootstrap; review and merge Cargo.lock + exact toolchain pin.
4. [ ] Dispatch SQLite benchmark workflow on Ubuntu, Windows, and macOS; inspect all JSON and summary artifacts; do not choose a binding from unmeasured assumptions.
5. [ ] Select persistence host/binding only after benchmark, package, license, crash-recovery, and cross-platform evidence.
6. [ ] Specify AgentRun/message/event schema and state machine against the transaction coordinator contract.
7. [ ] Implement host-owned run coordinator with deterministic test provider, cancellation, durable events, and restart reconciliation.
8. [ ] Add assistant/tool message persistence and API/feed/UI projections.
9. [ ] Add real local model adapter only after host/provider boundary and safety contracts pass.
10. [ ] Add hosted provider through host-owned credentials and explicit network policy.
11. [ ] Only then expand tool execution, permission approvals, and OS sandbox integration.

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
- [ ] Assistant/tool messages and Agent Runtime (not implemented).

### Persistence research and reproducibility
- [x] SQLite binding evaluation and isolated Node node:sqlite transaction vertical slice.
- [x] Injected rollback failures, pre/post-COMMIT child-process crash tests, lost-COMMIT-ack receipt recovery.
- [x] SQLite multi-process contention, WAL reader/writer, checkpoint and backup/restore smoke tests.
- [x] Node sync/worker and Rust benchmark harnesses plus dependency-free summarizer and CI tests.
- [ ] pnpm lockfile bootstrap workflow has not been dispatched; no pnpm-lock.yaml yet.
- [ ] Cargo lock/toolchain bootstrap workflow has not been dispatched; no Cargo.lock or exact Rust toolchain pin yet.
- [ ] Manual SQLite benchmark workflow has not been dispatched; no benchmark artifacts or binding decision.

## Verification ledger

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

## Current limitations / blockers

- No production Agent Runtime, assistant messages, tool messages, model provider, or resumable run execution.
- User messages and Session metadata are separate JSON stores; cross-store atomicity is not guaranteed.
- SQLite remains a spike/evaluation candidate, not production persistence.
- No lockfiles merged; CI is not yet using frozen/locked dependency resolution.
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
