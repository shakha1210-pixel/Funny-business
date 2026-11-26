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
- Workspace Controller source and tests.
- Filesystem policy/local backend source and tests.
- UI picker/tree state and race handling.
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
- Workspace Controller implementation and tests
- filesystem policy and local backend source/tests
- UI tree/picker state and tests


## 13. Implementation-level source review (2026-11-27)

This pass moves beyond package documentation into the Workspace package implementation and its test suite. It is still a bounded review, not a complete audit of the controller, filesystem backend, or UI.

### Source files inspected

- `packages/workspace/workspace/src/index.ts`
- `packages/workspace/workspace/src/entity.ts`
- `packages/workspace/workspace/src/spec.ts`
- `packages/workspace/workspace/src/paths.ts`
- `packages/workspace/workspace/src/types.ts`
- `packages/workspace/workspace/tests/workspace.spec.ts`

The test file contains focused cases for lifecycle/bootstrap, path validation, create/delete recovery, registry and Session ordering, membership projection, archive/pin, default initialization, and archive follow-up admission.

### Additional confirmed implementation details

#### Registry startup and dependency handling

- The registry declares mandatory dependencies on both `storageDomain` and `sessionPersistence`.
- Startup opens a versioned domain, installs a reversible close effect, recovers an explicitly marked interrupted mutation, validates stored invariants, then performs one-time bootstrap if needed.
- The registry does not become active while the required Session persistence peer is absent. This prevents an unavailable persistence service from being mistaken for an empty history.
- Header indexing uses Session headers only; tests explicitly assert that event bodies and per-session persistence stat calls are not opened during bootstrap.

#### Path rules

- Path qualification is platform-aware. On Windows, drive-relative forms such as `C:` without a root-qualified path and current-drive-rooted forms are rejected; UNC share paths are accepted.
- Canonicalization uses `realpath`, and create additionally checks that the resolved target is a directory.
- The same canonicalization is used for Session cwd validation and Workspace lookup.
- Tests cover symlink aliases, roots, relative paths, non-directories, and missing paths. The source injects the platform only into the pure qualification/title helpers; realpath behavior remains host-OS dependent.

#### Entity mutation semantics

- The entity keeps a record snapshot and routes all durable changes through one mutation function.
- The storage table's update chain is the serialization point for Session membership decisions, avoiding stale check-then-write races between attach/detach operations.
- `updatedAt` is stamped in that shared mutation path.
- No-op mutations avoid a storage write through an internal sentinel, unless filtering invalid candidates itself changes the record.
- New Session attachment validates the persisted/live header cwd against the canonical Workspace path; repeat attachment is idempotent.
- Workspace status is a live filesystem check and does not mutate the stored Workspace record.

#### Recovery and consistency

- Create/delete are multi-step changes spanning the Workspace table and registry-global order.
- A durable pending marker names the exact interrupted operation. Startup recovery completes only that named operation; unexplained order/table divergence is treated as corruption rather than guessed at.
- Failure-injection tests cover marker writes, table writes, rollback failures, and retry after interrupted bootstrap.
- Deleting a Workspace removes only its registration and record; tests assert that its directory and Session history remain untouched.
- Registry and entity ordering are durable, explicit, and independently tested for restart behavior.

#### Archive and pin behavior

- Archive and pin sets are registry-global and do not alter the Workspace's ordered Session ownership account.
- Archiving refuses active Sessions by default through a typed waterfall event; an explicit stop option persists the archive first, then asks providers to stop work.
- Archive and pin are mutually exclusive; archiving removes the pin in the same durable state update.
- Unarchive invokes provider follow-up before clearing the archive state, so a failure retains the archived state.
- Follow-up work is admitted only after durable archival; failure to admit follow-up is logged and does not undo the archive.
- Tests cover unknown IDs, persistence-list failures, active work, provider stop failures, idempotence, restart persistence, and missing Session records during unarchive/unpin.

### Important design lessons for Funny Business

1. **Do not use Workspace membership as an implicit filesystem permission.** The upstream entity validates grouping; it does not make the directory safe to read or execute.
2. **Do not use the current directory as an identity.** Stable IDs and canonical paths solve different problems.
3. **Do not bootstrap from partial availability.** A missing persistence dependency must block initialization rather than create a false empty state.
4. **Do not guess during recovery.** Persist the intended operation and fail loudly on unexplained corruption.
5. **Do not conflate archive with cancellation.** Archive admission, stop requests, and background follow-up have distinct ordering and failure policies.
6. **Keep read projections cheap.** The public membership getter is synchronous over indexed headers; expensive persistence listing happens at controlled lifecycle/validation boundaries.

### Funny Business design decision candidates (not yet accepted)

- Introduce a minimal Workspace domain first: stable ID, canonical root, display name, timestamps, ordered attached conversation IDs.
- Keep archive/pin out of the first Workspace implementation unless the initial UI requires them; they are navigation policy, not core project identity.
- Define an explicit persistence contract and crash-recovery strategy before implementing multi-record mutations.
- Define path canonicalization behind a platform adapter, and test Windows path semantics independently from the host OS.
- Keep access grants, filesystem operations, and process sandbox policy in separate modules.
- Start with a non-destructive unregister operation. Any future recursive deletion must be a separate, highly privileged action with explicit confirmation.

### Remaining gaps

- Workspace Controller source and tests have not yet been audited.
- Filesystem policy, local backend, symlink containment, and stale-write guard implementations/tests remain to be inspected.
- UI workspace picker/tree state and async race tests remain to be inspected.
- The current Funny Business code has not yet been checked out, built, or tested locally; GitHub CI has not been confirmed successful.
- No Funny Business Workspace implementation has been started.


## 14. Host Remote Controller source review (2026-11-27)

### Source files inspected

- `packages/api/workspace-controller/src/index.ts`
- `packages/api/workspace-controller/src/feed.ts`
- `packages/api/workspace-controller/src/types.ts`
- `packages/api/workspace-controller/src/commands.ts`
- `packages/api/workspace-controller/tests/workspace-controller.host.spec.ts`

### Confirmed behavior

- The Host controller exposes a typed Remote namespace; it is an adapter over the authoritative Workspace registry, not a second owner of Workspace state.
- Commands map domain errors to stable transport-level error codes and structured details. Unexpected registry/storage errors are not silently converted into ordinary user mistakes.
- Workspace rename has a controller-level serialization queue because uniqueness checks and title writes must not race. Path adoption is likewise serialized.
- The feed projects detached values from authoritative domain entities and observes committed storage-domain changes.
- Each stream generation begins with a complete baseline, followed by ordered increments (upsert, remove, order, archived, pinned).
- Followers are closed on controller disposal. Stream cancellation closes the generation-local queue.
- Remote access filtering is applied to Workspace and Session identities. When a Workspace previously visible to a client becomes inaccessible, the controller sends a complete filtered `replace` state rather than a misleading remove. This allows the client to reconcile without treating a permission change as permanent deletion.
- Remote requests/results are browser-safe types; host filesystem paths are projected as data, while filesystem picking is a separate optional controller seam.

### Test-suite coverage observed

The Host controller tests cover concurrent path adoption, stable error mapping, unexpected failure propagation, command ordering, archive/pin behavior, baseline-plus-increment streams, access filtering, replace-on-visibility-loss, follower disposal, and first-use initialization.

### Funny Business implications

- Keep a single authoritative domain service. UI/IPC/API controllers should validate requests, map errors, and project data, but must not duplicate domain ownership.
- Treat reconnect as a new state generation with a full baseline. Increment-only reconnect is fragile because clients may have missed events while offline.
- Include explicit stream generation/cancellation and dispose all subscribers when the host service stops.
- Access filtering belongs at the transport boundary as well as at the operation boundary; a user should not receive another Workspace's IDs merely because the domain event is global.
- Model permission revocation as a state replacement/reconciliation event, not automatically as deletion.
- Keep optional OS directory-picker capability separate; absence of a picker should not prevent core Workspace registry operation.

### Remaining gaps

- Filesystem policy/local backend and symlink containment/stale-write tests remain to be inspected.
- UI workspace picker/tree state and async race tests remain to be inspected.
- No Funny Business Workspace implementation or ADR has been created.


## 15. Filesystem capability, local provider, and sandbox review (2026-11-27)

### Source files inspected

- `packages/fs/fs/src/index.ts`, `types.ts`, `errno.ts`
- `packages/fs/fs-local/src/index.ts`, `fsio.ts`, `win32.ts`
- `packages/fs/fs-sandbox/src/index.ts`, `containment.ts`
- `packages/fs/fs-observation-policy/src/index.ts`, `types.ts`
- Provider, sandbox, containment, and observation-policy test suites

### Confirmed architecture

The upstream filesystem is split into four independent responsibilities:

1. **Contract (`dsh-fs`)** — backend-neutral service API, opaque target/version tokens, typed errors, bounded reads and mutation outcomes.
2. **Provider (`dsh-fs-local`)** — host disk path resolution, metadata, reads, directory listing, watch, and atomic mutations.
3. **Confinement adapter (`dsh-fs-sandbox`)** — per-call write/edit/patch/delete/move policy fence over the local provider.
4. **Observation policy (`dsh-fs-observation-policy`)** — optional per-agent prior-observation tracking and compare-and-swap intent decisions.

The model-facing tools are another consumer, not the filesystem provider itself. The sandbox filesystem fence is explicitly documented as trusted-code path containment, not a kernel boundary for arbitrary process execution.

### Path identity and symlinks

- Existing paths resolve to a realpath-derived opaque target key. Different symlink aliases to the same target therefore share identity and mutation locks.
- For missing targets, the resolver realpaths the nearest existing ancestor and appends the missing suffix. This preserves target identity when missing intermediate directories are later created, including under symlinked ancestors.
- Display path and target identity are distinct: display spelling is retained for user-facing output; I/O uses the resolved target key.
- `lstat` is a separate no-follow primitive. `resolve` intentionally follows symlinks; callers that reject a symlink at the final path entry must inspect it with `lstat` first.
- Workspace containment is checked against canonical targets. The sandbox adapter re-resolves the target immediately before mutation and mutates that fresh identity, catching an ancestor symlink swapped after initial resolution.
- Containment uses a lexical fast path, then filesystem device/inode identity walking for aliases such as Windows case/8.3 path spellings.
- The source explicitly accepts a residual resolve-to-syscall TOCTOU window for this trusted path-fence threat model. It does not claim to isolate hostile host processes.

### Freshness and safe mutation

- Local version tokens combine device, inode, size, nanosecond mtime, and nanosecond ctime. They are opaque to consumers.
- Per-target FIFO locks serialize read → version-check → edit/write critical sections inside one process. Multi-target move locks are acquired in lexical key order to avoid deadlocks.
- The lock is process-local, not a cross-process mutex. Optional version guards detect many external changes, but correctness still depends on filesystem metadata changing reliably.
- Writes use an exclusive owner-only staging directory and temporary file beside the destination, fsync the staged file, then atomically publish. Existing POSIX mode is preserved; Windows replacement preserves the destination DACL.
- Guarded create uses no-replace hard-link publication so a concurrent creator cannot be overwritten after the initial existence probe.
- Read-before-edit policy distinguishes unseen, confirmed-absent, and confirmed-present observations. Per-agent weakly-held state prevents one agent's read from authorizing another agent's edit.
- The provider performs the atomic freshness check; the optional policy plugin chooses the intent. Without the policy plugin, provider mutations can be unconditional.

### Bounds, typed failures, and partial effects

- Raw byte reads require a maximum byte count and fail on overflow rather than silently truncating.
- Directory listing is one level and metadata-only; it does not read file contents.
- UTF-8 text paths reject binary/invalid UTF-8. Large text can stream; edit/write diff bases are bounded.
- Filesystem errors have stable codes rather than requiring callers to parse message strings.
- A move is explicitly two effects: destination publication can succeed while source removal fails. The outcome reports this partial state instead of pretending the operation was transactional.
- Watchers have explicit initialization cancellation and an asynchronous close handle.

### Test coverage observed

The reviewed tests cover alias identity, symlink writes, missing-path resolution, parent symlink identity, stale same-size rewrites, concurrent guarded writes/edits, write-vs-edit races, binary/invalid UTF-8, bounded reads, atomic staging cleanup, no-clobber publication, Windows DACL behavior, symlink escape denial, symlink swaps, containment aliases, and policy ownership isolation.

### Funny Business design implications

1. Our first implementation should define a backend-neutral filesystem contract before choosing Node's local provider details.
2. A Workspace root is not itself a permission grant. Introduce explicit access grants and a separate execution sandbox policy.
3. Represent file targets and versions as opaque values. Never let plugins or the model construct or parse them.
4. Use no-follow metadata when repository policy needs to reject symlinks; canonicalize before every protected mutation.
5. Do not claim a path-checking wrapper is equivalent to OS sandboxing. Arbitrary code execution requires a real OS/container/VM boundary.
6. Use bounded reads, typed errors, atomic publication, and stale-write guards from the start.
7. Treat multi-file operations as potentially partial unless a true transactional primitive exists; return explicit per-effect outcomes.
8. Test same-path aliases, symlink escapes, missing intermediate directories, concurrent writers, external edits, and Windows path semantics.

### Scope and remaining gaps

- This is a source review of selected filesystem contracts/providers/policies and their tests, not a security audit or proof of race-free isolation.
- UI workspace tree and picker were sampled for state-projection and interaction contracts; full UI component/test coverage remains out of scope.
- No upstream code copied. No Funny Business filesystem implementation has been started.


## 16. Workspace browser and directory-picker UI review (2026-11-27)

### Source files inspected

- `packages/client/ui-workspace/src/client/tree.ts`
- `packages/client/ui-workspace/src/client/WorkspacePicker.tsx`
- `packages/api/workspace-controller/src/directory-picker.ts`
- Workspace UI and directory-picker test files (selected)

### Confirmed presentation contracts

- The browser tree is a derived projection over authoritative Workspace membership and Session summaries; it does not own Workspace lifecycle.
- Group order follows the caller's Workspace order. Session order can be manual or recency-based; unassigned Sessions have a separate browser-local order.
- Archived and pinned state is global registry state, while row visibility and some ordering preferences are client projections.
- Search uses a merged/bounded search result projection; blank provisional Sessions are treated specially and excluded from normal title search.
- The picker keeps directory selection as a separate capability seam. It can be absent; in that composition the UI withdraws the add action instead of presenting a nonfunctional control.
- The picker prevents overlapping pick/adopt interactions, handles late capability disappearance, reports adoption failures, and only auto-opens the add flow once the Workspace baseline has settled.
- The Host directory-picker controller exposes separate native chooser and browse capabilities. It refuses unsupported verbs rather than approximating them, validates new child names as a single path segment, and maps cancellation/business failures to stable Remote errors.

### Funny Business implications

- Keep domain truth on the host; build tree/search/flat-list as disposable projections.
- Separate OS-native directory chooser from in-app browse/list/create capabilities.
- UI must represent loading, capability unavailable, cancellation, and adoption failure explicitly.
- Preserve user order separately from recency sorting and authoritative membership.
- Do not make the first Workspace implementation depend on a graphical picker; a typed path adoption API can exist before UI.

### Remaining gaps

- The tree and picker UI were sampled, not fully audited across every component and test.
- No Funny Business Workspace UI or directory-picker code has been started.
