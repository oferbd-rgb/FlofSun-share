import { getTrackerGeometry, setTrackerGeometry, type TrackerGeometryState } from "./appState";

interface FieldSpec {
  key: keyof TrackerGeometryState;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: FieldSpec[] = [
  { key: "moduleLengthM", label: "Module length", unit: "m", min: 0.5, max: 6, step: 0.1 },
  { key: "hubHeightM", label: "Hub height", unit: "m", min: 0.5, max: 10, step: 0.1 },
  { key: "rowSpacingM", label: "Row spacing", unit: "m", min: 1, max: 20, step: 0.1 },
  { key: "axisAzimuthDeg", label: "Axis azimuth", unit: "deg", min: 0, max: 359, step: 1 },
];

export function createGeometryControl(container: HTMLElement): void {
  const panel = document.createElement("div");
  panel.className = "geometry-control";

  const title = document.createElement("div");
  title.className = "geometry-control-title";
  title.textContent = "Tracker geometry";
  panel.appendChild(title);

  for (const field of FIELDS) {
    const row = document.createElement("label");
    row.className = "geometry-control-row";

    const labelEl = document.createElement("span");
    labelEl.textContent = `${field.label} (${field.unit})`;
    row.appendChild(labelEl);

    const input = document.createElement("input");
    input.type = "number";
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
    input.value = String(getTrackerGeometry()[field.key]);
    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) {
        input.value = String(getTrackerGeometry()[field.key]);
        return;
      }
      const clamped = Math.min(field.max, Math.max(field.min, parsed));
      input.value = String(clamped);
      setTrackerGeometry({ ...getTrackerGeometry(), [field.key]: clamped });
    });
    row.appendChild(input);

    panel.appendChild(row);
  }

  container.appendChild(panel);
}
