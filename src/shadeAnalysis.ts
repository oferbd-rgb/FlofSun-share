// Pure math — no three.js dependency (deliberately recomputes the sun direction's X/Y
// components inline rather than importing sunPosition.ts's sunAzElToVector3, which returns a
// three.js Vector3 — same reasoning as trackerMath.ts's sunDirX/sunDirY parameters).
import type { DateState } from "./appState";
import { getSunAngles, localSolarTimeToDate } from "./sunPosition";
import {
  computeAntiTrackingRotationDeg,
  computeRowShadowIntervalX,
  computeTrackerRotationDeg,
  type ShadowInterval,
} from "./trackerMath";

const DEG2RAD = Math.PI / 180;

export type TrackingModeAt = (minutesSinceMidnight: number) => "track" | "anti-track";

export interface ShadeMatrixParams {
  dateState: DateState;
  latitude: number;
  longitude: number;
  axisAzimuthDeg: number;
  maxRotationDeg: number;
  moduleLengthM: number;
  hubHeightM: number;
  rowSpacingM: number;
  rowCount: number;
  getTrackingModeAt: TrackingModeAt;
  xMin: number;
  xMax: number;
  xBucketCount: number;
  timeStepMinutes: number;
}

export interface ShadeMatrixResult {
  xEdges: number[]; // length xBucketCount + 1, bucket boundaries in meters (ground east-west)
  timeMinutes: number[]; // sample times, local-solar minutes since midnight
  shaded: boolean[][]; // [timeIndex][xIndex] — true = in a row's shadow, false = sunlit
  sunUp: boolean[]; // per time sample — false = below horizon (no direct sun anywhere)
}

function rowWorldXPositions(rowCount: number, rowSpacingM: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    positions.push((i - (rowCount - 1) / 2) * rowSpacingM);
  }
  return positions;
}

function isWithin(x: number, interval: ShadowInterval): boolean {
  return x >= interval.startX && x <= interval.endX;
}

// Builds the binary (shaded/sunlit) ground heatmap: for every time sample across the day and
// every ground-position bucket along the east-west axis, whether that point is in the shadow
// of any tracker row at that moment. Uses the deterministic tracking/anti-tracking angle for
// each moment (same formulas as main.ts's render loop) rather than the live, rate-limited
// rotation — this report describes a fixed, reproducible outcome for the given settings, not a
// snapshot of in-progress animation.
export function computeShadeMatrix(params: ShadeMatrixParams): ShadeMatrixResult {
  const {
    dateState,
    latitude,
    longitude,
    axisAzimuthDeg,
    maxRotationDeg,
    moduleLengthM,
    hubHeightM,
    rowSpacingM,
    rowCount,
    getTrackingModeAt,
    xMin,
    xMax,
    xBucketCount,
    timeStepMinutes,
  } = params;

  const xEdges: number[] = [];
  for (let i = 0; i <= xBucketCount; i++) {
    xEdges.push(xMin + ((xMax - xMin) * i) / xBucketCount);
  }
  const xCenters = xEdges.slice(0, xBucketCount).map((edge, i) => (edge + xEdges[i + 1]) / 2);

  const rowXs = rowWorldXPositions(rowCount, rowSpacingM);

  const timeMinutes: number[] = [];
  const shaded: boolean[][] = [];
  const sunUp: boolean[] = [];

  for (let minutes = 0; minutes < 24 * 60; minutes += timeStepMinutes) {
    timeMinutes.push(minutes);
    const date = localSolarTimeToDate(dateState, minutes, longitude);
    const { azimuthDeg, altitudeDeg } = getSunAngles(date, latitude, longitude);
    const isSunUp = altitudeDeg > 0;
    sunUp.push(isSunUp);

    const row = new Array<boolean>(xBucketCount).fill(false);
    if (isSunUp) {
      const azRad = azimuthDeg * DEG2RAD;
      const elRad = altitudeDeg * DEG2RAD;
      const sunDirX = Math.sin(azRad) * Math.cos(elRad);
      const sunDirY = Math.sin(elRad);

      const trackingAngleDeg = computeTrackerRotationDeg(azimuthDeg, altitudeDeg, axisAzimuthDeg, maxRotationDeg);
      const rotationDeg =
        getTrackingModeAt(minutes) === "track"
          ? trackingAngleDeg
          : computeAntiTrackingRotationDeg(trackingAngleDeg, maxRotationDeg, moduleLengthM, sunDirX, sunDirY);

      const intervals = rowXs
        .map((rowX) => computeRowShadowIntervalX(rotationDeg, moduleLengthM, hubHeightM, rowX, sunDirX, sunDirY))
        .filter((interval): interval is ShadowInterval => interval !== null);

      for (let xi = 0; xi < xBucketCount; xi++) {
        row[xi] = intervals.some((interval) => isWithin(xCenters[xi], interval));
      }
    }
    shaded.push(row);
  }

  return { xEdges, timeMinutes, shaded, sunUp };
}
