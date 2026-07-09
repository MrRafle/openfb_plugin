import * as vscode from "vscode";
import * as fs from "fs";
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

    const xml = patchSysFile(ctx.uri.fsPath, {
      model: updatedModel,
      nodes,
      normParams,
    });

    fs.writeFileSync(ctx.uri.fsPath, xml, "utf8");

    ctx.logger.info("SYS file saved to", ctx.uri.fsPath);

    vscode.window.showInformationMessage(
      t(readSettingsFromVsCodeConfig().uiLanguage, "saveSys.saved", {
        path: ctx.uri.fsPath,
      }),
    );

    ctx.panel.webview.postMessage({
      type: "save-sys-result",
      payload: {
        success: true,
        filePath: ctx.uri.fsPath,
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
