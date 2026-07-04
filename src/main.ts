import "./style.css";
import { tracker as trackerCfg } from "./config";
import { getDate, getLocation, getTrackerGeometry, getTrackingModeAt, onStateChange } from "./appState";
import { getDaylightBounds, getSunAngles, localSolarTimeToDate, sunAzElToVector3 } from "./sunPosition";
import { computeAntiTrackingRotationDeg, computeTrackerRotationDeg, stepTowardDeg } from "./trackerMath";
import { createAppScene } from "./scene";
import { createTimeControl } from "./timeControl";
import { createLocationPicker } from "./locationPicker";
import { createGeometryControl } from "./geometryControl";
import { createReadingsPanel } from "./readingsPanel";

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

let lastFrameTime = performance.now();
let lastRotationDeg = 0; // the actual, rate-limited rotation currently applied to the rows
let lastSolarAngleDeg = 0; // the "ideal" sun-facing angle (pre anti-track override), held while the sun is below the horizon

function frame() {
  const now = performance.now();
  const realDeltaSeconds = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  timeControl.advance(realDeltaSeconds);
  const date = dateAt(timeControl.getMinutesSinceMidnight());
  const location = getLocation();
  const { azimuthDeg, altitudeDeg } = getSunAngles(date, location.latitude, location.longitude);
  const sunDir = sunAzElToVector3(azimuthDeg, altitudeDeg);
  sunLightRig.updateSunPosition(sunDir);

  let targetRotationDeg = lastRotationDeg;
  if (altitudeDeg > 0) {
    const geometry = getTrackerGeometry();
    lastSolarAngleDeg = computeTrackerRotationDeg(
      azimuthDeg,
      altitudeDeg,
      geometry.axisAzimuthDeg,
      trackerCfg.maxRotationDeg,
    );
    targetRotationDeg =
      getTrackingModeAt(timeControl.getMinutesSinceMidnight()) === "track"
        ? lastSolarAngleDeg
        : computeAntiTrackingRotationDeg(
            lastSolarAngleDeg,
            trackerCfg.maxRotationDeg,
            geometry.moduleLengthM,
            sunDir.x,
            sunDir.y,
          );
  }
  // Real (wall-clock) time, not simulated time — so mode-switch transitions always animate
  // smoothly regardless of playback speed or whether the simulated clock is even advancing.
  const maxStepDeg = trackerCfg.maxRotationSpeedDegPerMin * (realDeltaSeconds / 60);
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
