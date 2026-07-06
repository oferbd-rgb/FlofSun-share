import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { tracker as cfg } from "./config";

const moduleMaterial = new MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.3, roughness: 0.6 });
const torqueTubeMaterial = new MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });
const postMaterial = new MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });

export interface TrackerRow {
  group: Group;
  setRotationDeg(deg: number): void;
  dispose(): void; // frees this row's own geometries (call before dropping the row on rebuild)
}

export interface TrackerRowParams {
  worldX: number;
  hubHeightM: number;
  moduleLengthM: number; // across-axis (X when flat) module dimension — the tilt-facing side
}

// Builds one tracker row as two nested groups: an outer `anchorGroup`, at ground level and
// never rotated, holding the static ground-to-hub support posts; and an inner `pivotGroup`,
// translated up to hub height, holding the torque tube + modules. Only pivotGroup's local Z
// rotation changes per frame (the tube's own centerline) to sweep the modules east-west —
// rotating about X or Y instead would incorrectly shift modules along the row. Keeping the
// posts on the outer, unrotated group is what makes them "static, do not rotate."
//
// 1P (one-in-portrait) module orientation: each module's *width* (cfg.moduleWidth, fixed) runs
// along the row axis (Z) — that's the row pitch dimension — while its *length*
// (moduleLengthM, adjustable) runs across the axis (X), which is the dimension that actually
// sweeps toward/away from the sun as the row tilts.
export function createTrackerRow(params: TrackerRowParams): TrackerRow {
  const { worldX, hubHeightM, moduleLengthM } = params;

  const anchorGroup = new Group();
  anchorGroup.position.set(worldX, 0, 0);

  const pivotGroup = new Group();
  pivotGroup.position.set(0, hubHeightM, 0);
  anchorGroup.add(pivotGroup);

  const n = cfg.modulesPerRow;
  const pitch = cfg.moduleWidth + cfg.moduleGap;
  const totalLength = n * cfg.moduleWidth + (n - 1) * cfg.moduleGap;

  const tubeSide = cfg.torqueTubeRadius * 2;
  const torqueTubeGeometry = new BoxGeometry(tubeSide, tubeSide, totalLength + tubeSide);
  const torqueTube = new Mesh(torqueTubeGeometry, torqueTubeMaterial);
  pivotGroup.add(torqueTube);

  const moduleGeometry = new BoxGeometry(moduleLengthM, cfg.moduleThickness, cfg.moduleWidth);
  for (let i = 0; i < n; i++) {
    const zOffset = (i - (n - 1) / 2) * pitch;
    const module = new Mesh(moduleGeometry, moduleMaterial);
    module.position.set(0, 0, zOffset);
    module.castShadow = true;
    pivotGroup.add(module);
  }

  const postGeometry = new CylinderGeometry(cfg.postRadius, cfg.postRadius, hubHeightM, 8);
  for (let i = 0; i < cfg.postCount; i++) {
    const t = cfg.postCount === 1 ? 0.5 : i / (cfg.postCount - 1); // 0 at one end, 1 at the other
    const zOffset = (t - 0.5) * totalLength;
    const post = new Mesh(postGeometry, postMaterial);
    post.position.set(0, hubHeightM / 2, zOffset);
    post.castShadow = true;
    anchorGroup.add(post);
  }

  return {
    group: anchorGroup,
    setRotationDeg(deg: number) {
      pivotGroup.rotation.z = (deg * Math.PI) / 180;
    },
    dispose() {
      torqueTubeGeometry.dispose();
      moduleGeometry.dispose();
      postGeometry.dispose();
    },
  };
}
