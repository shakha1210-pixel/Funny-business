# Workspace Filesystem Engine — Read-only First Slice

- Status: Implemented as a host-owned prototype; cross-platform CI verification in progress
- Date: 2026-11-27

## Security model

A Workspace record is a project identity, not an access grant. Listing and reading are denied until an explicit grant is created. Grants are scoped to one Workspace ID, its canonical root path, and a narrow operation set (list, read). Grants are persisted in a versioned atomic JSON snapshot under the host data directory and can be revoked.

On startup, a persisted grant is accepted only if its Workspace still exists and its canonical root path is unchanged. A missing or changed Workspace fails initialization closed rather than silently widening access.

## First slice

- Relative slash-separated paths only; absolute paths, drive prefixes, backslashes, empty segments, dot and parent segments are rejected.
- Symlink path components are rejected. Directory listings identify symlink entries without following them.
- Directory enumeration is bounded to 5,000 entries total. Results are paginated with a default page size of 200 and a maximum of 500 entries per page; cursors are bound to the directory metadata version, and changes during pagination require restarting the listing.
- File reads are bounded to 1 MiB by default and UTF-8 decoded.
- Directory entries and file reads expose opaque SHA-256 version tokens derived from filesystem metadata.
- A read may provide the expected version; a stale token returns a conflict instead of silently reading a changed file.
- Reads use O_NOFOLLOW where the platform exposes it, then compare opened-file metadata with the pre-open metadata and verify it again after reading.
- Grant writes and revocations are persisted before in-memory publication.

## API

- GET /api/workspaces/:id/access-grants
- POST /api/workspaces/:id/access-grants with {"operations":["list","read"]} (either operation may be granted independently)
- POST /api/workspaces/:id/access-grants/:grantId/revoke
- GET /api/workspaces/:id/files?path=
- GET /api/workspaces/:id/file?path=README.md&version=<opaque-token>

The API is available through the loopback development server. It is not an agent tool API yet.

## Explicit limitations

- Read-only: no create, write, rename, delete, move, or watch operations.
- Grants are Workspace-root-wide for the selected operations; per-subdirectory grants and expiry are not implemented.
- Directories exceeding the 5,000-entry enumeration cap fail closed; pagination bounds response sizes but does not yet stream arbitrarily large directories.
- Metadata version tokens are stale-read guards, not cryptographic content hashes.
- Node's portable filesystem API does not provide an openat-style directory-handle walk on every supported platform. Symlink checks, canonical-root checks, O_NOFOLLOW, and opened-file identity checks reduce risk, but a hostile concurrent filesystem actor may still race intermediate path components. Do not treat this adapter as an OS sandbox or expose it to untrusted remote clients.
- The browser UI exposes a read-only file explorer with explicit grant and revoke controls, directory navigation, paginated listings, bounded text preview, and workspace-switch race guards.

## Next steps

1. Complete cross-platform CI and fix any platform-specific failures.
2. Add paginated listing and file metadata/encoding policy.
3. Continue UI file explorer hardening and add browser end-to-end coverage.
4. Only then design guarded writes, atomic replacement, backups, and stale-version checks.
5. Use OS-level sandboxing for commands, plugins, notebooks, and model-generated code; a Workspace grant alone does not constrain child processes.
