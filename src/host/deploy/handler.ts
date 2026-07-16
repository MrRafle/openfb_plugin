import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import * as vscode from "vscode";
import { getLogger } from "../logging";
import {
  buildPacket,
  parseResponse,
  detectXmlError,
  extractRequestFbInfo,
  extractResourceNamesFromQueryResponse,
} from "./protocol";
import { readSettingsFromVsCodeConfig } from "../settingsManager";
import { t } from "../../shared/i18n";

export class DeployAbortedByUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployAbortedByUserError";
  }
}

let openfbResponsesChannel: vscode.OutputChannel | undefined;
export function setResponsesChannel(ch: vscode.OutputChannel) {
  openfbResponsesChannel = ch;
}

export class OpenFBHandler {
  private logger = getLogger();

  constructor() {}

  /**
   * Load, parse, and prepare .fboot file for deployment
   */
  private async loadAndParseFile(fbootPath: string): Promise<string[]> {
    const content = await fs.promises.readFile(fbootPath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("#"));

    if (lines.length === 0) {
      throw new Error(".fboot is empty or contains only comments");
    }

    return lines;
  }

  /**
   * Ensure QUERY command is present at the beginning
   */
  private ensureQueryPresent(lines: string[]): void {
    const hasQuery = lines.some(l => l.includes('Action="QUERY"'));
    if (!hasQuery) {
      lines.unshift(';<Request ID="0" Action="QUERY"><FB Name="*" Type="*"/></Request>');
    }
  }

  /**
   * Parse a command line into resource and xml parts
   * Format: resource;xml or ;xml (empty resource if starts with ;)
   */
  private parseCommandLine(line: string): { resource: string; xml: string } | null {
    let resource = "";
    let xml = line;

    if (xml.startsWith(";")) {
      xml = xml.slice(1).trim();
    } else {
      const sepIndex = xml.indexOf(";");
      if (sepIndex !== -1) {
        resource = xml.substring(0, sepIndex).trim();
        xml = xml.substring(sepIndex + 1).trim();
      }
    }

    return xml ? { resource, xml } : null;
  }

  /**
   * Collect distinct non-empty resource names used by deploy commands.
   */
  private collectTargetResources(lines: string[]): string[] {
    const resources = new Set<string>();
    for (const line of lines) {
      const parsed = this.parseCommandLine(line);
      if (!parsed) continue;
      const resource = parsed.resource.trim();
      if (resource) resources.add(resource);
    }
    return Array.from(resources);
  }

  /**
   * Send overwrite preparation commands for existing resource(s).
   */
  private async prepareOverwriteExistingResources(
    socket: net.Socket,
    resources: string[],
  ): Promise<void> {
    let requestId = 2;

    for (const resourceName of resources) {
      const killXml = `<Request ID="${requestId++}" Action="KILL"><FB Name="${resourceName}" Type=""/></Request>`;
      await this.sendCommand(socket, "", killXml, -1, 0);

      const deleteXml = `<Request ID="${requestId++}" Action="DELETE"><FB Name="${resourceName}" Type=""/></Request>`;
      await this.sendCommand(socket, "", deleteXml, -1, 0);
    }
  }

  /**
   * Pre-deploy check:
   * - if resource exists, ask user whether to overwrite
   * - on overwrite: send KILL + DELETE before fboot commands
   * - on abort: stop deploy
   */
  private async checkResourcesBeforeDeploy(socket: net.Socket, lines: string[]): Promise<void> {
    const targetResources = this.collectTargetResources(lines);

    if (targetResources.length === 0) {
      this.logger.info("Resource pre-check skipped: no explicit resource in commands");
      return;
    }

    const queryXml = '<Request ID="1" Action="QUERY"><FB Name="*" Type="*"/></Request>';
    const responseXml = await this.sendCommand(socket, "", queryXml, -1, 0);
    const serverResources = extractResourceNamesFromQueryResponse(responseXml);
    const serverSet = new Set(serverResources);

    const existing = targetResources.filter((resource) => serverSet.has(resource));
    const missing = targetResources.filter((resource) => !serverSet.has(resource));

    if (existing.length > 0) {
      const lang = readSettingsFromVsCodeConfig().uiLanguage;
      const promptMsg = t(lang, "deploy.resourcesExist", { resources: existing.join(", ") });
      const abortOption: vscode.MessageItem = { title: t(lang, "deploy.abort"), isCloseAffordance: true };
      const overwriteOption: vscode.MessageItem = { title: t(lang, "common.overwrite") };

      this.logger.warn(promptMsg, { serverResources, targetResources });
      const choice = await vscode.window.showWarningMessage(
        promptMsg,
        { modal: true },
        overwriteOption,
        abortOption,
      );

      if (choice?.title !== overwriteOption.title) {
        const abortMsg = t(lang, "deploy.abortedExisting") + ` (${existing.join(", ")})`;
        this.logger.info(abortMsg);
        throw new DeployAbortedByUserError(abortMsg);
      }

      this.logger.info(`User chose to overwrite resources: ${existing.join(", ")}`);
      await this.prepareOverwriteExistingResources(socket, existing);
    }

    if (missing.length > 0) {
      const lang = readSettingsFromVsCodeConfig().uiLanguage;
      const missingMsg = t(lang, "deploy.resourcesMissing", { resources: missing.join(", ") }) + " " + t(lang, "deploy.continue");
      this.logger.info(missingMsg, { serverResources, targetResources });
    }
  }

  /**
   * Send a single command via socket and wait for response
   */
  private async sendCommand(
    socket: net.Socket,
    resource: string,
    xml: string,
    commandIndex: number,
    totalCommands: number
  ): Promise<string> {
    this.logger.info(`Sending command ${commandIndex + 1}/${totalCommands}`, xml.substring(0, 60));

    const packet = buildPacket(resource, xml);
    socket.write(packet);

    // Wait for response



    // Accumulate incoming data chunks until a full response packet is received.
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalLen = 0;

      const cmdTimer = setTimeout(() => {
        socket.removeListener("data", onData);
        reject(new Error("Timeout waiting for response from server"));
      }, 5000);

      function cleanup() {
        clearTimeout(cmdTimer);
      }

      const onData = (chunk: Buffer) => {
        const cmdLabel = `cmd ${commandIndex + 1}/${totalCommands}`;

        chunks.push(chunk);
        totalLen += chunk.length;
        const buf = Buffer.concat(chunks, totalLen);

        if (buf.length >= 3) {
          const lenXml = buf.readUInt16BE(1);
          if (buf.length >= 3 + lenXml) {
            socket.removeListener("data", onData);
            cleanup();

            const respBuf = buf.slice(0, 3 + lenXml);
            const responseStr = parseResponse(respBuf);

            this.logger.debug(`Received response ${cmdLabel} ${resource}`);

            // Check for XML-level error
            const xmlError = detectXmlError(responseStr);
            if (xmlError.isError) {
              const shortRes = resource || "<no resource>";
              
              let msg = xmlError.message || responseStr || "Error response from server";
              if (/NO_SUCH_OBJECT/i.test(msg)) {
                const lang = readSettingsFromVsCodeConfig().uiLanguage;
                msg = t(lang, "deploy.noSuchObject");
              }

              const cmdLabel = `cmd ${commandIndex + 1}/${totalCommands}`;

              // Try to extract object name and type from the XML (Request.FB.Name and Request.FB.Type)
              const fbInfo = extractRequestFbInfo(xml) || {};
              const objectInfoParts: string[] = [];
              if (fbInfo.name) objectInfoParts.push(`object=${fbInfo.name}`);
              if (fbInfo.type) objectInfoParts.push(`type=${fbInfo.type}`);
              const objectInfo = objectInfoParts.length ? ` ${objectInfoParts.join(' ')}` : '';

              // Log which fboot command caused the server error (resource + object)
              this.logger.error(`OpenFB error ${cmdLabel} for ${shortRes}: ${msg}${objectInfo}`);

              // Log the same error message to the responses output channel
              try {
                if (openfbResponsesChannel) {
                  openfbResponsesChannel.appendLine('------------------------------------------------------------');
                  openfbResponsesChannel.appendLine(`OpenFB error ${cmdLabel} for ${shortRes}: ${msg}${objectInfo}`);
                  openfbResponsesChannel.appendLine('');
                }
              } catch (e) {
                // ignore output channel errors
              }

              try {
                const lang = readSettingsFromVsCodeConfig().uiLanguage;
                vscode.window.showErrorMessage(t(lang, "deploy.errorUserMessage", { cmdLabel, resource: shortRes, msg }));
              } catch (e) {}
              reject(new Error(`OpenFB error ${cmdLabel} for ${shortRes}: ${msg}`));
              return;
            }

            resolve(responseStr);
          }
        }
      }

      socket.on("data", onData);
    });
  }

  /**
   * Deploy .fboot file to openFB/FORTE via binary packet protocol.
   * Uses FORTE-compatible binary format with resource+xml packets.
   * Automatically adds QUERY if not present in file.
   */
  async deploy(fbootPath: string): Promise<void> {
    this.logger.debug("OpenFBHandler.deploy called", fbootPath);

    if (!fs.existsSync(fbootPath)) {
      throw new Error(`.fboot file not found: ${fbootPath}`);
    }

    const config = vscode.workspace.getConfiguration("openfb");
    const host = (config.get<string>("host") || "127.0.0.1");
    const port = (config.get<number>("port") || 61499);
    const timeoutMs = (config.get<number>("deployTimeoutMs") || 30000);

    // Load and parse file
    const lines = await this.loadAndParseFile(fbootPath);

    return this.deployLines(
      lines,
      host,
      port,
      timeoutMs,
      `Deploy ${path.basename(fbootPath)}`,
    );
  }

  /**
   * Deploy multiple .fboot files in a single socket session.
   * Commands are sent sequentially in the order provided.
   */
  async deployMultiple(fbootPaths: string[]): Promise<void> {
    this.logger.debug("OpenFBHandler.deployMultiple called", fbootPaths);

    if (!fbootPaths.length) {
      throw new Error("No .fboot files to deploy");
    }

    const config = vscode.workspace.getConfiguration("openfb");
    const host = (config.get<string>("host") || "127.0.0.1");
    const port = (config.get<number>("port") || 61499);
    const timeoutMs = (config.get<number>("deployTimeoutMs") || 30000);

    const allLines: string[] = [];
    for (const fbootPath of fbootPaths) {
      if (!fs.existsSync(fbootPath)) {
        throw new Error(`.fboot file not found: ${fbootPath}`);
      }
      // Load and parse each file, strip QUERY commands to avoid duplicates
      const lines = (await this.loadAndParseFile(fbootPath)).filter(
        (line) => !line.includes('Action="QUERY"'),
      );
      allLines.push(...lines);
    }

    if (allLines.length === 0) {
      throw new Error(".fboot is empty or contains only comments");
    }

    return this.deployLines(
      allLines,
      host,
      port,
      timeoutMs,
      `Deploy ${fbootPaths.length} fboot files`,
    );
  }

  /**
   * Shared deploy path for pre-parsed command lines.
   */
  private async deployLines(
    lines: string[],
    host: string,
    port: number,
    timeoutMs: number,
    title: string,
  ): Promise<void> {
    this.ensureQueryPresent(lines);

    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    }, (progress) => {
      return new Promise<void>((resolve, reject) => {
        this.deployWithSocket(lines, host, port, timeoutMs, progress, resolve, reject);
      });
    });
  }

  /**
   * Internal method to handle socket-based deployment
   */
  private deployWithSocket(
    lines: string[],
    host: string,
    port: number,
    timeoutMs: number,
    progress: vscode.Progress<{ message?: string }>,
    resolve: () => void,
    reject: (err: Error) => void
  ): void {
    const socket = new net.Socket();
    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    let commandsSent = 0;
    let lastCommandResource: string | undefined;

    const cleanUp = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      try { socket.destroy(); } catch (e) {}
    };

    timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanUp();
      reject(new Error("Deploy timed out"));
    }, timeoutMs);

    socket.on("error", (err) => {
      if (finished) return;
      finished = true;
      this.logger.error("Socket error during deploy", err);
      cleanUp();
      reject(err);
    });

    socket.on("close", (hadError) => {
      if (finished) return;
      finished = true;
      this.logger.info("Deploy socket closed", { hadError });
      cleanUp();
      // If the socket closed before all commands were sent, treat as error
      if (commandsSent < lines.length) {
        const nextIdx = commandsSent + 1;
        const nextRes = lastCommandResource || "<unknown resource>";
        reject(new Error(`Connection closed prematurely after ${commandsSent}/${lines.length} commands (next ${nextIdx}/${lines.length} resource=${nextRes})`));
        return;
      }

      if (hadError) {
        reject(new Error("Connection closed with error"));
      } else {
        resolve();
      }
    });

    socket.connect(port, host, async () => {
      this.logger.info("Connected to openFB", { host, port });

      try {
        // Pre-check server resources before executing deploy commands
        await this.checkResourcesBeforeDeploy(socket, lines);

        for (let i = 0; i < lines.length; i++) {
          const parsed = this.parseCommandLine(lines[i]);
          if (!parsed) continue;  // Skip empty XML
          
          lastCommandResource = parsed.resource || "<no resource>";

          await this.sendCommand(socket, parsed.resource, parsed.xml, i, lines.length);
          commandsSent++;
          progress.report({ message: `Sent ${i + 1}/${lines.length}` });
        }

        // Gracefully close write side
        socket.end();
      } catch (err) {
        if (!finished) {
          finished = true;
          cleanUp();
          reject(err as Error);
        }
      }
    });
  }
}

