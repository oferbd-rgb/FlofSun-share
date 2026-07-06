import { describe, expect, it } from "vitest";
import { minutesToIntervalIndex } from "./appState";

describe("minutesToIntervalIndex", () => {
  it("maps 00:00 to index 0 and 00:30 to index 1", () => {
    expect(minutesToIntervalIndex(0)).toBe(0);
    expect(minutesToIntervalIndex(30)).toBe(1);
  });

  it("maps the last half-hour of the day (23:30) to index 47", () => {
    expect(minutesToIntervalIndex(23 * 60 + 30)).toBe(47);
  });

  it("stays within a half-hour window for any minute inside it", () => {
    expect(minutesToIntervalIndex(8 * 60)).toBe(16);
    expect(minutesToIntervalIndex(8 * 60 + 29)).toBe(16);
  });

  it("wraps values past 24h back into range (local solar time can exceed 1440 for extreme longitudes)", () => {
    expect(minutesToIntervalIndex(24 * 60)).toBe(0);
    expect(minutesToIntervalIndex(25 * 60)).toBe(2);
  });

  it("wraps negative values into range too", () => {
    expect(minutesToIntervalIndex(-30)).toBe(47);
    expect(minutesToIntervalIndex(-1)).toBe(47);
  });
});
