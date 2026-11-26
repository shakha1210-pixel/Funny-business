# Documentation

This directory is the canonical home for Funny-business project documentation.

## Core project docs

- [Instructions](INSTRUCTIONS.md) — contributor and AI-agent rules, documentation discipline, engineering workflow.
- [Architecture](ARCHITECTURE.md) — system vision, boundaries, and subsystem design.
- [Roadmap](ROADMAP.md) — phases, milestones, and pending work.
- [Security baseline](SECURITY.md) — threat model and required controls.
- [Work log](WORKLOG.md) — dated research, implementation, verification, and blockers.

## Research

- [DeepSeek Harness study](research/DEEPSEEK-HARNESS.md) — upstream architecture and plugin/runtime research.
- [Workspace reverse engineering](research/WORKSPACE-REVERSE-ENGINEERING.md) — first-pass Workspace, persistence, filesystem, and UI findings.

## Documentation rules

- Keep the repository root `README.md` concise; link here for details.
- Put new upstream/subsystem research under `research/`.
- Put accepted architecture decisions under `adr/` using numbered records (for example, `0001-workspace-domain-boundaries.md`).
- Update the work log when meaningful work is completed; update the roadmap only when milestone status changes.
- Each topic should have one canonical document. Link to it instead of copying its content elsewhere.
