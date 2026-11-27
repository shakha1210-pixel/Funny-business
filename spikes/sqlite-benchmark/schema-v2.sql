-- Funny Business SQLite benchmark v2 canonical schema.
-- Benchmark-only contract: this is not a production migration.
-- Timestamps are Unix milliseconds, matching the current TypeScript domain models.

PRAGMA foreign_keys = ON;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  canonical_path TEXT NOT NULL UNIQUE CHECK (length(trim(canonical_path)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  cwd TEXT NOT NULL CHECK (length(trim(cwd)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived'))
) STRICT;

-- Mirrors Workspace.sessionIds and the domain invariant that a Session belongs
-- to at most one Workspace. A Session may remain unattached.
CREATE TABLE workspace_sessions (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  attached_at INTEGER NOT NULL CHECK (attached_at >= 0),
  PRIMARY KEY (workspace_id, session_id)
) STRICT;

-- Current JSON persistence durably captures user messages only. Assistant,
-- system, and tool roles are synthetic benchmark workload records.
CREATE TABLE messages (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  run_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL CHECK (length(content) > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  tool_call_id TEXT,
  tool_name TEXT,
  FOREIGN KEY (run_id, session_id)
    REFERENCES agent_runs(id, session_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX messages_session_created
  ON messages(session_id, created_at, id);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(trim(operation_id)) > 0),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted')
  ),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  started_at INTEGER,
  finished_at INTEGER,
  provider_id TEXT,
  model_id TEXT,
  failure_code TEXT,
  failure_message TEXT,
  failure_retryable INTEGER CHECK (failure_retryable IN (0, 1)),
  CHECK (started_at IS NULL OR started_at >= created_at),
  CHECK (finished_at IS NULL OR finished_at >= COALESCE(started_at, created_at)),
  CHECK (
    (status = 'failed' AND failure_code IS NOT NULL AND failure_message IS NOT NULL
      AND failure_retryable IS NOT NULL)
    OR
    (status <> 'failed' AND failure_code IS NULL AND failure_message IS NULL
      AND failure_retryable IS NULL)
  ),
  UNIQUE (id, session_id)
) STRICT;

CREATE INDEX agent_runs_session_created
  ON agent_runs(session_id, created_at, id);

CREATE TABLE run_events (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'queued', 'started', 'assistant_delta', 'tool_call_proposed',
      'approval_required', 'tool_result', 'completed', 'failed',
      'cancelled', 'interrupted'
    )
  ),
  payload_json TEXT,
  UNIQUE (run_id, sequence)
) STRICT;

CREATE INDEX run_events_feed
  ON run_events(run_id, sequence);

-- Every successful logical mutation has one change-log row and one receipt.
-- Composite FK prevents a receipt from pointing at another operation's sequence.
CREATE TABLE change_log (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(trim(operation_id)) > 0),
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('workspace', 'session', 'message', 'agent_run')
  ),
  entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (sequence, operation_id)
) STRICT;

CREATE TABLE operation_receipts (
  operation_id TEXT PRIMARY KEY CHECK (length(trim(operation_id)) > 0),
  operation_kind TEXT NOT NULL CHECK (length(trim(operation_kind)) > 0),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
  change_sequence INTEGER NOT NULL UNIQUE,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  FOREIGN KEY (change_sequence, operation_id)
    REFERENCES change_log(sequence, operation_id)
) STRICT;

CREATE INDEX change_log_entity
  ON change_log(entity_type, entity_id, sequence);

PRAGMA user_version = 2;
