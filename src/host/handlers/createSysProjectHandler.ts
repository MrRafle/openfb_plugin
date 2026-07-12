import * as path from "path";
import * as vscode from "vscode";
import { getLogger } from "../logging";

function toSysIdentifier(fileName: string): string {
  const baseName = path.basename(fileName, path.extname(fileName));
  const normalized = baseName.replace(/[^A-Za-z0-9_]/g, "_");
  return normalized || "NewSystem";
}

export function createEmptySysXml(systemName: string): string {
  const appName = `${systemName}_App`;
  const startFbName = `${appName}.START`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<System Name="${systemName}">
	<VersionInfo Version="1.0" Author="OpenFB" Date="${new Date().toISOString().slice(0, 10)}"/>
	<Application Name="${appName}">
		<SubAppNetwork>
			<FB Name="START" Type="E_RESTART"/>
		</SubAppNetwork>
	</Application>
	<Device Name="FORTE_PC" Type="iec61499::system::FORTE_PC" x="2905.88" y="1364.71">
		<Parameter Name="MGR_ID" Value="&quot;localhost:61499&quot;" Comment="Device manager socket ID"/>
		<Attribute Name="Profile" Type="STRING" Value="HOLOBLOC"/>
		<Attribute Name="Color" Type="STRING" Value="255,190,111"/>
		<Resource Name="EMB_RES" Type="iec61499::system::EMB_RES" x="0" y="0">
			<FBNetwork>
				<FB Name="START" Type="E_RESTART"/>
			</FBNetwork>
		</Resource>
	</Device>
	<Segment Name="Ethernet" Type="iec61499::system::Ethernet" x="2329.41" y="917.65" dx1="1764.71">
		<Attribute Name="Color" Type="STRING" Value="217,70,108"/>
	</Segment>
	<Link SegmentName="Ethernet" CommResource="FORTE_PC" Comment=""/>
	<Mapping From="${startFbName}" To="FORTE_PC.EMB_RES"/>
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
