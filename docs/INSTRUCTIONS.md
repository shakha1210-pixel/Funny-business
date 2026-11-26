# Project Instructions

These instructions apply to contributors, maintainers, and AI coding agents working in Funny-business.

## 1. Project identity

Funny-business is an independent, local-first, cross-platform AI workspace. Windows, macOS, and Linux are first-class targets.

The project may study public software, documentation, interfaces, and observable behavior for interoperability and architectural learning. **Do not copy upstream implementation code or distinctive assets without an explicit license and provenance review.** Reverse engineering notes must distinguish observed facts, hypotheses, and unverified items.

## 2. Documentation discipline

- Keep project documentation under `docs/`; keep the root `README.md` as the short project entry point.
- Use `docs/README.md` as the documentation index.
- Put upstream and subsystem research in `docs/research/`.
- Keep architecture decisions in `docs/adr/` (create this directory when the first ADR is added).
- Update `docs/WORKLOG.md` when meaningful research, implementation, tests, or blockers change.
- Update `docs/ROADMAP.md` when phase scope or completion status changes.
- Do not duplicate the same specification across multiple documents; link to its canonical home.
- Mark proposals, assumptions, confirmed findings, and unverified claims clearly.

## 3. Engineering principles

- Prefer small, typed, testable modules and explicit interfaces.
- Keep domain logic independent from UI frameworks and OS-specific APIs.
- Put platform-specific behavior behind adapters.
- Keep Workspace identity, filesystem access policy, and process execution isolation as separate concepts.
- Keep user data separate from application code and generated artifacts.
- Prefer documented APIs and supported CLIs for integrations.
- Do not assume a working directory is a security boundary.
- Avoid adding dependencies without checking maintenance, platform support, and license implications.

## 4. Security and permissions

- Treat model output, external repositories, plugins, notebooks, datasets, browser content, and remote responses as untrusted input.
- Apply least privilege and default-deny behavior.
- Scope permissions to a resource and operation; record grants and revocations.
- Never commit credentials or ask users to paste long-lived secrets into source files or chat. Use an OS-backed credential store or supported authentication flow.
- Gate external writes, destructive operations, privileged changes, and self-modification behind explicit policy and approval.
- Run untrusted code in an OS-enforced isolation boundary with resource limits; a child process alone is not a sandbox.
- Preserve audit, secret handling, permission enforcement, recovery, and sandbox supervision as protected control-plane components.
- Self-evolution must use an isolated branch/worktree, tests, reviewable diffs, explicit activation, health checks, and rollback.

See [SECURITY.md](SECURITY.md) for the current baseline.

## 5. Tests and verification

- Add tests for new behavior, failure paths, cancellation, and relevant race conditions.
- Validate on Windows, macOS, and Linux when platform behavior is involved.
- Do not claim a build, test, or CI check passed unless its result was actually observed.
- Record commands, environment assumptions, and unverified checks in the work log.
- Keep CI reproducible and avoid relying on developer-machine state.

## 6. Change workflow

1. Read the relevant architecture and subsystem docs.
2. Inspect existing code and tests before changing interfaces.
3. State the intended behavior and safety implications.
4. Implement the smallest coherent change.
5. Add or update tests and docs.
6. Run the relevant checks and report exact results.
7. Review the diff for secrets, destructive behavior, licensing, and unintended scope.
8. Update the work log and roadmap when appropriate.

## 7. Research notes

For each reverse-engineering study, record:
- the upstream repository and reviewed revision/commit when known;
- exact files, docs, or public behavior examined;
- confirmed observations separately from deductions;
- limitations and unverified areas;
- the independent Funny-business design implications.

Never describe an inference as an upstream fact. Never describe a design proposal as implemented functionality.
