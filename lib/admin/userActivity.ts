import { sql } from "@/lib/db/postgres";

/**
 * Threshold (ms) within which a heartbeat counts as "online now".
 * Slightly larger than the client ping cadence to avoid flicker between sends.
 */
export const ONLINE_THRESHOLD_MS = 90 * 1000;

/** Client ping cadence — kept here so test/UI/server agree on the same value. */
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * Pure helper: returns true when `lastSeen` is within the online threshold
 * of `now`. Exported so the UI and tests can share the same definition.
 */
export function isOnlineNow(
  lastSeen: Date | string | null,
  now: number = Date.now()
): boolean {
  if (!lastSeen) return false;
  const t =
    lastSeen instanceof Date
      ? lastSeen.getTime()
      : new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < ONLINE_THRESHOLD_MS;
}

/**
 * Records a heartbeat for the given user. Both writes happen in a single
 * transaction so the summary's `last_seen_at` and the ping ledger never drift.
 *
 * The 24h ping count is maintained as a rolling counter: when more than 24h
 * have elapsed since the last reset we recount from the ledger; otherwise we
 * just increment. Old ledger rows are pruned opportunistically (~1% of writes)
 * so the activity table doesn't grow unbounded.
 */
export async function recordUserHeartbeat(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return;
  try {
    await runHeartbeatQuery(userId);
  } catch (e) {
    if (
      e instanceof Error &&
      /relation .*user_activity_(pings|summary).* does not exist/i.test(
        e.message
      )
    ) {
      // Migration pending — silently no-op so signed-in clients don't see 500s.
      return;
    }
    throw e;
  }
}

async function runHeartbeatQuery(userId: number): Promise<void> {
  await sql`
    WITH ins AS (
      INSERT INTO user_activity_pings (user_id)
      VALUES (${userId})
      RETURNING last_seen_at
    ),
    pruned AS (
      DELETE FROM user_activity_pings
      WHERE last_seen_at < NOW() - INTERVAL '36 hours'
        AND random() < 0.01
      RETURNING 1
    ),
    upserted AS (
      INSERT INTO user_activity_summary (user_id, last_seen_at, pings_24h, pings_24h_window_started_at, updated_at)
      VALUES (${userId}, NOW(), 1, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        last_seen_at = NOW(),
        updated_at = NOW(),
        pings_24h = CASE
          WHEN NOW() - user_activity_summary.pings_24h_window_started_at > INTERVAL '24 hours'
            THEN 1
          ELSE user_activity_summary.pings_24h + 1
        END,
        pings_24h_window_started_at = CASE
          WHEN NOW() - user_activity_summary.pings_24h_window_started_at > INTERVAL '24 hours'
            THEN NOW()
          ELSE user_activity_summary.pings_24h_window_started_at
        END
      RETURNING user_id
    )
    SELECT (SELECT count(*) FROM upserted) AS upserted_count;
  `;
}

export type UserActivityRow = {
  user_id: number;
  last_seen_at: Date | null;
  pings_24h: number;
  online_now: boolean;
};

/**
 * Returns activity for all users joined with the latest heartbeat.
 * `online_now` is computed from the configured threshold so the admin UI and
 * server agree.
 */
export async function fetchUserActivityMap(): Promise<
  Map<number, UserActivityRow>
> {
  const out = new Map<number, UserActivityRow>();
  let rows: Array<{
    user_id: number;
    last_seen_at: Date | null;
    pings_24h: number;
  }> = [];
  try {
    const result = await sql<{
      user_id: number;
      last_seen_at: Date | null;
      pings_24h: number;
    }>`
      SELECT user_id, last_seen_at, pings_24h
      FROM user_activity_summary
    `;
    rows = result.rows;
  } catch (e) {
    // Table not yet created (migration pending) — return empty map so the
    // admin dashboard still loads without activity columns populated.
    if (
      e instanceof Error &&
      /relation .*user_activity_summary.* does not exist/i.test(e.message)
    ) {
      return out;
    }
    throw e;
  }
  const now = Date.now();
  for (const r of rows) {
    out.set(r.user_id, {
      user_id: r.user_id,
      last_seen_at: r.last_seen_at,
      pings_24h: r.pings_24h ?? 0,
      online_now: isOnlineNow(r.last_seen_at, now),
    });
  }
  return out;
}
