import * as vscode from 'vscode';
import * as path from 'path';
import { getLogger } from '../logging';
import { FBTypeRegistry } from '../fbTypeRegistry';

let extensionContext: vscode.ExtensionContext | null = null;

export function registerPythonGenerator(context: vscode.ExtensionContext) {
  extensionContext = context;
  const logger = getLogger();

  // Команда для правой кнопки по .fbt файлу в проводнике
  const disposable = vscode.commands.registerCommand(
    "openfb.plugin.generatePythonCode",
    async (uri?: vscode.Uri) => {
      let fbtPath: string;

      if (uri && uri.fsPath) {
        fbtPath = uri.fsPath;
      } else {
        const files = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { "Function Block Type": ["fbt"] }
        });
        if (!files || files.length === 0) return;
        fbtPath = files[0].fsPath;
      }

      await generatePythonFromFbtPath(fbtPath);
    }
  );

  context.subscriptions.push(disposable);
  logger.info("Python code generator registered");
}

/**
 * Генерация из .fbt (для explorer)
 */
async function generatePythonFromFbtPath(fbtPath: string) {
  const logger = getLogger();
  if (!extensionContext) {
    vscode.window.showErrorMessage("Extension context not initialized");
    return;
  }

  try {
    const pathModule = await import('path');
    const childProcess = await import('child_process');
    
    const scriptPath = pathModule.join(extensionContext.extensionPath, 'scripts', 'fbt2py.py');
    const command = `python "${scriptPath}" "${fbtPath}"`;

    childProcess.exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        logger.error("Python generation failed", error);
        vscode.window.showErrorMessage(`Generation failed: ${error.message}`);
        return;
      }

      logger.info("Python generation output:", stdout);
      const pyPath = fbtPath.replace(/\.fbt$/i, '.py');
      
      vscode.window.showInformationMessage(
        `Python code generated: ${pyPath}`,
        "Open File"
      ).then((selection) => {
        if (selection === "Open File") {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(pyPath));
        }
      });
    });

  } catch (err: any) {
    logger.error("Failed to start Python generator", err);
    vscode.window.showErrorMessage("Failed to run Python generator");
  }
}

/**
 * Handler для правого клика по блоку в диаграмме
 */
export async function handleGeneratePython(m: any, ctx: any) {
  const logger = getLogger();
  const blockType = m.blockType?.trim();

  if (!blockType) {
    vscode.window.showErrorMessage("No block type provided");
    return true;
  }

  if (!extensionContext) {
    vscode.window.showErrorMessage("Extension context not initialized");
    return true;
  }

  logger.info(`Generate Python requested for block: ${blockType}`);

  try {
    const registry = new FBTypeRegistry(ctx.shared?.searchPaths || []);
    let info = registry.get(blockType);

    if (!info?.filePath) {
      logger.info(`Type ${blockType} not in cache, scanning...`);
      registry.scanForTypes([blockType]);
      info = registry.get(blockType);
    }

    if (!info?.filePath) {
      vscode.window.showErrorMessage(`.fbt file for type "${blockType}" not found`);
      return true;
    }

    const fbtPath = info.filePath;
    logger.info(`Found .fbt: ${fbtPath}`);

    // Генерируем .py РЯДОМ С .sys
    const sysDir = path.dirname(ctx.uri.fsPath);
    const targetPyPath = path.join(sysDir, `${blockType}.py`);

    const pathModule = await import('path');
    const childProcess = await import('child_process');
    
    const scriptPath = pathModule.join(extensionContext.extensionPath, 'scripts', 'fbt2py.py');
    const command = `python "${scriptPath}" "${fbtPath}"`;

    childProcess.exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        logger.error("Python generation failed", error);
        vscode.window.showErrorMessage(`Generation failed: ${error.message}`);
        return;
      }

      logger.info("fbt2py output:", stdout);

      const fs = require('fs');
      const originalPy = fbtPath.replace(/\.fbt$/i, '.py');

      if (fs.existsSync(originalPy)) {
        fs.copyFileSync(originalPy, targetPyPath);
        logger.info(`Python file saved next to .sys: ${targetPyPath}`);
      }

      vscode.window.showInformationMessage(
        `Python code generated: ${targetPyPath}`,
        "Open File"
      ).then((selection) => {
        if (selection === "Open File") {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(targetPyPath));
        }
      });
    });

  } catch (err: any) {
    logger.error("Failed to generate Python", err);
    vscode.window.showErrorMessage("Failed to generate Python code");
  }

  return true;
}