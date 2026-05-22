CREATE TABLE IF NOT EXISTS dashboard_state (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
