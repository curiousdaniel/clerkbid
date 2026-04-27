import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getAuctionDB } from "@/lib/db";
import {
  forgetDeletedCloudEventSyncId,
  isCloudEventSyncIdTombstoned,
} from "@/lib/services/cloudDeleteTombstone";

const TEST_USER = "tombstone-test-user";
const SAMPLE_SYNC_ID = "a0000000-0000-4000-8000-000000000001";

describe("cloudDeleteTombstone", () => {
  beforeEach(async () => {
    const db = getAuctionDB(TEST_USER);
    await db.delete();
  });

  it("tracks and clears tombstones for a sync id", async () => {
    const db = getAuctionDB(TEST_USER);
    await db.open();
    expect(await isCloudEventSyncIdTombstoned(db, SAMPLE_SYNC_ID)).toBe(false);
    await db.deletedCloudSyncTombstones.put({
      eventSyncId: SAMPLE_SYNC_ID,
      deletedAt: new Date(),
    });
    expect(await isCloudEventSyncIdTombstoned(db, SAMPLE_SYNC_ID)).toBe(true);
    await forgetDeletedCloudEventSyncId(db, SAMPLE_SYNC_ID);
    expect(await isCloudEventSyncIdTombstoned(db, SAMPLE_SYNC_ID)).toBe(false);
  });
});
