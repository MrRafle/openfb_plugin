import * as path from "path";
import * as vscode from "vscode";
import { getLogger } from "../logging";

function toSysIdentifier(fileName: string): string {
  const baseName = path.basename(fileName, path.extname(fileName));
  const normalized = baseName.replace(/[^A-Za-z0-9_]/g, "_");
  return normalized || "NewSystem";
}

function createEmptySysXml(systemName: string): string {
  const appName = `${systemName}_App`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<System Name="${systemName}">
\t<Application Name="${appName}">
\t\t<SubAppNetwork/>
\t</Application>
\t<Device Name="FORTE_PC" Type="iec61499::system::FORTE_PC">
\t\t<Resource Name="EMB_RES" Type="iec61499::system::EMB_RES">
\t\t\t<FBNetwork/>
\t\t</Resource>
\t</Device>
</System>
`;
}

export function registerCreateSysProjectCommand(context: vscode.ExtensionContext): void {
  const logger = getLogger();

  const disposable = vscode.commands.registerCommand(
    "openfb.plugin.createSysProject",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      const defaultUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, "NewSystem.sys")
        : vscode.Uri.file("NewSystem.sys");

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          "IEC 61499 System": ["sys"],
        },
        title: "Create OpenFB SYS project",
        saveLabel: "Create",
      });

      if (!saveUri) {
        logger.info("Create SYS project cancelled");
        return;
      }

      const systemName = toSysIdentifier(saveUri.fsPath);
      const xml = createEmptySysXml(systemName);

      await vscode.workspace.fs.writeFile(
        saveUri,
        Buffer.from(xml, "utf8"),
      );

      logger.info("Created empty SYS project", saveUri.fsPath);

      await vscode.commands.executeCommand(
        "openfb.plugin.showSysDiagram",
        saveUri,
      );
    },
  );

  context.subscriptions.push(disposable);
  logger.info("Create SYS project command registered");
}