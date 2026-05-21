import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { recordUserHeartbeat } from "@/lib/admin/userActivity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight heartbeat used by the admin "active users" dashboard.
 * Called every ~60s by the client while the tab is visible. Returns 204 on
 * success so we don't waste bytes on a body the client ignores.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const userId = parseInt(String(session.user.id), 10);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }
    await recordUserHeartbeat(userId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[admin/heartbeat]", e);
    return NextResponse.json(
      { error: "Heartbeat failed." },
      { status: 500 }
    );
  }
}
