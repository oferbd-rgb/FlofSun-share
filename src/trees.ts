import { CylinderGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, Scene } from "three";
import { scene as sceneCfg } from "./config";

const trunkMaterial = new MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
const canopyMaterial = new MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });

function createTree(scale: number): Group {
  const tree = new Group();

  const trunkHeight = 1.6 * scale;
  const trunk = new Mesh(new CylinderGeometry(0.12 * scale, 0.16 * scale, trunkHeight, 8), trunkMaterial);
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  tree.add(trunk);

  const canopyHeight = 2.6 * scale;
  const canopy = new Mesh(new ConeGeometry(1.1 * scale, canopyHeight, 10), canopyMaterial);
  canopy.position.y = trunkHeight + canopyHeight / 2 - 0.2 * scale;
  canopy.castShadow = true;
  tree.add(canopy);

  return tree;
}

// A handful of static trees beside the tracker field, purely so shadow direction/length can be
// read on the ground independent of the rotating panels.
export function addTrees(scene: Scene): void {
  const edge = sceneCfg.groundSize / 2 - 6;
  const placements: [x: number, z: number, scale: number][] = [
    [-edge, -edge + 4, 1.1],
    [-edge + 6, -edge, 0.9],
    [edge - 4, -edge + 2, 1.0],
    // Was [edge, edge - 6, 1.2] — removed, it sat right next to the EDF billboard (20, 18).
    [-edge + 3, edge - 3, 0.8],
  ];

  for (const [x, z, scale] of placements) {
    const tree = createTree(scale);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }
}
