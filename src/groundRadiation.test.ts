import { describe, expect, it } from "vitest";
import { computeGroundRadiationGrid, computeRowLengthM } from "./groundRadiation";

describe("computeRowLengthM", () => {
  it("matches the default 15-module, 1.1m-width, 0.05m-gap config", () => {
    // 15*1.1 + 14*0.05 = 16.5 + 0.7 = 17.2
    expect(computeRowLengthM(15, 1.1, 0.05)).toBeCloseTo(17.2);
  });
});

// A single flat (rotationDeg=0) row directly under a straight-up sun (sunDirY=1) is a simple,
// hand-checkable scenario: the shadow sits exactly below the panel ([-halfLength, +halfLength]
// around the row), and the view-factor-to-sky pattern is symmetric around the row's center.
function baseParams() {
  return {
    rowCount: 1,
    rowSpacingM: 7.5,
    moduleLengthM: 2.5,
    hubHeightM: 3,
    rotationDeg: 0,
    sunDirX: 0,
    sunDirY: 1,
    sunDirZ: 0,
    dni: 800,
    dhi: 100,
    xMin: -10,
    xMax: 10,
    xStepM: 0.1,
    zMin: -2,
    zMax: 2,
    zStepM: 0.5,
  };
}

describe("computeGroundRadiationGrid", () => {
  it("returns all zeros when the sun is at or below the horizon", () => {
    const result = computeGroundRadiationGrid({ ...baseParams(), sunDirY: 0 });
    for (const row of result.percentOfGHI) {
      expect(row.every((v) => v === 0)).toBe(true);
    }
  });

  it("gives 100% far away from the row, outside any shadow", () => {
    const result = computeGroundRadiationGrid(baseParams());
    const farXIndex = result.xCenters.findIndex((x) => x > 9);
    expect(result.percentOfGHI[Math.floor(result.percentOfGHI.length / 2)][farXIndex]).toBe(100);
  });

  it("is below 100% directly beneath the flat panel (shaded), and symmetric around the row center", () => {
    const result = computeGroundRadiationGrid(baseParams());
    const midZIndex = Math.floor(result.percentOfGHI.length / 2);
    // xCenters is built by uniform stepping across a symmetric [xMin, xMax] range, so it has an
    // even length and index i mirrors index (length-1-i) exactly, regardless of float rounding on
    // any individual center's value — more robust than hunting for an approximate x value.
    const n = result.xCenters.length;
    const centerValue = result.percentOfGHI[midZIndex][Math.floor(n / 2)];
    expect(centerValue).toBeGreaterThan(0);
    expect(centerValue).toBeLessThan(100);

    const offset = 10; // an arbitrary pair of mirrored indices, away from dead-center
    const leftValue = result.percentOfGHI[midZIndex][Math.floor(n / 2) - offset];
    const rightValue = result.percentOfGHI[midZIndex][Math.floor(n / 2) - 1 + offset];
    expect(leftValue).toBeCloseTo(rightValue, 5);
  });

  it("matches the analytical view factor directly under a flat panel's center", () => {
    const { hubHeightM, moduleLengthM, dni, dhi } = baseParams();
    const result = computeGroundRadiationGrid(baseParams());
    const midZIndex = Math.floor(result.percentOfGHI.length / 2);
    // Whichever grid center happens to land nearest X=0 — the analytical comparison uses that
    // exact value rather than assuming a center falls precisely on 0.
    const centerXIndex = result.xCenters.reduce(
      (bestI, x, i) => (Math.abs(x) < Math.abs(result.xCenters[bestI]) ? i : bestI),
      0,
    );
    const pointX = result.xCenters[centerXIndex];

    const halfLength = moduleLengthM / 2;
    const s1 = (halfLength - pointX) / Math.hypot(halfLength - pointX, hubHeightM);
    const s2 = (-halfLength - pointX) / Math.hypot(-halfLength - pointX, hubHeightM);
    const expectedViewFactor = 1 - Math.abs(s1 - s2) / 2;
    const expectedPercent = ((expectedViewFactor * dhi) / (dni * 1 + dhi)) * 100;

    expect(result.percentOfGHI[midZIndex][centerXIndex]).toBeCloseTo(expectedPercent, 5);
  });

  it("opens up toward 100% right at and beyond the row's physical Z-end (finite-panel edge correction)", () => {
    const rowLengthM = computeRowLengthM(15, 1.1, 0.05);
    const halfRowLengthM = rowLengthM / 2;
    const result = computeGroundRadiationGrid({
      ...baseParams(),
      zMin: halfRowLengthM - 0.3,
      zMax: halfRowLengthM + 3,
      zStepM: 0.3,
    });
    const centerXIndex = result.xCenters.findIndex((x) => Math.abs(x) < 0.05);
    const valuesAlongZ = result.percentOfGHI.map((row) => row[centerXIndex]);
    // Directly under the panel, sunlight percentage should trend upward (less shading) as Z moves
    // further past the row's actual physical end, since less of the (finite) panel remains able
    // to block the point's view of the sky.
    expect(valuesAlongZ[valuesAlongZ.length - 1]).toBeGreaterThan(valuesAlongZ[0]);
  });

  it("has consistent grid dimensions", () => {
    const result = computeGroundRadiationGrid(baseParams());
    expect(result.xCenters.length).toBeGreaterThan(0);
    expect(result.zCenters.length).toBeGreaterThan(0);
    expect(result.percentOfGHI).toHaveLength(result.zCenters.length);
    for (const row of result.percentOfGHI) {
      expect(row).toHaveLength(result.xCenters.length);
    }
  });
});
