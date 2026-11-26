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
