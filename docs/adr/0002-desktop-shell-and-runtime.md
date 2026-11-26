# ADR-0002: Desktop Shell and Runtime Strategy

- Status: Proposed
- Date: 2026-11-27
- Decision owners: Funny-business maintainers

## Context

Funny-business targets Windows, macOS, and Linux. The primary product should be a locally installed desktop application with native OS integration, while the browser interface remains available as a development and test surface. The application should feel lightweight: low idle CPU and memory use, fast startup, limited background services, and on-demand activation of expensive capabilities.

The current prototype is a TypeScript/Node.js core with a loopback HTTP server and static browser UI. That is useful for rapid iteration, but it must not become an accidental requirement for the production desktop experience.

## Options considered

### Tauri 2

- Uses the platform WebView rather than bundling a separate Chromium runtime.
- Provides a native Rust host for OS integration, window lifecycle, filesystem dialogs, notifications, and secure command boundaries.
- Supports Windows, macOS, and Linux packaging.
- Requires Rust/toolchain knowledge and careful command/API permission design.
- WebView behavior and packaging need validation on each target OS.

### Electron

- Mature ecosystem and straightforward reuse of Node.js APIs and the existing TypeScript server.
- Bundles Chromium and Node.js, generally increasing installer size and baseline memory compared with a system-WebView shell.
- Strong choice when browser-engine consistency and the Node ecosystem outweigh footprint goals.

### Browser-only

- Excellent for development and remote access, but cannot provide the same native installation, OS integration, and local capability boundary as a desktop shell.
- Retained as a development/test mode, not the primary product target.

## Proposed direction

Prefer **Tauri 2** for the production desktop shell, subject to a small cross-platform vertical-slice benchmark before the decision is accepted.

Keep the domain core independent of Tauri and the browser renderer. Define host capabilities behind typed interfaces so the same core behavior can be driven by:
- a Tauri desktop adapter in production;
- the loopback HTTP adapter in development and automated tests;
- a future CLI adapter where useful.

Do not assume that the current Node.js runtime must ship inside the desktop application. Evaluate two implementation paths with a working vertical slice:
1. Keep TypeScript domain logic and run it as a managed, bundled sidecar process.
2. Move only the privileged/native host and performance-sensitive services to Rust while keeping UI/domain modules in TypeScript where that remains beneficial.

Choose based on measured startup, idle memory, CPU, packaging size, developer complexity, and security boundaries—not ideology. Avoid maintaining two independent implementations of domain rules.

## Lightweight performance requirements

The desktop shell must not start model servers, notebook kernels, Git watchers, indexers, or plugin processes until needed. Capabilities should be lazy and cancellable.

Measure at minimum:
- cold startup to interactive UI;
- idle resident memory and CPU after startup;
- memory/CPU while opening a medium-sized Workspace;
- number of background processes;
- installer/package size per OS;
- shutdown and recovery behavior.

Record measurements separately for Windows, macOS, and Linux. Set numeric budgets only after the first reproducible baseline exists.

## Security requirements

- The renderer is untrusted input and never owns filesystem or process authority.
- Expose narrow, typed Tauri commands; deny unneeded capabilities by default.
- Keep Workspace identity, filesystem grants, and process sandboxing separate.
- Never expose arbitrary shell execution or unrestricted filesystem access to the renderer.
- Treat sidecar processes as ordinary processes, not as sandboxes; use OS-enforced isolation for untrusted code.
- Keep secrets out of renderer state, logs, URLs, and command-line arguments.
- Browser dev mode remains loopback-only and must use the same authorization and domain rules as desktop mode.

## Consequences

- Desktop-first packaging and OS adapters become first-class architecture concerns.
- Browser mode remains valuable for fast UI iteration, integration tests, and debugging.
- Some native integrations will require Rust and per-platform CI/toolchains.
- The current HTTP server becomes a development transport adapter rather than the mandatory production transport.
- No framework migration should happen until the vertical slice proves the chosen packaging and runtime approach.

## Acceptance criteria for this ADR

Before changing status to Accepted:
1. Build a minimal Tauri desktop window that loads the existing UI.
2. Verify a native directory picker through a narrow capability API.
3. Run the same Workspace list/create/rename/unregister contract through desktop and browser-dev adapters.
4. Produce successful Windows, macOS, and Linux CI builds.
5. Capture reproducible startup, idle memory, and package-size measurements.
6. Document the selected TypeScript sidecar versus Rust-host split and its security model.
