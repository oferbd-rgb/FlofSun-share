export interface ReadingsPanel {
  element: HTMLElement;
  update(sunAzimuthDeg: number, sunAltitudeDeg: number, solarAngleDeg: number, trackerAngleDeg: number): void;
}

// Two-column readout: "Sun" (azimuth, then altitude, then solar angle) beside "Tracker"
// (tracker angle — on the same CSS grid row as solar angle specifically, not just visually
// near it, so the two are easy to compare: solar angle is the "ideal" sun-facing angle
// (unclamped), while tracker angle is what's actually applied — same convention as solar angle
// (0deg = horizontal, +-maxRotationDeg at full tilt), but clamped to the mechanical limit and
// rate-limited, so it can genuinely differ during anti-tracking or while still slewing toward
// a new target.
export function createReadingsPanel(container: HTMLElement): ReadingsPanel {
  const panel = document.createElement("div");
  panel.className = "readings-panel";

  const sunLabel = document.createElement("div");
  sunLabel.className = "readings-label";
  sunLabel.textContent = "Sun";

  const trackerLabel = document.createElement("div");
  trackerLabel.className = "readings-label";
  trackerLabel.textContent = "Tracker";

  const azimuthValue = document.createElement("div");
  azimuthValue.className = "readings-value";

  const altitudeValue = document.createElement("div");
  altitudeValue.className = "readings-value";

  const solarAngleValue = document.createElement("div");
  solarAngleValue.className = "readings-value";

  const trackerAngleValue = document.createElement("div");
  trackerAngleValue.className = "readings-value";

  panel.appendChild(sunLabel);
  panel.appendChild(trackerLabel);
  panel.appendChild(azimuthValue);
  panel.appendChild(document.createElement("div")); // no tracker reading on the azimuth row
  panel.appendChild(altitudeValue);
  panel.appendChild(document.createElement("div")); // no tracker reading on the altitude row
  panel.appendChild(solarAngleValue);
  panel.appendChild(trackerAngleValue);

  container.appendChild(panel);

  return {
    element: panel,
    update(sunAzimuthDeg, sunAltitudeDeg, solarAngleDeg, trackerAngleDeg) {
      azimuthValue.textContent = `Az ${sunAzimuthDeg.toFixed(1)} deg`;
      altitudeValue.textContent = `Alt ${sunAltitudeDeg.toFixed(1)} deg`;
      solarAngleValue.textContent = `Solar angle ${solarAngleDeg.toFixed(1)} deg`;
      trackerAngleValue.textContent = `Tracker angle ${trackerAngleDeg.toFixed(1)} deg`;
    },
  };
}
