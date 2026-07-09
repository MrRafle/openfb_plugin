import { EditorState } from "../editorState";
import { getWebviewLogger } from "../logging";
import { createCamera, applyCamera } from "./camera";
import { Camera } from "./types";
import { clearCanvas, drawGrid } from "./grid";
import { drawConnections } from "./connectionRenderer";
import { drawNodes } from "./nodeRenderer";
import { drawStatsAndLegend } from "./legendRenderer";
import {
  EMPTY_NODES_COLOR,
  EMPTY_NODES_FONT,
  EMPTY_NODES_X,
  EMPTY_NODES_Y,
} from "./constants";
import { tr } from "../i18nService";

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private logger = getWebviewLogger();
  camera: Camera;

  get logicalWidth(): number {
    return this.canvas.width;
  }

  get logicalHeight(): number {
    return this.canvas.height;
  }

  constructor(public readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.logger.error("Failed to get 2D context from canvas");
      throw new Error("No canvas context");
    }
    this.camera = createCamera();
    this.logger.info("CanvasRenderer initialized successfully");
    this.ctx = ctx;
  }

  /**
   * Устанавливаем размер canvas в CSS-пикселях (без DPR)
   */
  resize(cssWidth: number, cssHeight: number): void {
    this.canvas.width = cssWidth;
    this.canvas.height = cssHeight;
    this.logger.debug(`Canvas resized to ${cssWidth}x${cssHeight}`);
  }

  render(state: EditorState): void {
    const w = this.logicalWidth;
    const h = this.logicalHeight;
    this.logger.debug(`Rendering ${state.nodes.length} nodes`);
    this.logger.debug("Canvas size", w, "x", h);

    // Clear canvas
    clearCanvas(this.ctx, w, h);

    // Draw grid background
    drawGrid(this.ctx, w, h);

    // Apply transformations
    this.ctx.save();

    // Apply zoom from editor state
    this.ctx.translate(w / 2, h / 2);
    this.ctx.scale(state.view.zoom, state.view.zoom);
    this.ctx.translate(-w / 2, -h / 2);

    // Apply camera transformation
    applyCamera(this.ctx, this.camera);

    // Draw connections
    drawConnections(this.ctx, state, state.selection.connectionId);

    // Draw nodes
    drawNodes(this.ctx, state.nodes, state.selection.nodeId, state.hoveredPortId);

    this.ctx.restore();

    // Show empty diagram message
    if (state.nodes.length === 0) {
      this.ctx.fillStyle = EMPTY_NODES_COLOR;
      this.ctx.font = EMPTY_NODES_FONT;
      this.ctx.fillText(tr("canvas.emptyDiagram"), EMPTY_NODES_X, EMPTY_NODES_Y);
    }

    // Draw overlay UI (stats and legend)
    drawStatsAndLegend(this.ctx, state, w, {
      offsetX: this.camera.offsetX,
      offsetY: this.camera.offsetY,
      scale: this.camera.scale * state.view.zoom,
    });
  }
}