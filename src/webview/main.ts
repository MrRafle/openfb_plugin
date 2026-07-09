import { EditorState } from "./editorState";
import { CanvasRenderer } from "./rendering/canvasRenderer";
import { CanvasInputManager } from "./input/canvasInputManager";
import { initializeWebviewLogger } from "./logging";
import { createLeftPanelController } from "./panels/leftPanel";
import { createRightPanelController } from "./panels/rightPanel";
import { createMessageHandler } from "./handlers/messageHandler";
import { setupToolbarHandlers } from "./handlers/toolbarHandlers";
import { setupCanvasDnd } from "./handlers/canvasDnd";
import { createCanvasLayout } from "./layout/canvasLayout";
import { screenToWorld } from "./layout/transformUtils";
import { createSettingsDialogController } from "./handlers/settingsDialogController";
import { createNewFbDialogController } from "./handlers/newFbDialogController";
import { setupCollapsibleDelegation } from "./panels/components/collapsible";
import { tr } from "./i18nService";

/**
 * VS Code Webview API for communication with the extension host
 */
interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

const logger = initializeWebviewLogger();
logger.info("main.ts starting...");

let vscode: VsCodeApi | undefined;
try {
  vscode = acquireVsCodeApi();
  logger.debug("acquireVsCodeApi success");
  // Forward webview logs to extension OutputChannel
  logger.setPostMessage((msg) => vscode!.postMessage(msg));
} catch (error) {
  logger.error("acquireVsCodeApi failed", error);
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
if (!canvas) {
  logger.error("Canvas not found!");
} else {
  logger.debug("Canvas found, initializing...");
}

const state = new EditorState();
if (vscode) {
  state.setPostMessage((msg) => vscode!.postMessage(msg));
}
const renderer = new CanvasRenderer(canvas);
new CanvasInputManager(canvas, state, renderer);

const requestAllFbTypes = (): boolean => {
  if (!vscode) {
    return false;
  }
  vscode.postMessage({ type: "request-all-fb-types" });
  return true;
};

const leftPanel = createLeftPanelController({
  logger,
  requestAllFbTypes,
});

let updateSidepanel = () => {};

// Collapsible toggle delegation is provided by setupCollapsibleDelegation() from components/collapsible

const settingsDialog = createSettingsDialogController({
  vscode,
});

const newFbDialog = createNewFbDialogController({
  logger,
  vscode,
});

const rightPanel = createRightPanelController({
  state,
});

updateSidepanel = rightPanel.updateSidepanel;
settingsDialog.setUpdateSidepanel(updateSidepanel);

// UI reacts to store updates via subscription
state.subscribe((newState) => {
  // Re-render canvas on every state change (single source of render triggers)
  renderer.render(state);

  // Hybrid auto-switch: switch to block info tab only if currently on devices tab
  if (newState.ui.selection.nodeId && rightPanel.getDiagramTab() === "devices") {
    rightPanel.setDiagramTab("blockinfo"); // this already calls updateSidepanel()
    return;
  }
  updateSidepanel();
});
updateSidepanel();

// Setup diagram tab click handlers
const tabDevices = document.getElementById("tab-devices");
const tabBlockinfo = document.getElementById("tab-blockinfo");

if (tabDevices) {
  tabDevices.addEventListener("click", () => {
    rightPanel.setDiagramTab("devices");
  });
}

if (tabBlockinfo) {
  tabBlockinfo.addEventListener("click", () => {
    rightPanel.setDiagramTab("blockinfo");
  });
}

// Setup event delegation for toggle buttons (optimization #1)
setupCollapsibleDelegation();

const canvasLayout = createCanvasLayout({
  canvas,
  state,
  renderer,
  logger,
});

window.addEventListener("resize", canvasLayout.resize);
canvasLayout.resize();

setupToolbarHandlers({
  logger,
  vscode,
  openSettingsPanel: settingsDialog.openSettingsModal,
  openNewFBDialog: newFbDialog.openNewFbDialog,
  openPalettePanel: () => leftPanel.openPalettePanel(),
  getSaveData: () => {
    const model = state.model;
    if (!model) return undefined;
    return {
      model,
      nodes: state.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
      normParams: state.getNormParams(),
    };
  },
});

setupCanvasDnd({
  canvas,
  leftPanel,
  logger,
  onDropBlockType: (blockType: string, event: DragEvent) => {
    // Convert drop screen coordinates to world coordinates
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldPos = screenToWorld(canvas,renderer.camera,state.view.zoom,screenX, screenY);

    state.addNode(blockType, worldPos.x, worldPos.y);
  },
});

// Register message handler BEFORE anything else
logger.debug("Registering message handler...");

function refreshStaticLabels(): void {
  const ids: Record<string, string> = {
    createBlockBtn: "toolbar.createFb",
    addBlockBtn: "toolbar.addFb",
    generateFbootBtn: "toolbar.generateFboot",
    deployBtn: "toolbar.deploy",
    saveAsBtn: "toolbar.saveAs",
    "tab-devices": "panel.devices.title",
    "tab-blockinfo": "panel.blockInfo.title",
    "left-sidepanel-header": "panel.typeLibrary.title",
  };
  for (const [id, key] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.textContent = tr(key);
  }
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.textContent = `\u2699 ${tr("toolbar.settings")}`;
    settingsBtn.title = tr("toolbar.settingsTooltip");
  }
  updateSidepanel();
}

const messageHandler = createMessageHandler({
  logger,
  state,
  leftPanel,
  requestAllFbTypes,
  centerDiagramInCanvas: canvasLayout.centerDiagramInCanvas,
  updateSidepanel,
  updateSettingsModal: settingsDialog.updateSettingsModal,
  closeSettingsModal: settingsDialog.closeSettingsModal,
  getSettingsDraft: settingsDialog.getSettingsDraft,
  setSettingsDraft: settingsDialog.setSettingsDraft,
  setLockedFbPath: settingsDialog.setLockedFbPath,
  getIsSettingsLoading: settingsDialog.getIsSettingsLoading,
  setIsSettingsLoading: settingsDialog.setIsSettingsLoading,
  getIsSettingsSaving: settingsDialog.getIsSettingsSaving,
  setIsSettingsSaving: settingsDialog.setIsSettingsSaving,
  setSettingsLoadError: settingsDialog.setSettingsLoadError,
  setSettingsDirty: settingsDialog.setSettingsDirty,
  updateSettingsDirtyState: settingsDialog.updateSettingsDirtyState,
  setSettingsStatus: settingsDialog.setSettingsStatus,
  handleCreateFbTypeResult: newFbDialog.handleCreateFbTypeResult,
  refreshStaticLabels,
});

window.addEventListener("message", messageHandler);
logger.debug("Message handler registered");

// Send ready handshake to extension host
try {
  if (vscode) {
    logger.debug("Posting ready to extension host");
    vscode.postMessage({ type: "ready" });
  } else {
    logger.debug("vscode.postMessage not available yet");
  }
} catch (err) {
  logger.error("Failed to post ready message", err);
}

// Global error handler
window.onerror = (msg, url, lineNo, columnNo, error) => {
  logger.error("GLOBAL ERROR", { msg, url, lineNo, columnNo, error });
  return false;
};

logger.debug("Webview script loaded");
