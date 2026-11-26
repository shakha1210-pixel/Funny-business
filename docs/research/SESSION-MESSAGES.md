# Session Message Persistence — First Vertical Slice

- Status: Implemented as a JSON-backed prototype
- Date: 2026-11-27

## Scope

The first conversation slice makes user prompts durable within an existing Session. It intentionally does not invoke a model or fabricate assistant output.

## Data contract

Each record contains:
- opaque message ID;
- owning Session ID;
- role fixed to `user` in this slice;
- UTF-8 content;
- creation timestamp in Unix milliseconds.

The store is split into one snapshot per Session. Filenames are SHA-256 digests of Session IDs, so Session IDs are never interpreted as path fragments. Each document includes schema version 1 and the original Session ID; load validates the document binding, record shape, and duplicate IDs.

## Write behavior

- Only existing active Sessions accept new user messages.
- Empty/whitespace-only content is rejected.
- Content is bounded to 64 KiB of UTF-8 by default.
- Appends are serialized per Session in the process; reads wait for pending appends on that Session so a completed write is visible to the next read.
- The HTTP request envelope allows up to 512 KiB so a full 64 KiB UTF-8 message (including JSON escaping/metadata) can reach the stricter message-content limit.
- Each update writes an exclusive temporary file, syncs it, atomically renames it, and syncs the containing directory on POSIX.
- The application host lock supplies single-host ownership. The message store itself does not provide cross-process locking.
- Reads return defensive copies and preserve append order.

## Host API

- `GET /api/sessions/:id/messages` lists persisted messages.
- `POST /api/sessions/:id/messages` appends a user message.

The browser UI loads the selected Session's messages and sends prompts to this API. It shows a clear notice that agent execution is not connected.

## Deliberate limitations

- No assistant, system, or tool messages yet.
- No model provider invocation, streaming, cancellation, retries, tool calls, or execution trace.
- No message edit/delete API.
- No durable event feed for message updates.
- Message snapshots are separate from Session metadata; no cross-file transaction exists.
- No SQLite migration/importer yet. The SQLite vertical slice remains a candidate evaluation, not the production store.

## Next steps

1. Add a host-owned agent-run contract with explicit queued/running/completed/failed/cancelled states.
2. Persist run records and assistant output with idempotent operation IDs.
3. Introduce model-provider interfaces and a fake deterministic provider for contract tests before connecting a real local/hosted model.
4. Move messages and run records into the selected transactional store only after the SQLite/runtime evaluation is complete.
