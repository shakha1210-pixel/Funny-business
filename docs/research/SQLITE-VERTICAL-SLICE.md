# Node.js SQLite Vertical Slice

**Status:** Implemented as an isolated evaluation spike; not production persistence and not a binding selection.

## Purpose

Exercise the minimum transactional contract against the Node.js 22 built-in `node:sqlite` API without adding a third-party dependency or changing the active JSON stores. The test is deliberately kept under `spikes/` so experimental API usage cannot be mistaken for an accepted runtime decision.

## What the spike exercises

- Opens a temporary on-disk SQLite database and explicitly enables foreign keys.
- Applies schema version 1 inside a transaction and stores a SHA-256 migration checksum.
- Defines Workspace, Session, unique Session membership, operation receipts, and an ordered durable change log.
- Creates a Session, attaches it to a Workspace, records an operation receipt, and appends a change event in one `BEGIN IMMEDIATE` transaction.
- Retries the same operation ID and returns the original receipt instead of writing duplicate rows.
- Forces a foreign-key failure and verifies all writes in the transaction roll back.
- Verifies the unique Session-membership constraint.
- Closes and reopens the database, then reads the durable operation receipt, migration checksum, and change sequence.

The test is wired into the existing `pnpm run test` command, so the repository's Ubuntu, Windows, and macOS CI matrix runs it using the configured Node 22 runtime.

## What this does not prove

- It does not benchmark latency, event-loop blocking, startup, memory, packaging, or installer size.
- It does not establish crash/power-loss durability guarantees or test commit-outcome ambiguity.
- It does not test concurrent processes, busy-lock contention, WAL backup/restore, migrations beyond the first version, or long-running readers.
- It does not evaluate Node worker-thread ownership or a Rust/Tauri host implementation.
- It does not replace the current JSON Workspace/Session stores or alter the host's production persistence path.

## Evaluation gates still open

1. Verify the GitHub Actions result on all three OS runners; do not infer success from a commit.
2. Add failure-injection around commit ambiguity and restart recovery.
3. Measure realistic metadata transaction latency and event-loop delay.
4. Run the same contract through a Rust-owned host candidate before selecting the desktop persistence owner.
5. Complete packaging, backup/restore, platform/architecture, and dependency provenance review.

**Decision:** Node's built-in SQLite path has passed only the source-level implementation stage until CI confirms it. SQLite remains an evaluation candidate; JSON remains the active persistence implementation.
