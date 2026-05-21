import { describe, expect, it } from "vitest";
import { isOnlineNow, ONLINE_THRESHOLD_MS } from "./userActivity";

describe("isOnlineNow", () => {
  it("returns false when last seen is null", () => {
    expect(isOnlineNow(null)).toBe(false);
  });

  it("returns true when last seen is within the threshold", () => {
    const now = Date.now();
    const recent = new Date(now - 30_000);
    expect(isOnlineNow(recent, now)).toBe(true);
  });

  it("returns false at the threshold boundary", () => {
    const now = Date.now();
    const exactlyAtCutoff = new Date(now - ONLINE_THRESHOLD_MS);
    expect(isOnlineNow(exactlyAtCutoff, now)).toBe(false);
  });

  it("returns false when last seen is older than the threshold", () => {
    const now = Date.now();
    const stale = new Date(now - ONLINE_THRESHOLD_MS - 1_000);
    expect(isOnlineNow(stale, now)).toBe(false);
  });

  it("accepts ISO date strings", () => {
    const now = Date.now();
    const iso = new Date(now - 5_000).toISOString();
    expect(isOnlineNow(iso, now)).toBe(true);
  });

  it("returns false for malformed date strings", () => {
    expect(isOnlineNow("not-a-date")).toBe(false);
  });
});
