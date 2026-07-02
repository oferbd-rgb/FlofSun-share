import { BufferGeometry, LineBasicMaterial, LineLoop, Vector3 } from "three";
import type { DateState } from "./appState";
import { sunPath as pathCfg } from "./config";
import { getSunAngles, localSolarTimeToDate, sunAzElToVector3 } from "./sunPosition";

export interface SunPath {
  line: LineLoop;
  update(dateState: DateState, latitude: number, longitude: number, radius: number): void;
}

// The sun's full diurnal circle for the given calendar date/site — not just the above-horizon
// arc — sampled at even local-solar-time intervals and projected onto a sphere of `radius`
// using the same az/el-to-vector convention as the sun marker (sunLight.ts), so the ring passes
// exactly through wherever the marker sits at any time of day. Rendered as a closed LineLoop
// (rather than a full 360deg parametric circle) since the sun's actual path is a slightly
// irregular loop, not a perfect circle, except at the equinoxes.
function computePathPoints(dateState: DateState, latitude: number, longitude: number, radius: number): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i < pathCfg.sampleCount; i++) {
    const minutesSinceMidnight = (i / pathCfg.sampleCount) * 24 * 60;
    const date = localSolarTimeToDate(dateState, minutesSinceMidnight, longitude);
    const { azimuthDeg, altitudeDeg } = getSunAngles(date, latitude, longitude);
    points.push(sunAzElToVector3(azimuthDeg, altitudeDeg).multiplyScalar(radius));
  }
  return points;
}

export function createSunPath(dateState: DateState, latitude: number, longitude: number, radius: number): SunPath {
  const geometry = new BufferGeometry().setFromPoints(computePathPoints(dateState, latitude, longitude, radius));
  const material = new LineBasicMaterial({ color: pathCfg.color });
  const line = new LineLoop(geometry, material);

  return {
    line,
    update(nextDateState, nextLatitude, nextLongitude, nextRadius) {
      line.geometry.dispose();
      line.geometry = new BufferGeometry().setFromPoints(
        computePathPoints(nextDateState, nextLatitude, nextLongitude, nextRadius),
      );
    },
  };
}
