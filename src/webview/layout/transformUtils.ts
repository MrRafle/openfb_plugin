import { Camera } from "../rendering/types";

/**
 * Convert screen (CSS) coordinates to world coordinates.
 * Работает в CSS-пикселях, без DPR.
 */
export function screenToWorld(
  canvas: HTMLCanvasElement,
  camera: Camera,
  viewZoom: number,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const scale = camera.scale;

  const worldX = (screenX - centerX * (1 - viewZoom) - viewZoom * camera.offsetX) / (viewZoom * scale);
  const worldY = (screenY - centerY * (1 - viewZoom) - viewZoom * camera.offsetY) / (viewZoom * scale);

  return { x: worldX, y: worldY };
}