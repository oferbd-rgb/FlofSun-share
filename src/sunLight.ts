import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { scene as sceneCfg } from "./config";

const SUN_DISTANCE = 100; // distance for the shadow-casting light — arbitrary, just needs to be "far"

export interface SunLightRig {
  light: DirectionalLight;
  sunMarker: Mesh;
  updateSunPosition(sunDir: Vector3): void;
}

export function createSunLightRig(scene: Scene): SunLightRig {
  const light = new DirectionalLight(0xffffff, 2);
  light.castShadow = true;

  const halfFootprint = sceneCfg.groundSize / 2 + 5;
  light.shadow.camera.left = -halfFootprint;
  light.shadow.camera.right = halfFootprint;
  light.shadow.camera.top = halfFootprint;
  light.shadow.camera.bottom = -halfFootprint;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SUN_DISTANCE * 2;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0005;

  scene.add(light);
  scene.add(light.target);

  // Fill light so shadowed faces aren't pure black.
  scene.add(new AmbientLight(0xffffff, 0.35));

  // Visible marker for the sun itself — MeshBasicMaterial so it's always bright regardless
  // of scene lighting, making it easy to spot where the sun actually is.
  const sunMarker = new Mesh(new SphereGeometry(1.5, 16, 16), new MeshBasicMaterial({ color: 0xfff2b0 }));
  scene.add(sunMarker);

  return {
    light,
    sunMarker,
    updateSunPosition(sunDir: Vector3) {
      light.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
      light.target.position.set(0, 0, 0);
      sunMarker.position.copy(sunDir).multiplyScalar(sceneCfg.sunMarkerDistance);
      // Below the horizon: keep both parked/hidden so nothing NaNs out and the marker
      // doesn't show through the ground.
      const aboveHorizon = sunDir.y > 0;
      light.visible = aboveHorizon;
      sunMarker.visible = aboveHorizon;
    },
  };
}
