import { RepeatWrapping, Texture } from "three";

// Procedural speckled-grass texture: a lighter base green than the old flat fill, plus random
// patches of slightly varying shade so the ground doesn't read as a single flat color from
// directly overhead. Tiled (RepeatWrapping) across the ground plane rather than stretched.
export function createGroundTexture(): Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#6f9153";
  ctx.fillRect(0, 0, size, size);

  const speckleCount = 2200;
  for (let i = 0; i < speckleCount; i++) {
    const shade = 40 + Math.random() * 60; // varying lightness patches
    const hue = 95 + Math.random() * 25; // stays within green range
    ctx.fillStyle = `hsl(${hue}, 35%, ${shade}%)`;
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new Texture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(14, 14);
  return texture;
}
