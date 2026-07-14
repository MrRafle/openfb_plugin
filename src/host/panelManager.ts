import * as vscode from "vscode";
import * as path from "path";
import { getLogger } from "./logging";
import { getWebviewHtml } from "./webviewTemplate";
import { routeWebviewMessage, buildLoadDiagramMessage } from "./messageRouter";
import type { MessageContext, WebviewMessage } from "./messageRouter";
import type { Logger } from "./logging";
import { createTypeLibraryResolver, createDiagramLoader } from "./diagramLoader";
import { readSettingsFromVsCodeConfig } from "./settingsManager";
import { t } from "../shared/i18n";
import { MonitoringSession } from "./handlers/monitoringHandler";

const FALLBACK_TIMEOUT_MS = 1500;

/**
 * Open a new webview panel for a .sys diagram file.
 * Handles panel creation, diagram loading, and message wiring.
 */
export async function openSysDiagramPanel(
  uri: vscode.Uri,
  context: vscode.ExtensionContext,
  logger: Logger,
): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage(t(readSettingsFromVsCodeConfig().uiLanguage, "host.noSysSelected"));
    return;
  }

  const basePanelTitle = path.parse(uri.fsPath).name;
  const panel = vscode.window.createWebviewPanel(
    "openfbEditor",
    basePanelTitle,
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  );

  const panelDisposables: vscode.Disposable[] = [];
  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri, readSettingsFromVsCodeConfig().uiLanguage);

  try {
    const innerLogger = getLogger();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(t(readSettingsFromVsCodeConfig().uiLanguage, "host.fileOutsideWorkspace"));
      panel.dispose();
      return;
    }

    innerLogger.info("Workspace folder", workspaceFolder.uri.fsPath);

    const sysFileDir = path.dirname(uri.fsPath);
    innerLogger.info("SYS file directory", sysFileDir);

    const shared: MessageContext["shared"] = {
      model: undefined,
      fbTypeMap: new Map(),
      searchPaths: [],
    };

    const monitoringSession = new MonitoringSession(
      panel,
      () => shared.model,
      innerLogger,
    );

    panel.onDidDispose(() => {
      logger.debug("Cleaning up OpenFB Editor panel resources");
      panelDisposables.forEach(d => d.dispose());
      monitoringSession.stop().catch((err) => logger.error("Failed to stop monitoring", err));
    }, null, panelDisposables);

    const resolveTypeLibraryPath = createTypeLibraryResolver(sysFileDir, innerLogger);
    const loadDiagramData = createDiagramLoader(uri, workspaceFolder, shared, resolveTypeLibraryPath, innerLogger);

    await loadDiagramData();

    if (!shared.model) {
      throw new Error("Failed to load SYS model");
    }

    innerLogger.debug("Sending to webview", {
      diagramBlocks: shared.model.subAppNetwork.blocks.length,
      fbTypesCount: shared.fbTypeMap.size,
    });

    innerLogger.debug("Detailed block info");
    for (const block of shared.model.subAppNetwork.blocks) {
      innerLogger.debug(`Block: ${block.id} (type=${block.typeShort}) at (${block.x}, ${block.y})`);
    }

    const msgCtx: MessageContext = {
      panel,
      uri,
      logger: innerLogger,
      shared,
      loadDiagramData,
      resolveTypeLibraryPath,
      basePanelTitle,
      monitoringSession,
    };

    let timeoutHandle: NodeJS.Timeout | undefined;

    const messageDisposable = panel.webview.onDidReceiveMessage(async (m: unknown) => {
      try {
        const msg = m as WebviewMessage;
        innerLogger.debug("Message from webview", msg);

        if (msg?.type === "ready" && timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }

        await routeWebviewMessage(msg, msgCtx);
      } catch (err) {
        innerLogger.error("Error handling webview message", err);
      }
    });

    panelDisposables.push(messageDisposable);

    // Fallback: if webview doesn't send ready, send after timeout
    timeoutHandle = setTimeout(() => {
      try {
        const messageData = buildLoadDiagramMessage(shared);
        const testJson = JSON.stringify(messageData);
        innerLogger.debug("Message serializable (fallback)", testJson.length, "bytes");
        panel.webview.postMessage(messageData);
        innerLogger.info("Message sent to webview (fallback)");
      } catch (error) {
        innerLogger.error("Failed to send message to webview (fallback)", error);
        vscode.window.showErrorMessage(t(readSettingsFromVsCodeConfig().uiLanguage, "host.failedSendToWebview", { error: String(error) }));
      }
    }, FALLBACK_TIMEOUT_MS);

  } catch (error) {
    logger.error("Error loading diagram", error);
    vscode.window.showErrorMessage(t(readSettingsFromVsCodeConfig().uiLanguage, "host.genericError", { error: String(error) }));
    panel.dispose();
  }
}
