import type { EditorState } from "../editorState";
import type { CanvasRenderer } from "../rendering/canvasRenderer";
import type { WebviewLogger } from "../logging";
import { PANEL_LAYOUT_CONFIG } from "../constants";

interface CanvasLayoutDeps {
  canvas: HTMLCanvasElement;
  state: EditorState;
  renderer: CanvasRenderer;
  logger: WebviewLogger;
}

export function createCanvasLayout(deps: CanvasLayoutDeps) {
  const { canvas, state, renderer, logger } = deps;

  function resize(): void {
    const cssWidth = window.innerWidth - PANEL_LAYOUT_CONFIG.RIGHT_PANEL_WIDTH;
    const toolbar = document.getElementById(PANEL_LAYOUT_CONFIG.TOOLBAR_ID);
    const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
    const cssHeight = Math.max(0, window.innerHeight - toolbarHeight);

    renderer.resize(cssWidth, cssHeight);
    logger.debug(`Canvas resized to ${cssWidth}x${cssHeight} (toolbar ${toolbarHeight}px)`);
    renderer.render(state);
  }

  function centerDiagramInCanvas(): void {
    if (!state.nodes || state.nodes.length === 0) {
      renderer.camera.offsetX = 0;
      renderer.camera.offsetY = 0;
      const resetDx = -state.view.offsetX;
      const resetDy = -state.view.offsetY;
      if (resetDx !== 0 || resetDy !== 0) {
        state.dispatch({ type: "PAN", dx: resetDx, dy: resetDy });
      }
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of state.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const diagramCenterX = (minX + maxX) / 2;
    const diagramCenterY = (minY + maxY) / 2;
    const targetOffsetX = renderer.logicalWidth / 2 - diagramCenterX;
    const targetOffsetY = renderer.logicalHeight / 2 - diagramCenterY;

    renderer.camera.offsetX = targetOffsetX;
    renderer.camera.offsetY = targetOffsetY;

    const dx = targetOffsetX - state.view.offsetX;
    const dy = targetOffsetY - state.view.offsetY;
    if (dx !== 0 || dy !== 0) {
      state.dispatch({ type: "PAN", dx, dy });
    }
  }

  return {
    resize,
    centerDiagramInCanvas,
  };
}