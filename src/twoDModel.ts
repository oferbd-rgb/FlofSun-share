// A schematic 2D east-west cross section of the tracker field, rendered as plain SVG (not
// three.js) — a deliberately simplified "elevation view" companion to the live 3D scene, not a
// physically exact rendering. Shows all `tracker.rowCount` rows side by side as seen from the
// side: a static support leg from the ground to hub height, a small torque-tube hub, and a
// tilted line representing the module's cross-sectional profile (thickness = moduleThickness,
// length = moduleLengthM) — using the exact same edge-offset formula as trackerMath.ts's
// computeRowShadowIntervalX (halfLength*cos/sin of the rotation), so this view's panel angle is
// consistent with the shadow/tracking math used elsewhere. Ground is drawn as a thin green
// "grass" cap over brown soil down to 50cm depth. The sun itself isn't drawn — instead, parallel
// yellow "ray" lines fill the sky region at the angle implied by the sun direction's X/Y
// components (ignoring the north-south/Z component, same simplification `computeRowShadowIntervalX`
// makes — this is a 2D cross section, so only the east-west/vertical sun components apply).
import { tracker as trackerCfg } from "./config";
import { getTrackerGeometry } from "./appState";
import { computeFieldHalfWidthM } from "./trackerMath";

// World X position of each row's torque-tube center, evenly spaced and centered on X=0 — same
// formula scene.ts's rebuildRows uses to place each TrackerRow.
function rowWorldXPositions(rowCount: number, rowSpacingM: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    positions.push((i - (rowCount - 1) / 2) * rowSpacingM);
  }
  return positions;
}

export interface TwoDModelView {
  element: SVGSVGElement;
  update(rotationDeg: number, sunDirX: number, sunDirY: number): void;
  setVisible(visible: boolean): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SOIL_DEPTH_M = 0.5;
const GRASS_THICKNESS_M = 0.08;
const SKY_MARGIN_M = 4;
const FIELD_MARGIN_M = 3;
const RAY_COUNT = 24;
const RAY_COLOR = "#ffdd33";
const SKY_CLIP_ID = "two-d-model-sky-clip";

function makeRect(x: number, y: number, width: number, height: number, fill: string): SVGRectElement {
  const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", fill);
  return rect;
}

function makeLine(x1: number, y1: number, x2: number, y2: number, stroke: string, strokeWidth: number): SVGLineElement {
  const line = document.createElementNS(SVG_NS, "line") as SVGLineElement;
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", String(strokeWidth));
  return line;
}

export function createTwoDModelView(): TwoDModelView {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("two-d-model-view");
  svg.style.display = "none";

  const defs = document.createElementNS(SVG_NS, "defs");
  const clipPath = document.createElementNS(SVG_NS, "clipPath");
  clipPath.setAttribute("id", SKY_CLIP_ID);
  const clipRect = document.createElementNS(SVG_NS, "rect");
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const groundLayer = document.createElementNS(SVG_NS, "g");
  const rayLayer = document.createElementNS(SVG_NS, "g");
  rayLayer.setAttribute("clip-path", `url(#${SKY_CLIP_ID})`);
  const trackerLayer = document.createElementNS(SVG_NS, "g");
  svg.appendChild(groundLayer);
  svg.appendChild(rayLayer);
  svg.appendChild(trackerLayer);

  function update(rotationDeg: number, sunDirX: number, sunDirY: number): void {
    const geometry = getTrackerGeometry();
    const fieldHalfWidthM = computeFieldHalfWidthM(trackerCfg.rowCount, geometry.rowSpacingM);

    const xMin = -fieldHalfWidthM - FIELD_MARGIN_M;
    const xMax = fieldHalfWidthM + FIELD_MARGIN_M;
    const yMin = -SOIL_DEPTH_M;
    const yMax = geometry.hubHeightM + geometry.moduleLengthM / 2 + SKY_MARGIN_M;
    const widthM = xMax - xMin;
    const heightM = yMax - yMin;
    svg.setAttribute("viewBox", `0 0 ${widthM} ${heightM}`);

    const toSvgX = (worldX: number) => worldX - xMin;
    const toSvgY = (worldY: number) => yMax - worldY;

    // Ground: brown soil from -SOIL_DEPTH_M to 0, a thin green grass cap from 0 to +GRASS_THICKNESS_M.
    groundLayer.replaceChildren();
    groundLayer.appendChild(makeRect(0, toSvgY(0), widthM, SOIL_DEPTH_M, "#6b4a2f"));
    groundLayer.appendChild(makeRect(0, toSvgY(GRASS_THICKNESS_M), widthM, GRASS_THICKNESS_M, "#4a7c3f"));

    // Sky-region clip (everything above the grass) so ray lines never visually spill onto the
    // ground, regardless of how shallow the sun angle is.
    const skyYMin = GRASS_THICKNESS_M;
    clipRect.setAttribute("x", "0");
    clipRect.setAttribute("y", String(toSvgY(yMax)));
    clipRect.setAttribute("width", String(widthM));
    clipRect.setAttribute("height", String(toSvgY(skyYMin) - toSvgY(yMax)));

    rayLayer.replaceChildren();
    if (sunDirY > 0) {
      // Ray travel direction (from sun toward ground) and its perpendicular, used to lay out an
      // evenly spaced family of parallel lines covering the sky region regardless of angle.
      const dirLen = Math.hypot(sunDirX, sunDirY);
      const dirX = -sunDirX / dirLen;
      const dirY = -sunDirY / dirLen;
      const perpX = -dirY;
      const perpY = dirX;

      const centerX = (xMin + xMax) / 2;
      const centerY = (skyYMin + yMax) / 2;
      const spanDiag = Math.hypot(widthM, yMax - skyYMin) * 1.2;

      for (let i = 0; i < RAY_COUNT; i++) {
        const t = (i - (RAY_COUNT - 1) / 2) * (spanDiag / RAY_COUNT);
        const startX = centerX + perpX * t - dirX * (spanDiag / 2);
        const startY = centerY + perpY * t - dirY * (spanDiag / 2);
        const endX = startX + dirX * spanDiag;
        const endY = startY + dirY * spanDiag;
        const ray = makeLine(toSvgX(startX), toSvgY(startY), toSvgX(endX), toSvgY(endY), RAY_COLOR, 0.04);
        ray.setAttribute("opacity", "0.65");
        rayLayer.appendChild(ray);
      }
    }

    // Trackers: one leg + hub + tilted panel line per row, all sharing the current rotation.
    trackerLayer.replaceChildren();
    const rowXs = rowWorldXPositions(trackerCfg.rowCount, geometry.rowSpacingM);
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const halfLength = geometry.moduleLengthM / 2;
    const edgeX = halfLength * Math.cos(rotationRad);
    const edgeY = halfLength * Math.sin(rotationRad);

    for (const rowX of rowXs) {
      trackerLayer.appendChild(
        makeLine(toSvgX(rowX), toSvgY(0), toSvgX(rowX), toSvgY(geometry.hubHeightM), "#555555", 0.12),
      );

      const hubSize = 0.22;
      trackerLayer.appendChild(
        makeRect(toSvgX(rowX) - hubSize / 2, toSvgY(geometry.hubHeightM) - hubSize / 2, hubSize, hubSize, "#555555"),
      );

      const panel = makeLine(
        toSvgX(rowX - edgeX),
        toSvgY(geometry.hubHeightM - edgeY),
        toSvgX(rowX + edgeX),
        toSvgY(geometry.hubHeightM + edgeY),
        "#1a2a4a",
        trackerCfg.moduleThickness,
      );
      panel.setAttribute("stroke-linecap", "round");
      trackerLayer.appendChild(panel);
    }
  }

  return {
    element: svg,
    update,
    setVisible(visible: boolean) {
      svg.style.display = visible ? "block" : "none";
    },
  };
}
