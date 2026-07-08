import * as vscode from 'vscode';
import * as path from 'path';
import { getLogger } from '../logging';
import { FBTypeRegistry } from '../fbTypeRegistry';
import { convertFbtToPython } from '../generation/fbtToPython';

let extensionContext: vscode.ExtensionContext | null = null;

export function registerPythonGenerator(context: vscode.ExtensionContext) {
  extensionContext = context;
  const logger = getLogger();

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
 * Генерация Python из .fbt файла (для вызова из Explorer)
 */
async function generatePythonFromFbtPath(fbtPath: string) {
  const logger = getLogger();

  try {
    const pyPath = await convertFbtToPython(fbtPath);

    vscode.window.showInformationMessage(
      `Python code generated: ${pyPath}`,
      "Open File"
    ).then((selection) => {
      if (selection === "Open File") {
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(pyPath));
      }
    });

  } catch (err: any) {
    logger.error("Failed to generate Python", err);
    vscode.window.showErrorMessage(`Failed to generate Python: ${err.message}`);
  }
}

/**
 * Handler для правого клика по блоку в диаграмме
 * Генерирует .py рядом с текущим .sys файлом
 */
export async function handleGeneratePython(m: any, ctx: any) {
  const logger = getLogger();
  const blockType = m.blockType?.trim();

  if (!blockType) {
    vscode.window.showErrorMessage("No block type provided");
    return true;
  }

  logger.info(`Generate Python requested for block: ${blockType}`);

  try {
    // Поиск .fbt файла
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

    // Генерируем .py РЯДОМ С .sys файлом
    const sysDir = path.dirname(ctx.uri.fsPath);

    const pyPath = await convertFbtToPython(fbtPath, sysDir);

    vscode.window.showInformationMessage(
      `Python code generated: ${pyPath}`,
      "Open File"
    ).then((selection) => {
      if (selection === "Open File") {
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(pyPath));
      }
    });

  } catch (err: any) {
    logger.error("Failed to generate Python", err);
    vscode.window.showErrorMessage(`Failed to generate Python code: ${err.message}`);
  }

  return true;
}