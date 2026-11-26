# Research Notes: DeepSeek Harness

Source: https://github.com/deepseek-ai/deepseek-harness  
Inspected: README.md, docs/architecture.md, docs/development.md, SAFETY.md, package.json  
Research date: 2026-11-26

## Source-stated facts

### Identity and maturity
- DeepSeek Harness (dsh) is described as an open-source agent harness developed by DeepSeek AI.
- README describes an everything-is-a-plugin architecture built on Cordis.
- README marks it developer preview and warns of compatibility-breaking changes.

### Architecture
- Cordis plugins contribute services, typed events, and reversible effects to shared context.
- Model adapter, tool registry, session log, and agent loop are plugins.
- Runtime is composed as an ordered plugin tree at boot.
- Profiles are named compositions stored in the Harness home.
- Bundles package Cordis config rows and the code they mount.
- Profile and bundle composition uses ordered bundles and patch overlays.
- Documented profiles include Web, Headless, SDK, SDK-minimal, and ACP.
- Capability seams cover LLM adapters, tools, shell, terminal, filesystem, sandbox, agent lifecycle, UI, and session persistence.
- The session log is described as the source of model-visible context.

### Development
- The inspected development guide specifies Node.js 24.22.3 or newer 24.x, or Node.js 26.13.1 or newer, and pnpm 11.28.5.
- It documents native Windows development or optional WSL 2.
- It states each OS environment needs its own runtime, build tools, and permissions.
- It uses separate TypeScript Host and Client project aggregates.
- Web and Electron desktop apps are launched through named profiles.

### Safety
- SAFETY.md says the project is experimental developer-preview software and has not undergone a security audit.
- It warns that model-generated code/commands and third-party plugins may damage files or disclose data and credentials.
- It says sandboxing, approval prompts, and permission controls reduce risk but do not guarantee isolation.
- It recommends least privilege, disposable environments, backups, and review of plugins/configuration/commands.

## Funny-business implications (our design decisions, not claims about upstream)
1. Use composable modules and replaceable provider interfaces.
2. Make plugin activation transactional with reverse-order cleanup.
3. Separate application composition profiles from plugin package distribution.
4. Keep session/model-visible context auditable.
5. Keep policy and recovery outside unrestricted agent control.
6. Validate each operating system independently.

## Reuse and licensing
The upstream README identifies an MIT license and links to THIRD_PARTY_NOTICES.md. These notes do not copy upstream source. Before adopting source files or dependencies, inspect the exact license and notices, preserve copyright/license text, record origin and commit, review transitive dependency licenses, and document modifications.

## Remaining research
- Inspect Cordis primer and tutorial.
- Map plugin manager, scope, tool pipeline, LLM adapters, sandbox, approval, persistence, and desktop package boundaries.
- Read implementation and tests before choosing dependency reuse.
