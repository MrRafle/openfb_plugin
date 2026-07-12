import * as vscode from "vscode";
import { handleDeploy, handleGenerateFboot } from "./handlers/deployHandler";
import { handleSaveSys } from "./handlers/saveSysHandler";
import { handleSettingsLoad, handleSettingsSave, handleSettingsPickPath } from "./handlers/settingsHandler";
import { handleRequestAllFbTypes, handleCreateFbType } from "./handlers/fbTypeHandler";
import type { SysModel } from "../shared/models/sysModel";
import type { FBTypeModel } from "../shared/models/fbtModel";
import type { Logger } from "./logging";
import type { NormParams } from "./parsing/sysPatcher";
import { readSettingsFromVsCodeConfig } from "./settingsManager";
import { t } from "../shared/i18n";
import { handleGeneratePython } from "./handlers/pythonGenerator";

/**
 * Shared context available to every message handler.
 * Created once per webview panel lifetime and passed through.
 */
export interface MessageContext {
  panel: vscode.WebviewPanel;
  uri: vscode.Uri;
  logger: Logger;

  /** Mutable shared state from the activate() scope. */
  shared: {
    model: SysModel | undefined;
    fbTypeMap: Map<string, FBTypeModel>;
    searchPaths: string[];
  };

  /** Reload diagram data (re-parse .sys file, refresh registry). */
  loadDiagramData: () => Promise<void>;
  /** Resolve the "Type Library" folder next to .sys. */
  resolveTypeLibraryPath: () => string | undefined;
  /** Base panel title (file name without extension). */
  basePanelTitle: string;
}

/** Discriminated union for messages sent from webview to extension. */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "deploy" }
  | { type: "generateFboot" }
  | { type: "save-sys"; model?: SysModel; nodes?: Array<{ id: string; x: number; y: number }>; normParams?: NormParams; targetPath?: string }
  | { type: "settings:load" }
  | { type: "settings:save"; payload?: unknown }
  | { type: "settings:pick-path" }
  | { type: "request-all-fb-types" }
  | { type: "dirty-state-changed"; isDirty?: boolean }
  | { type: "webview-log"; level?: string; message?: string; args?: string[] }
  | { type: "create-fb-type"; payload?: unknown }
  | { type: "generate-python"; payload?: unknown };

/**
 * Route a single webview message to the appropriate handler.
 * Returns `true` if the message was handled.
 */
export async function routeWebviewMessage(m: WebviewMessage, ctx: MessageContext): Promise<boolean> {
  if (!m?.type) return false;

  switch (m.type) {
    case "ready":
      return handleReady(ctx);
    case "deploy":
      return handleDeploy(m, ctx);
    case "generateFboot":
      return handleGenerateFboot(m, ctx);
    case "save-sys":
      return handleSaveSys(m, ctx);
    case "settings:load":
      return handleSettingsLoad(ctx);
    case "settings:save":
      return handleSettingsSave(m, ctx);
    case "settings:pick-path":
      return handleSettingsPickPath(ctx);
    case "request-all-fb-types":
      return handleRequestAllFbTypes(ctx);
    case "dirty-state-changed":
      return handleDirtyStateChanged(m, ctx);
    case "webview-log":
      return handleWebviewLog(m, ctx);
    case "create-fb-type":
      return handleCreateFbType(m, ctx);
    case "generate-python":
      return handleGeneratePython(m, ctx);
    default:
      return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

/** Build the standard load-diagram message from shared state. */
export function buildLoadDiagramMessage(shared: MessageContext["shared"]) {
  return {
    type: "load-diagram" as const,
    payload: shared.model,
    fbTypes: Array.from(shared.fbTypeMap.entries()),
  };
}

// ── Trivial handlers ──────────────────────────────────────────────

function handleReady(ctx: MessageContext): boolean {
  if (!ctx.shared.model) {
    ctx.logger.error("Cannot send diagram: model not loaded yet");
    return true;
  }
  const messageData = buildLoadDiagramMessage(ctx.shared);
  const testJson = JSON.stringify(messageData);
  ctx.logger.debug("Message serializable (on ready)", testJson.length, "bytes");
  ctx.panel.webview.postMessage(messageData);
  ctx.logger.debug("Message sent to webview on ready");
  return true;
}

function handleDirtyStateChanged(m: WebviewMessage & { type: "dirty-state-changed" }, ctx: MessageContext): boolean {
  const isDirty = !!m.isDirty;
  const lang = readSettingsFromVsCodeConfig().uiLanguage;
  ctx.panel.title = isDirty ? `${ctx.basePanelTitle} ${t(lang, "host.dirtyMark")}` : ctx.basePanelTitle;
  return true;
}

function handleWebviewLog(m: WebviewMessage & { type: "webview-log" }, ctx: MessageContext): boolean {
  const level = m.level ?? "info";
  const logMsg = m.message ?? "";
  const args = m.args;
  const full = args?.length ? `[Webview] ${logMsg} ${args.join(" ")}` : `[Webview] ${logMsg}`;
  switch (level) {
    case "debug": ctx.logger.debug(full); break;
    case "info":  ctx.logger.info(full);  break;
    case "warn":  ctx.logger.warn(full);  break;
    case "error": ctx.logger.error(full);  break;
    default:      ctx.logger.info(full);  break;
  }
  return true;
}
