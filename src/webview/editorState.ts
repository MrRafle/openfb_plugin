import { FBTypeModel, FBPort } from "../shared/models/fbtModel";
import { FBKind } from "../shared/models/FBKind";
import type { SysModel, SysConnection } from "../shared/models/sysModel";
import { getWebviewLogger } from "./logging";
import { calculateNodeDimensions } from "./layout/nodeLayout";
import { editorReducer, createInitialState } from "./store/reducer";
import type { EditorAction } from "./store/actions";
import type { EditorStore, EditorStoreState } from "./store/types";
import { logEditorAction } from "./store/middleware";
import { buildPorts, convertDiagramToEditorGraph } from "./modelConverter";

/**
 * Type alias for backward compatibility.
 * DiagramModel is now SysModel from the domain layer.
 */
export type DiagramModel = SysModel;

/**
 * Type alias: DiagramConnection is SysConnection from the domain layer.
 */
export type DiagramConnection = SysConnection;

export interface EditorPort extends FBPort {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  value?: string;
  isDefaultValue?: boolean;
}

export interface EditorNode {
  id: string;
  type: string;
  x: number;
  y: number;
  ports: EditorPort[];
  width: number;
  height: number;
  deviceColor?: string;  // Color from device mapping (R,G,B)
  fbKind?: FBKind;
  resolvedTypePath?: string;
}

export interface EditorConnection {
  id: string;
  fromPortId: string;
  toPortId: string;
  type?: "event" | "data";  // Connection type from diagram
}

export interface ViewState {
  zoom: number;        // 1.0 = 100%
  offsetX: number;     // Pan offset X
  offsetY: number;     // Pan offset Y
}

export class EditorState implements EditorStore {
  nodes: EditorNode[] = [];
  connections: EditorConnection[] = [];
  isDirty = false;
  isDragging = false;
  hoveredPortId?: string;
  pendingConnection?: {
    fromPortId: string;
    fromPortKind: 'event' | 'data';
    fromPortDirection: 'input' | 'output';
    fromPortDataType?: string;
    mouseX: number;
    mouseY: number;
  };
  fbTypes?: Map<string, FBTypeModel>;
  model?: SysModel;  
  private logger = getWebviewLogger();
  private postMessageFn?: (msg: unknown) => void;

  // Normalization parameters for reverse transformation on save
  private normParams?: { minX: number; minY: number; scale: number; offsetX: number; offsetY: number };

  // Cache node dimensions by FB type to avoid recalculation
  private dimensionCache: Map<string, { width: number; height: number }> = new Map();

  view: ViewState = {
    zoom: 1.0,
    offsetX: 0,
    offsetY: 0
  };

  selection: {
    nodeId?: string;
    connectionId?: string;
  } = {};

  private storeState: EditorStoreState = createInitialState();
  private listeners = new Set<(state: EditorStoreState) => void>();

  constructor() {
    this.syncPublicStateFromStore();
  }

  /**
   * Set postMessage callback for communicating dirty state to extension host.
   */
  public setPostMessage(fn: (msg: unknown) => void): void {
    this.postMessageFn = fn;
  }

  /**
   * Send message to the VS Code extension host
   */
  public sendMessage(msg: unknown): void {
    if (this.postMessageFn) {
      this.postMessageFn(msg);
    } else {
      console.warn("[EditorState] postMessageFn is not set");
    }
  }

  /**
   * Get stored normalization parameters (for reverse transform on save).
   */
  public getNormParams(): { minX: number; minY: number; scale: number; offsetX: number; offsetY: number } | undefined {
    return this.normParams;
  }

  public getState(): EditorStoreState {
    return this.storeState;
  }

  public subscribe(listener: (state: EditorStoreState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispatch(action: EditorAction): void {
    // Central state pipeline: dispatch -> reducer -> sync public fields -> notify subscribers
    logEditorAction(action);
    this.storeState = editorReducer(this.storeState, action);
    this.syncPublicStateFromStore();
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.storeState);
    }
  }

  private syncPublicStateFromStore(): void {
    const prevDirty = this.isDirty;
    this.nodes = this.storeState.diagram.nodes;
    this.connections = this.storeState.diagram.connections;
    this.isDirty = this.storeState.diagram.isDirty;
    this.fbTypes = this.storeState.diagram.fbTypes;
    this.model = this.storeState.diagram.model;
    this.isDragging = this.storeState.ui.isDragging;
    this.hoveredPortId = this.storeState.ui.hoveredPortId;
    this.pendingConnection = this.storeState.ui.pendingConnection;
    this.selection = { ...this.storeState.ui.selection };
    this.view = { ...this.storeState.ui.viewport };

    // Notify extension host when dirty state changes
    if (this.isDirty !== prevDirty && this.postMessageFn) {
      this.postMessageFn({ type: "dirty-state-changed", isDirty: this.isDirty });
    }
  }

  public loadFromDiagram(
    diagram: SysModel,
    fbTypes: Map<string, FBTypeModel>
  ) {
    // Clear caches when loading new diagram
    this.dimensionCache.clear();

    const result = convertDiagramToEditorGraph(diagram, fbTypes, this.dimensionCache, this.logger);
    this.normParams = result.normParams;

    this.dispatch({
      type: "SET_GRAPH_DATA",
      model: diagram,
      fbTypes,
      nodes: result.nodes,
      connections: result.connections,
      initialZoom: result.initialZoom,
    });

    this.logger.info("Total nodes created", this.nodes.length);
    this.logger.info("Total connections created", this.connections.length);
  }

  public moveNode(id: string, x: number, y: number) {
    this.dispatch({ type: "MOVE_NODE", nodeId: id, x, y });
  }

  public selectNode(id?: string) {
    this.dispatch({ type: "SELECT_NODE", nodeId: id });
  }

  /**
   * Generate a unique node ID like "E_SWITCH_3" by finding the highest
   * existing suffix number for this type among all current nodes.
   */
  private generateNodeId(blockType: string): string {
    const prefix = `${blockType}_`;
    let maxNum = 0;
    for (const node of this.nodes) {
      if (node.id.startsWith(prefix)) {
        const suffix = node.id.slice(prefix.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    return `${prefix}${maxNum + 1}`;
  }

  /**
   * Add a new FB block to the diagram by type name and world coordinates.
   * Builds ports from FBTypeModel, calculates dimensions, generates unique ID,
   * and dispatches ADD_NODE to the store.
   */
  public addNode(blockType: string, worldX: number, worldY: number): void {
    const fbType = this.fbTypes?.get(blockType);
    if (!fbType) {
      this.logger.warn(`Cannot add node: FB type "${blockType}" not found in loaded types`);
      return;
    }

    const resolvedTypeName = (fbType.name || blockType).trim();

    const id = this.generateNodeId(resolvedTypeName);
    const ports = buildPorts(id, fbType);

    // Use cached dimensions or calculate and cache them
    let dimensions = this.dimensionCache.get(resolvedTypeName);
    if (!dimensions) {
      dimensions = calculateNodeDimensions(ports);
      this.dimensionCache.set(resolvedTypeName, dimensions);
    }

    this.dispatch({
      type: "ADD_NODE",
      node: {
        id,
        type: resolvedTypeName,
        x: worldX,
        y: worldY,
        ports,
        width: dimensions.width,
        height: dimensions.height,
        fbKind: fbType.kind,
      },
    });

    this.logger.info(`Added node "${id}" (type=${resolvedTypeName}) at (${worldX.toFixed(1)}, ${worldY.toFixed(1)})`);
  }
}

