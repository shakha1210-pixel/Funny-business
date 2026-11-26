use rusqlite::{params, Connection};
use std::env;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

fn arg(name: &str, fallback: &str) -> String {
    let prefix = format!("--{}=", name);
    env::args().find_map(|value| value.strip_prefix(&prefix).map(str::to_owned))
        .unwrap_or_else(|| fallback.to_owned())
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    let index = ((p * sorted.len() as f64).ceil() as usize).saturating_sub(1).min(sorted.len() - 1);
    sorted[index]
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let iterations: usize = arg("iterations", "5000").parse()?;
    let warmup: usize = arg("warmup", "500").parse()?;
    let journal = arg("journal", "WAL").to_uppercase();
    let synchronous = arg("synchronous", "FULL").to_uppercase();
    if iterations == 0 || !["WAL", "DELETE"].contains(&journal.as_str())
        || !["FULL", "NORMAL"].contains(&synchronous.as_str()) {
        return Err("invalid benchmark parameters".into());
    }

    let mut path = env::temp_dir();
    let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    path.push(format!("funny-business-sqlite-bench-{}-{}.sqlite", std::process::id(), unique));
    let started_open = Instant::now();
    let mut connection = Connection::open(&path)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", journal.as_str())?;
    connection.pragma_update(None, "synchronous", synchronous.as_str())?;
    let open_ms = started_open.elapsed().as_secs_f64() * 1000.0;

    connection.execute_batch(
        "CREATE TABLE workspaces (id TEXT PRIMARY KEY, canonical_path TEXT NOT NULL UNIQUE);
         CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, created_at TEXT NOT NULL);
         CREATE TABLE workspace_sessions (
           workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
           session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
           PRIMARY KEY (workspace_id, session_id)
         );
         CREATE TABLE change_log (
           sequence INTEGER PRIMARY KEY AUTOINCREMENT,
           operation_id TEXT NOT NULL UNIQUE,
           event_type TEXT NOT NULL,
           entity_id TEXT NOT NULL,
           created_at TEXT NOT NULL
         );
         CREATE TABLE operation_receipts (
           operation_id TEXT PRIMARY KEY,
           operation_kind TEXT NOT NULL,
           session_id TEXT NOT NULL REFERENCES sessions(id),
           change_sequence INTEGER NOT NULL
         );
         INSERT INTO workspaces(id, canonical_path) VALUES ('workspace-1', '/benchmark/workspace');"
    )?;

    for index in 0..warmup {
        let id = format!("session-{}", index);
        let operation = format!("operation-{}", index);
        let now = "2026-11-27T00:00:00.000Z";
        let transaction = connection.transaction()?;
        transaction.execute("INSERT INTO sessions(id, cwd, created_at) VALUES (?1, ?2, ?3)",
            params![id, "/benchmark/workspace", now])?;
        transaction.execute("INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?1, ?2)",
            params!["workspace-1", id])?;
        transaction.execute("INSERT INTO change_log(operation_id, event_type, entity_id, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![operation, "session.created", id, now])?;
        let sequence = transaction.last_insert_rowid();
        transaction.execute("INSERT INTO operation_receipts(operation_id, operation_kind, session_id, change_sequence) VALUES (?1, ?2, ?3, ?4)",
            params![operation, "session.create", id, sequence])?;
        transaction.commit()?;
    }

    let mut samples = Vec::with_capacity(iterations);
    let benchmark_started = Instant::now();
    for index in warmup..(warmup + iterations) {
        let id = format!("session-{}", index);
        let operation = format!("operation-{}", index);
        let now = "2026-11-27T00:00:00.000Z";
        let started = Instant::now();
        let transaction = connection.transaction()?;
        transaction.execute("INSERT INTO sessions(id, cwd, created_at) VALUES (?1, ?2, ?3)",
            params![id, "/benchmark/workspace", now])?;
        transaction.execute("INSERT INTO workspace_sessions(workspace_id, session_id) VALUES (?1, ?2)",
            params!["workspace-1", id])?;
        transaction.execute("INSERT INTO change_log(operation_id, event_type, entity_id, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![operation, "session.created", id, now])?;
        let sequence = transaction.last_insert_rowid();
        transaction.execute("INSERT INTO operation_receipts(operation_id, operation_kind, session_id, change_sequence) VALUES (?1, ?2, ?3, ?4)",
            params![operation, "session.create", id, sequence])?;
        transaction.commit()?;
        if index >= warmup {
            samples.push(started.elapsed().as_secs_f64() * 1000.0);
        }
    }

    let total_ms = benchmark_started.elapsed().as_secs_f64() * 1000.0;
    let verified: i64 = connection.query_row("SELECT count(*) FROM sessions", [], |row| row.get(0))?;
    if verified != (warmup + iterations) as i64 {
        return Err(format!("row count mismatch: {}", verified).into());
    }
    let elapsed_ms = total_ms;
    samples.sort_by(f64::total_cmp);
    println!(
        "{{\"benchmark\":\"sqlite-session-create-transaction-v1\",\"adapter\":\"rusqlite\",\"runtime\":\"rust\",\"platform\":\"{}\",\"arch\":\"{}\",\"journal\":\"{}\",\"synchronous\":\"{}\",\"iterations\":{},\"warmup\":{},\"openMs\":{:.3},\"summedTransactionMs\":{:.3},\"transactionMs\":{{\"p50\":{:.4},\"p95\":{:.4},\"p99\":{:.4},\"max\":{:.4}}},\"verifiedSessionRows\":{}}}",
        env::consts::OS, env::consts::ARCH, journal, synchronous, iterations, warmup,
        open_ms, elapsed_ms, percentile(&samples, 0.50), percentile(&samples, 0.95),
        percentile(&samples, 0.99), samples[samples.len() - 1], verified
    );

    drop(connection);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("sqlite-wal"));
    let _ = std::fs::remove_file(path.with_extension("sqlite-shm"));
    Ok(())
}
