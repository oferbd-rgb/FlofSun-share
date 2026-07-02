import { describe, expect, it } from "vitest";
import { computeTrackerRotationDeg } from "./trackerMath";

describe("computeTrackerRotationDeg", () => {
  it("returns 0 when the sun is due south (behind the axis) at any elevation", () => {
    expect(computeTrackerRotationDeg(180, 45, 180, 60)).toBeCloseTo(0);
    expect(computeTrackerRotationDeg(180, 10, 180, 60)).toBeCloseTo(0);
  });

  it("rotates east (negative) when the sun is in the east and west (positive) when in the west", () => {
    // Sun in the east (morning) relative to a south-facing axis.
    expect(computeTrackerRotationDeg(90, 30, 180, 60)).toBeLessThan(0);
    // Sun in the west (afternoon) relative to a south-facing axis.
    expect(computeTrackerRotationDeg(270, 30, 180, 60)).toBeGreaterThan(0);
  });

  it("is symmetric for mirrored east/west sun positions", () => {
    const east = computeTrackerRotationDeg(120, 30, 180, 60);
    const west = computeTrackerRotationDeg(240, 30, 180, 60);
    expect(west).toBeCloseTo(-east);
  });

  it("clamps to maxRotationDeg near sunrise/sunset when the ideal angle would exceed it", () => {
    const rotation = computeTrackerRotationDeg(90, 2, 180, 60);
    expect(rotation).toBeCloseTo(-60);
  });

  it("clamps to a smaller limit when maxRotationDeg is tighter", () => {
    const rotation = computeTrackerRotationDeg(90, 2, 180, 45);
    expect(rotation).toBeCloseTo(-45);
  });
});
