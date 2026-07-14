import * as net from "net";
import * as vscode from "vscode";
import {
  buildPacket,
  parseResponse,
  detectXmlError,
  buildAddWatchRequest,
  buildDeleteWatchRequest,
  buildReadWatchesRequest,
  buildForceValueRequest,
  buildTriggerEventRequest,
  parseWatchesResponse,
} from "../deploy/protocol";
import { readSettingsFromVsCodeConfig } from "../settingsManager";
import type { Logger } from "../logging";
import type { SysModel } from "../../shared/models/sysModel";

export class MonitoringSession {
  private socket?: net.Socket;
  private requestId = 1;
  private pollTimer?: NodeJS.Timeout;
  private watched = new Map<string, { resource: string; source: string }>();

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly getModel: () => SysModel | undefined,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    if (this.socket) return;

    const settings = readSettingsFromVsCodeConfig();
    const socket = new net.Socket();
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.connect(settings.deploy.port, settings.deploy.host, () => {
        socket.removeListener("error", reject);
        resolve();
      });
    });

    this.pollTimer = setInterval(() => {
      this.readWatches().catch((err) => this.postError(err));
    }, 500);

    this.panel.webview.postMessage({ type: "monitoring:started" });
    this.logger.info("Monitoring started");
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;

    try {
      this.socket?.destroy();
    } catch {}
    this.socket = undefined;
    this.watched.clear();

    this.panel.webview.postMessage({ type: "monitoring:stopped" });
    this.logger.info("Monitoring stopped");
  }

  async addWatch(nodeId: string, portName: string): Promise<void> {
    await this.start();

    const target = this.resolveTarget(nodeId, portName);
    const key = `${nodeId}.${portName}`;

    await this.send(target.resource, buildAddWatchRequest(this.nextId(), target.source));
    this.watched.set(key, target);

    this.panel.webview.postMessage({ type: "monitoring:watch-added", portId: key });
  }

  async deleteWatch(nodeId: string, portName: string): Promise<void> {
    const key = `${nodeId}.${portName}`;
    const target = this.watched.get(key);
    if (!target) return;

    await this.send(target.resource, buildDeleteWatchRequest(this.nextId(), target.source));
    this.watched.delete(key);

    this.panel.webview.postMessage({ type: "monitoring:watch-deleted", portId: key });
  }

  async forceValue(nodeId: string, portName: string, value: string, force: boolean): Promise<void> {
    await this.start();
    const target = this.resolveTarget(nodeId, portName);
    await this.send(target.resource, buildForceValueRequest(this.nextId(), value, target.source, force));
  }

  async triggerEvent(nodeId: string, portName: string): Promise<void> {
    await this.start();
    const target = this.resolveTarget(nodeId, portName);
    await this.send(target.resource, buildTriggerEventRequest(this.nextId(), target.source));
  }

  private async readWatches(): Promise<void> {
    if (!this.socket || this.watched.size === 0) return;

    const xml = await this.send("", buildReadWatchesRequest(this.nextId()));
    const values = parseWatchesResponse(xml);

    this.panel.webview.postMessage({
      type: "monitoring:values",
      payload: { values },
    });
  }

  private resolveTarget(nodeId: string, portName: string): { resource: string; source: string } {
    const model = this.getModel();
    if (!model) throw new Error("No SYS model loaded");

    const qualifiedFb = nodeId.includes(".") ? nodeId : `${model.applicationName}.${nodeId}`;
    const mapping = model.mappings.find(
      (m) => m.fbInstance === qualifiedFb || m.fbInstance.endsWith(`.${nodeId}`),
    );

    if (!mapping) {
      throw new Error(`No mapping for ${nodeId}. Save and deploy the SYS first.`);
    }

    return {
      resource: mapping.resource,
      source: `${mapping.fbInstance}.${portName}`,
    };
  }

  private async send(resource: string, xml: string): Promise<string> {
    if (!this.socket) throw new Error("Monitoring socket is not connected");

    const socket = this.socket;
    const packet = buildPacket(resource, xml);
    socket.write(packet);

    const response = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalLen = 0;

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timeout waiting for monitoring response"));
      }, 5000);

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        totalLen += chunk.length;

        const buf = Buffer.concat(chunks, totalLen);
        if (buf.length < 3) return;

        const lenXml = buf[2];
        if (buf.length < 3 + lenXml) return;

        cleanup();
        resolve(parseResponse(buf.slice(0, 3 + lenXml)));
      };

      socket.on("data", onData);
      socket.on("error", onError);
    });

    const error = detectXmlError(response);
    if (error.isError) throw new Error(error.message || response);

    return response;
  }

  private nextId(): number {
    return this.requestId++;
  }

  private postError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error("Monitoring error", err);
    this.panel.webview.postMessage({ type: "monitoring:error", error: message });
  }
}