import { describe, expect, it } from "vitest";
import { sunAzElToVector3 } from "./sunPosition";

describe("sunAzElToVector3", () => {
  it("points north (-Z) when azimuth is due north", () => {
    const v = sunAzElToVector3(0, 45);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeLessThan(0);
  });

  it("points south (+Z) when azimuth is due south", () => {
    const v = sunAzElToVector3(180, 45);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeGreaterThan(0);
  });

  it("points east (+X) when azimuth is due east", () => {
    const v = sunAzElToVector3(90, 45);
    expect(v.x).toBeGreaterThan(0);
    expect(v.z).toBeCloseTo(0);
  });

  it("points west (-X) when azimuth is due west", () => {
    const v = sunAzElToVector3(270, 45);
    expect(v.x).toBeLessThan(0);
    expect(v.z).toBeCloseTo(0);
  });

  it("places a southeast azimuth (e.g. 129.8deg, a real morning sun position in Tel Aviv) in the east+south octant, not east+north", () => {
    // Regression test: this azimuth/altitude pair (from real suncalc output for Tel Aviv,
    // 2026-06-21 09:00 UTC) previously came out with an inverted north/south sign, placing
    // the sun to the north instead of the south.
    const v = sunAzElToVector3(129.8, 77.2);
    expect(v.x).toBeGreaterThan(0);
    expect(v.z).toBeGreaterThan(0);
  });

  it("places a west-northwest azimuth (e.g. 271.6deg, a real afternoon sun position in Tel Aviv) in the west+north octant, not west+south", () => {
    // Regression test companion to the above, for the other sign of the bug.
    const v = sunAzElToVector3(271.6, 45.9);
    expect(v.x).toBeLessThan(0);
    expect(v.z).toBeLessThan(0);
  });
});
