import { EditorState } from "../editorState";
import { CanvasRenderer } from "../rendering/canvasRenderer";
import { ZOOM_CONFIG } from "../constants";

export class ViewportController {
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;

  constructor(
    private state: EditorState,
    private renderer: CanvasRenderer
  ) {}

  isPanningActive(): boolean {
    return this.isPanning;
  }

  startPanning(e: MouseEvent): void {
    this.isPanning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
  }

  updatePan(e: MouseEvent): void {
    if (!this.isPanning) return;

    const deltaX = e.clientX - this.panStartX;
    const deltaY = e.clientY - this.panStartY;

    this.state.dispatch({ type: "PAN", dx: deltaX, dy: deltaY });
    this.renderer.camera.offsetX = this.state.view.offsetX;
    this.renderer.camera.offsetY = this.state.view.offsetY;

    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
  }

  stopPanning(): void {
    this.isPanning = false;
  }

  handleZoom(delta: number, screenX: number, screenY: number): void {
    const zoomFactor = delta > 0
      ? 1 - ZOOM_CONFIG.STEP
      : 1 + ZOOM_CONFIG.STEP;

    this.state.dispatch({
      type: "ZOOM",
      factor: zoomFactor,
      centerX: screenX,
      centerY: screenY,
      canvasCenterX: this.renderer.logicalWidth / 2,
      canvasCenterY: this.renderer.logicalHeight / 2
    });

    this.renderer.camera.offsetX = this.state.view.offsetX;
    this.renderer.camera.offsetY = this.state.view.offsetY;
  }
}