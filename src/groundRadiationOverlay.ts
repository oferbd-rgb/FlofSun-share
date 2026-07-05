import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { GroundRadiationGridResult } from "./groundRadiation";

export interface GroundRadiationOverlay {
  mesh: Mesh;
  update(grid: GroundRadiationGridResult): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

// Simple two-stop gradient (dark indigo -> warm yellow) rather than a "scientifically correct"
// colormap — easy to read at a glance as "how sunlit is this patch of ground."
const LOW_COLOR = { r: 30, g: 30, b: 70 };
const HIGH_COLOR = { r: 255, g: 210, b: 60 };

function colorForPercent(percent: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, percent / 100));
  return [
    Math.round(LOW_COLOR.r + (HIGH_COLOR.r - LOW_COLOR.r) * t),
    Math.round(LOW_COLOR.g + (HIGH_COLOR.g - LOW_COLOR.g) * t),
    Math.round(LOW_COLOR.b + (HIGH_COLOR.b - LOW_COLOR.b) * t),
  ];
}

// A ground-hugging plane textured from a CanvasTexture that's repainted (via ImageData, not
// per-cell fillRect calls — much faster at grid resolutions in the tens of thousands of cells)
// every time update() is called with a fresh computeGroundRadiationGrid result. Unlit
// (MeshBasicMaterial) since it represents an already-computed radiation value, not a surface that
// should itself be shaded by the scene's directional light.
export function createGroundRadiationOverlay(): GroundRadiationOverlay {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);

  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;

  function update(grid: GroundRadiationGridResult): void {
    const xCount = grid.xCenters.length;
    const zCount = grid.zCenters.length;
    if (xCount === 0 || zCount === 0) return;

    if (canvas.width !== xCount || canvas.height !== zCount) {
      canvas.width = xCount;
      canvas.height = zCount;
    }
    const imageData = ctx.createImageData(xCount, zCount);
    // Canvas textures default to flipY=true (row 0 of the bitmap maps to V=1), and after this
    // mesh's -90deg X rotation, local +Y (V=1) lands at world -Z — so canvas row 0 should hold
    // grid.zCenters[0] (the smallest/most-negative Z), i.e. no row flip needed. Verified visually
    // once wired into main.ts (same approach used for the shade-line cylinder's orientation
    // earlier in this project — geometry axis conventions are easy to get backwards on paper).
    for (let zi = 0; zi < zCount; zi++) {
      const rowStart = zi * xCount * 4;
      for (let xi = 0; xi < xCount; xi++) {
        const [r, g, b] = colorForPercent(grid.percentOfGHI[zi][xi]);
        const idx = rowStart + xi * 4;
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    texture.needsUpdate = true;

    const gridWidthM = grid.xCenters[xCount - 1] - grid.xCenters[0];
    const gridDepthM = grid.zCenters[zCount - 1] - grid.zCenters[0];
    mesh.scale.set(gridWidthM, gridDepthM, 1);
    mesh.position.set(
      (grid.xCenters[0] + grid.xCenters[xCount - 1]) / 2,
      0.015, // just above the ground (y=0) and clear of the shade-line strip embedded at y=-0.02
      (grid.zCenters[0] + grid.zCenters[zCount - 1]) / 2,
    );
  }

  return {
    mesh,
    update,
    setVisible(visible: boolean) {
      mesh.visible = visible;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
