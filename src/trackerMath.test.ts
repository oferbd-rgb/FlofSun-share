import { describe, expect, it } from "vitest";
import {
  computeAntiTrackingRotationDeg,
  computeShadowFootprintWidthM,
  computeSolarAngleDeg,
  computeTrackerRotationDeg,
  stepTowardDeg,
} from "./trackerMath";

describe("computeSolarAngleDeg", () => {
  it("is not clamped to any tracker mechanical limit, unlike computeTrackerRotationDeg", () => {
    // Low morning sun implies an ideal angle well past a typical 60deg tracker limit.
    const solarAngle = computeSolarAngleDeg(90, 2, 0);
    expect(Math.abs(solarAngle)).toBeGreaterThan(60);
    // The clamped tracker angle for the same inputs stays within the limit.
    expect(computeTrackerRotationDeg(90, 2, 0, 60)).toBeCloseTo(-60);
  });

  it("agrees with computeTrackerRotationDeg whenever the ideal angle is within the limit", () => {
    expect(computeSolarAngleDeg(90, 30, 0)).toBeCloseTo(computeTrackerRotationDeg(90, 30, 0, 60));
  });
});

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

describe("computeShadowFootprintWidthM", () => {
  it("returns 0 when the sun is at or below the horizon", () => {
    expect(computeShadowFootprintWidthM(20, 2, 1, 0)).toBe(0);
    expect(computeShadowFootprintWidthM(20, 2, 1, -0.5)).toBe(0);
  });

  it("returns the full module length for a flat panel with the sun straight overhead", () => {
    expect(computeShadowFootprintWidthM(0, 2, 0, 1)).toBeCloseTo(2);
  });

  it("returns ~0 for a vertical panel with the sun straight overhead (its edge points at the sun)", () => {
    expect(computeShadowFootprintWidthM(90, 2, 0, 1)).toBeCloseTo(0);
  });

  it("is ~0 when the panel is edge-on to the sun (rotation angle matches the sun's incidence angle)", () => {
    // Sun direction (1,1) is a 45deg angle; a panel rotated +45deg is exactly edge-on to it.
    expect(computeShadowFootprintWidthM(45, 2, 1, 1)).toBeCloseTo(0);
  });

  it("is large when the panel instead faces mostly toward that same sun", () => {
    const edgeOn = computeShadowFootprintWidthM(45, 2, 1, 1);
    const facing = computeShadowFootprintWidthM(-45, 2, 1, 1);
    expect(facing).toBeGreaterThan(edgeOn);
  });
});

describe("computeAntiTrackingRotationDeg", () => {
  it("picks whichever +-90deg (clamped) candidate has the smaller shadow footprint", () => {
    // tracking angle -45, max 45: east candidate clamps to -45 (large footprint facing this
    // sun), west candidate clamps to +45 (~0 footprint, edge-on to this sun) — see the
    // computeShadowFootprintWidthM cases above.
    expect(computeAntiTrackingRotationDeg(-45, 45, 2, 1, 1)).toBeCloseTo(45);
  });

  it("stays within the mechanical rotation limit", () => {
    const result = computeAntiTrackingRotationDeg(10, 60, 2.5, 0.5, 0.5);
    expect(result).toBeGreaterThanOrEqual(-60);
    expect(result).toBeLessThanOrEqual(60);
  });
});

describe("stepTowardDeg", () => {
  it("reaches the target directly when it's within the step limit", () => {
    expect(stepTowardDeg(10, 12, 5)).toBeCloseTo(12);
    expect(stepTowardDeg(10, 10, 5)).toBeCloseTo(10);
  });

  it("moves only by maxStepDeg, toward the target, when the target is farther away", () => {
    expect(stepTowardDeg(0, 100, 5)).toBeCloseTo(5);
    expect(stepTowardDeg(0, -100, 5)).toBeCloseTo(-5);
  });

  it("never overshoots the target even when maxStepDeg is much larger than the gap", () => {
    expect(stepTowardDeg(10, 12, 1000)).toBeCloseTo(12);
  });

  it("with maxStepDeg 0, doesn't move at all unless already at the target", () => {
    expect(stepTowardDeg(10, 50, 0)).toBeCloseTo(10);
    expect(stepTowardDeg(10, 10, 0)).toBeCloseTo(10);
  });
});
