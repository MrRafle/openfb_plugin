import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { patchSysFile } from "../parsing/sysPatcher";
import type { WebviewMessage, MessageContext } from "../messageRouter";
import { readSettingsFromVsCodeConfig } from "../settingsManager";
import { t } from "../../shared/i18n";

export async function handleSaveSys(
  m: WebviewMessage & { type: "save-sys" },
  ctx: MessageContext,
): Promise<boolean> {
  try {
    const updatedModel = m.model;
    if (!updatedModel) {
      ctx.logger.warn("save-sys: no model in message");
      ctx.panel.webview.postMessage({
        type: "save-sys-result",
        payload: {
          success: false,
          error: t(readSettingsFromVsCodeConfig().uiLanguage, "saveSys.noModel"),
        },
      });
      return true;
    }

    const nodes: Array<{ id: string; x: number; y: number }> = m.nodes || [];
    const normParams = m.normParams;
    const requestedTargetPath = m.targetPath?.trim();
    const targetUri = requestedTargetPath ? vscode.Uri.file(requestedTargetPath) : undefined;
    let savePath = targetUri?.fsPath || ctx.uri.fsPath;
    const sourcePath = ctx.uri.fsPath || savePath;

    if (!requestedTargetPath && ctx.uri.fsPath) {
      const selected = await vscode.window.showSaveDialog({
        defaultUri: ctx.uri,
        filters: { "IEC 61499 System": ["sys"] },
        saveLabel: "Save",
        title: "Save SYS As",
      });
      if (!selected) {
        ctx.logger.info("Save cancelled by user");
        return true;
      }
      savePath = selected.fsPath;
      ctx.uri = selected;
      ctx.panel.title = path.parse(savePath).name;
      ctx.shared.model = updatedModel;
    }

    const nodePositionMap = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    for (const block of updatedModel.subAppNetwork?.blocks || []) {
      const pos = nodePositionMap.get(block.id);
      if (pos) {
        block.x = pos.x;
        block.y = pos.y;
      }
    }

    // Ensure all blocks have a mapping entry.
    const appName = updatedModel.applicationName || "App";
    if (updatedModel.subAppNetwork?.blocks && updatedModel.devices?.length > 0) {
      const mappings = updatedModel.mappings || [];
      const mappedInstances = new Set(mappings.map((mp) => mp.fbInstance));
      const defaultDevice = updatedModel.devices[0].name || "FORTE_PC";
      const defaultResource =
        updatedModel.devices[0].resources?.[0]?.name || "EMB_RES";

      for (const block of updatedModel.subAppNetwork.blocks) {
        const qualifiedName = `${appName}.${block.id}`;
        if (!mappedInstances.has(qualifiedName)) {
          mappings.push({
            fbInstance: qualifiedName,
            device: defaultDevice,
            resource: defaultResource,
          });
          ctx.logger.info(
            `Auto-mapped new block "${qualifiedName}" -> ${defaultDevice}.${defaultResource}`,
          );
        }
      }

      updatedModel.mappings = mappings;
    }

    const xml = patchSysFile(sourcePath, {
      model: updatedModel,
      nodes,
      normParams,
    });

    const parentDir = path.dirname(savePath);
    if (parentDir && !fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(savePath, xml, "utf8");

    ctx.uri = vscode.Uri.file(savePath);
    ctx.panel.title = path.parse(savePath).name;
    ctx.shared.model = updatedModel;

    ctx.logger.info("SYS file saved to", savePath);

    vscode.window.showInformationMessage(
      t(readSettingsFromVsCodeConfig().uiLanguage, "saveSys.saved", {
        path: savePath,
      }),
    );

    ctx.panel.webview.postMessage({
      type: "load-diagram",
      payload: updatedModel,
      fbTypes: Array.from(ctx.shared.fbTypeMap.entries()),
    });

    ctx.panel.webview.postMessage({
      type: "save-sys-result",
      payload: {
        success: true,
        filePath: savePath,
      },
    });
  } catch (err) {
    ctx.logger.error("Failed to save SYS file", err);
    vscode.window.showErrorMessage(
      t(readSettingsFromVsCodeConfig().uiLanguage, "saveSys.saveFailed", {
        error: String(err),
      }),
    );
    ctx.panel.webview.postMessage({
      type: "save-sys-result",
      payload: {
        success: false,
        error: String(err),
      },
    });
  }

  return true;
}
