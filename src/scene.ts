import {
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  VSMShadowMap,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { scene as sceneCfg, tracker as trackerCfg } from "./config";
import { getTrackerGeometry, onGeometryChange } from "./appState";
import { addCompassLabels } from "./compassLabels";
import { createSunLightRig, type SunLightRig } from "./sunLight";
import { createTrackerRow, type TrackerRow } from "./tracker";
import { rowOffsetToWorldXZ } from "./trackerMath";
import { addTrees } from "./trees";

export interface AppScene {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  sunLightRig: SunLightRig;
  rows: TrackerRow[];
}

export function createAppScene(canvasContainer: HTMLElement): AppScene {
  const scene = new Scene();

  const ground = new Mesh(
    new PlaneGeometry(sceneCfg.groundSize, sceneCfg.groundSize),
    new MeshStandardMaterial({ color: 0x4a5d3a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new HemisphereLight(0xbfd8ff, 0x3a3a2a, 0.6));
  const sunLightRig = createSunLightRig(scene);
  addCompassLabels(scene);
  addTrees(scene);

  // Kept as a stable array reference (mutated in place by rebuildRows) rather than reassigned,
  // so callers that destructured `rows` from this function's return value keep seeing live rows
  // after a geometry-driven rebuild.
  const rows: TrackerRow[] = [];

  function rebuildRows(): void {
    for (const row of rows) {
      scene.remove(row.group);
      row.dispose();
    }
    rows.length = 0;

    const geometry = getTrackerGeometry();
    for (let i = 0; i < trackerCfg.rowCount; i++) {
      const offsetM = (i - (trackerCfg.rowCount - 1) / 2) * geometry.rowSpacingM;
      const { x, z } = rowOffsetToWorldXZ(offsetM, geometry.axisAzimuthDeg);
      const row = createTrackerRow({
        worldX: x,
        worldZ: z,
        hubHeightM: geometry.hubHeightM,
        moduleLengthM: geometry.moduleLengthM,
        axisAzimuthDeg: geometry.axisAzimuthDeg,
      });
      scene.add(row.group);
      rows.push(row);
    }
  }

  rebuildRows();
  onGeometryChange(rebuildRows);

  const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(45, 32, 55);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;
  canvasContainer.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 8, 0);
  controls.enableDamping = true;
  controls.update();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, sunLightRig, rows };
}
