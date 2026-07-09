import { EditorState } from "../editorState";
import { CanvasRenderer } from "../rendering/canvasRenderer";
import { NodeDragHandler } from "../handlers/nodeDragHandler";
import { ViewportController } from "../handlers/viewportController";
import { screenToWorld } from "../layout/transformUtils";
import { PORT_HIT_RADIUS } from "../rendering/constants";
import { computeOrthogonalRoute } from "../rendering/orthogonalRouter";
import { pointToSegmentDist } from "../utils/geometry";
import { showContextMenu, hideContextMenu, getActiveMenu } from "./contextMenu";

/**
 * Manages canvas input events for the diagram editor
 * Routes mouse/keyboard events to appropriate handlers
 * Single Responsibility: Event routing and coordination
 */
export class CanvasInputManager {
  private nodeDragHandler: NodeDragHandler;
  private viewportController: ViewportController;

  constructor(
    private canvas: HTMLCanvasElement,
    private state: EditorState,
    private renderer: CanvasRenderer
  ) {
    this.nodeDragHandler = new NodeDragHandler(canvas, state, renderer, this.getMousePos);
    this.viewportController = new ViewportController(state, renderer);
    this.init();
  }

  private init() {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onCanvasMouseMove);
    this.canvas.addEventListener("mouseup", this.onCanvasMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("mousemove", this.onWindowMouseMove);
    window.addEventListener("mouseup", this.onWindowMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("mousedown", this.onWindowMouseDown);
  }

  /** Remove all registered event listeners to prevent memory leaks. */
  dispose(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onCanvasMouseMove);
    this.canvas.removeEventListener("mouseup", this.onCanvasMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("mousemove", this.onWindowMouseMove);
    window.removeEventListener("mouseup", this.onWindowMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("mousedown", this.onWindowMouseDown);
  }

  /**
   * Get world coordinates from mouse event using screen-to-world transformation.
   * Passed to NodeDragHandler to calculate node positions during drag operations.
   */
  private getMousePos = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    return screenToWorld(this.canvas,this.renderer.camera, this.state.view.zoom, screenX, screenY);
  };

  private onMouseDown = (e: MouseEvent) => {
    // Middle mouse button (button 1) for panning
    if (e.button === 1) {
      e.preventDefault();
      this.viewportController.startPanning(e);
      return;
    }

     if (e.button !== 0) return;

  const rect = this.canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  const worldPos = this.getMousePos(e);



    // Check port hit first (for connection creation)
    const hitPort = this.findPortAtPoint(worldPos.x, worldPos.y);
    if (hitPort) {
      this.state.dispatch({
        type: "START_CONNECTION_DRAG",
        fromPortId: hitPort.id,
        fromPortKind: hitPort.kind as 'event' | 'data',
        fromPortDirection: hitPort.direction as 'input' | 'output',
        fromPortDataType: hitPort.type,
        mouseX: worldPos.x,
        mouseY: worldPos.y
      });
      return;
    }
    
    // Try to find and start dragging a node at click position
    const clickedNode = this.findNodeAtPoint(worldPos.x, worldPos.y);
    if (clickedNode) {
      // Input layer dispatches interaction actions; state updates are handled by reducer.
      // Try to start drag first (so click-and-drag works)
      if (this.nodeDragHandler.tryStartDrag(e)) {
        return;
      }

      // If drag didn't start, select the node
      this.state.dispatch({ type: "SELECT_NODE", nodeId: clickedNode.id });
      return;
    }

    // Try to find a connection at click position
    const hitConn = this.findConnectionAtPoint(worldPos.x, worldPos.y);
    if (hitConn) {
      this.state.dispatch({ type: "SELECT_CONNECTION", connectionId: hitConn.id });
      return;
    }

    // Empty area was clicked - deselect any node/connection and start panning
    this.state.dispatch({ type: "SELECT_NODE", nodeId: undefined });
    this.viewportController.startPanning(e);
  };

  /**
   * Find the node at the given world coordinates
   * Returns the topmost node if multiple nodes overlap
   * @param worldX - World coordinate X
   * @param worldY - World coordinate Y
   * @returns The node at the point, or undefined if no node
   */
  private findNodeAtPoint(worldX: number, worldY: number) {
    for (const node of this.state.nodes) {
      // Check if point is inside node bounding box
      if (
        worldX >= node.x &&
        worldX <= node.x + node.width &&
        worldY >= node.y &&
        worldY <= node.y + node.height
      ) {
        return node;
      }
    }
    return undefined;
  }

  private onWindowMouseMove = (e: MouseEvent) => {
    this.nodeDragHandler.updateDragPosition(e);
  };

  private onCanvasMouseMove = (e: MouseEvent) => {
    this.viewportController.updatePan(e);

    const worldPos = this.getMousePos(e);

    // Connection drag: update rubber-band endpoint
    if (this.state.pendingConnection) {
      this.state.dispatch({
        type: "UPDATE_CONNECTION_DRAG",
        mouseX: worldPos.x,
        mouseY: worldPos.y
      });

      // Also update port hover for target feedback
      const hitPort = this.findPortAtPoint(worldPos.x, worldPos.y);
      const hitPortId = hitPort?.id;
      if (hitPortId !== this.state.hoveredPortId) {
        this.state.dispatch({ type: "HOVER_PORT", portId: hitPortId });
      }
      return;
    }

    // Port hover detection (skip during drag/pan for performance)
    if (!this.state.isDragging && !this.viewportController.isPanningActive()) {
      const hitPort = this.findPortAtPoint(worldPos.x, worldPos.y);
      const hitPortId = hitPort?.id;
      if (hitPortId !== this.state.hoveredPortId) {
        this.state.dispatch({ type: "HOVER_PORT", portId: hitPortId });
      }
    }
  };

  private onCanvasMouseUp = (e: MouseEvent) => {
    if (this.state.pendingConnection) {
      this.completeOrCancelConnection(e);
      return;
    }
    this.viewportController.stopPanning();
  };

  private onWindowMouseUp = (e: MouseEvent) => {
    if (this.state.pendingConnection) {
      this.completeOrCancelConnection(e);
      return;
    }
    this.nodeDragHandler.stopDrag();
    this.viewportController.stopPanning();
  };

  /**
   * Attempt to complete connection drag on the target port.
   * If no valid port under cursor, cancel.
   */
  private completeOrCancelConnection(e: MouseEvent) {
    const worldPos = this.getMousePos(e);
    const targetPort = this.findPortAtPoint(worldPos.x, worldPos.y);

    if (targetPort) {
      this.state.dispatch({
        type: "COMPLETE_CONNECTION_DRAG",
        toPortId: targetPort.id,
        toPortKind: targetPort.kind as 'event' | 'data',
        toPortDirection: targetPort.direction as 'input' | 'output',
        toPortDataType: targetPort.type
      });
    } else {
      this.state.dispatch({ type: "CANCEL_CONNECTION_DRAG" });
    }
  }

  private onWheel = (e: WheelEvent) => {
    // Prevent default scroll behavior
    e.preventDefault();

    // Get mouse position relative to canvas
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Handle zoom with wheel
    this.viewportController.handleZoom(e.deltaY, screenX, screenY);
  };

  /**
   * Find the port closest to the given world coordinates within hit radius
   * @returns The port if found, undefined otherwise
   */
  private findPortAtPoint(worldX: number, worldY: number) {
    const hitR = PORT_HIT_RADIUS;
    for (const node of this.state.nodes) {
      for (const port of node.ports) {
        const dx = worldX - port.x;
        const dy = worldY - port.y;
        if (dx * dx + dy * dy <= hitR * hitR) {
          return port;
        }
      }
    }
    return undefined;
  }

  // ============ Connection Hit Testing ============

  /** Hit distance threshold for connection click detection (px in world coords) */
  private static readonly CONNECTION_HIT_RADIUS = 5;

  /**
   * Find a connection at the given world coordinates.
   * Computes the orthogonal route for each connection and checks
   * point-to-segment distance for each segment of the polyline.
   */
  private findConnectionAtPoint(worldX: number, worldY: number) {
    const hitR = CanvasInputManager.CONNECTION_HIT_RADIUS;

    for (const c of this.state.connections) {
      const fromPort = this.state.nodes
        .flatMap(n => n.ports)
        .find(p => p.id === c.fromPortId);
      const toPort = this.state.nodes
        .flatMap(n => n.ports)
        .find(p => p.id === c.toPortId);
      if (!fromPort || !toPort) continue;

      const fromNodeId = c.fromPortId.split(".")[0];
      const toNodeId = c.toPortId.split(".")[0];
      const obstacles = this.state.nodes
        .filter(n => n.id !== fromNodeId && n.id !== toNodeId)
        .map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }));

      const waypoints = computeOrthogonalRoute(fromPort, toPort, obstacles);

      for (let i = 0; i < waypoints.length - 1; i++) {
        const dist = pointToSegmentDist(
          worldX, worldY,
          waypoints[i].x, waypoints[i].y,
          waypoints[i + 1].x, waypoints[i + 1].y
        );
        if (dist <= hitR) return c;
      }
    }
    return undefined;
  }

  // ============ Context Menu ============

  /**
   * Right-click context menu on canvas.
   * Shows "Удалить" option when clicking on a node or connection.
   * Also shows "Generate Python Code" for blocks.
   */
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    hideContextMenu();

    const worldPos = this.getMousePos(e);

    // Check if right-clicked on a node
    const clickedNode = this.findNodeAtPoint(worldPos.x, worldPos.y);
    if (clickedNode) {
      this.state.dispatch({ type: "SELECT_NODE", nodeId: clickedNode.id });
      showContextMenu(
        e.clientX, 
        e.clientY, 
        () => {
          this.state.dispatch({ type: "DELETE_NODE", nodeId: clickedNode.id });
        },
        () => {
          // Generate Python Code
          const blockType = (clickedNode as any).typeShort || 
                            clickedNode.type || 
                            clickedNode.id;

          // Send message to extension host
          this.state.sendMessage({
            type: "generate-python",
            blockType: blockType
          });
        }
      );
      return;
    }

    // Check if right-clicked on a connection
    const clickedConn = this.findConnectionAtPoint(worldPos.x, worldPos.y);
    if (clickedConn) {
      this.state.dispatch({ type: "SELECT_CONNECTION", connectionId: clickedConn.id });
      showContextMenu(e.clientX, e.clientY, () => {
        this.state.dispatch({ type: "DELETE_CONNECTION", connectionId: clickedConn.id });
      });
      return;
    }
  };

  /**
   * Close context menu on any mouse click outside
   */
  private onWindowMouseDown = (e: MouseEvent) => {
    const menu = getActiveMenu();
    if (menu && !menu.contains(e.target as Node)) {
      hideContextMenu();
    }
  };

  // ============ Keyboard ============

  /**
   * Handle keyboard shortcuts.
   * Delete key: delete selected node or connection.
   */
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete") {
      const sel = this.state.selection;
      if (sel?.nodeId) {
        this.state.dispatch({ type: "DELETE_NODE", nodeId: sel.nodeId });
      } else if (sel?.connectionId) {
        this.state.dispatch({ type: "DELETE_CONNECTION", connectionId: sel.connectionId });
      }
    }
  };
}