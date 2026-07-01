import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { tracker as cfg } from "./config";

const moduleMaterial = new MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.3, roughness: 0.6 });
const torqueTubeMaterial = new MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });

export interface TrackerRow {
  group: Group;
  setRotationDeg(deg: number): void;
}

// Builds one tracker row: a pivot Group centered on the torque-tube axis (world Z, N-S),
// with `modulesPerRow` modules mounted along it. Rotating the pivot around its local Z axis
// (the tube's own centerline) sweeps the modules' faces east-west without moving their
// position along the row — that's the physically correct rotation axis for a torque tube
// spinning about itself (rotating about X or Y here would incorrectly shift modules along
// the row as they "rotate").
export function createTrackerRow(worldX: number): TrackerRow {
  const group = new Group();
  group.position.set(worldX, cfg.hubHeight, 0);

  const n = cfg.modulesPerRow;
  const pitch = cfg.moduleLength + cfg.moduleGap;
  const totalLength = n * cfg.moduleLength + (n - 1) * cfg.moduleGap;

  const tubeSide = cfg.torqueTubeRadius * 2;
  const torqueTube = new Mesh(new BoxGeometry(tubeSide, tubeSide, totalLength + tubeSide), torqueTubeMaterial);
  group.add(torqueTube);

  const moduleGeometry = new BoxGeometry(cfg.moduleWidth, cfg.moduleThickness, cfg.moduleLength);
  for (let i = 0; i < n; i++) {
    const zOffset = (i - (n - 1) / 2) * pitch;
    const module = new Mesh(moduleGeometry, moduleMaterial);
    module.position.set(0, 0, zOffset);
    module.castShadow = true;
    group.add(module);
  }

  return {
    group,
    setRotationDeg(deg: number) {
      group.rotation.z = (deg * Math.PI) / 180;
    },
  };
}
