# SQLite runtime benchmark

- **Status:** Benchmark harness implemented; no measurements accepted yet
- **Date:** 2026-11-27
- **Related:** [Binding evaluation](SQLITE-BINDING-EVALUATION.md), [vertical slice](SQLITE-VERTICAL-SLICE.md), [ADR-0002](../adr/0002-desktop-shell-and-runtime.md), [ADR-0003](../adr/0003-transactional-workspace-session-persistence.md)

## Purpose

Compare the cost of one identical metadata transaction through:

1. Node.js 22 built-in `node:sqlite` / `DatabaseSync`.
2. Rust `rusqlite` 0.32.1 with the bundled SQLite build.

This is a storage-adapter microbenchmark, not a complete Node-sidecar versus Tauri-host benchmark. It does not include Tauri startup, IPC, renderer, native host command dispatch, sidecar startup, or package size.

## Workload contract

Both implementations create the same five tables and seed one Workspace, then execute one transaction per Session:

1. Insert Session row.
2. Insert Workspace membership row.
3. Insert durable change-log row.
4. Insert operation receipt referencing the Session and change sequence.
5. Commit.

Both use foreign keys, a 5-second busy timeout, WAL journal mode, and FULL synchronous mode by default. Each runs a configurable warmup, then a measured transaction count. Both verify the final Session row count.

The Rust and Node harnesses intentionally use the same schema, constraints, write order, and transaction boundary. They are independent implementations, not production repositories or domain services.

## Running locally

Node (requires a Node release with `node:sqlite`):

```sh
node spikes/sqlite-benchmark/node.mjs --iterations=5000 --warmup=500 --journal=WAL --synchronous=FULL
```

Rust (requires the Rust stable toolchain and a C build toolchain for bundled SQLite):

```sh
cd spikes/sqlite-benchmark/rust
cargo run --release -- --iterations=5000 --warmup=500 --journal=WAL --synchronous=FULL
```

Supported options:
- `iterations`: measured transactions; positive integer.
- `warmup`: discarded warmup transactions; non-negative integer.
- `journal`: `WAL` or `DELETE`.
- `synchronous`: `FULL` or `NORMAL`.

The manual GitHub Actions workflow runs both adapters on Ubuntu, Windows, and macOS:
[SQLite runtime benchmark workflow](../../.github/workflows/sqlite-benchmark.yml).

## Reported measurements

- Database open + initial PRAGMA setup time.
- Total measured wall time and transactions/second.
- Per-transaction p50, p95, p99, and max latency.
- Node-only synchronous event-loop stall estimate and RSS delta.
- OS, architecture, runtime, journal mode, synchronous mode, iteration count.
- Verified final Session row count.

The Node event-loop figure is a deliberately simple timer-delay probe around a synchronous benchmark loop. It estimates the event-loop stall caused by this workload; it is not a production event-loop histogram. RSS delta is process-wide and can be noisy.

## Interpretation rules

- Compare Node and Rust only within the same OS runner, same workflow input, same journal/synchronous settings, and same iteration count.
- Hosted CI runners are noisy and are not dedicated performance hardware. Use repeated runs and report medians/ranges before drawing conclusions.
- A storage microbenchmark cannot decide the runtime architecture by itself. Include sidecar/native-host startup, idle RSS, process count, IPC/command overhead, packaging size, developer complexity, and security boundaries.
- Do not infer that a faster adapter permits moving database access into the renderer. Persistence remains host-owned.
- Do not compare a debug Rust build with optimized Node or vice versa. The Rust workflow uses `--release`.
- The initial workflow pins rusqlite but does not yet commit a Cargo.lock. Treat first results as exploratory until the lockfile and toolchain are pinned and checked in.
- Do not use a single run as an acceptance threshold. No performance budgets exist yet.

## Current status and next steps

- Harnesses and a manual three-OS workflow are committed.
- No benchmark result is recorded yet; the workflow must be run from GitHub Actions.
- First verify compilation and output shape on all three OS.
- Commit a generated Cargo.lock and pin the Rust toolchain after the first successful workflow run.
- Run at least five repetitions per OS and compare median throughput and tail latency.
- Add a bounded concurrent-reader workload and a worker-thread Node variant before choosing database thread ownership.
- Later compare a minimal Tauri Rust host against a Node sidecar; do not equate this adapter microbenchmark with the full desktop runtime decision.

**Decision:** No binding or runtime selected. JSON remains the active application persistence implementation.
