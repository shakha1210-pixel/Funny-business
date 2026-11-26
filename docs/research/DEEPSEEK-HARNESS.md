# Research Notes: DeepSeek Harness

Source: https://github.com/deepseek-ai/deepseek-harness  
Inspected: README.md, docs/architecture.md, docs/development.md, docs/cordis-primer.md, SAFETY.md, package.json, packages/boot/plugin-manager/README.md, packages/bundle/base/README.md, packages/core/tools/README.md, LICENSE, THIRD_PARTY_NOTICES.md  
Research date: 2026-11-26

## Source-stated facts

### Identity, maturity, and license
- DeepSeek Harness (dsh) is described as an open-source agent harness developed by DeepSeek AI.
- README describes an everything-is-a-plugin architecture built on Cordis.
- README marks it developer preview and warns of compatibility-breaking changes.
- LICENSE contains the MIT License text with DeepSeek 2026 copyright.
- THIRD_PARTY_NOTICES.md documents vendored Cordis/foundation packages and a large direct runtime dependency set. The notice file is generated from repository metadata.

### Cordis model
The Cordis primer describes five central ideas:
1. A plugin implements a Service and is mounted into a context.
2. A context is a repository of services exposed through stable context keys.
3. Plugins declare service dependencies through injection, allowing the loader to activate them when required services exist.
4. Typed events provide communication and support emit, waterfall, parallel, serial, and bail dispatch modes.
5. Registrations are reversible effects, so teardown/reload can unwind listeners, providers, tools, adapters, and other registrations.

The primer describes waterfall listeners as around-middleware: a listener calls next() to delegate and can short-circuit by returning without delegation. Event dispatch mode is part of the public contract.

### Runtime composition
- A running Harness is composed as an ordered plugin tree at boot.
- Profiles are named compositions stored in the Harness home.
- Bundles package Cordis config rows and the code they mount.
- Profile and bundle composition uses ordered bundles and patch overlays.
- Documented profiles include Web, Headless, SDK, SDK-minimal, and ACP.
- The architecture documents seams for LLM adapters, tools, shell, terminal, filesystem, sandbox, agent lifecycle, UI, session persistence, and more.
- The session log is described as the source of model-visible context.

### Plugin management and policy
- The plugin-manager package manages profile plugin entries and bundle installation/selection.
- Its README states plugin-manager actions require a danger-full-access mode or per-call approval, and profile changes can affect every session using that profile.
- The base bundle README describes shared model access, tools, durable sessions, and workspace safety defaults for base-backed profiles.
- The tools package describes a shared registry, argument validation, scoped restrictions, and a guarded execution pipeline with pre-execute, execute, post-execute, and result stages.

### Development and platform
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
3. Consider service dependency declarations rather than relying only on manual load order.
4. Define event dispatch semantics explicitly; do not use one generic event API for every behavior.
5. Treat plugin install/update and plugin activation as separate operations.
6. Keep tool execution policy in a shared pipeline so individual tools cannot bypass it.
7. Keep session/model-visible context auditable.
8. Keep policy and recovery outside unrestricted agent control.
9. Validate each operating system independently.

## Reuse and licensing
The upstream repository is MIT-licensed, but it also contains third-party dependencies and vendored components with their own notices. These notes do not copy upstream source. Before adopting source files:
- inspect the exact source file and its license provenance;
- preserve copyright and license text;
- record origin and upstream commit;
- inspect THIRD_PARTY_NOTICES and transitive dependency licenses;
- document local modifications;
- keep upstream code clearly separated from Funny-business original code.

## Remaining research
- Inspect Cordis tutorial and actual vendor implementation.
- Map plugin manager source/tests, service scope, tool pipeline, LLM adapters, sandbox, approvals, session persistence, and desktop package boundaries.
- Compare the upstream plugin manager's install/update safeguards with our planned extension lifecycle.
- Decide whether to depend on Cordis or keep the smaller independent kernel.
