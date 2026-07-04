export interface ReadingsPanel {
  update(sunAzimuthDeg: number, sunAltitudeDeg: number, trackerRotationDeg: number): void;
}

// Two-column readout: "Sun" (azimuth, then altitude below it) beside "Tracker" (rotational
// position, on the same row as altitude — a CSS grid row, not just visual proximity).
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

  const azimuthSpacer = document.createElement("div"); // no tracker reading on the azimuth row

  const altitudeValue = document.createElement("div");
  altitudeValue.className = "readings-value";

  const rotationValue = document.createElement("div");
  rotationValue.className = "readings-value";

  panel.appendChild(sunLabel);
  panel.appendChild(trackerLabel);
  panel.appendChild(azimuthValue);
  panel.appendChild(azimuthSpacer);
  panel.appendChild(altitudeValue);
  panel.appendChild(rotationValue);

  container.appendChild(panel);

  return {
    update(sunAzimuthDeg, sunAltitudeDeg, trackerRotationDeg) {
      azimuthValue.textContent = `Az ${sunAzimuthDeg.toFixed(1)} deg`;
      altitudeValue.textContent = `Alt ${sunAltitudeDeg.toFixed(1)} deg`;
      rotationValue.textContent = `Rot ${trackerRotationDeg.toFixed(1)} deg`;
    },
  };
}
