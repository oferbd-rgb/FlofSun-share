// Local ambient declaration for suncalc v2.x's API shape.
// The published @types/suncalc package (as of this writing) still reflects the old v1.x API
// (radians, azimuth measured from south) — suncalc v2.0 is a breaking rewrite (degrees,
// azimuth clockwise from north). Declaring the real shape locally avoids relying on
// mismatched community types.
declare module "suncalc" {
  export interface SunPosition {
    azimuth: number; // degrees, clockwise from north: 0=N, 90=E, 180=S, 270=W
    altitude: number; // degrees, apparent/refraction-corrected: 0=horizon, 90=zenith
  }

  export interface SunTimes {
    solarNoon: Date | null;
    nadir: Date | null;
    sunrise: Date | null;
    sunset: Date | null;
    sunriseEnd: Date | null;
    sunsetStart: Date | null;
    dawn: Date | null;
    dusk: Date | null;
    nauticalDawn: Date | null;
    nauticalDusk: Date | null;
    nightEnd: Date | null;
    night: Date | null;
    goldenHourEnd: Date | null;
    goldenHour: Date | null;
    alwaysUp: boolean; // true at high latitudes when the sun never sets that day (polar day)
    alwaysDown: boolean; // true when the sun never rises that day (polar night)
  }

  export function getPosition(date: Date, latitude: number, longitude: number): SunPosition;
  export function getTimes(date: Date, latitude: number, longitude: number): SunTimes;
}
