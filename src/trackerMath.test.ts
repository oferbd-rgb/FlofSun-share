import { describe, expect, it } from "vitest";
import { axisYawDeg, computeTrackerRotationDeg, rowOffsetToWorldXZ } from "./trackerMath";

describe("computeTrackerRotationDeg", () => {
  it("returns 0 when the sun is exactly along the axis bearing, at any elevation", () => {
    expect(computeTrackerRotationDeg(0, 45, 0, 60)).toBeCloseTo(0);
    expect(computeTrackerRotationDeg(0, 10, 0, 60)).toBeCloseTo(0);
  });

  it("for a default north-south axis (0deg), rotates negative (east-facing) in the morning and positive (west-facing) in the afternoon", () => {
    // Sun in the east (morning).
    expect(computeTrackerRotationDeg(90, 30, 0, 60)).toBeLessThan(0);
    // Sun in the west (afternoon).
    expect(computeTrackerRotationDeg(270, 30, 0, 60)).toBeGreaterThan(0);
  });

  it("is symmetric for mirrored east/west sun positions", () => {
    const east = computeTrackerRotationDeg(60, 30, 0, 60);
    const west = computeTrackerRotationDeg(300, 30, 0, 60);
    expect(west).toBeCloseTo(-east);
  });

  it("clamps to maxRotationDeg near sunrise/sunset when the ideal angle would exceed it", () => {
    const rotation = computeTrackerRotationDeg(90, 2, 0, 60);
    expect(rotation).toBeCloseTo(-60);
  });

  it("clamps to a smaller limit when maxRotationDeg is tighter", () => {
    const rotation = computeTrackerRotationDeg(90, 2, 0, 45);
    expect(rotation).toBeCloseTo(-45);
  });

  it("shifts which sun azimuth gives zero rotation when the axis bearing is not north-south", () => {
    // A 90deg (east-west) axis is "facing" the sun (rotation 0) when the sun is due east.
    expect(computeTrackerRotationDeg(90, 40, 90, 60)).toBeCloseTo(0);
  });
});

describe("rowOffsetToWorldXZ", () => {
  it("spreads rows along +X (east) for the default north-south axis (0deg)", () => {
    expect(rowOffsetToWorldXZ(5, 0)).toMatchObject({ x: expect.closeTo(5), z: expect.closeTo(0) });
  });

  it("spreads rows along +Z (south) for an east-west axis (90deg)", () => {
    const { x, z } = rowOffsetToWorldXZ(5, 90);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(5);
  });
});

describe("axisYawDeg", () => {
  it("is 180deg (a visual no-op for a symmetric row) for the default north-south axis", () => {
    expect(axisYawDeg(0)).toBeCloseTo(180);
  });

  it("is 0deg for an axis bearing of 180 (due south)", () => {
    expect(axisYawDeg(180)).toBeCloseTo(0);
  });
});
