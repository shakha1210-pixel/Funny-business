# Performance and Resource Budgets

Status: baseline instrumentation only; numeric budgets are not yet established.

## Principles

- Keep startup work proportional to the visible feature set.
- Do not start model servers, notebook kernels, Git watchers, indexers, or plugin processes until explicitly needed.
- Prefer event-driven updates and cancellable work over permanent polling loops.
- Bound file reads, search results, caches, queues, and concurrent tasks.
- Avoid loading full project trees or file contents when a compact projection or requested slice is sufficient.
- Shut down idle workers and release subscriptions when their owning view or capability is closed.
- Measure before optimizing; record OS, hardware, runtime version, workload, and measurement method.

## Current instrumentation

The loopback development host exposes `GET /api/diagnostics`. It reports an on-demand snapshot containing:
- Node version, OS platform, and architecture;
- host uptime since module initialization;
- process resident-set, V8 heap, external, and ArrayBuffer memory in bytes;
- cumulative process CPU user/system time in microseconds.

The endpoint does not run a sampling timer or background profiler. CPU values are cumulative since process start, not an instantaneous utilization percentage. Memory values are a point-in-time process snapshot, not total machine memory use.

The endpoint is intended for local development and test diagnostics. It is not a production monitoring protocol and should not be exposed on a network interface.

## Baseline procedure

For each supported OS:
1. Record OS version, CPU, RAM, Node version, and build revision.
2. Launch the app from a cold process and measure time to interactive UI.
3. Capture diagnostics immediately after startup and after a fixed idle period.
4. Open a representative medium-sized Workspace and capture diagnostics again.
5. Record background process count and package/installer size.
6. Repeat each measurement at least three times and report median plus range.

Do not compare measurements from different hardware or workloads as if they were directly comparable.

## Planned budgets

Numeric limits for startup time, idle RSS, CPU use, and package size remain open until reproducible Windows, macOS, and Linux baselines exist. The desktop-shell ADR requires these measurements before the shell decision is accepted.
