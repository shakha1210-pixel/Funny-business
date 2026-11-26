# Funny-business Work Log

Update this file with meaningful research, implementation, tests, and blockers.

## 2026-11-26 — Bootstrap and first core implementation

### Completed
- Confirmed repository: shakha1210-pixel/Funny-business.
- Confirmed default branch: main; repository was empty before bootstrap.
- Confirmed push permission through the connected GitHub integration.
- Set Windows, macOS, and Linux as first-class targets.
- Inspected DeepSeek Harness README, architecture guide, development guide, safety notice, and package manifest.
- Added README, architecture, roadmap, security baseline, and upstream research notes.
- Added TypeScript/Node project manifest and compiler configuration.
- Implemented the initial typed plugin contracts, service registry, and plugin lifecycle manager.
- Added initial lifecycle tests and a GitHub Actions matrix for Ubuntu, Windows, and macOS.
- Added .gitignore for build artifacts and local runtime data.

### DeepSeek Harness findings
- Describes an everything-is-a-plugin architecture built on Cordis.
- Plugins contribute services, typed events, and reversible effects to shared context.
- Model adapter, tool registry, session log, and agent loop are replaceable plugin contributions.
- Runtime composition uses profiles, bundles, and ordered patch layers.
- Documents extension seams for model adapters, tools, shell, filesystem, sandbox, sessions, UI, and agent lifecycle.
- It is developer-preview software with breaking changes.
- Its safety notice says it has not undergone a security audit and warns about model-generated code, commands, plugins, credentials, files, and network access.
- Its development guide describes native Windows development and optional WSL 2; each OS environment needs its own toolchain and validation.

### Verification status
- Source files and workflow were committed to GitHub.
- Tests and builds have NOT yet been executed in a local checkout or CI.
- The first CI run will provide the initial cross-platform validation.

### Not done yet
- No DeepSeek Harness source code has been copied.
- No package-by-package upstream source audit is complete.
- No desktop UI, model adapter, notebook gateway, or real OS-level sandbox exists yet.
- No dependency lockfile has been generated.

### Next actions
1. Inspect upstream Cordis primer/tutorial and plugin-manager implementation/tests.
2. Review upstream MIT license and third-party notices before any source reuse.
3. Decide Cordis versus a smaller independent plugin kernel.
4. Run CI and fix any TypeScript/test issues.
5. Add event bus, config, structured logging, and health checks.
6. Add workspace and Git worktree support.
