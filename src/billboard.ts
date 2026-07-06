import { DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, CanvasTexture, SRGBColorSpace } from "three";

export interface BillboardParams {
  worldX: number;
  worldZ: number;
  facingAzimuthDeg: number; // 0=N, 90=E, 180=S, 270=W — same convention as sunPosition.ts
  widthM: number;
  heightM: number;
  hoverHeightM: number; // gap between the ground and the sign's bottom edge
  logoImage: HTMLImageElement;
}

// Loads an SVG (or any raster-able image format) as an HTMLImageElement, ready to draw onto a
// canvas. Browsers rasterize SVGs directly via <img>, so no extra parsing library is needed.
export function loadLogoImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load billboard image: ${url}`));
    image.src = url;
  });
}

// A sign: a thin plane textured with the logo, letterboxed (transparent padding) to fit
// widthM x heightM without distorting its aspect ratio, and hard-cutout via alphaTest so only
// the logo shape itself is opaque — "no solid background" — which also means its cast shadow
// follows the logo's silhouette rather than a solid rectangle.
//
// DoubleSide so it's guaranteed visible from either direction (the logo reads correctly from
// facingAzimuthDeg's side, mirrored from the opposite side — the same tradeoff a real static
// decal/sticker has, and simpler/more robust than relying on single-sided face culling lining
// up exactly with a specific viewing direction).
//
// The plane's default (unrotated) normal points +Z (south, matching sunPosition.ts's
// convention), so facingAzimuthDeg=180 needs no rotation; other bearings yaw the whole mesh
// (geometry + texture together) around world Y.
export function createBillboard(params: BillboardParams): Mesh {
  const { worldX, worldZ, facingAzimuthDeg, widthM, heightM, hoverHeightM, logoImage } = params;

  const pxPerMeter = 200;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthM * pxPerMeter);
  canvas.height = Math.round(heightM * pxPerMeter);
  const ctx = canvas.getContext("2d")!;

  const fitScale = Math.min(canvas.width / logoImage.width, canvas.height / logoImage.height);
  const drawW = logoImage.width * fitScale;
  const drawH = logoImage.height * fitScale;
  ctx.drawImage(logoImage, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const material = new MeshStandardMaterial({
    map: texture,
    alphaTest: 0.4, // hard cutout instead of alpha blending — no solid background panel
    side: DoubleSide,
    roughness: 0.6,
  });

  const mesh = new Mesh(new PlaneGeometry(widthM, heightM), material);
  mesh.position.set(worldX, hoverHeightM + heightM / 2, worldZ);
  mesh.rotation.y = ((180 - facingAzimuthDeg) * Math.PI) / 180;
  mesh.castShadow = true;
  return mesh;
}
