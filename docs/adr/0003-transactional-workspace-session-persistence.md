# ADR-0003: Transactional Workspace and Session Persistence

- **Status:** Proposed
- **Date:** 2026-11-27
- **Decision owners:** Funny-business maintainers
- **Related:** [ADR-0001](0001-workspace-domain-boundaries.md), [Storage coordination study](../research/STORAGE-COORDINATION.md), [Dependency reproducibility](../research/DEPENDENCY-REPRODUCIBILITY.md), [SQLite binding evaluation](../research/SQLITE-BINDING-EVALUATION.md)

## Context

The current host persists Workspace and Session metadata in two independent JSON snapshots:

- `workspaces.json`
- `sessions.json`

Each snapshot is staged and atomically renamed. Each registry serializes mutations only within its own process. A single-host directory guard prevents two local host processes from writing the same data directory concurrently, but it does not make a multi-record operation atomic.

Session creation currently uses a dedicated write-ahead journal around Session creation and Workspace attachment. That recovers this one workflow, but it is not a general transaction coordinator. Registry revisions and subscriptions are in-memory and process-local.

The project now needs a durable model that can atomically coordinate Workspace, Session, membership, and future conversation/run metadata without growing a collection of bespoke JSON journals.

## Proposed direction

Evaluate SQLite as the default durable local store and migrate Workspace and Session into one database only after a working cross-platform vertical slice and dependency/packaging review.

Do not add a SQLite package until the pnpm lockfile has been generated and reviewed. The binding/runtime comparison is recorded in [SQLite binding evaluation](../research/SQLITE-BINDING-EVALUATION.md); it is research, not a final selection. Database access remains host-owned: do not expose a general SQL connection or arbitrary query API to the renderer. Do not remove the current JSON stores until migration, backup, rollback, and compatibility tests exist.

### Logical schema

The initial relational model should separate Workspace, Session, and membership:

- `workspaces`: stable ID, canonical root path, title, creation/update timestamps.
- `sessions`: stable ID, canonical working directory, title, creation/update timestamps, status.
- `workspace_sessions`: Workspace ID, Session ID, stable ordering position; Session ID is unique so a Session cannot belong to two Workspaces.
- `schema_migrations`: ordered, checksummed migration history.
- `change_log`: durable monotonically increasing sequence, entity type/ID, change kind, and versioned payload or enough data to rebuild an authoritative snapshot.

Workspace unregister must delete only its membership rows and Workspace metadata. It must not cascade-delete Session records or project files. Unassigned Sessions remain valid.

### Transaction boundary

All writes that affect more than one domain record must run in one database transaction. Session creation plus Workspace attachment is the first vertical slice:

1. Validate Workspace and canonical working directory.
2. Allocate the Session ID.
3. Begin a write transaction.
4. Insert Session metadata.
5. Insert Workspace membership.
6. Append durable change-log entries and advance the durable revision.
7. Commit.
8. Only after commit, update in-memory projections and publish notifications.

If any step before commit fails, the transaction rolls back and no registry event is published. A crash during commit is resolved by SQLite recovery; startup then loads the committed database state as authoritative.

Single-entity Workspace and Session mutations use the same transaction/publish pipeline. No direct store adapter writes may bypass the coordinator.

### Event delivery

SQLite transactions do not automatically deliver events to other processes. The durable change log provides an ordered recovery cursor; an in-process broker may wake current subscribers, while reconnecting clients read changes after their last acknowledged sequence or receive a full snapshot if history has been pruned.

Until a multi-process host model is explicitly supported, retain the single-host guard. The change log is for durable ordering and reconnect correctness, not a claim that multiple desktop windows can safely mutate the database today.

### Runtime and durability requirements

- Enable and verify foreign-key enforcement on every connection.
- Choose journal mode and synchronous durability settings explicitly; document the trade-offs.
- Use bounded transactions and a single well-defined writer coordinator.
- Define busy timeout, cancellation, and shutdown behavior.
- Keep migrations transactional where SQLite permits; reject unknown newer schema versions without destructive fallback.
- Back up using a database-consistent mechanism; never copy a live database file blindly when WAL mode is active.
- Test Windows, macOS, and Linux packaging and recovery.
- Keep renderer and plugins away from direct database access; only the host owns the store.

## Alternatives considered

### Continue with separate JSON snapshots and more journals

Rejected as the long-term direction. Atomic file replacement is useful for simple snapshots, but every multi-record workflow would need its own durable protocol, recovery matrix, and failure-injection suite.

### One aggregate JSON document

Could make Workspace and Session snapshots publish together through one rename, but it increases write amplification, whole-document contention, and migration complexity as conversation history, runs, tool events, and artifacts grow. It remains a useful dependency-free prototype, not the preferred long-term store.

### SQLite

Preferred candidate because it offers local transactions, constraints, crash recovery, and a durable change sequence in one portable database. Native binding choice and packaging must be validated rather than assumed.

### Remote database or multi-writer service

Out of scope for the first local-first release. A future remote provider must preserve the same host-owned domain and transaction contracts.

## Migration strategy

1. Generate and review the pinned pnpm lockfile.
2. Complete the Node 22 + Tauri 2 binding/runtime spike using the acceptance matrix in [SQLite binding evaluation](../research/SQLITE-BINDING-EVALUATION.md).
3. Select a host-owned binding/runtime split and record it in ADR-0002/0003; do not expose renderer SQL access.
4. Define and test the schema and migration runner independently of UI.
5. Implement a repository/transaction coordinator used by both Workspace and Session domain operations.
6. Add an importer that reads both JSON stores, validates all existing membership invariants, and imports them in one database transaction.
7. Keep source JSON files untouched until import verification and backup succeed.
8. Add restart, rollback, crash-injection, and cross-platform tests.
9. Switch the host to SQLite only after the complete matrix passes; retain a documented export/rollback path for at least the first migration release.

## Acceptance tests

- Session creation and Workspace attachment either both commit or neither commits.
- Process death before COMMIT leaves no partial domain, membership, receipt, or change-log rows after reopen.
- Process death after COMMIT but before notification is recovered from the durable receipt/change log without duplicate mutation.
- A lost COMMIT acknowledgement is resolved only after reopening and querying the original operation receipt; an unresolved outcome fails closed.
- Reusing an operation ID with a different operation payload is rejected.
- A Session cannot belong to multiple Workspaces.
- Workspace unregister preserves Session records and their conversation data.
- Failed transactions publish no in-memory events.
- Committed transactions publish exactly one ordered logical change set.
- A reconnecting consumer can resume from a durable sequence or receive a full authoritative snapshot.
- Unknown schema versions fail closed.
- JSON import rejects duplicate IDs, missing Session references, duplicate memberships, and canonical path mismatches without partially importing.
- Backup and restore work with the selected journal mode on Windows, macOS, and Linux.

## Open decisions

- Which SQLite binding has the best support for Node 22, Tauri packaging, and all three target OSes?
- Should SQLite be owned by the TypeScript host sidecar or by a narrow Rust persistence adapter?
- Which journal mode and synchronous setting meet the product's durability and performance goals?
- Should the change log store full versioned event payloads or only durable sequence markers plus snapshot invalidation?
- What retention, backup, export, and restore guarantees are required?


## Normative transaction coordinator contract

The database adapter is not the application transaction boundary. A host-owned coordinator must own the complete write lifecycle; domain services must not issue independent persistence writes and then attempt compensating deletes.

### Operation identity and idempotency

- Every externally initiated mutation receives a stable operation ID before its first durable write. A caller retrying after a timeout must reuse that ID.
- Persist a unique operation receipt in the same transaction as the domain changes and change-log rows. The receipt records operation ID, operation kind, schema/version, and resulting durable sequence.
- Replaying an already committed operation ID returns its recorded result and must not create a second Session, membership, or change-log entry.
- Internal operations that cannot be retried by a caller may generate an ID at the host boundary, but the ID remains stable throughout recovery.

### Required phases

1. **Validate:** check domain invariants and normalize/canonicalize inputs before opening a write transaction where possible. Re-check database-dependent invariants inside the transaction.
2. **Prepare:** construct immutable intended changes and allocate stable entity/operation IDs. Do not mutate in-memory registries.
3. **Begin:** acquire the coordinator's serialized write slot and begin the database transaction.
4. **Apply:** write all entity rows, membership constraints, operation receipt, and change-log rows in that transaction.
5. **Commit:** the database commit is the only logical publication point.
6. **Project:** after commit is confirmed, update in-memory projections from committed values (or reload the affected projection). A projection failure invalidates the in-memory host and requires reload; it must not attempt to undo committed data.
7. **Notify:** publish the committed change set only after projections are coherent. Notifications carry durable sequence numbers and operation IDs; subscribers deduplicate by sequence/operation ID.
8. **Return:** return the committed result. A notification transport failure cannot turn a committed mutation into a failed mutation.

### Commit outcome semantics

The coordinator must distinguish three outcomes; a generic rejected Promise is insufficient:

- **Not committed:** the transaction is known to have rolled back or never started. No projection update and no event publication are allowed.
- **Committed:** the commit is confirmed. Projection update and notification proceed.
- **Unknown:** the adapter cannot determine whether commit took effect (for example, an I/O failure at the commit boundary). Do not compensate, blindly retry with a new operation ID, or publish a speculative event. Reopen/recover the database and query the operation receipt using the original operation ID. If the receipt exists, treat the operation as committed; if the database proves it absent after recovery, treat it as not committed. If the outcome still cannot be established, mark the host unavailable and fail closed until recovery succeeds.

An error after a confirmed commit (projection refresh or notification) is not a transaction rollback. The host must retain the committed operation receipt and recover projections/notifications without replaying the domain mutation.

### Session creation first vertical slice

The coordinator transaction must insert Session metadata, insert its Workspace membership, append the corresponding durable change-log entries, and insert the operation receipt together. The Session ID and operation ID are allocated before the transaction. The current JSON journal remains the compatibility implementation until this vertical slice passes; it must not be mistaken for the final coordinator.

### Failure-injection matrix

The implementation and adapter contract tests must inject failure at each boundary:

| Failure point | Required durable result | In-memory/event behavior |
|---|---|---|
| Validation / ID allocation | No writes | No projection change; no event |
| Begin / first write | No committed rows | No projection change; no event |
| Mid-transaction statement | Full rollback | No projection change; no event |
| Constraint violation | Full rollback | No projection change; no event |
| Commit confirmed | Complete operation + receipt + log | Project then notify once per sequence |
| Commit response lost / I/O error | Resolve by recovery + operation receipt | No speculative event; host unavailable while unresolved |
| Projection refresh after commit | Operation remains committed | Rebuild projection; notify only after coherent |
| Notification listener throws | Operation remains committed | Isolate listener; other listeners continue |
| Process crash after commit, before notify | Operation and log survive | Replay from durable sequence after restart |
| Caller retries same operation ID | No duplicate mutation | Return original committed result |

### Coordinator invariants

- One serialized writer owns Workspace/Session mutations in the current single-host runtime.
- All domain changes and their change-log/receipt records commit atomically.
- No event is published for an uncommitted or unresolved operation.
- Every committed mutation has one durable sequence; in-process delivery may be repeated after reconnect, so consumers are idempotent rather than relying on exactly-once transport.
- A projection is a cache of committed storage, never a second source of truth.
- The coordinator owns transaction boundaries; repositories expose transaction-scoped operations and cannot commit independently.
- Shutdown waits for or safely aborts pre-commit work; it does not report an uncommitted operation as successful.
