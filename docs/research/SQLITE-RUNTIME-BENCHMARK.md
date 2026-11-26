# SQLite runtime benchmark

- **Status:** Benchmark harness implemented; no measurements accepted yet
- **Date:** 2026-11-27
- **Related:** [Binding evaluation](SQLITE-BINDING-EVALUATION.md), [vertical slice](SQLITE-VERTICAL-SLICE.md), [ADR-0002](../adr/0002-desktop-shell-and-runtime.md), [ADR-0003](../adr/0003-transactional-workspace-session-persistence.md)

## Purpose

Compare the cost of one identical metadata transaction through:

1. Node.js 22 built-in `node:sqlite` / `DatabaseSync` on the main thread.
2. The same Node adapter inside a dedicated worker thread, measuring main-thread heartbeat responsiveness.
3. Rust `rusqlite` 0.32.1 with the bundled SQLite build.

This is a storage-adapter microbenchmark, not a complete Node-sidecar versus Tauri-host benchmark. It does not include Tauri startup, IPC, renderer, native host command dispatch, sidecar startup, or package size.

## Workload contract

Both implementations create the same five tables and seed one Workspace, then execute one transaction per Session:

1. Insert Session row.
2. Insert Workspace membership row.
3. Insert durable change-log row.
4. Insert operation receipt referencing the Session and change sequence.
5. Commit.

Both use foreign keys, a 5-second busy timeout, WAL journal mode, and FULL synchronous mode by default. Each uses `BEGIN IMMEDIATE`, prepares the four write statements inside each transaction, uses the same fixed timestamp, runs a configurable warmup, then a measured transaction count. Both verify the final Session row count.

The Rust and Node harnesses intentionally use the same schema, constraints, write order, and transaction boundary. They are independent implementations, not production repositories or domain services.

## Running locally

Node (requires a Node release with `node:sqlite`):

```sh
node spikes/sqlite-benchmark/node.mjs --mode=sync --iterations=5000 --warmup=500 --journal=WAL --synchronous=FULL
node spikes/sqlite-benchmark/node.mjs --mode=worker --iterations=5000 --warmup=500 --journal=WAL --synchronous=FULL
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

Before benchmarking, run the [Cargo lockfile bootstrap workflow](../../.github/workflows/bootstrap-cargo-lockfile.yml) on `main`, review and merge its PR. The benchmark workflow uses `cargo --locked` and intentionally refuses to resolve an uncommitted dependency graph. The manual GitHub Actions workflow then runs Node main-thread, Node worker-thread, and Rust adapters on Ubuntu, Windows, and macOS. It repeats each adapter independently (default: five repetitions, configurable up to 20) and uploads one JSON result per adapter/repetition plus a generated `summary.md` per OS as OS-specific artifacts:
[SQLite runtime benchmark workflow](../../.github/workflows/sqlite-benchmark.yml).

## Reported measurements

- Database open + initial PRAGMA setup time.
- Total measured wall time and transactions/second.
- Per-transaction p50, p95, p99, and max latency.
- Node synchronous event-loop stall estimate, worker-thread main-loop heartbeat delay/tick count, and RSS delta.
- OS, architecture, runtime, journal mode, synchronous mode, iteration count.
- Verified final Session row count.

The Node synchronous event-loop figure is a timer-delay probe scheduled immediately before the measured transaction loop; it estimates how long that loop prevents the owning thread from servicing timers. In worker mode, the same field describes worker-thread blocking and must not be interpreted as UI responsiveness; the separate 10 ms main-thread heartbeat reports the relevant maximum scheduling delay and tick count. The summarizer uses the synchronous stall only for main-thread mode and the heartbeat only for worker mode. This is a focused responsiveness probe, not a production event-loop histogram. RSS delta is process-wide and can be noisy.

## Summarizing downloaded artifacts

After downloading the three OS artifacts and extracting their JSON files under one directory (for example, `benchmark-results/`), run:

```sh
node spikes/sqlite-benchmark/summarize.mjs benchmark-results --expected-repeats=5
```

The summarizer groups results by OS, adapter, and execution mode; reports median throughput, throughput range, median p95/p99 transaction latency, database open time, and available responsiveness probes; and exits with a warning status if any group has a different number of repetitions. It does not combine measurements across operating systems.

## Interpretation rules

- Compare Node and Rust only within the same OS runner, same workflow input, same journal/synchronous settings, and same iteration count.
- Hosted CI runners are noisy and are not dedicated performance hardware. Use repeated runs and report medians/ranges before drawing conclusions.
- A storage microbenchmark cannot decide the runtime architecture by itself. Include sidecar/native-host startup, idle RSS, process count, IPC/command overhead, packaging size, developer complexity, and security boundaries.
- Do not infer that a faster adapter permits moving database access into the renderer. Persistence remains host-owned.
- Do not compare a debug Rust build with optimized Node or vice versa. The Rust workflow uses `--release`.
- The initial workflow pins rusqlite but does not yet commit a Cargo.lock. Treat first results as exploratory until the lockfile and toolchain are pinned and checked in.
- Do not use a single run as an acceptance threshold. No performance budgets exist yet.

## Current status and next steps

- Harnesses, a focused Rust compile-check, and a manual three-OS benchmark workflow are committed.
- The Rust compile-check passed its first CI run [45904796532](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45904796532). The Node harness now measures both main-thread blocking and worker-thread isolation; the updated manual workflow still needs to be run to produce comparable artifacts.
- The workflow now defaults to five independent repetitions per adapter and OS, with separate JSON artifacts for each run. Dispatch inputs are passed through environment variables (not interpolated into shell source), and `set -euo pipefail` ensures a failed benchmark cannot be hidden by `tee`. No benchmark result is recorded yet; the manual workflow must be run from GitHub Actions.
- First verify compilation and output shape on all three OS.
- Commit a generated Cargo.lock and pin the Rust toolchain after the first successful workflow run.
- Run the manual workflow with five repetitions per OS and compare median throughput, p95/p99 latency, and run-to-run spread.
- Add a bounded concurrent-reader workload before choosing database thread ownership.
- Later compare a minimal Tauri Rust host against a Node sidecar; do not equate this adapter microbenchmark with the full desktop runtime decision.

**Decision:** No binding or runtime selected. JSON remains the active application persistence implementation.
