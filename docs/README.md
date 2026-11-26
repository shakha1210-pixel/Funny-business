# Documentation

This directory is the canonical home for Funny-business project documentation.

## Core project docs

- [Instructions](INSTRUCTIONS.md) — contributor and AI-agent rules, documentation discipline, engineering workflow.
- [Architecture](ARCHITECTURE.md) — system vision, boundaries, and subsystem design.
- [Interface specification](INTERFACE-SPEC.md) — application frame, Workspace flows, UI state ownership, and first implementation milestones.
- [Roadmap](ROADMAP.md) — phases, milestones, and pending work.
- [Security baseline](SECURITY.md) — threat model and required controls.
- [Performance](PERFORMANCE.md) — lightweight-runtime principles, diagnostics, and baseline procedure.
- [Work log](WORKLOG.md) — dated research, implementation, verification, and blockers.

## Architecture decisions

- [ADR-0001: Workspace, Filesystem, and Execution Boundaries](adr/0001-workspace-domain-boundaries.md) — proposed separation of project identity, file access, permissions, and execution isolation.
- [ADR-0002: Desktop Shell and Runtime Strategy](adr/0002-desktop-shell-and-runtime.md) — proposes Tauri 2 for desktop-first delivery and browser mode for development/tests.
- [ADR-0003: Transactional Workspace and Session Persistence](adr/0003-transactional-workspace-session-persistence.md) — proposes a unified transactional store and durable change sequence.

## Research

- [DeepSeek Harness study](research/DEEPSEEK-HARNESS.md) — upstream architecture and plugin/runtime research.
- [Workspace reverse engineering](research/WORKSPACE-REVERSE-ENGINEERING.md) — first-pass Workspace, persistence, filesystem, and UI findings.
- [Storage coordination study](research/STORAGE-COORDINATION.md) — single-host locking, SQLite transactions, multi-process risks, and failure-test plan.
- [Dependency reproducibility](research/DEPENDENCY-REPRODUCIBILITY.md) — pnpm lockfile bootstrap and frozen-install follow-up.
- [SQLite binding evaluation](research/SQLITE-BINDING-EVALUATION.md) — Node 22, better-sqlite3, and Tauri/Rust persistence options; no binding selected yet.\n- [SQLite vertical slice](research/SQLITE-VERTICAL-SLICE.md) — isolated Node built-in SQLite transaction-contract spike and its current acceptance limits.

## Documentation rules

- Keep the repository root `README.md` concise; link here for details.
- Put new upstream/subsystem research under `research/`.
- Put accepted architecture decisions under `adr/` using numbered records (for example, `0001-workspace-domain-boundaries.md`).
- Update the work log when meaningful work is completed; update the roadmap only when milestone status changes.
- Each topic should have one canonical document. Link to it instead of copying its content.
