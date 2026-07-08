// A schematic 2D east-west cross section of the tracker field, rendered as plain SVG (not
// three.js) — a deliberately simplified "elevation view" companion to the live 3D scene, not a
// physically exact rendering. Shows all `tracker.rowCount` rows side by side as seen from the
// side: a static support leg from the ground to hub height, a small torque-tube hub, and a
// tilted line representing the module's cross-sectional profile (thickness = moduleThickness,
// length = moduleLengthM) — using the exact same edge-offset formula as trackerMath.ts's
// computeRowShadowIntervalX (halfLength*cos/sin of the rotation), so this view's panel angle is
// consistent with the shadow/tracking math used elsewhere. Ground is drawn as a green "grass"
// cap over brown soil down to 50cm depth.
//
// The sun itself isn't drawn — instead, a dense family of parallel yellow rays travels top to
// bottom at the angle implied by the sun direction's X/Y components (ignoring the north-south/Z
// component — a 2D cross section, same simplification computeRowShadowIntervalX makes). Each ray
// is actually raycast against the 4 panels: if it hits one, the ray is drawn only up to that
// point ("blocked") and the grass patch it would have reached is shaded dark; if it clears every
// panel, it's drawn all the way to the ground and that grass patch is shaded light — so the
// grass strip doubles as this view's shadow map. The whole ray family is anchored so that one ray
// always passes through the tracker axis (hub) height at the field's center, regardless of sun
// angle — without that anchor, the family would appear to drift sideways as the angle changes
// rather than simply pivoting.
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
const GRASS_THICKNESS_M = 0.35;
const SKY_MARGIN_M = 4;
const FIELD_MARGIN_M = 3;
const RAY_SPACING_M = 0.1; // dense — this is also the grass-shading segment width
const MAX_RAY_COUNT = 1600; // safety cap for extreme geometry (very wide fields)
const RAY_COLOR = "#ffdd33";
const GRASS_SUNLIT_COLOR = "#6fae4f";
const GRASS_SHADOW_COLOR = "#2a4620";
const SKY_CLIP_ID = "two-d-model-sky-clip";

interface Point {
  x: number;
  y: number;
}

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

// Standard segment-segment intersection (parametric form): returns the intersection point and
// how far along the (a1->a2) segment it falls (0 = at a1, 1 = at a2), or null if the segments
// don't cross within their own extents (or are parallel).
function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): { t: number; point: Point } | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const s = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t < 0 || t > 1 || s < 0 || s > 1) return null;
  return { t, point: { x: a1.x + t * d1x, y: a1.y + t * d1y } };
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

  const grassLayer = document.createElementNS(SVG_NS, "g");
  const soilLayer = document.createElementNS(SVG_NS, "g");
  const rayLayer = document.createElementNS(SVG_NS, "g");
  rayLayer.setAttribute("clip-path", `url(#${SKY_CLIP_ID})`);
  const trackerLayer = document.createElementNS(SVG_NS, "g");
  svg.appendChild(soilLayer);
  svg.appendChild(grassLayer);
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

    // Soil: brown, from -SOIL_DEPTH_M up to 0.
    soilLayer.replaceChildren();
    soilLayer.appendChild(makeRect(0, toSvgY(0), widthM, SOIL_DEPTH_M, "#6b4a2f"));

    // Grass base layer (shaded, i.e. "not reached by a ray") — sunlit patches are drawn over this
    // once each ray's fate is known below, so grass always shows something even where no ray's
    // exact spacing lands (e.g. past the outermost rays).
    grassLayer.replaceChildren();
    grassLayer.appendChild(makeRect(0, toSvgY(GRASS_THICKNESS_M), widthM, GRASS_THICKNESS_M, GRASS_SHADOW_COLOR));

    // Sky-region clip (everything above the grass) so ray lines never visually spill onto the
    // ground, regardless of how shallow the sun angle is.
    const skyYMin = GRASS_THICKNESS_M;
    clipRect.setAttribute("x", "0");
    clipRect.setAttribute("y", String(toSvgY(yMax)));
    clipRect.setAttribute("width", String(widthM));
    clipRect.setAttribute("height", String(toSvgY(skyYMin) - toSvgY(yMax)));

    // Trackers: one leg + hub + tilted panel line per row, all sharing the current rotation.
    // Panels are computed before the rays below, since rays need to test against them.
    trackerLayer.replaceChildren();
    const rowXs = rowWorldXPositions(trackerCfg.rowCount, geometry.rowSpacingM);
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const halfLength = geometry.moduleLengthM / 2;
    const edgeX = halfLength * Math.cos(rotationRad);
    const edgeY = halfLength * Math.sin(rotationRad);
    const panelSegments: [Point, Point][] = rowXs.map((rowX) => [
      { x: rowX - edgeX, y: geometry.hubHeightM - edgeY },
      { x: rowX + edgeX, y: geometry.hubHeightM + edgeY },
    ]);

    for (const rowX of rowXs) {
      trackerLayer.appendChild(
        makeLine(toSvgX(rowX), toSvgY(0), toSvgX(rowX), toSvgY(geometry.hubHeightM), "#555555", 0.12),
      );

      const hubSize = 0.22;
      trackerLayer.appendChild(
        makeRect(toSvgX(rowX) - hubSize / 2, toSvgY(geometry.hubHeightM) - hubSize / 2, hubSize, hubSize, "#555555"),
      );
    }
    for (const [p1, p2] of panelSegments) {
      const panel = makeLine(toSvgX(p1.x), toSvgY(p1.y), toSvgX(p2.x), toSvgY(p2.y), "#1a2a4a", trackerCfg.moduleThickness);
      panel.setAttribute("stroke-linecap", "round");
      trackerLayer.appendChild(panel);
    }

    // Rays: a dense family of parallel lines traveling from sky to ground at the sun's angle,
    // anchored so one ray always passes through (field center X, hub height) regardless of angle
    // — otherwise the whole family would appear to slide sideways as the sun moves rather than
    // pivot around the tracker axis. Each ray is raycast against every panel; the closest hit (if
    // any) truncates the drawn ray and marks that ray's ground position shaded instead of sunlit.
    rayLayer.replaceChildren();
    if (sunDirY > 0) {
      const dirLen = Math.hypot(sunDirX, sunDirY);
      const dirX = -sunDirX / dirLen; // ray travel direction: from sun toward ground
      const dirY = -sunDirY / dirLen;
      const perpX = -dirY;
      const perpY = dirX;

      const pivot: Point = { x: 0, y: geometry.hubHeightM };
      const spanDiag = Math.hypot(widthM, yMax - skyYMin) * 1.2;
      const halfCount = Math.min(MAX_RAY_COUNT / 2, Math.ceil(spanDiag / 2 / RAY_SPACING_M));

      for (let i = -halfCount; i <= halfCount; i++) {
        const offset = i * RAY_SPACING_M;
        const onLineX = pivot.x + perpX * offset;
        const onLineY = pivot.y + perpY * offset;

        // Where this ray (extended both ways from onLine) crosses the sky top and the ground —
        // whichever endpoint has the larger Y is where the ray "starts" (top to bottom, as
        // requested), regardless of the sign of dirY for this particular offset line.
        const tTop = dirY !== 0 ? (yMax - onLineY) / dirY : null;
        const tGround = dirY !== 0 ? (0 - onLineY) / dirY : null;
        if (tTop === null || tGround === null) continue;
        const topPoint: Point = { x: onLineX + dirX * tTop, y: onLineY + dirY * tTop };
        const groundPoint: Point = { x: onLineX + dirX * tGround, y: onLineY + dirY * tGround };
        const start = topPoint.y >= groundPoint.y ? topPoint : groundPoint;
        const nominalEnd = start === topPoint ? groundPoint : topPoint;
        if (nominalEnd.x < xMin - RAY_SPACING_M || nominalEnd.x > xMax + RAY_SPACING_M) continue; // off to the side, skip

        let closestT = 1;
        let blocked = false;
        for (const [p1, p2] of panelSegments) {
          const hit = segmentIntersection(start, nominalEnd, p1, p2);
          if (hit && hit.t < closestT) {
            closestT = hit.t;
            blocked = true;
          }
        }
        const end = blocked
          ? { x: start.x + (nominalEnd.x - start.x) * closestT, y: start.y + (nominalEnd.y - start.y) * closestT }
          : nominalEnd;

        const ray = makeLine(toSvgX(start.x), toSvgY(start.y), toSvgX(end.x), toSvgY(end.y), RAY_COLOR, 0.03);
        ray.setAttribute("opacity", "0.7");
        rayLayer.appendChild(ray);

        if (!blocked) {
          grassLayer.appendChild(
            makeRect(toSvgX(nominalEnd.x - RAY_SPACING_M / 2), toSvgY(GRASS_THICKNESS_M), RAY_SPACING_M, GRASS_THICKNESS_M, GRASS_SUNLIT_COLOR),
          );
        }
      }
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
