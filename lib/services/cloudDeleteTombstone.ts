import type { AuctionDB } from "@/lib/db";

/** Call when intentionally restoring an event (import / replace) with this sync id. */
export async function forgetDeletedCloudEventSyncId(
  db: AuctionDB,
  eventSyncId: string
): Promise<void> {
  const id = eventSyncId.trim();
  if (!id) return;
  await db.deletedCloudSyncTombstones.delete(id);
}

export async function isCloudEventSyncIdTombstoned(
  db: AuctionDB,
  eventSyncId: string
): Promise<boolean> {
  const id = eventSyncId.trim();
  if (!id) return false;
  const row = await db.deletedCloudSyncTombstones.get(id);
  return row != null;
}
