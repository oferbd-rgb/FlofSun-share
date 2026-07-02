import * as SunCalc from "suncalc";
import { Vector3, MathUtils } from "three";
import type { DateState } from "./appState";

export interface SunAngles {
  azimuthDeg: number; // clockwise from north: 0=N, 90=E, 180=S, 270=W
  altitudeDeg: number; // 0=horizon, 90=zenith
}

export function getSunAngles(date: Date, latitude: number, longitude: number): SunAngles {
  const { azimuth, altitude } = SunCalc.getPosition(date, latitude, longitude);
  return { azimuthDeg: azimuth, altitudeDeg: altitude };
}

// World convention: +X = East, +Z = South, +Y = up.
export function sunAzElToVector3(azimuthDeg: number, altitudeDeg: number): Vector3 {
  const azRad = MathUtils.degToRad(azimuthDeg);
  const elRad = MathUtils.degToRad(altitudeDeg);
  return new Vector3(
    Math.sin(azRad) * Math.cos(elRad), // east component
    Math.sin(elRad), // up component
    -Math.cos(azRad) * Math.cos(elRad), // south component (azimuth is clockwise from north, so north = -south)
  );
}

// --- Local solar time ---------------------------------------------------
//
// The slider/clock in this app represents LOCAL SOLAR TIME at the selected site
// (approx. UTC + longitude/15h), not the browser's system timezone and not the site's
// real political/DST timezone. Using system time was a bug: it silently anchored every
// "day" to whatever timezone this machine happens to be set to, which only looked right
// for the default Tel Aviv location because that machine's timezone happens to match it.
// Local solar time is timezone-database-free, well-defined for any longitude (including
// the poles), and is the time basis that actually determines where the sun is.
const MINUTES_PER_DEGREE_LONGITUDE = 4; // 360deg / 24h = 15deg/h = 4min/deg

export function localSolarTimeToDate(dateState: DateState, minutesSinceMidnight: number, longitude: number): Date {
  const utcMidnight = Date.UTC(dateState.year, dateState.month - 1, dateState.day, 0, 0, 0, 0);
  const utcMinutesOfDay = minutesSinceMidnight - longitude * MINUTES_PER_DEGREE_LONGITUDE;
  return new Date(utcMidnight + utcMinutesOfDay * 60_000);
}

function dateToLocalSolarMinutes(date: Date, dateState: DateState, longitude: number): number {
  const utcMidnight = Date.UTC(dateState.year, dateState.month - 1, dateState.day, 0, 0, 0, 0);
  const utcMinutesOfDay = (date.getTime() - utcMidnight) / 60_000;
  return utcMinutesOfDay + longitude * MINUTES_PER_DEGREE_LONGITUDE;
}

export interface DaylightBounds {
  sunriseMinutes: number;
  sunsetMinutes: number;
}

// Full-day range used when the sun never sets (polar day) or never rises (polar night) —
// in both cases there's no meaningful single rise/set pair, so let the slider scrub the
// whole 24h; the sun marker naturally stays hidden throughout for polar night since
// altitude stays negative (see main.ts's altitude>0 check).
const FULL_DAY_BOUNDS: DaylightBounds = { sunriseMinutes: 0, sunsetMinutes: 24 * 60 };

// Returns sunrise/sunset expressed as local-solar-time minutes-since-midnight for the given
// site and calendar date, so the time slider can be bounded to daylight hours.
export function getDaylightBounds(dateState: DateState, latitude: number, longitude: number): DaylightBounds {
  // Anchor the SunCalc query at local solar noon of the requested calendar date so the
  // correct date is resolved regardless of longitude (querying at UTC midnight would often
  // land on the wrong side of midnight for sites far from Greenwich).
  const anchor = localSolarTimeToDate(dateState, 12 * 60, longitude);
  const times = SunCalc.getTimes(anchor, latitude, longitude);

  if (times.alwaysUp || times.alwaysDown || !times.sunrise || !times.sunset) {
    return FULL_DAY_BOUNDS;
  }
  return {
    sunriseMinutes: dateToLocalSolarMinutes(times.sunrise, dateState, longitude),
    sunsetMinutes: dateToLocalSolarMinutes(times.sunset, dateState, longitude),
  };
}
