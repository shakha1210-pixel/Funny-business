# Storage Coordination and Multi-Process Safety

Status: implementation update — a fail-closed atomic-directory single-host guard is implemented; kernel-managed locks and transactional shared storage remain under evaluation.

## Problem statement

The current runtime has two independently persisted JSON snapshots:
- `workspaces.json`
- `sessions.json`

Each registry serializes mutations only inside its own process. Atomic file replacement protects a snapshot from partial publication, but it does not prevent two processes from reading the same old state and overwriting one another's updates. The Session-creation journal coordinates one Session-create/Workspace-attach operation in one host process; it is not a cross-process lock or a general transaction manager.

The Session and Workspace revision feeds are also process-local. The loopback SSE endpoint streams the state of the host process that accepted the connection; it is not a shared multi-process event log.

**Current enforced constraint:** the Node host acquires `FUNNY_HOME/.host.lock` using atomic directory creation before loading either JSON registry. A competing host fails closed. Only one host may use a data directory. This guard is designed for supported local filesystems; network filesystem semantics are not claimed.

## Requirements

1. Prevent concurrent host processes from silently overwriting one another's state.
2. Preserve crash recovery and fail closed when ownership or persisted state is ambiguous.
3. Keep Workspace and Session invariants consistent across writes.
4. Avoid treating PID metadata, stale timestamps, or a process-local Promise queue as proof of exclusive ownership.
5. Define behavior for abrupt termination, OS sleep, process crashes, and stale ownership records.
6. Keep Windows, macOS, and Linux behavior explicit and tested.
7. Keep renderer and browser clients as clients of one authoritative host; do not grant them direct store access.

## Options

### A. Atomic-directory single-host guard (implemented interim mechanism)

The Node host creates `FUNNY_HOME/.host.lock` with an atomic filesystem directory-creation operation before reading either store. The directory contains owner metadata with PID, hostname, start time, and a random ownership token. Normal shutdown verifies the token and removes the directory. A competing host fails closed and reports diagnostic owner information.

- Advantage: no native dependency; atomic directory creation is available through Node on Windows, macOS, and Linux local filesystems; preserves the current single authoritative in-memory registry.
- Important limitation: a process crash leaves a stale directory. The runtime deliberately does not reclaim it based on PID or timestamp; an operator must verify that no process is using the data directory and manually remove the stale directory.
- This is not a kernel-managed advisory lock and does not automatically release on process death. It does not claim correctness on arbitrary network filesystems.
- The owner token prevents this process instance from intentionally releasing a lock whose metadata has changed.
- CI tests cover same-process contention, separate-process contention, normal release/reacquisition, stale fail-closed behavior, and owner-token mismatch.

### A2. Native kernel-managed lock (future desktop-host option)

A native host adapter may later hold an OS lock handle for the lifetime of the process so the OS releases it on process termination. This requires a maintained implementation with verified Windows, macOS, and Linux semantics; it is not implemented by the current TypeScript host.

### B. Transactional shared database

Move Workspace and Session records into one transactional database, likely SQLite, and execute Session creation plus Workspace attachment in one database transaction.

- Advantage: database-level writer serialization, crash recovery, constraints, and a natural place for schema migrations and durable revisions.
- Cost: introduces a persistence dependency, migration/versioning work, backup/restore requirements, and platform packaging considerations.
- Important design point: merely replacing each JSON store with a separate SQLite table adapter is insufficient if the host still commits Session and Workspace changes as two independent transactions. The host needs a transaction boundary spanning both records, and in-memory registries must publish only after that transaction commits.
- Multi-process event delivery still needs a durable change sequence/outbox or a clearly defined single-host event broker; SQLite does not automatically make current in-memory subscriptions cross-process.

### C. JSON files with a lock-file lease

A lock file or lock directory can record PID, process metadata, and timestamps.

- Advantage: easy to prototype without a native dependency.
- Risk: stale-lock recovery can race; PIDs can be reused; timestamps can be skewed; a process can pause or sleep; network filesystems may have different semantics. A stale timestamp is not proof that the owner is dead.
- Conclusion: do not use a custom PID/mtime lease as the security or correctness boundary for production writes.

## Direction to validate

The implemented atomic-directory guard is the interim single-host invariant. It prevents concurrent local host processes but intentionally requires manual recovery after a crash. Before production desktop packaging, evaluate a kernel-managed native lock with automatic release; do not describe the current guard as an OS advisory lock.

Evaluate **Option B as the durable long-term storage direction** before introducing multiple host processes, multi-window independent writers, or shared background workers. If selected, move Workspace and Session mutation coordination behind a shared transaction coordinator; do not preserve the current two-file commit protocol unchanged.

Option C's automatic stale PID/mtime reclamation is not accepted as a correctness mechanism. The current atomic-directory guard is implemented, but its stale-lock manual recovery is an explicit operational limitation.

## Failure and concurrency test plan

- Start two host processes against the same `FUNNY_HOME`; the second must fail before loading writable registries.
- Kill the lock owner abruptly; a new host must fail closed on the stale directory until an operator verifies the owner is gone and removes it.
- Verify normal shutdown removes the guard and a subsequent host can start.
- Exercise lock contention and release on Windows, macOS, and Linux.
- Run concurrent Session creation and Workspace mutations through separate host processes; verify no lost updates if/when multi-writer support is introduced.
- Inject crashes before and after each durable write/transaction boundary.
- Verify Session membership invariants after restart.
- Verify backups and migrations do not run while another writer owns the store.
- Confirm revision semantics and client resynchronization after host restart.

## Open decisions

- Which maintained native lock implementation is acceptable for Tauri and the Node development host, with reliable automatic release on Windows, macOS, and Linux?
- Should the interim lock be owned by the native desktop process or the shared core host?
- Which SQLite binding/runtime is supportable across all target OSes and package formats?
- How should the Workspace/Session transaction coordinator preserve persistence-before-publication semantics?
- Should durable revisions live in the database, an outbox table, or a separate event journal?
- What backup, restore, and schema migration policy is required before user data is considered stable?
