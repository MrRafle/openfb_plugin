import type { WebviewLogger } from "../logging";

interface HostApi {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    __openfbTargetPath?: string;
  }
}

interface ToolbarHandlersDeps {
  logger: WebviewLogger;
  vscode?: HostApi;
  openSettingsPanel: () => void;
  openNewFBDialog: () => void;
  openPalettePanel: () => void;
  getSaveData: () => { model: any; nodes: any[]; normParams: any } | undefined;
}

export function setupToolbarHandlers(deps: ToolbarHandlersDeps): void {
  const { logger, vscode, openSettingsPanel, openNewFBDialog, openPalettePanel, getSaveData } = deps;

  /** Bind a button to post a simple message to the extension host. */
  function bindMessageButton(id: string, messageType: string): void {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (!btn) { logger.warn(`${id} not found in DOM`); return; }
    btn.addEventListener("click", () => {
      logger.debug(`${id} clicked`);
      try {
        if (vscode) {
          vscode.postMessage({ type: messageType });
        } else {
          logger.warn(`vscode.postMessage not available for ${messageType}`);
        }
      } catch (err) {
        logger.error(`Failed to post ${messageType} message`, err);
      }
    });
  }

  /** Bind a button to a simple callback. */
  function bindCallbackButton(id: string, callback: () => void): void {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (!btn) { logger.warn(`${id} not found in DOM`); return; }
    btn.addEventListener("click", () => {
      logger.debug(`${id} clicked`);
      callback();
    });
  }

  bindMessageButton("deployBtn", "deploy");
  bindMessageButton("generateFbootBtn", "generateFboot");
  bindCallbackButton("settingsBtn", openSettingsPanel);
  bindCallbackButton("createBlockBtn", openNewFBDialog);
  bindCallbackButton("addBlockBtn", openPalettePanel);

  const saveCurrentDiagram = () => {
    logger.debug("Saving current diagram");
    try {
      if (vscode) {
        const saveData = getSaveData();
        if (!saveData) {
          logger.warn("No model available for saving");
          return;
        }
        const targetPath = window.__openfbTargetPath;
        vscode.postMessage({
          type: "save-sys",
          model: saveData.model,
          nodes: saveData.nodes,
          normParams: saveData.normParams,
          targetPath,
        });
      } else {
        logger.warn("vscode.postMessage not available for save");
      }
    } catch (err) {
      logger.error("Failed to post save-sys message", err);
    }
  };

  const saveAsBtn = document.getElementById("saveAsBtn") as HTMLButtonElement | null;
  if (saveAsBtn) {
    saveAsBtn.addEventListener("click", () => {
      logger.debug("Save As button clicked");
      saveCurrentDiagram();
    });
  } else {
    logger.warn("saveAsBtn button not found in DOM");
  }

  window.addEventListener("keydown", (event: KeyboardEvent) => {
    const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
    if (!isSaveShortcut) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    saveCurrentDiagram();
  });
}
