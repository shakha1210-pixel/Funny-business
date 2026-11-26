# Funny-business Work Log

Update this file with meaningful research, implementation, tests, and blockers.

## 2026-11-26 — Bootstrap and first core implementation

### Completed
- Confirmed repository: shakha1210-pixel/Funny-business.
- Confirmed default branch: main; repository was empty before bootstrap.
- Confirmed push permission through the connected GitHub integration.
- Set Windows, macOS, and Linux as first-class targets.
- Inspected DeepSeek Harness README, architecture guide, development guide, Cordis primer, safety notice, plugin-manager reference, base-bundle reference, tools reference, LICENSE, THIRD_PARTY_NOTICES, and package manifest.
- Added README, architecture, roadmap, security baseline, and upstream research notes.
- Added TypeScript/Node project manifest and compiler configuration.
- Implemented initial typed plugin contracts, service registry, and plugin lifecycle manager.
- Added initial lifecycle tests and a GitHub Actions matrix for Ubuntu, Windows, and macOS.
- Added .gitignore for build artifacts and local runtime data.

### DeepSeek Harness findings
- Describes an everything-is-a-plugin architecture built on Cordis.
- Cordis centers on context services, declared service dependencies, typed events, and reversible registration effects.
- Events have explicit dispatch semantics: emit, waterfall, parallel, serial, or bail.
- Model adapter, tool registry, session log, and agent loop are replaceable plugin contributions.
- Runtime composition uses profiles, bundles, and ordered patch layers.
- Plugin management is permission-gated; the upstream plugin-manager README documents danger-full-access or per-call approval.
- The shared base bundle includes model access, tools, durable sessions, and workspace safety defaults.
- The tool system uses a shared registry, validation, scoped restrictions, and a guarded execution pipeline.
- Upstream is developer-preview software with breaking changes and no security audit.
- Its safety notice warns that sandboxing and approval prompts reduce risk but do not guarantee isolation.
- Its development guide describes native Windows development and optional WSL 2; each OS environment needs its own toolchain and validation.
- Upstream LICENSE is MIT; THIRD_PARTY_NOTICES lists vendored packages and other dependencies with their own license terms.

### Verification status
- Source files and workflow were committed to GitHub.
- GitHub combined commit status currently reports no status entries for the latest documentation commit; no successful CI run has been verified yet.
- Tests and builds have NOT yet been executed in a local checkout or confirmed by CI.
- The first CI run will provide initial cross-platform validation.

### Not done yet
- No DeepSeek Harness source code has been copied.
- No full package-by-package upstream source audit is complete.
- No desktop UI, model adapter, notebook gateway, or real OS-level sandbox exists yet.
- No dependency lockfile has been generated.

### Next actions
1. Inspect Cordis tutorial and upstream plugin-manager/service-scope implementation and tests.
2. Review exact upstream source provenance and third-party notices before any source reuse.
3. Decide Cordis versus the independent minimal plugin kernel.
4. Run CI and fix any TypeScript/test issues.
5. Add event bus, config, structured logging, and health checks.
6. Add workspace and Git worktree support.

## 2026-11-27 — Workspace reverse engineering, first pass

### Completed
- Inspected DeepSeek Harness workspace subsystem contract and package reference.
- Inspected the public Workspace type contract and selected Workspace Controller, filesystem, and UI workspace documentation.
- Recorded reviewed upstream revision `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`.
- Added `docs/research/WORKSPACE-REVERSE-ENGINEERING.md` with the evidence ledger, source map, domain invariants, persistence/recovery design, session membership, archive/pin behavior, filesystem boundary, and Funny Business proposals.

### Confirmed findings
- Workspace is a durable project-directory record, not a Session and not a sandbox.
- Stable Workspace ID is separate from canonical path identity.
- Session membership is validated against the Session header cwd; the ordered membership account remains the ownership record.
- Workspace unregister/delete is non-destructive: it does not delete folders, files, or session histories.
- Registry mutations are serialized; multi-write changes use a pending-mutation recovery marker.
- Workspace domain, filesystem capability, and process execution isolation are separate concerns.

### Still not done
- No upstream implementation code copied.
- No full source-level audit of Workspace registry/entity/domain or tests yet.
- No Funny Business Workspace implementation yet.
- No cross-platform path/symlink tests yet.

### Next actions
1. Inspect upstream Workspace `index.ts`, `entity.ts`, `spec.ts`, `paths.ts`, and tests.
2. Inspect filesystem policy/local backend implementation and tests, especially symlink containment and stale-write guards.
3. Inspect UI workspace tree/picker state and race handling.
4. Write a Funny Business Workspace ADR and implement the first independent domain module with tests.

## 2026-11-27 — Documentation structure cleanup

### Completed
- Added `docs/README.md` as the central documentation index.
- Added `docs/INSTRUCTIONS.md` for contributor and AI-agent rules, research discipline, security expectations, and change workflow.
- Updated the root `README.md` to act as a concise project entry point linking to the documentation index.
- Confirmed project Markdown documents are organized under `docs/`, with upstream research under `docs/research/`.

### Not done
- No bulk merge into one oversized Markdown file; each topic retains one canonical document.
- No ADR has been created yet; `docs/adr/` will be introduced when the first architecture decision is ready.
