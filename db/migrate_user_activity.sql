-- Heartbeat-based activity tracking for the admin dashboard.
-- A small ledger of (user_id, last_seen_at) updated whenever a signed-in client
-- pings /api/admin/heartbeat. We keep the last 24h of distinct event timestamps
-- so the admin dashboard can show "online now" (last_seen within ~60s) and the
-- 24h activity history without growing the table unbounded.
--
-- Run once in Neon (SQL Editor or psql). Reflected in db/schema.sql.

CREATE TABLE IF NOT EXISTS user_activity_pings (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_pings_user_seen
  ON user_activity_pings (user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_pings_seen
  ON user_activity_pings (last_seen_at DESC);

-- Coarse aggregate of "last seen" per user. Updated transactionally by the
-- heartbeat endpoint. Reads on the admin page hit this table directly so
-- computing "online now" is O(users) instead of scanning the ping ledger.
CREATE TABLE IF NOT EXISTS user_activity_summary (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pings_24h INTEGER NOT NULL DEFAULT 0,
  pings_24h_window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_summary_last_seen
  ON user_activity_summary (last_seen_at DESC);
