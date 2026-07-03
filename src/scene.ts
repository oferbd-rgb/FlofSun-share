import {
  Color,
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
import { billboards as billboardCfg, scene as sceneCfg, shadeLine as shadeLineCfg, tracker as trackerCfg } from "./config";
import { getDate, getLocation, getTrackerGeometry, onGeometryChange, onStateChange } from "./appState";
import { createBillboard, loadLogoImage } from "./billboard";
import { addCompassLabels } from "./compassLabels";
import { createGroundTexture } from "./groundTexture";
import { createSunLightRig, type SunLightRig } from "./sunLight";
import { createSunPath } from "./sunPath";
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
  scene.background = new Color(sceneCfg.skyColor);

  const ground = new Mesh(
    new PlaneGeometry(sceneCfg.groundSize, sceneCfg.groundSize),
    new MeshStandardMaterial({ map: createGroundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Silver east-west reference strip, slightly above the ground to avoid z-fighting — a ruler
  // for gauging tracker shadow position/length at a glance, even in a single still frame.
  const shadeLine = new Mesh(
    new PlaneGeometry(sceneCfg.groundSize, shadeLineCfg.widthM),
    new MeshStandardMaterial({ color: shadeLineCfg.color, roughness: 0.4, metalness: 0.3 }),
  );
  shadeLine.rotation.x = -Math.PI / 2;
  shadeLine.position.set(0, 0.01, shadeLineCfg.worldZ);
  shadeLine.receiveShadow = true;
  scene.add(shadeLine);

  scene.add(new HemisphereLight(0xbfd8ff, 0x3a3a2a, 0.6));
  const sunLightRig = createSunLightRig(scene);
  addCompassLabels(scene);
  addTrees(scene);

  const initialLocation = getLocation();
  const sunPath = createSunPath(getDate(), initialLocation.latitude, initialLocation.longitude, sceneCfg.sunMarkerDistance);
  scene.add(sunPath.line);
  onStateChange(() => {
    const loc = getLocation();
    sunPath.update(getDate(), loc.latitude, loc.longitude, sceneCfg.sunMarkerDistance);
  });

  loadLogoImage(billboardCfg.logoUrl).then((logoImage) => {
    for (const sign of billboardCfg.signs) {
      const billboard = createBillboard({
        worldX: sign.worldX,
        worldZ: sign.worldZ,
        facingAzimuthDeg: sign.facingAzimuthDeg,
        widthM: billboardCfg.widthM,
        heightM: billboardCfg.heightM,
        hoverHeightM: billboardCfg.hoverHeightM,
        logoImage,
      });
      scene.add(billboard);
    }
  });

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
      const worldX = (i - (trackerCfg.rowCount - 1) / 2) * geometry.rowSpacingM;
      const row = createTrackerRow({
        worldX,
        hubHeightM: geometry.hubHeightM,
        moduleLengthM: geometry.moduleLengthM,
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
