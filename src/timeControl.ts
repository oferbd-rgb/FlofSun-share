import { animation } from "./config";
import { getDate, setDate, type DateState } from "./appState";
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

  panel.appendChild(dateInput);
  panel.appendChild(playButton);
  panel.appendChild(slider);
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
      if (minutesSinceMidnight < bounds.sunriseMinutes || minutesSinceMidnight > bounds.sunsetMinutes) {
        minutesSinceMidnight = (bounds.sunriseMinutes + bounds.sunsetMinutes) / 2;
      }
      refreshDisplay();
    },
  };
}
