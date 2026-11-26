# Funny-business Work Log

Update this file with meaningful research, implementation, tests, and blockers.

## 2026-11-26 — Bootstrap

### Completed
- Confirmed repository: shakha1210-pixel/Funny-business.
- Confirmed default branch: main; repository was empty before bootstrap.
- Confirmed push permission through the connected GitHub integration.
- Set Windows, macOS, and Linux as first-class targets.
- Inspected DeepSeek Harness README, architecture guide, development guide, safety notice, and package manifest.
- Added initial project docs and TypeScript scaffold.

### DeepSeek Harness findings
- Describes an everything-is-a-plugin architecture built on Cordis.
- Plugins contribute services, typed events, and reversible effects to shared context.
- Model adapter, tool registry, session log, and agent loop are replaceable plugin contributions.
- Runtime composition uses profiles, bundles, and ordered patch layers.
- Documents extension seams for model adapters, tools, shell, filesystem, sandbox, sessions, UI, and agent lifecycle.
- It is developer-preview software with breaking changes.
- Its safety notice says it has not undergone a security audit and warns about model-generated code, commands, plugins, credentials, files, and network access.
- Its development guide describes native Windows development and optional WSL 2; each OS environment needs its own toolchain and validation.

### Not done yet
- No DeepSeek Harness source code has been copied.
- No package-by-package source audit is complete.
- No code has been executed or tested in a local runtime.
- No desktop UI, model adapter, notebook gateway, or real sandbox exists yet.
- No CI workflow exists yet.

### Next actions
1. Map relevant upstream packages and tests.
2. Review MIT license and third-party notices before any source reuse.
3. Decide Cordis versus a smaller plugin kernel.
4. Complete plugin lifecycle, service registry, rollback, and tests.
5. Add cross-platform CI.
