import { OrthographicCamera, Scene, VSMShadowMap, WebGLRenderer } from "three";
import { crossSection as cfg } from "./config";

export interface CrossSectionView {
  render(scene: Scene): void;
}

// A small orthographic (true-scale, no-perspective) side view, looking due north along world Z
// from due south — an east-west elevation of the tracker field: rows are seen edge-on so their
// tilt angle reads clearly, and because it's orthographic (not perspective), the ground and any
// shadows on it stay at a consistent, comparable scale across the frame rather than being
// foreshortened by distance. Static (no OrbitControls) — a fixed reference view, not meant to
// be manipulated like the main one.
export function createCrossSectionView(container: HTMLElement): CrossSectionView {
  const panel = document.createElement("div");
  panel.className = "cross-section-view";

  const title = document.createElement("div");
  title.className = "cross-section-title";
  title.textContent = "E-W cross section";
  panel.appendChild(title);

  // A perfectly horizontal (zero-pitch) elevation would show tracker tilt with no distortion,
  // but a flat horizontal ground viewed exactly edge-on has zero apparent area — shadows lying
  // on it would be an invisible sliver, defeating the point. So this tilts down slightly
  // (~15deg) to give the ground real screen area while staying orthographic (no
  // distance-based foreshortening, unlike a perspective camera).
  const camera = new OrthographicCamera(-cfg.halfWidthM, cfg.halfWidthM, cfg.heightM, 0, 0.1, 300);
  camera.position.set(0, 18, 70);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(cfg.pixelWidth, cfg.pixelHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;
  panel.appendChild(renderer.domElement);

  container.appendChild(panel);

  return {
    render(scene: Scene) {
      renderer.render(scene, camera);
    },
  };
}
