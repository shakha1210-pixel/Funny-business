# SQLite binding and runtime evaluation

- **Status:** Research / no binding selected
- **Date:** 2026-11-27
- **Scope:** Node.js 22 development host and prospective Tauri 2 desktop host
- **Related:** [ADR-0002](../adr/0002-desktop-shell-and-runtime.md), [ADR-0003](../adr/0003-transactional-workspace-session-persistence.md), [Dependency reproducibility](DEPENDENCY-REPRODUCIBILITY.md)

## Executive summary

SQLite remains the preferred persistence engine candidate, but the binding must follow the host/runtime boundary rather than dictate it.

The project currently has a TypeScript/Node.js host and a proposed Tauri 2 desktop shell. The renderer must never receive a general-purpose database connection. A single host-owned transaction coordinator must own writes, operation receipts, durable change-log rows, commit outcome resolution, and projection publication.

**No dependency is added by this research. No final binding is selected.** The pnpm lockfile bootstrap and a runnable cross-platform vertical slice remain prerequisites.

## Candidate comparison

| Candidate | Node 22 dev host | Tauri 2 desktop host | Advantages | Risks / constraints |
|---|---|---|---|---|
| Built-in `node:sqlite` | Direct | Only if Node sidecar is shipped | No extra npm native addon; built into Node; simple dependency graph | Node 22 API is Stability 1.1 (Active development); synchronous API can block the event loop; ties persistence to Node runtime |
| `better-sqlite3` | Direct | Only if Node sidecar is shipped | Mature synchronous API; current v13 line uses Node-API; published platform prebuilds | Native binary packaging and architecture matrix; synchronous calls can block event loop; extra npm dependency and native supply-chain surface |
| Rust SQLite adapter (`sqlx` or `rusqlite`) | Not directly in current Node host | Native Tauri host | Database stays behind native host commands; no SQLite access from renderer; natural fit if privileged host moves to Rust | Rust implementation and test harness required; a Node dev adapter is still needed unless the host runtime itself moves; avoid duplicating domain rules |
| Tauri SQL plugin guest API | Not applicable | Available | Official plugin; SQLx-backed; SQLite feature; supports Windows/macOS/Linux | Its documented API is exposed through JavaScript guest bindings; direct renderer DB access violates this project's host-only persistence boundary unless wrapped behind a separate trusted command layer |

## Evidence reviewed

### Node.js built-in SQLite

The Node.js v22.16.0 documentation identifies `node:sqlite` as **Stability 1.1 — Active development**. Its `DatabaseSync` and `StatementSync` methods execute synchronously. The constructor enables foreign-key constraints by default and supports a configurable busy timeout (default 0 ms). The module was added in Node 22.5.0 and is no longer behind the experimental startup flag from Node 22.13.0, but it remains experimental in the 22.x line.

Implications:
- The current `engines.node >=22` declaration is too broad to promise one uniform built-in SQLite API. If selected, define and enforce a minimum tested Node 22 minor version.
- Keep extension loading disabled; the built-in constructor defaults `allowExtension` to false.
- Do not run potentially long synchronous database work on the UI/event-loop thread. Test whether the Node host needs a dedicated worker thread or whether bounded metadata transactions are sufficiently short.
- Treat Node 22's experimental API stability as an explicit risk, not as a free production default.

Official source: https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html

### better-sqlite3

The current v13 package manifest declares Node >=22, uses `node-addon-api`, and publishes platform-specific entry points for Windows x64/arm64, macOS x64/arm64, Linux glibc x64/arm64, and Linux musl x64/arm64. Its v13 release notes state that v13 moved to Node-API and distributes prebuilt binaries; unsupported platform/architecture combinations still need a source build. The current v13.2.0 release also contains platform/build-system changes, so the exact release must be pinned and tested rather than inferred from the major version.

Implications:
- It is a credible Node-host candidate if the TypeScript sidecar remains the chosen desktop runtime.
- Validate all actual release artifacts and install behavior on Windows, macOS, Linux glibc and Linux musl, for x64 and arm64 targets that the product intends to ship.
- Native addon packaging must be tested in the final sidecar layout, not just in a developer's `node_modules`.
- Synchronous API work still needs bounded transaction sizes and an event-loop blocking measurement.

Official sources:
- https://github.com/WiseLibs/better-sqlite3/releases
- https://github.com/WiseLibs/better-sqlite3/blob/master/package.json

### Tauri / Rust

The Tauri v2 SQL plugin is SQLx-backed and lists Linux, Windows, and macOS support. Its documented JavaScript guest bindings allow the frontend to load a database and execute SQL. This is convenient for ordinary UI-owned data, but it is not an acceptable direct persistence interface for Funny Business: the renderer is untrusted and must not become a database client with broad query authority.

A Tauri-native implementation can instead expose narrow typed commands from Rust and keep SQL operations inside the trusted host. The official plugin source can be studied as an implementation option, but the guest API should not be exposed to the renderer. If the plugin itself is used, verify its command permissions and whether the required transaction and connection ownership can be enforced without granting renderer SQL execution.

Official sources:
- https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/sql
- https://v2.tauri.app/plugin/sql/

## Provisional recommendation

Do not select a binding yet. Carry these two paths into the vertical-slice benchmark:

**Path A — TypeScript host remains authoritative**
- Evaluate `node:sqlite` first because it avoids a third-party native npm dependency.
- Treat its Node 22 experimental stability and synchronous execution as blocking evaluation criteria.
- Keep the database inside the host process (or a dedicated worker owned by it); renderer and plugins only call typed host methods.
- Evaluate `better-sqlite3` as the fallback if Node's built-in API maturity or missing functionality fails acceptance.

**Path B — Tauri Rust host owns persistence**
- Evaluate a Rust SQLite adapter behind narrow typed Tauri commands.
- The TypeScript browser/dev adapter must implement the same repository/coordinator contract; it may use `node:sqlite` or `better-sqlite3`.
- Keep domain invariants and transaction semantics in one shared specification and contract-test suite. Do not fork Workspace/Session business rules between Rust and TypeScript.
- Do not expose the Tauri SQL plugin's general guest SQL API to the renderer.

The current microbenchmark compares main-thread Node, worker-thread Node, and Rust transaction execution; use the worker-thread result to estimate the cost of isolating synchronous SQLite from the UI/event loop. The vertical slice must compare the full host choice, not just raw SQL speed. A Node sidecar with a native addon and a native Rust host have different process, startup, packaging, and security costs. The initial same-schema Node `node:sqlite` and Rust `rusqlite` microbenchmark harness is in `spikes/sqlite-benchmark/`; its methodology and limitations are recorded in [SQLite runtime benchmark](SQLITE-RUNTIME-BENCHMARK.md).

## Required spike and acceptance matrix

Build the same minimal schema and operation in each viable path: open database, verify foreign keys, apply a checksummed migration, insert Session + Workspace membership + operation receipt + change-log row in one transaction, force a constraint failure and verify rollback, close/reopen, and resume from a durable change sequence.

Run on:
- Windows x64; Windows arm64 if included in the product target.
- macOS arm64 and x64.
- Linux x64 and arm64 on the supported libc baseline; include musl only if it is a supported deployment target.

Measure and record:
- Clean build and install without relying on a developer-global compiler or preinstalled SQLite.
- Runtime/sidecar/native host startup and cold database-open latency.
- Idle memory and process count.
- Transaction latency for realistic metadata workloads.
- Event-loop delay during the largest allowed transaction (Node paths).
- Installer and packaged runtime size.
- Database path placement, permissions, backup, restore, and WAL handling.
- Crash/restart behavior around commit and operation-receipt lookup.
- License, native binary provenance, update cadence, and vulnerability response.

A candidate fails if it requires renderer SQL authority, silently falls back to an untested source build, cannot pass the same transaction contract, or cannot be packaged/recovered on a required OS.

## Current blockers and next step

1. A maintainer must run the manual pnpm lockfile bootstrap workflow and review/merge its PR.
2. Confirm the exact Node 22 minor version used by CI and desktop sidecar (do not assume every Node 22 release has the same `node:sqlite` surface).
3. Run the manual cross-platform SQLite runtime benchmark workflow with the same iteration count and settings on all three operating systems.
4. Commit the generated Cargo.lock and pin the Rust toolchain after the first successful run; repeat at least five times per OS before interpreting performance.
5. Extend the benchmark with a Node worker-thread variant and bounded concurrent readers, then compare full sidecar versus native-host startup/idle/packaging costs.
6. Record measured results and only then update ADR-0002/0003 with an accepted runtime/binding decision.

Until those steps pass, JSON remains the active persistence implementation and SQLite remains a proposed migration target.
