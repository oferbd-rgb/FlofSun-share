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
import { addCompassLabels } from "./compassLabels";
import { createSunLightRig, type SunLightRig } from "./sunLight";
import { createTrackerRow, type TrackerRow } from "./tracker";
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

  const rows: TrackerRow[] = [];
  for (let i = 0; i < trackerCfg.rowCount; i++) {
    const worldX = (i - (trackerCfg.rowCount - 1) / 2) * trackerCfg.rowSpacing;
    const row = createTrackerRow(worldX);
    scene.add(row.group);
    rows.push(row);
  }

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
