import { demoDate, location as defaultLocation } from "./config";

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

let currentLocation: LocationState = {
  latitude: defaultLocation.latitude,
  longitude: defaultLocation.longitude,
  label: "Tel Aviv, Israel",
};

let currentDate: DateState = { ...demoDate };

const listeners: Array<() => void> = [];

function notify(): void {
  for (const listener of listeners) listener();
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

// Fires whenever location OR date changes — either can shift sunrise/sunset bounds and the
// sun's position, so callers that care about one generally need to react to both.
export function onStateChange(callback: () => void): void {
  listeners.push(callback);
}
