export interface ReadingsPanel {
  update(sunAzimuthDeg: number, sunAltitudeDeg: number, solarAngleDeg: number, trackerRotationDeg: number): void;
}

// Two-column readout: "Sun" (azimuth, then altitude, then solar angle) beside "Tracker"
// (rotational position — on the same CSS grid row as solar angle specifically, not just
// visually near it, so the two are easy to compare: solar angle is the "ideal" sun-facing
// angle, while tracker rotation is what's actually applied, which can differ during
// anti-tracking or while the rotation is still slewing toward a new target).
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

  const rotationValue = document.createElement("div");
  rotationValue.className = "readings-value";

  panel.appendChild(sunLabel);
  panel.appendChild(trackerLabel);
  panel.appendChild(azimuthValue);
  panel.appendChild(document.createElement("div")); // no tracker reading on the azimuth row
  panel.appendChild(altitudeValue);
  panel.appendChild(document.createElement("div")); // no tracker reading on the altitude row
  panel.appendChild(solarAngleValue);
  panel.appendChild(rotationValue);

  container.appendChild(panel);

  return {
    update(sunAzimuthDeg, sunAltitudeDeg, solarAngleDeg, trackerRotationDeg) {
      azimuthValue.textContent = `Az ${sunAzimuthDeg.toFixed(1)} deg`;
      altitudeValue.textContent = `Alt ${sunAltitudeDeg.toFixed(1)} deg`;
      solarAngleValue.textContent = `Solar angle ${solarAngleDeg.toFixed(1)} deg`;
      rotationValue.textContent = `Rot ${trackerRotationDeg.toFixed(1)} deg`;
    },
  };
}
