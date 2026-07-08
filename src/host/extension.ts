import * as vscode from "vscode";
import { setResponsesChannel } from "./deploy/handler";
import { initializeLogger, getLogger } from "./logging";
import { openSysDiagramPanel } from "./panelManager";
import { registerPythonGenerator } from './handlers/pythonGenerator';

// Store subscriptions for cleanup on deactivation
const extensionSubscriptions: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
  const responsesChannel = vscode.window.createOutputChannel("OpenFBPlugin");
  context.subscriptions.push(responsesChannel);
  try { responsesChannel.show(true); } catch (e) {}

  const logger = initializeLogger(responsesChannel);
  logger.info("OpenFB plugin activated");

  try { setResponsesChannel(responsesChannel); } catch (e) {}

  const commandDisposable = vscode.commands.registerCommand(
    "openfb.plugin.showSysDiagram",
    (uri: vscode.Uri) => openSysDiagramPanel(uri, context, logger),
  );

  context.subscriptions.push(commandDisposable);
  extensionSubscriptions.push(commandDisposable);

  registerPythonGenerator(context);
}

/**
 * Called when extension is deactivated
 */
export function deactivate() {
  const logger = getLogger();
  logger.info("OpenFB plugin deactivating, cleaning up resources");
  
  extensionSubscriptions.forEach(disposable => {
    try {
      disposable.dispose();
    } catch (err) {
      logger.error("Error disposing subscription", err);
    }
  });
  
  extensionSubscriptions.length = 0;
  logger.dispose();
}
