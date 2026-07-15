import { EditorState, EditorNode, EditorPort } from "../editorState";
import { COLORS, CANVAS_COLORS } from "../../shared/colorScheme";
import { buildPortSectionHtml } from "./panelUtils";
import { validateParameterValue } from "../../shared/parameterValidator";
import { getWebviewLogger } from "../logging";
import type { SysConnection } from "../../shared/models/sysModel";
import {
  buildDeviceParametersHtml,
  buildDeviceResourcesHtml,
  buildDeviceFBsHtml,
  buildDeviceConnectionsHtml,
} from "./deviceTreeRenderer";
import { tr, getLanguage } from "../i18nService";

export type DiagramTabMode = "devices" | "blockinfo";

export interface RightPanelController {
  updateSidepanel: () => void;
  setDiagramTab: (tab: DiagramTabMode) => void;
  getDiagramTab: () => DiagramTabMode;
}

interface RightPanelOptions {
  state: EditorState;
}

export function createRightPanelController(options: RightPanelOptions): RightPanelController {
  const { state } = options;

  let diagramTabMode: DiagramTabMode = "devices";

  function renderDevicesTab(): void {
    const sidepanelHeader = document.getElementById("sidepanel-header");
    const sidepanelContent = document.getElementById("sidepanel-content");
    if (!sidepanelContent) return;

    if (sidepanelHeader) {
      sidepanelHeader.textContent = tr("panel.devices.title");
    }

    if (!state.model || !state.model.devices || state.model.devices.length === 0) {
      sidepanelContent.innerHTML = `<div class="sidepanel-empty">${tr("panel.devices.empty")}</div>`;
      return;
    }

    let html = "";

    for (const device of state.model.devices) {
      const deviceFBs = state.model?.mappings?.filter((m) => m.device === device.name) || [];
      const uniqueFBs = Array.from(new Set(deviceFBs.map((m) => m.fbInstance))) as string[];

      const deviceConnections = state.model?.subAppNetwork?.connections?.filter((conn) => {
        const fromBlockInDevice = uniqueFBs.some((fb) => conn.fromBlock.startsWith(fb));
        const toBlockInDevice = uniqueFBs.some((fb) => conn.toBlock.startsWith(fb));
        return fromBlockInDevice && toBlockInDevice;
      }) || [];

      const deviceId = `device-${device.name.replace(/\s+/g, "_")}`;
      const borderColor = device.color ? `rgb(${device.color})` : COLORS.BUTTON_PRIMARY_BG;

      html += `<div class="device-section" style="border-left: 3px solid ${borderColor}">`;
      html += '<div class="device-header">';
      html += `<div class="device-name">${device.name}</div>`;
      html += "</div>";

      html += '<div class="device-info-container">';
      if (device.type) {
        html += `<div class="device-item"><span class="device-label">${tr("field.type")}:</span><span class="device-value">${device.type}</span></div>`;
      }
      html += "</div>";

      html += buildDeviceParametersHtml(deviceId, device);
      html += buildDeviceResourcesHtml(deviceId, device);
      html += buildDeviceFBsHtml(deviceId, uniqueFBs);
      html += buildDeviceConnectionsHtml(deviceId, deviceConnections);

      html += "</div>";
    }

    sidepanelContent.innerHTML = html;
  }

  function buildBlockInfoHtml(node: EditorNode, displayType?: string, displayKind?: string): string {
    const safeType = (displayType && displayType.trim()) || node.type || "—";
    const safeKind = displayKind || (node.fbKind ? String(node.fbKind) : undefined);
    let html = '<div class="sidepanel-section">';
    html += `<div class="sidepanel-item"><span class="sidepanel-label">${tr("field.name")}:</span><span class="sidepanel-value">${node.id}</span></div>`;
    html += `<div class="sidepanel-item"><span class="sidepanel-label">${tr("field.type")}:</span><span class="sidepanel-value">${safeType}</span></div>`;

    if (safeKind) {
      const kindLabels: Record<string, string> = {
        BASIC: "Basic",
        SIMPLE: "Simple",
        COMPOSITE: "Composite",
        ADAPTER: "Adapter",
        SUBAPP: "Sub-app",
        SERVICE: "Service",
        UNKNOWN: "Unknown",
      };
      const kindLabel = kindLabels[safeKind] || safeKind;
      html += `<div class="sidepanel-item"><span class="sidepanel-label">${tr("field.class")}:</span><span class="sidepanel-value">${kindLabel}</span></div>`;
    }
    html += "</div>";

    html += '<div class="sidepanel-section">';
    html += `<div class="sidepanel-item"><span class="sidepanel-label">${tr("field.position")}:</span><span class="sidepanel-value">X: ${node.x.toFixed(0)}, Y: ${node.y.toFixed(0)}</span></div>`;
    html += "</div>";

    return html;
  }



  function buildPortsHtml(nodeId: string, ports: EditorPort[], nodeParamMap: Map<string, string>, opcMappingSet: Set<string>): string {
    if (ports.length === 0) return "";

    let html = "";

    const inputPorts = ports.filter((p) => p.direction === "input");
    html += buildPortSectionHtml({
      nodeId,
      sectionIdSuffix: "inputs",
      title: tr("field.inputs"),
      toggleTitle: tr("hint.toggleInputs"),
      ports: inputPorts,
      nodeParamMap,
      opcMappingSet,
      showValueWhenTruthyOnly: false,
      editable: true,
      portColorMap: (port) =>
        port.kind === "event" ? CANVAS_COLORS.EVENT_PORT_COLOR : CANVAS_COLORS.DATA_PORT_COLOR,
      textMutedColor: COLORS.TEXT_MUTED,
    });

    const outputPorts = ports.filter((p) => p.direction === "output");
    html += buildPortSectionHtml({
      nodeId,
      sectionIdSuffix: "outputs",
      title: tr("field.outputs"),
      toggleTitle: tr("hint.toggleOutputs"),
      ports: outputPorts,
      nodeParamMap,
      showValueWhenTruthyOnly: true,
      portColorMap: (port) =>
        port.kind === "event" ? CANVAS_COLORS.EVENT_PORT_COLOR : CANVAS_COLORS.DATA_PORT_COLOR,
      textMutedColor: COLORS.TEXT_MUTED,
    });

    return html;
  }

  function updateSidepanel(): void {
    const sidepanelHeader = document.getElementById("sidepanel-header");
    const sidepanelContent = document.getElementById("sidepanel-content");
    if (!sidepanelContent) return;

    // Diagram tabs mode
    if (diagramTabMode === "devices") {
      renderDevicesTab();
    } else {
      renderBlockInfoTab();
    }
  }

  function attachMonitoringHandlers(container: HTMLElement): void {
    const watchButtons = container.querySelectorAll<HTMLButtonElement>(".monitor-watch-btn");

    Array.from(watchButtons).forEach((btn) => {
      const nodeId = btn.dataset.nodeId;
      const portName = btn.dataset.portName;
      if (!nodeId || !portName) return;

      btn.addEventListener("click", () => {
        console.log(`[MONITOR DEBUG] Watch clicked! Node: "${nodeId}", Port: "${portName}"`);
        
        state.sendMessage({
          type: "monitoring:add-watch",
          nodeId,
          portName,
        });
      });
    });

    const triggerButtons = container.querySelectorAll<HTMLButtonElement>(".monitor-trigger-btn");

    Array.from(triggerButtons).forEach((btn) => {
      const nodeId = btn.dataset.nodeId;
      const portName = btn.dataset.portName;
      if (!nodeId || !portName) return;

      btn.addEventListener("click", () => {
        state.sendMessage({
          type: "monitoring:trigger-event",
          nodeId,
          portName,
        });
      });
    });

    const forceButtons = container.querySelectorAll<HTMLButtonElement>(".monitor-force-btn");

    Array.from(forceButtons).forEach((btn) => {
      const nodeId = btn.dataset.nodeId;
      const portName = btn.dataset.portName;
      if (!nodeId || !portName) return;

      btn.addEventListener("click", () => {
        const input = container.querySelector<HTMLInputElement>(
          `.monitor-force-input[data-node-id="${nodeId}"][data-port-name="${portName}"]`,
        );

        state.sendMessage({
          type: "monitoring:force-value",
          nodeId,
          portName,
          value: input?.value ?? "",
          force: true,
        });
      });
    });
  }

  function renderBlockInfoTab(): void {
    const sidepanelHeader = document.getElementById("sidepanel-header");
    const sidepanelContent = document.getElementById("sidepanel-content");
    if (!sidepanelContent) return;

    if (sidepanelHeader) {
      sidepanelHeader.textContent = tr("panel.blockInfo.title");
    }

    const selectedNodeId = state.selection.nodeId;

    if (!selectedNodeId) {
      sidepanelContent.innerHTML = `<div class="sidepanel-empty">${tr("panel.blockInfo.selectBlock")}</div>`;
      return;
    }

    const node = state.nodes.find((n) => n.id === selectedNodeId);
    if (!node) {
      sidepanelContent.innerHTML = `<div class="sidepanel-empty">${tr("panel.blockInfo.notFound")}</div>`;
      return;
    }

    const nodeParamMap = new Map<string, string>();
    const opcMappingSet = new Set<string>();
    const diagramBlock = state.model?.subAppNetwork?.blocks?.find((b) => b.id === node.id);
    if (diagramBlock?.parameters) {
      for (const p of diagramBlock.parameters) {
        nodeParamMap.set(p.name, p.value);
        if (p.attributes?.some((a) => a.name === "OpcMapping" && a.value === "true")) {
          opcMappingSet.add(p.name);
        }
      }
    }

    const displayType = node.type || diagramBlock?.typeShort || diagramBlock?.typeLong || "";
    const displayKind = (node.fbKind || diagramBlock?.fbKind) ? String(node.fbKind || diagramBlock?.fbKind) : undefined;

    let html = "";
    html += buildBlockInfoHtml(node, displayType, displayKind);
    html += buildPortsHtml(selectedNodeId, node.ports || [], nodeParamMap, opcMappingSet);

    sidepanelContent.innerHTML = html;

    // Attach event handlers for editable parameter inputs and OPC checkboxes
    attachParameterHandlers(sidepanelContent);
    attachMonitoringHandlers(sidepanelContent);
  }

  /**
   * Attach change/blur handlers for parameter value inputs and OPC checkboxes.
   * Uses direct DOM queries after innerHTML is set (not event delegation)
   * to keep focused input state clean.
   */
  function attachParameterHandlers(container: HTMLElement): void {
    const logger = getWebviewLogger();

    // Parameter value inputs
    const paramInputs = container.querySelectorAll<HTMLInputElement>('.param-value-input');
    Array.from(paramInputs).forEach((input) => {
      const nodeId = input.dataset.nodeId;
      const portName = input.dataset.portName;
      const portType = input.dataset.portType || undefined;
      if (!nodeId || !portName) return;

      let lastCommittedValue = input.value;

      input.addEventListener('change', () => {
        const newValue = input.value.trim();
        if (newValue === lastCommittedValue) return;

        // Validate before dispatching
        const validation = validateParameterValue(newValue, portType, getLanguage());
        if (!validation.valid) {
          logger.warn(`Parameter validation failed: ${nodeId}.${portName} = "${newValue}" — ${validation.error}`);
          input.style.borderColor = '#e74c3c';
          input.title = validation.error || tr('validation.invalidValue');
          return;
        }

        // Clear error styling
        input.style.borderColor = 'rgba(128,128,128,0.3)';
        input.title = '';
        lastCommittedValue = newValue;

        state.dispatch({
          type: 'UPDATE_PARAMETER',
          nodeId,
          paramName: portName,
          value: newValue
        });
      });

      // Also validate on blur (in case user tabs away without pressing Enter)
      input.addEventListener('blur', () => {
        const newValue = input.value.trim();
        if (newValue === lastCommittedValue) return;
        // Fire the change event programmatically to reuse the same logic
        input.dispatchEvent(new Event('change'));
      });

      // Validate on keypress: Enter commits, Escape reverts
      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.dispatchEvent(new Event('change'));
          input.blur();
        } else if (e.key === 'Escape') {
          input.value = lastCommittedValue;
          input.style.borderColor = 'rgba(128,128,128,0.3)';
          input.title = '';
          input.blur();
        }
      });

      // Live validation hint while typing
      input.addEventListener('input', () => {
        const val = input.value.trim();
        if (val === '') {
          input.style.borderColor = 'rgba(128,128,128,0.3)';
          input.title = '';
          return;
        }
        const v = validateParameterValue(val, portType, getLanguage());
        if (!v.valid) {
          input.style.borderColor = '#e7a33c';
          input.title = v.error || '';
        } else {
          input.style.borderColor = 'rgba(128,128,128,0.3)';
          input.title = '';
        }
      });
    });

    // OPC Mapping checkboxes
    const opcCheckboxes = container.querySelectorAll<HTMLInputElement>('.opc-mapping-checkbox:not([disabled])');
    Array.from(opcCheckboxes).forEach((cb) => {
      const nodeId = cb.dataset.nodeId;
      const portName = cb.dataset.portName;
      if (!nodeId || !portName) return;

      cb.addEventListener('change', () => {
        state.dispatch({
          type: 'TOGGLE_OPC_MAPPING',
          nodeId,
          paramName: portName,
          enabled: cb.checked
        });
      });
    });
  }
  
  function setDiagramTab(tab: DiagramTabMode): void {
    diagramTabMode = tab;
    
    // Update tab UI
    const devicesTab = document.getElementById("tab-devices");
    const blockinfoTab = document.getElementById("tab-blockinfo");
    
    if (devicesTab && blockinfoTab) {
      if (tab === "devices") {
        devicesTab.classList.add("active");
        blockinfoTab.classList.remove("active");
      } else {
        devicesTab.classList.remove("active");
        blockinfoTab.classList.add("active");
      }
    }
    
    updateSidepanel();
  }

  return {
    updateSidepanel,
    setDiagramTab,
    getDiagramTab: () => diagramTabMode,
  };
}
