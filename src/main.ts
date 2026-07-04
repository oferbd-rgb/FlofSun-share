import "./style.css";
import { scene as sceneCfg, tracker as trackerCfg } from "./config";
import { getDate, getLocation, getTrackerGeometry, getTrackingModeAt, onGeometryChange, onStateChange } from "./appState";
import { getDaylightBounds, getSunAngles, localSolarTimeToDate, sunAzElToVector3 } from "./sunPosition";
import {
  computeAntiTrackingRotationDeg,
  computeSolarAngleDeg,
  computeTrackerRotationDeg,
  stepTowardDeg,
} from "./trackerMath";
import { createAppScene } from "./scene";
import { createTimeControl } from "./timeControl";
import { createLocationPicker } from "./locationPicker";
import { createGeometryControl } from "./geometryControl";
import { createReadingsPanel } from "./readingsPanel";
import { createSunHoursPanel, type SunHoursPanel } from "./sunHoursReport";

const app = document.querySelector<HTMLDivElement>("#app")!;
const { scene, camera, renderer, controls, sunLightRig, rows } = createAppScene(app);

createGeometryControl(app);
const readingsPanel = createReadingsPanel(app);

// minutesSinceMidnight is local SOLAR time at the selected site (see sunPosition.ts) —
// not the browser's system timezone.
function dateAt(minutesSinceMidnight: number): Date {
  return localSolarTimeToDate(getDate(), minutesSinceMidnight, getLocation().longitude);
}

const initialLocation = getLocation();
const bounds = getDaylightBounds(getDate(), initialLocation.latitude, initialLocation.longitude);
const timeControl = createTimeControl(app, bounds);
createLocationPicker(app);

onStateChange(() => {
  const loc = getLocation();
  const newBounds = getDaylightBounds(getDate(), loc.latitude, loc.longitude);
  timeControl.updateBounds(newBounds);
});

// --- Cumulative Sun Hours "report": rather than a separate page, this switches the live scene
// to a still top-down view and hides only the momentary/time-of-day panels (time control,
// readings), which don't apply to a full-day summary. Geometry control and the location picker
// stay live so their effect on both the 3D layout and the heatmap is visible immediately.
const sunHoursButton = document.createElement("button");
sunHoursButton.className = "sun-hours-trigger-button";
sunHoursButton.textContent = "Cumulative sunhours";
app.appendChild(sunHoursButton);

const savedCameraPosition = camera.position.clone();
const savedControlsTarget = controls.target.clone();

let reportActive = false;
let sunHoursPanel: SunHoursPanel | null = null;

function enterReportMode(): void {
  reportActive = true;
  timeControl.pause();
  timeControl.element.style.display = "none";
  readingsPanel.element.style.display = "none";

  savedCameraPosition.copy(camera.position);
  savedControlsTarget.copy(controls.target);
  // A tiny Z-only offset (not X and Z both) avoids the vertical-look singularity in OrbitControls'
  // internal spherical coordinates while keeping the view axis-aligned with the row layout (rows
  // run along world Z) — an equal X/Z offset would instead put the camera on a 45deg diagonal,
  // rendering the square ground as a rotated diamond instead of a clean top-down rectangle.
  camera.position.set(0, sceneCfg.groundSize * 1.4, 0.01);
  controls.target.set(0, 0, 0);
  controls.enabled = false; // "still" top view — no orbit/zoom/pan while the report is open

  sunHoursButton.textContent = "Back to 3D model";
  sunHoursPanel = createSunHoursPanel();
  app.appendChild(sunHoursPanel.element);
}

function exitReportMode(): void {
  reportActive = false;
  timeControl.element.style.display = "";
  readingsPanel.element.style.display = "";

  camera.position.copy(savedCameraPosition);
  controls.target.copy(savedControlsTarget);
  controls.enabled = true;

  sunHoursButton.textContent = "Cumulative sunhours";
  sunHoursPanel?.element.remove();
  sunHoursPanel = null;
}

sunHoursButton.addEventListener("click", () => {
  if (reportActive) {
    exitReportMode();
  } else {
    enterReportMode();
  }
});

// Geometry changes already trigger scene.ts's rebuildRows (so the top-down 3D view updates on
// its own) — this just keeps the heatmap matrix in sync while the report panel is open. Location
// changes matter too (shading depends on lat/lng), so both trigger a refresh.
onGeometryChange(() => {
  if (reportActive) sunHoursPanel?.refresh();
});
onStateChange(() => {
  if (reportActive) sunHoursPanel?.refresh();
});

let lastFrameTime = performance.now();
let lastRotationDeg = 0; // the actual, rate-limited rotation currently applied to the rows
let lastSolarAngleDeg = 0; // unclamped ideal sun-facing angle, for the "Solar angle" reading only — not applied to the hardware
let lastKnownMinutesSinceMidnight = timeControl.getMinutesSinceMidnight();

function frame() {
  const now = performance.now();
  const realDeltaSeconds = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  timeControl.advance(realDeltaSeconds);
  const currentMinutesSinceMidnight = timeControl.getMinutesSinceMidnight();
  // Simulated (solar-clock) minutes elapsed since the last frame — not real/wall-clock time.
  // Using simulated time here means the slew-rate limit scales with how far the simulated
  // clock actually moved: a large slider drag or a fast "Play" both let the tracker catch up
  // proportionally, instead of it looking frozen whenever simulated time moves faster than
  // 5deg/min of *real* time would allow (any slider drag, or "Play" at 30 sim-min/real-sec —
  // tried real-time-only first, and that was the bug: the tracker could take 24 real minutes to
  // sweep its full range regardless of how the simulated clock moved).
  //
  // But simulated time alone reintroduces the exact problem this feature was meant to fix:
  // toggling a tracking-schedule interval while the clock is paused (not playing, slider not
  // being dragged) leaves simulated time unchanged frame to frame, so simulated-time-only would
  // make the tracker snap-or-freeze instead of visibly slewing to the new target. Taking the max
  // of the two bases covers both: whichever moved further since the last frame drives the step.
  const simulatedMinutesElapsed = Math.abs(currentMinutesSinceMidnight - lastKnownMinutesSinceMidnight);
  lastKnownMinutesSinceMidnight = currentMinutesSinceMidnight;
  const effectiveMinutesElapsed = Math.max(simulatedMinutesElapsed, realDeltaSeconds / 60);

  const date = dateAt(currentMinutesSinceMidnight);
  const location = getLocation();
  const { azimuthDeg, altitudeDeg } = getSunAngles(date, location.latitude, location.longitude);
  const sunDir = sunAzElToVector3(azimuthDeg, altitudeDeg);
  sunLightRig.updateSunPosition(sunDir);

  let targetRotationDeg = lastRotationDeg;
  if (altitudeDeg > 0) {
    const geometry = getTrackerGeometry();
    lastSolarAngleDeg = computeSolarAngleDeg(azimuthDeg, altitudeDeg, geometry.axisAzimuthDeg);
    const clampedTrackingAngleDeg = computeTrackerRotationDeg(
      azimuthDeg,
      altitudeDeg,
      geometry.axisAzimuthDeg,
      trackerCfg.maxRotationDeg,
    );
    targetRotationDeg =
      getTrackingModeAt(currentMinutesSinceMidnight) === "track"
        ? clampedTrackingAngleDeg
        : computeAntiTrackingRotationDeg(
            clampedTrackingAngleDeg,
            trackerCfg.maxRotationDeg,
            geometry.moduleLengthM,
            sunDir.x,
            sunDir.y,
          );
  }
  const maxStepDeg = trackerCfg.maxRotationSpeedDegPerMin * effectiveMinutesElapsed;
  lastRotationDeg = stepTowardDeg(lastRotationDeg, targetRotationDeg, maxStepDeg);

  for (const row of rows) {
    row.setRotationDeg(lastRotationDeg);
  }
  readingsPanel.update(azimuthDeg, altitudeDeg, lastSolarAngleDeg, lastRotationDeg);

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
