import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { sql } from "@/lib/db/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const vendorId = parseInt(session.user.vendorId, 10);
    if (!Number.isFinite(vendorId)) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const syncId = searchParams.get("syncId")?.trim();
    if (!syncId || !UUID_RE.test(syncId)) {
      return NextResponse.json(
        { error: "syncId query (UUID) is required." },
        { status: 400 }
      );
    }

    const { rows } = await sql<{ payload: unknown; updated_at: Date }>`
      SELECT payload, updated_at
      FROM event_cloud_snapshots
      WHERE vendor_id = ${vendorId} AND event_sync_id = ${syncId}::uuid
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({
      payload: row.payload,
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  } catch (e) {
    console.error("[sync/event]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("event_cloud_snapshots") || msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error:
            "Database is missing cloud sync tables. Run db/migrate_cloud_sync.sql in Neon.",
        },
        { status: 503 }
      );
    }
    if (msg.includes("vendor_id")) {
      return NextResponse.json(
        {
          error:
            "Database needs migration for shared organization backups. Run db/migrate_multi_user_org.sql in Neon.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Could not load backup." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const vendorId = parseInt(session.user.vendorId, 10);
    if (!Number.isFinite(vendorId)) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const syncId = searchParams.get("syncId")?.trim();
    if (!syncId || !UUID_RE.test(syncId)) {
      return NextResponse.json(
        { error: "syncId query (UUID) is required." },
        { status: 400 }
      );
    }

    await sql`
      DELETE FROM event_sync_ops
      WHERE vendor_id = ${vendorId} AND event_sync_id = ${syncId}::uuid
    `;
    await sql`
      DELETE FROM event_cloud_snapshots
      WHERE vendor_id = ${vendorId} AND event_sync_id = ${syncId}::uuid
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sync/event DELETE]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("event_cloud_snapshots") || msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error:
            "Database is missing cloud sync tables. Run db/migrate_cloud_sync.sql in Neon.",
        },
        { status: 503 }
      );
    }
    if (msg.includes("vendor_id")) {
      return NextResponse.json(
        {
          error:
            "Database needs migration for shared organization backups. Run db/migrate_multi_user_org.sql in Neon.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Could not delete backup." },
      { status: 500 }
    );
  }
}
