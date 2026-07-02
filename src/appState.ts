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
