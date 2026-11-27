# Funny-business

A universal, local-first, extensible AI workspace.

Funny-business combines project Workspaces, durable Sessions, an agent runtime, local and hosted models, Git integrations, notebook/compute gateways, plugins, and controlled self-evolution.

## Current status

Early but working prototype: plugin core, Workspace and Session metadata, loopback development host, connected browser UI, read-only Workspace file access, and durable user-message capture. Agent execution, assistant/tool messages, real model providers, native desktop shell, and OS-enforced sandboxing are not implemented yet. pnpm and Rust lockfiles are committed; cross-platform SQLite benchmarking is the active persistence evaluation milestone.

## Principles

- Windows, macOS, and Linux are first-class targets.
- Local-first project data; remote sync and external writes are explicit.
- Host-owned domain state, permissions, persistence, and execution policy.
- Replaceable providers and plugins behind narrow contracts.
- Least privilege, OS-level isolation for untrusted code, audit, approval, and rollback.
- Independent implementation; public references are studied for architecture, not copied.

## Start here

- [Architecture & Engineering Handbook](ARCHITECTURE.md) — canonical system design, contracts, security, persistence, research, and open decisions.
- [Task Chain & Engineering Log](TASKS.md) — current milestone, completed work, blockers, verification, and next actions.

## Development

Initial core: TypeScript and Node.js 22+.

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm dev
```

The local development host binds to 127.0.0.1:4317 by default (or the port set by PORT). Workspace and Session metadata live under ~/.funny-business/ by default; set FUNNY_HOME to use another data directory. The host enforces single-process ownership. If it crashes, verify no process still owns the data directory before manually removing a stale .host.lock.

The browser UI is a development/test client, not the final desktop shell. The filesystem explorer requires explicit read-only grants. The composer persists user messages but does not yet invoke a model or agent.

## Research and attribution

Funny-business is independently implemented. Public architecture and documented extension concepts from DeepSeek Harness have been studied; no DeepSeek Harness source files have been copied into the current implementation. Future source reuse requires explicit license/provenance review and preservation of required notices.

Project licensing will be finalized before redistribution.
