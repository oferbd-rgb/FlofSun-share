import { describe, expect, it } from "vitest";
import {
  computeAntiTrackingRotationDeg,
  computeFieldHalfWidthM,
  computeRowShadowIntervalX,
  computeRowShadowZShift,
  computeRowWorldXPositions,
  computeShadowFootprintWidthM,
  computeSolarAngleDeg,
  computeTrackerRotationDeg,
  stepTowardDeg,
} from "./trackerMath";

describe("computeRowWorldXPositions", () => {
  it("centers rows symmetrically around X=0", () => {
    expect(computeRowWorldXPositions(4, 7.5)).toEqual([-11.25, -3.75, 3.75, 11.25]);
  });

  it("places a single row exactly at X=0", () => {
    expect(computeRowWorldXPositions(1, 7.5)).toEqual([0]);
  });
});

describe("computeRowShadowZShift", () => {
  it("is zero when the sun is due east/west (no north-south component)", () => {
    expect(computeRowShadowZShift(3, 0, 0.5)).toBe(0);
  });

  it("is zero when the sun is at or below the horizon", () => {
    expect(computeRowShadowZShift(3, 0.5, 0)).toBe(0);
    expect(computeRowShadowZShift(3, 0.5, -0.1)).toBe(0);
  });

  it("shifts further for a lower sun (smaller sunDirY) at the same north-south component", () => {
    const highSun = Math.abs(computeRowShadowZShift(3, 0.3, 0.8));
    const lowSun = Math.abs(computeRowShadowZShift(3, 0.3, 0.2));
    expect(lowSun).toBeGreaterThan(highSun);
  });
});

describe("computeFieldHalfWidthM", () => {
  it("matches the default 4-row, 7.5m-spacing config", () => {
    // Outermost row center sits at 1.5 * 7.5 = 11.25m from center; add one more rowSpacing of
    // margin beyond it: 11.25 + 7.5 = 18.75m.
    expect(computeFieldHalfWidthM(4, 7.5)).toBeCloseTo(18.75);
  });

  it("degenerates to just the margin for a single row", () => {
    expect(computeFieldHalfWidthM(1, 7.5)).toBeCloseTo(7.5);
  });
});

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

describe("computeRowShadowIntervalX", () => {
  it("returns null when the sun is at or below the horizon", () => {
    expect(computeRowShadowIntervalX(0, 2, 3, 0, 1, 0)).toBeNull();
    expect(computeRowShadowIntervalX(0, 2, 3, 0, 1, -0.2)).toBeNull();
  });

  it("centers directly under the row for a flat panel with the sun straight overhead", () => {
    const interval = computeRowShadowIntervalX(0, 2, 3, 10, 0, 1)!;
    expect(interval.startX).toBeCloseTo(9);
    expect(interval.endX).toBeCloseTo(11);
  });

  it("translates by exactly the row's world X offset, all else equal", () => {
    const at0 = computeRowShadowIntervalX(20, 2.5, 3, 0, 0.6, 0.6)!;
    const at10 = computeRowShadowIntervalX(20, 2.5, 3, 10, 0.6, 0.6)!;
    expect(at10.startX).toBeCloseTo(at0.startX + 10);
    expect(at10.endX).toBeCloseTo(at0.endX + 10);
  });

  it("shifts the shadow away from the sun's direction as hub height increases, without changing its width", () => {
    const low = computeRowShadowIntervalX(20, 2.5, 1, 0, 0.7, 0.3)!;
    const high = computeRowShadowIntervalX(20, 2.5, 6, 0, 0.7, 0.3)!;
    // Sun to the east (positive sunDirX) casts the shadow to the west (more negative X) the
    // higher off the ground the panel is.
    expect(high.startX).toBeLessThan(low.startX);
    expect(high.endX - high.startX).toBeCloseTo(low.endX - low.startX);
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
