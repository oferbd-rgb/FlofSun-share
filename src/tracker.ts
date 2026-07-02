import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { tracker as cfg } from "./config";
import { axisYawDeg } from "./trackerMath";

const moduleMaterial = new MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.3, roughness: 0.6 });
const torqueTubeMaterial = new MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });

export interface TrackerRow {
  group: Group; // outer group: positioned + yawed to the axis bearing, add this to the scene
  setRotationDeg(deg: number): void;
  dispose(): void; // frees this row's own geometries (call before dropping the row on rebuild)
}

export interface TrackerRowParams {
  worldX: number;
  worldZ: number;
  hubHeightM: number;
  moduleLengthM: number;
  axisAzimuthDeg: number;
}

// Builds one tracker row. Two nested groups keep the two rotations unambiguous (three.js Euler
// composition order is easy to get backwards): an outer `orientationGroup` is yawed once around
// world Y so its local Z axis points along the tracker's compass bearing (see axisYawDeg), and
// an inner `pivotGroup` — whose local Z *is* that bearing — rotates around its own Z every frame
// to sweep the modules east-west, exactly like a torque tube spinning about its own centerline.
// Rotating pivotGroup about X or Y instead would incorrectly shift modules along the row.
export function createTrackerRow(params: TrackerRowParams): TrackerRow {
  const { worldX, worldZ, hubHeightM, moduleLengthM, axisAzimuthDeg } = params;

  const orientationGroup = new Group();
  orientationGroup.position.set(worldX, hubHeightM, worldZ);
  orientationGroup.rotation.y = (axisYawDeg(axisAzimuthDeg) * Math.PI) / 180;

  const pivotGroup = new Group();
  orientationGroup.add(pivotGroup);

  const n = cfg.modulesPerRow;
  const pitch = moduleLengthM + cfg.moduleGap;
  const totalLength = n * moduleLengthM + (n - 1) * cfg.moduleGap;

  const tubeSide = cfg.torqueTubeRadius * 2;
  const torqueTubeGeometry = new BoxGeometry(tubeSide, tubeSide, totalLength + tubeSide);
  const torqueTube = new Mesh(torqueTubeGeometry, torqueTubeMaterial);
  pivotGroup.add(torqueTube);

  const moduleGeometry = new BoxGeometry(cfg.moduleWidth, cfg.moduleThickness, moduleLengthM);
  for (let i = 0; i < n; i++) {
    const zOffset = (i - (n - 1) / 2) * pitch;
    const module = new Mesh(moduleGeometry, moduleMaterial);
    module.position.set(0, 0, zOffset);
    module.castShadow = true;
    pivotGroup.add(module);
  }

  return {
    group: orientationGroup,
    setRotationDeg(deg: number) {
      pivotGroup.rotation.z = (deg * Math.PI) / 180;
    },
    dispose() {
      torqueTubeGeometry.dispose();
      moduleGeometry.dispose();
    },
  };
}
