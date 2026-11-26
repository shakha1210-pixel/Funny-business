# ADR-0001: Workspace, Filesystem, and Execution Boundaries

- **Status:** Proposed
- **Date:** 2026-11-27
- **Decision owners:** Funny-business maintainers
- **Related:** [Architecture](../ARCHITECTURE.md), [Security baseline](../SECURITY.md), [Workspace reverse-engineering](../research/WORKSPACE-REVERSE-ENGINEERING.md)

## Context

Funny-business needs to work with multiple projects and repositories across Windows, macOS, and Linux. An AI agent must be able to inspect and modify explicitly authorized project files, but a project directory must not silently become permission to access arbitrary host files or execute arbitrary code.

The DeepSeek Harness study shows useful patterns: durable Workspace identity, canonical path handling, opaque filesystem targets and versions, bounded reads, guarded atomic writes, reconnect-safe state projections, and separate filesystem and sandbox layers. These are design observations, not a mandate to copy its implementation.

The current Funny-business prototype has a small plugin/service kernel but no Workspace domain, filesystem provider, permission broker, or execution sandbox. Those must be designed as separate capabilities.

## Decision (proposed)

### 1. Workspace is a domain record, not a security boundary

A Workspace represents a registered project root and its metadata.

Initial conceptual record:
- stable generated WorkspaceId
- canonical root path (host-owned)
- user-visible title
- creation and update timestamps
- ordered attached conversation/session identifiers (when session support exists)

The Workspace registry owns identity, uniqueness, lifecycle, and membership. It does not own filesystem permissions, process execution, or recursive deletion.

Removing a Workspace unregisters the record only. It does not delete its directory, repository, sessions, or user data.

### 2. Filesystem access is a separate capability

A backend-neutral filesystem contract will be defined before a local provider is implemented.

The contract should provide:
- path resolution to opaque FileTarget identities
- metadata and no-follow metadata (stat / lstat)
- bounded byte reads and streaming text reads
- one-level directory listing without reading file contents
- opaque version tokens
- guarded create/replace/edit/delete operations
- explicit cancellation and typed errors
- atomic publication where supported by the provider

Consumers must not parse or manufacture target identities or version tokens. Display paths are for presentation only.

The local provider will resolve paths using platform-native semantics and canonical filesystem identity. Symlink behavior must be explicit: following a link is not equivalent to authorizing its destination. Trust-boundary checks must inspect link entries where required and re-canonicalize protected mutation targets immediately before use.

### 3. Access grants are explicit and scoped

A Workspace registration does not grant the agent access by itself.

A future Permission Broker will issue revocable grants scoped by principal (user, agent, plugin, or session), resource (Workspace, repository, file target, or external directory), operation (read, write, delete, execute, network, etc.), lifetime (single action, session, or persistent), and optional constraints (path scope, size, destination, or expiry).

Missing or ambiguous grants fail closed. UI selection and project membership are not authorization proofs.

### 4. Execution sandbox is independent from filesystem policy

A path-containment check in application code is a defense-in-depth policy fence, not a secure boundary for arbitrary untrusted code.

Commands, plugins, notebooks, and generated code must execute through a separate Sandbox Supervisor using OS-level isolation appropriate to the platform: restricted users, namespaces, containers, Windows Job Objects/AppContainer, macOS sandboxing, or VMs as supported and validated.

Each execution profile must declare filesystem roots, network policy, resource limits, environment variables, and lifetime. A process child alone is not considered a secure sandbox.

### 5. Mutation and recovery semantics are explicit

- Guarded writes use compare-and-swap style version checks where a prior observation exists.
- Per-target mutations are serialized within a provider; cross-process guarantees must be documented separately.
- Writes stage privately and publish atomically where the platform permits.
- Multi-target operations acquire locks in deterministic order.
- Operations with multiple effects return explicit partial outcomes; they must not claim transactionality when only some effects committed.
- Destructive operations require approval and audit records.
- Workspace unregister and file/directory deletion remain distinct actions.

### 6. UI and transport are projections, not domain owners

The host-side Workspace service is authoritative. IPC/Remote controllers validate commands, map stable errors, enforce access filtering, and publish state projections.

A reconnecting client receives a complete baseline followed by ordered updates. UI tree, search, grouping, and sorting are derived projections and may be rebuilt without mutating domain truth.

Directory picking is an optional capability. Core Workspace APIs must remain usable in CLI/headless environments without a graphical picker.

## Consequences

### Positive
- Clear separation between project identity, data access, authorization, and code execution.
- Supports local, remote, and future cloud filesystem providers behind one contract.
- Reduces accidental privilege escalation from selecting a project folder.
- Makes cross-platform differences explicit and testable.
- Enables headless use and alternative UI clients.

### Costs and trade-offs
- More interfaces and policy plumbing than a single unrestricted filesystem helper.
- Strong process isolation differs by OS and requires native integration and platform-specific tests.
- Canonicalization reduces symlink escape risk but cannot alone eliminate all filesystem TOCTOU races.
- Version tokens based on filesystem metadata are provider-specific and not universally strong.
- Atomic replacement and ACL/permission preservation need per-platform implementations.

## Initial implementation sequence
1. Inspect and validate the existing core plugin/service code in a real checkout and CI.
2. Implement a minimal Workspace domain and persistence contract with lifecycle tests.
3. Add a backend-neutral filesystem contract and path-identity test suite.
4. Implement a local filesystem provider with bounded reads and guarded atomic mutations.
5. Add explicit access grants and audit events.
6. Add platform sandbox adapters before enabling arbitrary code execution.
7. Add transport/UI projections after host domain behavior is stable.

## Required tests before calling the design production-ready
- Workspace identity remains stable when paths contain symlink aliases.
- Same canonical directory cannot be registered twice.
- Missing intermediate directory resolution remains stable across directory creation.
- Symlinked paths cannot escape an authorized root for protected mutations.
- Symlink swaps between initial resolution and mutation are rejected or safely contained within the documented threat model.
- Concurrent writes against one observed version cannot both silently succeed.
- External edits are detected where the provider's version mechanism supports it.
- Bounded reads reject oversized content without unbounded buffering.
- Failed setup and interrupted persistence mutations recover without deleting user data.
- Workspace unregister never deletes project files.
- Windows, macOS, and Linux run the relevant native path and permission tests.

## Open questions
- Persistence engine and schema migration strategy.
- Whether Workspace membership is session-owned or a separate ordered relation.
- Exact grant vocabulary and approval UX.
- Concrete sandbox mechanism and threat model per supported OS.
- How remote providers express canonical identity, versioning, and atomicity.
- Whether the initial UI is desktop, local web, CLI-first, or a combination.