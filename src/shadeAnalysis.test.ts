import { describe, expect, it } from "vitest";
import { computeShadeMatrix } from "./shadeAnalysis";
import { createClearSkyIrradianceProvider } from "./irradiance";

const TEL_AVIV_SUMMER_SOLSTICE = { year: 2026, month: 6, day: 21 };

function baseParams() {
  return {
    dateState: TEL_AVIV_SUMMER_SOLSTICE,
    latitude: 32.08,
    longitude: 34.78,
    axisAzimuthDeg: 0,
    maxRotationDeg: 60,
    moduleLengthM: 2.5,
    hubHeightM: 3,
    rowSpacingM: 7.5,
    rowCount: 4,
    getTrackingModeAt: () => "track" as const,
    irradianceProvider: createClearSkyIrradianceProvider(),
    xMin: -30,
    xMax: 30,
    xBucketCount: 60,
    timeStepMinutes: 30,
  };
}

describe("computeShadeMatrix", () => {
  it("returns arrays with the requested dimensions", () => {
    const result = computeShadeMatrix(baseParams());
    expect(result.xEdges).toHaveLength(61); // xBucketCount + 1
    expect(result.timeMinutes).toHaveLength(48); // 24h / 30min
    expect(result.shaded).toHaveLength(48);
    for (const row of result.shaded) {
      expect(row).toHaveLength(60);
    }
    expect(result.sunUp).toHaveLength(48);
  });

  it("has both day and night samples for a non-polar site/date", () => {
    const result = computeShadeMatrix(baseParams());
    expect(result.sunUp.some((up) => up)).toBe(true);
    expect(result.sunUp.some((up) => !up)).toBe(true);
  });

  it("never marks a ground point shaded while the sun is below the horizon", () => {
    const result = computeShadeMatrix(baseParams());
    result.sunUp.forEach((up, i) => {
      if (!up) {
        expect(result.shaded[i].every((cell) => cell === false)).toBe(true);
      }
    });
  });

  it("shows some daytime shading somewhere in the field (rows do cast shadows during the day)", () => {
    const result = computeShadeMatrix(baseParams());
    const anyDaytimeShade = result.shaded.some((row, i) => result.sunUp[i] && row.some((cell) => cell));
    expect(anyDaytimeShade).toBe(true);
  });

  it("xEdges spans exactly [xMin, xMax]", () => {
    const result = computeShadeMatrix(baseParams());
    expect(result.xEdges[0]).toBeCloseTo(-30);
    expect(result.xEdges[result.xEdges.length - 1]).toBeCloseTo(30);
  });

  it("percentOfGHI is 0 whenever the sun is below the horizon", () => {
    const result = computeShadeMatrix(baseParams());
    result.sunUp.forEach((up, i) => {
      if (!up) {
        expect(result.percentOfGHI[i].every((cell) => cell === 0)).toBe(true);
      }
    });
  });

  it("percentOfGHI is exactly 100 wherever shaded is false", () => {
    const result = computeShadeMatrix(baseParams());
    result.shaded.forEach((row, ti) => {
      row.forEach((isShaded, xi) => {
        if (!isShaded && result.sunUp[ti]) {
          expect(result.percentOfGHI[ti][xi]).toBe(100);
        }
      });
    });
  });

  it("percentOfGHI is strictly between 0 and 100 wherever shaded is true", () => {
    const result = computeShadeMatrix(baseParams());
    let sawShadedPoint = false;
    result.shaded.forEach((row, ti) => {
      row.forEach((isShaded, xi) => {
        if (isShaded) {
          sawShadedPoint = true;
          expect(result.percentOfGHI[ti][xi]).toBeGreaterThan(0);
          expect(result.percentOfGHI[ti][xi]).toBeLessThan(100);
        }
      });
    });
    expect(sawShadedPoint).toBe(true);
  });
});
