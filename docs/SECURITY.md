# Funny-business Security Baseline

This is an initial baseline, not a security audit or guarantee of isolation.

## Threat model
Treat model-generated code and commands, third-party plugins, external repositories, imported notebooks/datasets, browser content, and remote API responses as untrusted.

## Required controls
1. Least privilege; no global filesystem or account access by default.
2. Scoped grants tied to a resource and operation.
3. Secrets in OS-backed credential storage; redact from prompts and logs.
4. Untrusted execution in disposable environments with filesystem, network, CPU, memory, and time limits.
5. Approval for external writes, destructive actions, and privileged changes.
6. Audit tool calls, permission decisions, extension versions, and evolution diffs.
7. Backup before activation or destructive changes.
8. Default deny when permissions are missing or ambiguous.

## Protected control plane
The agent cannot independently disable or weaken permission evaluation, secret storage/redaction, sandbox supervision, audit logging, recovery/rollback, or provenance verification. Changes to these components require privileged human review.

## Sandbox caveat
A child process alone is not a secure sandbox. Use OS-level isolation where available, such as containers, restricted users, namespaces, job objects, or virtual machines. Document residual risks for every platform.

## Emergency controls
Provide stop-all, revoke-grants, disable-extension, terminate-sandbox, and restore-last-known-good operations.

## Credentials
Never commit tokens, embed credentials in URLs, print secrets, or ask users to paste long-lived tokens into chat. Prefer OS credential managers and documented OAuth/device flows with minimum scopes.


## Local host data-directory ownership
The Node development host uses an atomic-directory guard to prevent two local host processes from opening the same data directory concurrently. The guard is not a sandbox or a kernel-managed lock. After a crash, the stale guard must be removed manually only after verifying that no process still uses the directory. Do not automatically reclaim it based only on PID or timestamps. Network filesystem behavior is not covered by this guarantee.


## Workspace filesystem grants
Workspace registration is not file access authorization. The first filesystem adapter requires an explicit, persisted grant scoped to one Workspace root and the list and/or read operation. Grants can be revoked. Missing grants fail closed. The current adapter rejects traversal and symlink path components, bounds directory enumeration and file reads, and supports metadata-derived version tokens. It is read-only and is not an OS sandbox. Node's portable filesystem APIs do not eliminate every intermediate-component TOCTOU race; do not expose this adapter to untrusted remote clients or treat it as a substitute for OS-level process isolation.
