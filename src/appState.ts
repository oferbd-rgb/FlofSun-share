import { demoDate, location as defaultLocation, tracker as trackerDefaults } from "./config";

export interface LocationState {
  latitude: number;
  longitude: number;
  label: string;
}

export interface DateState {
  year: number;
  month: number; // 1-indexed
  day: number;
}

// User-adjustable subset of tracker.ts/config.ts's geometry. moduleWidth, moduleThickness,
// moduleGap, modulesPerRow, rowCount, torqueTubeRadius, and maxRotationDeg stay fixed demo
// constants (see config.ts) — only these four are exposed as controls.
export interface TrackerGeometryState {
  moduleLengthM: number;
  hubHeightM: number;
  rowSpacingM: number;
  axisAzimuthDeg: number;
}

let currentLocation: LocationState = {
  latitude: defaultLocation.latitude,
  longitude: defaultLocation.longitude,
  label: "Tel Aviv, Israel",
};

let currentDate: DateState = { ...demoDate };

let currentTrackerGeometry: TrackerGeometryState = {
  moduleLengthM: trackerDefaults.moduleLength,
  hubHeightM: trackerDefaults.hubHeight,
  rowSpacingM: trackerDefaults.rowSpacing,
  axisAzimuthDeg: trackerDefaults.axisAzimuthDeg,
};

// "track" faces the sun directly (computeTrackerRotationDeg). "anti-track" rotates 90deg off
// that angle instead, toward whichever side gives the smaller shadow footprint — see
// trackerMath.ts's computeAntiTrackingRotationDeg.
export type TrackingMode = "track" | "anti-track";

// Recurring daily schedule: which mode applies during each half-hour window of the day
// (index 0 = 00:00-00:30, index 1 = 00:30-01:00, ... index 47 = 23:30-24:00), independent of
// the calendar date — see timeControl.ts's schedule bar. Read directly each frame in
// main.ts's loop via getTrackingModeAt, so no pub-sub is needed here.
export const HALF_HOURS_PER_DAY = 48;

let currentTrackingSchedule: TrackingMode[] = new Array(HALF_HOURS_PER_DAY).fill("track");

const listeners: Array<() => void> = [];
const geometryListeners: Array<() => void> = [];

function notify(): void {
  for (const listener of listeners) listener();
}

function notifyGeometry(): void {
  for (const listener of geometryListeners) listener();
}

export function getLocation(): LocationState {
  return currentLocation;
}

export function setLocation(next: LocationState): void {
  currentLocation = next;
  notify();
}

export function getDate(): DateState {
  return currentDate;
}

export function setDate(next: DateState): void {
  currentDate = next;
  notify();
}

export function getTrackerGeometry(): TrackerGeometryState {
  return currentTrackerGeometry;
}

export function setTrackerGeometry(next: TrackerGeometryState): void {
  currentTrackerGeometry = next;
  notifyGeometry();
}

export function getTrackingSchedule(): TrackingMode[] {
  return currentTrackingSchedule;
}

export function setTrackingIntervalMode(intervalIndex: number, mode: TrackingMode): void {
  const next = currentTrackingSchedule.slice();
  next[intervalIndex] = mode;
  currentTrackingSchedule = next;
}

// Maps a (possibly out-of-[0,1440) or negative, since local solar time can run past midnight
// for extreme longitudes) minutes-since-midnight value to its half-hour schedule index,
// wrapping around a 24h day.
export function minutesToIntervalIndex(minutesSinceMidnight: number): number {
  const raw = Math.floor(minutesSinceMidnight / 30) % HALF_HOURS_PER_DAY;
  return raw < 0 ? raw + HALF_HOURS_PER_DAY : raw;
}

export function getTrackingModeAt(minutesSinceMidnight: number): TrackingMode {
  return currentTrackingSchedule[minutesToIntervalIndex(minutesSinceMidnight)];
}

// Fires whenever location OR date changes — either can shift sunrise/sunset bounds and the
// sun's position, so callers that care about one generally need to react to both.
export function onStateChange(callback: () => void): void {
  listeners.push(callback);
}

// Fires whenever the tracker geometry (module length, hub height, row spacing, axis azimuth)
// changes — kept separate from onStateChange since geometry edits don't affect daylight bounds
// and shouldn't force main.ts to recompute them.
export function onGeometryChange(callback: () => void): void {
  geometryListeners.push(callback);
}
