# Storage Coordination and Multi-Process Safety

Status: design study — no storage backend or locking strategy has been selected.

## Problem statement

The current runtime has two independently persisted JSON snapshots:
- `workspaces.json`
- `sessions.json`

Each registry serializes mutations only inside its own process. Atomic file replacement protects a snapshot from partial publication, but it does not prevent two processes from reading the same old state and overwriting one another's updates. The Session-creation journal coordinates one Session-create/Workspace-attach operation in one host process; it is not a cross-process lock or a general transaction manager.

The Session and Workspace revision feeds are also process-local. The loopback SSE endpoint streams the state of the host process that accepted the connection; it is not a shared multi-process event log.

**Current operating constraint:** run one Funny-business host against a given `FUNNY_HOME`. Multiple host processes sharing the same data directory are unsupported until a coordination strategy is implemented and verified.

## Requirements

1. Prevent concurrent host processes from silently overwriting one another's state.
2. Preserve crash recovery and fail closed when ownership or persisted state is ambiguous.
3. Keep Workspace and Session invariants consistent across writes.
4. Avoid treating PID metadata, stale timestamps, or a process-local Promise queue as proof of exclusive ownership.
5. Define behavior for abrupt termination, OS sleep, process crashes, and stale ownership records.
6. Keep Windows, macOS, and Linux behavior explicit and tested.
7. Keep renderer and browser clients as clients of one authoritative host; do not grant them direct store access.

## Options

### A. One host per data directory, enforced by an OS-backed exclusive lock

The host acquires an OS-level advisory lock before loading stores and holds it for its lifetime. A second host using the same data directory fails with a clear diagnostic instead of opening writable stores.

- Advantage: smallest change to the current JSON store architecture; preserves a single authoritative in-memory registry and current feed semantics.
- Cost: requires a reliable cross-platform lock primitive and native/platform validation. A home-grown lock directory with PID/mtime stale reclamation is not an equivalent guarantee.
- Required behavior: lock acquisition is atomic; crash/OS process teardown releases ownership; lock failure is fail-closed; diagnostics identify the data directory without leaking secrets.
- Limitation: this is single-writer coordination, not multi-process shared writing.

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

Prefer **Option A as an interim runtime invariant** if a supported native lock can be implemented and tested across all target OSes. This keeps the current single-host architecture simple while the desktop shell is being built.

Evaluate **Option B as the durable long-term storage direction** before introducing multiple host processes, multi-window independent writers, or shared background workers. If selected, move Workspace and Session mutation coordination behind a shared transaction coordinator; do not preserve the current two-file commit protocol unchanged.

Option C is not accepted as a correctness mechanism.

This is a recommendation for the next design/implementation step, not an implemented guarantee. Until a lock exists, the single-host rule is an operational constraint only.

## Failure and concurrency test plan

- Start two host processes against the same `FUNNY_HOME`; the second must fail before loading writable registries.
- Kill the lock owner abruptly; a new host must acquire ownership without unsafe stale-lock deletion.
- Exercise lock contention and release on Windows, macOS, and Linux.
- Run concurrent Session creation and Workspace mutations through separate host processes; verify no lost updates if/when multi-writer support is introduced.
- Inject crashes before and after each durable write/transaction boundary.
- Verify Session membership invariants after restart.
- Verify backups and migrations do not run while another writer owns the store.
- Confirm revision semantics and client resynchronization after host restart.

## Open decisions

- Which maintained native lock implementation is acceptable for Tauri and the Node development host?
- Should the interim lock be owned by the native desktop process or the shared core host?
- Which SQLite binding/runtime is supportable across all target OSes and package formats?
- How should the Workspace/Session transaction coordinator preserve persistence-before-publication semantics?
- Should durable revisions live in the database, an outbox table, or a separate event journal?
- What backup, restore, and schema migration policy is required before user data is considered stable?
