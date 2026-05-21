/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  readStickyConsignor,
  readSuggestNextLot,
  writeStickyConsignor,
  writeSuggestNextLot,
} from "./clerkFormPrefs";

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("readSuggestNextLot / writeSuggestNextLot", () => {
  it("defaults to true", () => {
    expect(readSuggestNextLot()).toBe(true);
  });

  it("persists false and reads it back", () => {
    writeSuggestNextLot(false);
    expect(readSuggestNextLot()).toBe(false);
  });

  it("clears the override when set back to true", () => {
    writeSuggestNextLot(false);
    writeSuggestNextLot(true);
    expect(readSuggestNextLot()).toBe(true);
  });
});

describe("readStickyConsignor / writeStickyConsignor", () => {
  it("defaults to true (sticky)", () => {
    expect(readStickyConsignor()).toBe(true);
  });

  it("persists false (legacy reset behavior)", () => {
    writeStickyConsignor(false);
    expect(readStickyConsignor()).toBe(false);
  });

  it("clears the override when set back to true", () => {
    writeStickyConsignor(false);
    writeStickyConsignor(true);
    expect(readStickyConsignor()).toBe(true);
  });

  it("is independent of suggestNextLot", () => {
    writeStickyConsignor(false);
    writeSuggestNextLot(false);
    expect(readStickyConsignor()).toBe(false);
    expect(readSuggestNextLot()).toBe(false);

    writeStickyConsignor(true);
    expect(readStickyConsignor()).toBe(true);
    expect(readSuggestNextLot()).toBe(false);
  });
});
