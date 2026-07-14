import * as vscode from "vscode";
import { getLogger } from "./logging";
import { EXTENSION_COLORS } from "../shared/colorScheme";
import { buildLayoutStyles } from "./webviewStyles/layoutStyles";
import { buildModalStyles } from "./webviewStyles/modalStyles";
import { buildComponentStyles } from "./webviewStyles/componentStyles";
import { t } from "../shared/i18n";
import type { UiLanguage } from "../shared/pluginSettings";

/**
 * Generate the full HTML document for the webview panel.
 * Contains all CSS styles and the skeleton DOM structure.
 */
export function getWebviewHtml(webview: vscode.Webview, extUri: vscode.Uri, language: UiLanguage): string {
  const logger = getLogger();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extUri, "out", "webview", "main.js"),
  );

  logger.debug("Script URI", scriptUri.toString());

  return `
<!DOCTYPE html>
<html data-lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src ${webview.cspSource}; style-src 'unsafe-inline';">
  <style>
${buildStyles()}
  </style>
</head>
<body>
${buildBodyHtml(scriptUri, language)}
</body>
</html>`;
}

function buildStyles(): string {
  return [
    buildLayoutStyles(),
    buildModalStyles(),
    buildComponentStyles(),
  ].join("\n");
}

function buildBodyHtml(scriptUri: vscode.Uri, language: UiLanguage): string {
  const tr = (key: string) => t(language, key);
  return `
  <div id="toolbar">
    <div class="toolbar-left">
      <button id="createBlockBtn" style="padding:8px 12px; border:1px solid ${EXTENSION_COLORS.TOOLBAR_BUTTON_PRIMARY_BORDER}; background:${EXTENSION_COLORS.TOOLBAR_BUTTON_PRIMARY_BG}; color:${EXTENSION_COLORS.TOOLBAR_BUTTON_PRIMARY_TEXT}; cursor:pointer; border-radius:4px; font-family:Roboto,sans-serif;">${tr("toolbar.createFb")}</button>
      <button id="addBlockBtn" style="padding:8px 12px; border:1px solid ${EXTENSION_COLORS.TOOLBAR_BUTTON_PRIMARY_BORDER}; background:${EXTENSION_COLORS.TOOLBAR_BUTTON_PRIMARY_BG}; color:${EXTENSION_COLORS.TOOLBAR_BUTTON_PRIMARY_TEXT}; cursor:pointer; border-radius:4px; font-family:Roboto,sans-serif;">${tr("toolbar.addFb")}</button>
    </div>
    <div class="toolbar-center">
      <button id="generateFbootBtn">${tr("toolbar.generateFboot")}</button>
      <button id="deployBtn">${tr("toolbar.deploy")}</button>
      <button id="monitoringToggleBtn">Monitor</button>
    </div>
    <div class="toolbar-right">
      <button id="saveAsBtn">${tr("toolbar.saveAs")}</button>
      <button id="settingsBtn" title="${tr("toolbar.settingsTooltip")}">⚙ ${tr("toolbar.settings")}</button>
    </div>
  </div>
  
  <div id="left-sidepanel">
    <div id="left-sidepanel-header">${tr("panel.typeLibrary.title")}</div>
    <div id="left-sidepanel-content">
      <div class="sidepanel-empty">${tr("panel.typeLibrary.closed")}</div>
    </div>
  </div>
  
  <canvas id="canvas"></canvas>
  
  <div id="sidepanel">
    <div id="sidepanel-tabs">
      <button id="tab-devices" class="sidepanel-tab active">${tr("panel.devices.title")}</button>
      <button id="tab-blockinfo" class="sidepanel-tab">${tr("panel.blockInfo.title")}</button>
    </div>
    <div id="sidepanel-header">${tr("panel.devices.title")}</div>
    <div id="sidepanel-content">
      <div class="sidepanel-empty">${tr("panel.devices.empty")}</div>
    </div>
  </div>
  
  <div id="settings-modal" class="modal-overlay">
    <div class="modal-content">
      <div id="settings-modal-header"></div>
      <div id="settings-modal-body"></div>
    </div>
  </div>

  <div id="newfb-modal" class="modal-overlay">
    <div class="modal-content">
      <div id="newfb-modal-header"></div>
      <div id="newfb-modal-body"></div>
    </div>
  </div>
  
  <script type="module" src="${scriptUri}"></script>`;
}
