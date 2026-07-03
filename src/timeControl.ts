import { animation } from "./config";
import {
  getDate,
  getTrackingSchedule,
  minutesToIntervalIndex,
  setDate,
  setTrackingIntervalMode,
  type DateState,
} from "./appState";
import type { DaylightBounds } from "./sunPosition";

export interface TimeControl {
  getMinutesSinceMidnight(): number;
  advance(realDeltaSeconds: number): void;
  updateBounds(bounds: DaylightBounds): void;
}

function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toIsoDate({ year, month, day }: DateState): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoDate(iso: string): DateState {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

interface ScheduleBar {
  element: HTMLElement;
  updateBounds(bounds: DaylightBounds): void;
}

// One clickable segment per half-hour, positioned/sized (via absolute percentage left/width) to
// line up with the slider directly above it: the bar always spans exactly
// [bounds.sunriseMinutes, bounds.sunsetMinutes], same as the slider's own min/max, rather than a
// fixed 00:00-24:00 range. A half-hour interval that only partially overlaps the bounds (at
// either end) is clipped to show just its overlapping portion, so the bar's edges land exactly
// under the slider's own left/right ends. The underlying schedule storage is still the fixed
// 48-slot 00:00-24:00 clock (see appState.ts) — only the rendering here is bounds-relative.
function createScheduleBar(): ScheduleBar {
  const bar = document.createElement("div");
  bar.className = "tracking-schedule-bar";

  function render(bounds: DaylightBounds): void {
    bar.replaceChildren();
    const totalRangeMinutes = bounds.sunsetMinutes - bounds.sunriseMinutes;
    if (totalRangeMinutes <= 0) return;

    const firstIntervalStart = Math.floor(bounds.sunriseMinutes / 30) * 30;
    for (let intervalStart = firstIntervalStart; intervalStart < bounds.sunsetMinutes; intervalStart += 30) {
      const intervalEnd = intervalStart + 30;
      const clippedStart = Math.max(intervalStart, bounds.sunriseMinutes);
      const clippedEnd = Math.min(intervalEnd, bounds.sunsetMinutes);
      if (clippedEnd <= clippedStart) continue;

      const scheduleIndex = minutesToIntervalIndex(intervalStart);
      const segment = document.createElement("div");
      segment.className = "tracking-schedule-segment";
      segment.style.left = `${((clippedStart - bounds.sunriseMinutes) / totalRangeMinutes) * 100}%`;
      segment.style.width = `${((clippedEnd - clippedStart) / totalRangeMinutes) * 100}%`;

      const startLabel = formatClock(intervalStart);
      const endLabel = formatClock(intervalEnd);
      const refreshSegment = () => {
        const isAntiTracking = getTrackingSchedule()[scheduleIndex] === "anti-track";
        segment.classList.toggle("is-anti-tracking", isAntiTracking);
        segment.title = `${startLabel}-${endLabel}: ${isAntiTracking ? "anti-tracking" : "tracking"} (click to toggle)`;
      };
      segment.addEventListener("click", () => {
        const current = getTrackingSchedule()[scheduleIndex];
        setTrackingIntervalMode(scheduleIndex, current === "track" ? "anti-track" : "track");
        refreshSegment();
      });
      refreshSegment();
      bar.appendChild(segment);
    }
  }

  return { element: bar, updateBounds: render };
}

export function createTimeControl(container: HTMLElement, initialBounds: DaylightBounds): TimeControl {
  let bounds = initialBounds;
  let minutesSinceMidnight = (bounds.sunriseMinutes + bounds.sunsetMinutes) / 2; // start at solar noon-ish
  let playing = false;

  const panel = document.createElement("div");
  panel.className = "time-control";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = toIsoDate(getDate());
  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    setDate(parseIsoDate(dateInput.value));
  });

  const playButton = document.createElement("button");
  playButton.textContent = "Play";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(bounds.sunriseMinutes);
  slider.max = String(bounds.sunsetMinutes);
  slider.step = "1";
  slider.value = String(minutesSinceMidnight);

  const clockReadout = document.createElement("span");
  clockReadout.className = "clock-readout";

  const tzNote = document.createElement("span");
  tzNote.className = "tz-note";
  tzNote.textContent = "local solar time";

  function refreshDisplay() {
    slider.value = String(minutesSinceMidnight);
    clockReadout.textContent = formatClock(minutesSinceMidnight);
  }

  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
  });

  slider.addEventListener("input", () => {
    minutesSinceMidnight = Number(slider.value);
    refreshDisplay();
  });

  const scheduleBar = createScheduleBar();
  scheduleBar.updateBounds(bounds);

  const sliderStack = document.createElement("div");
  sliderStack.className = "time-control-slider-stack";
  sliderStack.appendChild(slider);
  sliderStack.appendChild(scheduleBar.element);

  panel.appendChild(dateInput);
  panel.appendChild(playButton);
  panel.appendChild(sliderStack);
  panel.appendChild(clockReadout);
  panel.appendChild(tzNote);
  container.appendChild(panel);

  refreshDisplay();

  return {
    getMinutesSinceMidnight() {
      return minutesSinceMidnight;
    },
    advance(realDeltaSeconds: number) {
      if (!playing) return;
      minutesSinceMidnight += realDeltaSeconds * animation.simMinutesPerRealSecond;
      if (minutesSinceMidnight > bounds.sunsetMinutes) {
        minutesSinceMidnight = bounds.sunriseMinutes;
      }
      refreshDisplay();
    },
    updateBounds(newBounds: DaylightBounds) {
      bounds = newBounds;
      slider.min = String(bounds.sunriseMinutes);
      slider.max = String(bounds.sunsetMinutes);
      scheduleBar.updateBounds(bounds);
      if (minutesSinceMidnight < bounds.sunriseMinutes || minutesSinceMidnight > bounds.sunsetMinutes) {
        minutesSinceMidnight = (bounds.sunriseMinutes + bounds.sunsetMinutes) / 2;
      }
      refreshDisplay();
    },
  };
}
