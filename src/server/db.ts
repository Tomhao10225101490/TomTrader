import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Local persistence (SQLite).
 *
 * Chosen over an ORM because the schema is small, fixed, and read from a
 * single process; `node:sqlite` ships with the runtime Node already needs, so
 * TomTrader has no native build step to break. Everything the app stores is
 * either (a) a vendor snapshot we keep so a cold start can paint cached data
 * within the first second, or (b) user data with no cloud account behind it.
 *
 * The repository layer below is deliberately thin — swapping in PostgreSQL is
 * a matter of reimplementing `db.exec/query` behind the same function names.
 */

const DATA_DIR = process.env.TOMTRADER_DATA_DIR
  ? path.resolve(process.env.TOMTRADER_DATA_DIR)
  : path.join(process.cwd(), 'data');

let handle: DatabaseSync | null = null;
let path_ = '';

export function dbPath(): string {
  return path_;
}

export function getDb(): DatabaseSync {
  if (handle) return handle;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  path_ = process.env.TOMTRADER_DB === ':memory:' ? ':memory:' : path.resolve(process.env.TOMTRADER_DB || path.join(DATA_DIR, process.env.TOMTRADER_DEMO === '1' ? 'demo.db' : 'tomtrader.db'));
  if (path_ != ':memory:') fs.mkdirSync(path.dirname(path_), { recursive: true });
  handle = new DatabaseSync(path_);
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA synchronous = NORMAL');
  handle.exec('PRAGMA foreign_keys = ON');
  migrate(handle);
  return handle;
}

/** Test helper: drop the singleton so a spec can start from a clean database. */
export function resetDbForTests(): void {
  if (handle) {
    try {
      handle.close();
    } catch {
      /* already closed */
    }
  }
  handle = null;
  path_ = '';
  process.env.TOMTRADER_DB = ':memory:';
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS quote_cache (
  instrument_id   TEXT PRIMARY KEY,
  payload         TEXT NOT NULL,
  exchange_ts     INTEGER,
  received_at     INTEGER NOT NULL,
  provider        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quote_cache_received ON quote_cache (received_at);

CREATE TABLE IF NOT EXISTS bars_cache (
  instrument_id   TEXT NOT NULL,
  range           TEXT NOT NULL,
  interval        TEXT NOT NULL,
  payload         TEXT NOT NULL,
  last_bar_at     INTEGER,
  received_at     INTEGER NOT NULL,
  provider        TEXT NOT NULL,
  PRIMARY KEY (instrument_id, range, interval)
);

CREATE TABLE IF NOT EXISTS meta_cache (
  instrument_id   TEXT PRIMARY KEY,
  payload         TEXT NOT NULL,
  received_at     INTEGER NOT NULL,
  provider        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_cache (
  query       TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fx_cache (
  base        TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_group (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  instrument_ids  TEXT NOT NULL,
  pinned          TEXT NOT NULL,
  builtin         INTEGER NOT NULL DEFAULT 0,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS holding (
  id             TEXT PRIMARY KEY,
  instrument_id  TEXT NOT NULL,
  quantity       REAL NOT NULL,
  average_cost   REAL NOT NULL,
  currency       TEXT NOT NULL,
  purchased_at   TEXT NOT NULL,
  note           TEXT,
  position       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alert (
  id                 TEXT PRIMARY KEY,
  instrument_id      TEXT NOT NULL,
  condition          TEXT NOT NULL,
  enabled            INTEGER NOT NULL DEFAULT 1,
  cooldown_minutes   INTEGER NOT NULL DEFAULT 30,
  armed              INTEGER NOT NULL DEFAULT 1,
  created_at         INTEGER NOT NULL,
  last_triggered_at  INTEGER,
  triggered_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alert_event (
  id             TEXT PRIMARY KEY,
  alert_id       TEXT NOT NULL,
  instrument_id  TEXT NOT NULL,
  fired_at       INTEGER NOT NULL,
  price          REAL NOT NULL,
  detail         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS alert_event_fired ON alert_event (fired_at DESC);

CREATE TABLE IF NOT EXISTS news_item (
  id           TEXT PRIMARY KEY,
  payload      TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  fetched_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  provider   TEXT NOT NULL,
  op         TEXT NOT NULL,
  outcome    TEXT NOT NULL,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS provider_log_ts ON provider_log (ts DESC);

CREATE TABLE IF NOT EXISTS instrument_registry (
  id          TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function migrate(db: DatabaseSync): void {
  db.exec(SCHEMA);
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('schema_version') as { value: string } | undefined;
  const version = 1;
  if (!row) {
    db.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run('schema_version', String(version));
  }
}

/* ------------------------------------------------------------------ helpers */

export function kvGet(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function kvSet(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function logProviderEvent(provider: string, op: string, outcome: string, detail?: string): void {
  try {
    getDb()
      .prepare('INSERT INTO provider_log (ts, provider, op, outcome, detail) VALUES (?, ?, ?, ?, ?)')
      .run(Date.now(), provider, op, outcome, detail ?? null);
    // keep the log bounded
    getDb().prepare('DELETE FROM provider_log WHERE id < (SELECT MAX(id) - 2000 FROM provider_log)').run();
  } catch {
    /* logging must never break a data path */
  }
}

export function recentProviderEvents(limit = 60): { ts: number; provider: string; op: string; outcome: string; detail: string | null }[] {
  return getDb()
    .prepare('SELECT ts, provider, op, outcome, detail FROM provider_log ORDER BY ts DESC LIMIT ?')
    .all(limit) as never;
}
