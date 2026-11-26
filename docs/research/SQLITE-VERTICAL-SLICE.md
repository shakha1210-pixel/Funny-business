# Node.js SQLite Vertical Slice

**Status:** Transaction, process-crash recovery, and initial multi-process/WAL concurrency spike verified in the Ubuntu, Windows, and macOS CI matrix; not production persistence and not a binding selection.

## Purpose

Exercise the minimum transactional contract against the Node.js 22 built-in `node:sqlite` API without adding a third-party dependency or changing the active JSON stores. The test is deliberately kept under `spikes/` so experimental API usage cannot be mistaken for an accepted runtime decision.

## What the spike exercises

- Opens a temporary on-disk SQLite database and explicitly enables foreign keys.
- Applies schema version 1 inside a transaction and stores a SHA-256 migration checksum.
- Defines Workspace, Session, unique Session membership, operation receipts, and an ordered durable change log.
- Creates a Session, attaches it to a Workspace, records an operation receipt, and appends a change event in one `BEGIN IMMEDIATE` transaction.
- Retries the same operation ID and returns the original receipt instead of writing duplicate rows.
- Forces a foreign-key failure and injected failures after each pre-commit write; every case must roll back all domain, membership, receipt, and change-log rows.
- Verifies the unique Session-membership constraint and rejects reuse of an operation ID with a different Session payload.
- Kills a child process before COMMIT and verifies SQLite recovery exposes no partial rows.
- Kills a child process immediately after COMMIT but before notification; restart finds the durable receipt/change log and an operation retry does not duplicate data.
- Simulates a lost COMMIT acknowledgement after the database committed, closes the connection, reopens the file, and resolves the outcome from the original operation receipt.
- Simulates a failure before COMMIT, verifies the receipt is absent after reopen, and retries with the same operation ID.
- Closes and reopens the database, then reads the durable operation receipt, migration checksum, and change sequence.
- Uses two independent processes to verify writer-lock contention and `busy_timeout` failure behavior.
- Verifies WAL readers see the last committed snapshot while a writer is active, do not see uncommitted rows, and see the new row after commit.
- Runs two independent writer processes concurrently and verifies SQLite serializes them without losing either committed row.

The test is wired into the existing `pnpm run test` command, so the repository's Ubuntu, Windows, and macOS CI matrix runs it using the configured Node 22 runtime.

## What this does not prove

- It does not benchmark latency, event-loop blocking, startup, memory, packaging, or installer size.
- Process-kill tests exercise SQLite process-crash recovery on CI; they are not power-loss, storage-controller, or filesystem fault tests and do not establish universal durability guarantees.
- Commit ambiguity is simulated at the adapter boundary; no real device I/O error or torn-write fault is induced.
- The concurrency tests cover a small local-filesystem workload only; they do not prove fairness, starvation freedom, high-contention throughput, network-filesystem safety, or multi-host access.
- The backup/restore test is a controlled local snapshot test. It does not cover process termination during backup, external file-copy tools, filesystem snapshots, encryption, or operational retention policies.
- Migrations beyond the first version and sustained reader/writer load remain untested.
- It does not evaluate Node worker-thread ownership or a Rust/Tauri host implementation.
- It does not replace the current JSON Workspace/Session stores or alter the host's production persistence path.

## Evaluation gates still open

1. Add backup interruption/corruption recovery tests, and define retention/encryption policy.
2. Add migration upgrade policy tests and sustained load/fairness measurements.
3. Measure realistic metadata transaction latency and event-loop delay.
4. Run the same contract through a Rust-owned host candidate before selecting the desktop persistence owner.
5. Complete packaging, platform/architecture, and dependency provenance review.

**Verification:** The base transaction spike passed [run 45898898484](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45898898484). The failure-injection/process-crash suite passed [run 45902028784](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45902028784), the additional idempotency/commit-outcome checks passed [run 45902058380](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45902058380), and the initial multi-process/WAL concurrency suite passed [run 45902344483](https://github.com/shakha1210-pixel/Funny-business/actions/runs/45902344483); each run completed install, typecheck, tests, and build on Ubuntu, Windows, and macOS.\n\n**Decision:** The Node built-in SQLite path has passed this minimal transaction-contract smoke test on the three CI operating systems. It has not passed production durability, sustained concurrency/fairness, WAL backup/restore, performance, packaging, or runtime-maturity gates. SQLite remains an evaluation candidate; JSON remains the active persistence implementation.
