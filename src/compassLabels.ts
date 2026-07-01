import { CanvasTexture, Scene, Sprite, SpriteMaterial } from "three";
import { scene as sceneCfg } from "./config";

function createLabelSprite(text: string): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 88px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 68);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new Sprite(material);
  sprite.scale.set(4, 4, 1);
  return sprite;
}

// World convention (see sunPosition.ts): +X = East, +Z = South, so North is -Z, West is -X.
export function addCompassLabels(scene: Scene): void {
  const r = sceneCfg.groundSize / 2 + 4;
  const labels: [string, number, number][] = [
    ["N", 0, -r],
    ["S", 0, r],
    ["E", r, 0],
    ["W", -r, 0],
  ];
  for (const [text, x, z] of labels) {
    const sprite = createLabelSprite(text);
    sprite.position.set(x, 1, z);
    scene.add(sprite);
  }
}
