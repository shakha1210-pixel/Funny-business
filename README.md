# Funny-business

A universal, local-first, extensible AI workspace.

Funny-business combines a modular agent runtime, local and hosted AI models, project workspaces, Git repositories, notebook and compute gateways, and controlled self-evolution.

## Status

Early architecture and core bootstrap. This is the canonical source repository.

## Principles

- Windows, macOS, and Linux are first-class targets.
- Local-first project files; remote sync is always explicit.
- Model providers, tools, gateways, UI panels, and workflows are modular.
- Agent actions pass through permission and execution policy.
- Self-evolution uses isolated branches/workspaces, tests, review, and rollback.
- Integrations use documented APIs and supported CLIs.

## Documentation

All project documentation is maintained under [`docs/`](docs/README.md).

Start here:
- [Documentation index](docs/README.md)
- [Project instructions](docs/INSTRUCTIONS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Work log](docs/WORKLOG.md)
- [Security baseline](docs/SECURITY.md)

Research:
- [DeepSeek Harness study](docs/research/DEEPSEEK-HARNESS.md)
- [Workspace reverse engineering](docs/research/WORKSPACE-REVERSE-ENGINEERING.md)

## Development

Initial core: TypeScript and Node.js 22+.

```bash
corepack enable
pnpm install
pnpm build
pnpm test
```

## Research and attribution

We study public architecture and documented extension concepts from DeepSeek Harness. This is an independent implementation; no DeepSeek Harness source files are copied into this initial scaffold. Any future source reuse must preserve license and copyright notices and be recorded in third-party notices.

Project licensing will be finalized before redistribution.
