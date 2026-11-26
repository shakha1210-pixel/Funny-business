# Workspace Reverse-Engineering Notes

**Status:** First-pass source/documentation analysis  
**Reference implementation:** [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)  
**Reviewed revision:** `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`  
**Scope:** Workspace domain, persistence, session membership, Host controller, filesystem boundary, and UI-facing projection.

> This document records observable contracts and design deductions from public documentation and source files. It is not a claim that every implementation path, race, or platform edge case has been audited. Funny Business will implement its own design; no upstream source has been copied.

## 1. Executive finding

DeepSeek Harness uses **Workspace** as a durable host-side project/directory record, not as a synonym for a chat session or a filesystem sandbox.

A Workspace record contains:
- a stable generated ID;
- a canonical directory path;
- a display title;
- creation and update timestamps;
- an ordered account of Session IDs.

A Session is a separate durable conversation/execution record. Its immutable header includes `cwd`, which is used to validate whether it belongs to a Workspace.

The Workspace subsystem is optional and host-side. Its documentation says it adds no model-visible tools, prompt text, or session events by itself. A separate optional listing-tools package can expose metadata to models.

## 2. Domain model and invariants

### Identity

- `WorkspaceId` is a branded generated UUID, not the directory path.
- Directory identity is canonicalized with `fs.realpath`.
- Trailing separators, `..`, and symlinks are resolved before uniqueness comparison.
- Two paths resolving to the same canonical directory collide.
- The stored canonical path is not rewritten if the directory later disappears.

**Design implication:** identity and location must be separate. Renaming/moving a folder must not silently mutate the identity of a project record.

### Workspace entity

The public interface exposes:
- `id`, `path`, `title`, `createdAt`, `updatedAt`, `sessionIds`;
- `getSessionHeaders()`;
- `setTitle()`;
- `attachSession()`;
- `insertSessionBefore()`;
- `detachSession()`;
- `status()`.

Session order is manually owned:
- attaching a new Session prepends it;
- explicit reorder uses an insert-before operation;
- activity does not reorder Sessions.

The durable Session account is the ownership record. Header `cwd` validates membership; it is not used as the sole source of truth for existing ownership.

### Membership edge cases

- New attachment requires a known Session whose live or persisted header `cwd` resolves to an existing directory equal to the Workspace path.
- Unknown IDs, missing/invalid cwd, and canonical path mismatch reject.
- Existing membership can be preserved when a fully qualified cwd's realpath/stat fails with `ENOENT`, including dangling symlinks.
- Missing headers, invalid cwd, mismatches, and non-ENOENT filesystem errors are filtered.
- A later accepted mutation prunes filtered candidates, but does not prune candidates preserved solely because their directory is missing.

**Design implication:** distinguish “directory currently unavailable” from “membership is invalid.” A temporary missing folder should not automatically erase project history.

## 3. Registry lifecycle and persistence

The registry API described in the subsystem reference includes:
- `create(path, title?)`: requires an absolute existing directory, canonicalizes it, and returns the existing record if already registered;
- `get(id)`, `list()`: synchronous cache reads;
- `resolveByPath(path)`: canonical lookup without creation;
- `delete(id)`: removes registration/order/session account only.

Deleting a Workspace registration does **not** delete its directory, files, live Sessions, or persisted logs. Its Sessions become ungrouped. Re-adding the same directory creates a fresh Workspace record.

### Durable storage model

The package uses a versioned storage domain with:
- a Workspace table keyed by Workspace ID;
- global state for Workspace order;
- archived and pinned Session ID sets;
- an optional default Workspace identity;
- a pending-mutation marker.

Create/delete can touch both a record row and global order. The documented design writes a pending marker before those writes can diverge. Startup resolves the marked operation; an unmarked order/table mismatch fails loudly as corruption.

Registry operations are serialized. Entity mutations go through a domain write chain, stamp `updatedAt`, and decide membership at their place in that chain.

Bootstrap is one-time:
- it reads persisted Session headers (ID, cwd, createdAt), not event bodies;
- valid canonical cwd values are grouped into Workspaces;
- newest sessions are considered first;
- the initialized marker is written last so interrupted bootstrap can resume;
- legacy Sessions without cwd remain ungrouped;
- later Sessions join only through explicit attachment.

**Design implication:** persistence needs explicit transaction/recovery semantics. “Write JSON and hope” is not sufficient for multi-record invariants.

## 4. Session lifecycle is separate

The API flow for a new Session is:
1. resolve the Session cwd from the selected Workspace path (with explicit/default fallback);
2. create the Session so cwd is recorded in its immutable header;
3. attach the Session to the Workspace;
4. revalidate the persisted header cwd during attachment.

This makes Workspace grouping a host-level operation rather than a hidden side effect of the agent loop.

## 5. Archive, pin, and active work

The Workspace registry also owns navigation-oriented state:
- pinned Session IDs (most recently pinned first);
- archived Session IDs;
- archive/unarchive behavior.

Archiving a Session with running work is refused by default. A capability seam asks providers what activity is running (documented families include turn, subagent, job, schedule). An explicit stop-activity option writes the archive state and dispatches stop requests; those activities settle independently. Archiving clears a pin in the same durable write; unarchiving does not restore the pin.

**Design implication:** hiding/archiving a Session must not silently destroy work or its history. Running work needs an explicit admission/stop policy.

## 6. Host API and client projection

The Workspace Controller exposes Host mutations and a Client remote namespace. The Host serializes mutations that depend on registry state.

Its `follow()` stream:
- attaches to durable changes;
- emits one complete baseline first;
- then emits ordered upsert/remove/order/archived/pinned changes;
- reconnect begins a new generation with a replacement baseline.

The Client model owns Workspace rows, order, archived/pinned identities, mutation echoes, and stream/unary race resolution. The UI layer consumes projections rather than owning Workspace entity lifecycles.

**Design implication:** keep domain state and UI presentation state separate. The UI should not be the authoritative owner of Workspace creation/deletion.

## 7. Filesystem boundary is not Workspace identity

The separate filesystem subsystem documents a backend-neutral filesystem interface:
- resolve paths to opaque targets;
- stat/list directory metadata without reading file contents;
- read text/bytes with explicit size bounds;
- carry opaque version tokens;
- guard edits/writes against stale versions;
- support local or remote backends without changing tool contracts.

It also warns that `cwd` is only a base path, not a sandbox by itself. Containment must be enforced by an explicit filesystem backend/policy. Symlink handling must be consistent across path resolution, shell execution, and mutations.

**Critical distinction for Funny Business:**
- Workspace = project identity and navigation/grouping.
- Filesystem capability = what can be read/written and under what policy.
- Execution sandbox = where processes run and what OS resources they can access.

These must be separate interfaces with explicit composition.

## 8. Default Workspace behavior

The documented first-use flow creates a default Workspace without creating a Session. Initialization is eligible only when the registry and all live/persisted/archived Session history are empty. It creates/reuses a fixed directory under Documents, stores the identity durably, and does not repeatedly resolve or rename it on later calls.

This is a product policy, not a fundamental Workspace requirement. Funny Business can choose a different first-run experience.

## 9. UI observations

The UI package describes:
- grouped Workspace and Session lists plus flat/search projections;
- manual Session ordering;
- a Workspace picker and directory-picker extension seam;
- a directory tree that loads one level at a time and caches expanded levels;
- cancellation-aware async loading so late responses do not mutate a disposed view;
- a distinction between empty/provisional Sessions and durable Sessions;
- UI state kept separate from domain lifecycle.

The detailed UI notes are extensive and are not fully audited in this first pass. The next UI pass should inspect the actual client state model, tree loader, picker contracts, and tests.

## 10. Funny Business architecture proposals

These are **our proposals**, not claims about upstream implementation.

| Concern | Proposed Funny Business boundary |
|---|---|
| Workspace identity | `WorkspaceId` generated independently of path |
| Workspace record | canonical root, title, timestamps, ordered session/project references |
| Path canonicalization | platform adapter with realpath/equivalent semantics |
| Membership | explicit attach/detach with header/project-root validation |
| Persistence | versioned repository + serialized mutations + crash recovery |
| File access | capability-based `WorkspaceFileSystem` abstraction |
| Execution | separate sandbox/execution provider; never infer isolation from cwd |
| UI | projection/store consumes domain events; does not own lifecycle |
| Deletion | unregister by default; never recursively delete user data |
| Permissions | per-workspace grants, explicit consent, audit trail |
| Recovery | snapshots/checkpoints and tested rollback boundaries |

### Proposed initial types

```ts
type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

interface WorkspaceRecord {
  readonly id: WorkspaceId;
  readonly rootPath: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: 'available' | 'missing' | 'unavailable';
}

interface WorkspaceAccessGrant {
  readonly workspaceId: WorkspaceId;
  readonly capabilities: readonly ('read' | 'write' | 'execute' | 'git')[];
  readonly grantedAt: string;
  readonly expiresAt?: string;
}
```

This is a sketch only. It deliberately does not bake a local filesystem path into the stable ID or treat the access grant as a sandbox.

## 11. Evidence ledger

### Confirmed from reviewed upstream docs/source
- Workspace is a durable directory record with a stable ID and ordered Session account.
- Session membership is checked against persisted header cwd.
- Canonical path identity uses realpath semantics.
- Workspace registration deletion is non-destructive.
- Workspace storage and Session persistence are required peers.
- Registry mutations are serialized and multi-write operations have recovery markers.
- Workspace is separate from the agent-loop spine and has no model-visible surface by default.
- Filesystem access is a separate backend/policy seam; cwd alone is not sandboxing.
- Host projection and Client state model are separate from the domain entity.

### Inferred (reasonable, needs implementation-level verification)
- Funny Business should use similar separation between domain, filesystem, execution, and UI.
- A durable mutation journal or transactional store is appropriate for multi-record invariants.
- Workspace permission grants should be independent from OS sandbox policy.

### Not yet verified
- Full source implementation of registry/entity/domain and all associated tests.
- All path edge cases on Windows, macOS, and Linux.
- Every race in bootstrap, attach, follow/reconnect, and UI selection.
- Full UI component/state-machine behavior.
- Actual sandbox provider guarantees and platform-specific enforcement.
- Performance characteristics for very large workspaces.

## 12. Source map reviewed

- `docs/subsystems/workspace.md`
- `packages/workspace/workspace/README.md`
- `packages/workspace/workspace/src/types.ts`
- `packages/api/workspace-controller/README.md`
- `docs/subsystems/filesystem.md`
- `packages/client/ui-workspace/README.md` (selected sections)

Next source files to inspect:
- `packages/workspace/workspace/src/index.ts`
- `packages/workspace/workspace/src/entity.ts`
- `packages/workspace/workspace/src/spec.ts`
- `packages/workspace/workspace/src/paths.ts`
- workspace package tests
- Workspace Controller source and tests
- filesystem policy and local backend source/tests
- UI tree/picker state and tests
