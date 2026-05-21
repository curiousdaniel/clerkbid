import { sql } from "@/lib/db/postgres";
import { fetchUserActivityMap } from "@/lib/admin/userActivity";

export type AdminUserRow = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
  vendor_id: number;
  vendor_name: string;
  vendor_slug: string;
  synced_events: number;
  total_lots: string;
  total_bidders: string;
  total_consignors: string;
  total_sales: string;
  total_invoices: string;
  /** Sum of invoice `total` across all events for this user's vendor (cloud snapshots). */
  invoice_total_sum: string;
  last_cloud_sync: Date | null;
  /** True when `last_seen_at` is within the online threshold. */
  online_now: boolean;
  last_seen_at: Date | null;
  /** Heartbeat count in the rolling 24h window. */
  pings_24h: number;
};

/**
 * Aggregates from `event_cloud_snapshots` JSONB only (not local-only IndexedDB data).
 * Joins with `user_activity_summary` so the dashboard can show "online now"
 * and the rolling 24h heartbeat count alongside the cloud counts.
 */
export async function fetchAdminUserList(): Promise<AdminUserRow[]> {
  const { rows } = await sql<
    Omit<AdminUserRow, "online_now" | "last_seen_at" | "pings_24h">
  >`
    SELECT
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.created_at,
      v.id AS vendor_id,
      v.name AS vendor_name,
      v.slug AS vendor_slug,
      COUNT(ecs.id)::int AS synced_events,
      COALESCE(
        SUM(
          CASE
            WHEN jsonb_typeof(ecs.payload->'lots') = 'array'
            THEN jsonb_array_length(ecs.payload->'lots')
            ELSE 0
          END
        ),
        0
      )::text AS total_lots,
      COALESCE(
        SUM(
          CASE
            WHEN jsonb_typeof(ecs.payload->'bidders') = 'array'
            THEN jsonb_array_length(ecs.payload->'bidders')
            ELSE 0
          END
        ),
        0
      )::text AS total_bidders,
      COALESCE(
        SUM(
          CASE
            WHEN jsonb_typeof(ecs.payload->'consignors') = 'array'
            THEN jsonb_array_length(ecs.payload->'consignors')
            ELSE 0
          END
        ),
        0
      )::text AS total_consignors,
      COALESCE(
        SUM(
          CASE
            WHEN jsonb_typeof(ecs.payload->'sales') = 'array'
            THEN jsonb_array_length(ecs.payload->'sales')
            ELSE 0
          END
        ),
        0
      )::text AS total_sales,
      COALESCE(
        SUM(
          CASE
            WHEN jsonb_typeof(ecs.payload->'invoices') = 'array'
            THEN jsonb_array_length(ecs.payload->'invoices')
            ELSE 0
          END
        ),
        0
      )::text AS total_invoices,
      COALESCE(
        ROUND(
          SUM(
            CASE
              WHEN jsonb_typeof(ecs.payload->'invoices') = 'array' THEN (
                SELECT COALESCE(SUM((inv->>'total')::numeric), 0)
                FROM jsonb_array_elements(ecs.payload->'invoices') AS inv
                WHERE jsonb_typeof(inv->'total') IN ('number', 'string')
              )
              ELSE 0
            END
          )::numeric,
          2
        ),
        0
      )::text AS invoice_total_sum,
      MAX(ecs.updated_at) AS last_cloud_sync
    FROM users u
    INNER JOIN vendors v ON v.id = u.vendor_id
    LEFT JOIN event_cloud_snapshots ecs ON ecs.vendor_id = u.vendor_id
    GROUP BY
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.created_at,
      v.id,
      v.name,
      v.slug
    ORDER BY u.id ASC
  `;
  const activity = await fetchUserActivityMap();
  return rows.map((r) => {
    const a = activity.get(r.id);
    return {
      ...r,
      online_now: a?.online_now ?? false,
      last_seen_at: a?.last_seen_at ?? null,
      pings_24h: a?.pings_24h ?? 0,
    };
  });
}
