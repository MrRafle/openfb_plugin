/**
 * Panel utilities — port section builder and re-exports.
 */

import { buildCollapsibleSectionHtml } from "./components/collapsible";
export type { CollapsibleSectionOptions } from "./components/collapsible";
export { buildCollapsibleSectionHtml } from "./components/collapsible";

export interface PortBuilderOptions {
  nodeId: string;
  sectionIdSuffix: string;
  title: string;
  toggleTitle: string;
  ports: any[];
  nodeParamMap: Map<string, string>;
  opcMappingSet?: Set<string>;
  showValueWhenTruthyOnly: boolean;
  portColorMap: (port: any) => string;
  textMutedColor: string;
  /** When true, render editable <input> for data input values and enabled OPC checkboxes */
  editable?: boolean;
}

export function buildPortSectionHtml(options: PortBuilderOptions): string {
  const {
    nodeId,
    sectionIdSuffix,
    title,
    toggleTitle,
    ports,
    nodeParamMap,
    opcMappingSet,
    showValueWhenTruthyOnly,
    portColorMap,
    textMutedColor,
    editable = false,
  } = options;

  if (ports.length === 0) return "";

  const sectionId = `node-${nodeId}-${sectionIdSuffix}`;
  let contentHtml = "";

  for (const port of ports) {
    const portColor = portColorMap(port);
    const paramValue = nodeParamMap.get(port.name);
    const portType = (port as any).type
      ? ` <span class="port-type-annotation" style="color: ${textMutedColor};">(${(port as any).type})</span>`
      : "";

    contentHtml += '<div class="sidepanel-item">';
    contentHtml += `<span class="sidepanel-label"><span class="port-dot" style="background-color: ${portColor}"></span>${port.name}${portType}</span>`;

    // Editable input for data input ports, read-only span for others
    const isDataInput = port.kind === "data" && port.direction === "input";
    if (editable && isDataInput) {
      const val = paramValue ?? "";
      const portDataType = (port as any).type || "";
      contentHtml += `<input type="text" class="param-value-input" data-node-id="${nodeId}" data-port-name="${port.name}" data-port-type="${portDataType}" value="${val.replace(/"/g, '&quot;')}" />`;
    } else if (showValueWhenTruthyOnly ? !!paramValue : paramValue !== undefined) {
      const displayValue = paramValue ? `= ${paramValue}` : "";
      if (displayValue) {
        contentHtml += `<span class="sidepanel-value">${displayValue}</span>`;
      }
    }

    // OPC Mapping checkbox for data input ports
    if (opcMappingSet && isDataInput) {
      const checked = opcMappingSet.has(port.name) ? "checked" : "";
      const disabledAttr = editable ? "" : "disabled";
      contentHtml += `<label class="opc-mapping-label" title="OPC UA Mapping" style="margin-left: auto;"><input type="checkbox" class="opc-mapping-checkbox" data-node-id="${nodeId}" data-port-name="${port.name}" ${checked} ${disabledAttr} /> OPC</label>`;
    }

    if (nodeId !== "START") {
      contentHtml += `<div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">`;

      contentHtml += `<div style="display: flex; gap: 4px;">`;
      contentHtml += `<button class="monitor-watch-btn" data-node-id="${nodeId}" data-port-name="${port.name}" title="Следить за значением" style="flex: 0 0 55px; font-size: 11px; padding: 4px 0; border-radius: 3px; cursor: pointer; box-sizing: border-box; text-align: center;">Watch</button>`;

      if (port.kind === "event" && port.direction === "input") {
        contentHtml += `<button class="monitor-trigger-btn" data-node-id="${nodeId}" data-port-name="${port.name}" title="Сымитировать событие" style="flex: 0 0 55px; font-size: 11px; padding: 4px 0; border-radius: 3px; cursor: pointer; box-sizing: border-box; text-align: center;">Trigger</button>`;
      }
      contentHtml += `</div>`;

      // Строка 2
      if (port.kind === "data" && port.direction === "input") {
        contentHtml += `<div style="display: flex; gap: 4px;">`;
        contentHtml += `<input type="text" class="monitor-force-input" placeholder="Force" data-node-id="${nodeId}" data-port-name="${port.name}" style="flex: 0 0 40px !important; width: 40px !important; min-width: 40px !important; max-width: 40px !important; font-size: 11px; padding: 4px 4px; border: 1px solid rgba(128,128,128,0.3); border-radius: 3px; background: rgba(255,255,255,0.05); color: inherit; box-sizing: border-box;" />`;
        contentHtml += `<button class="monitor-force-btn" data-node-id="${nodeId}" data-port-name="${port.name}" title="Принудительно задать значение" style="flex: 0 0 55px !important; width: 55px !important; min-width: 55px !important; max-width: 55px !important; font-size: 11px; padding: 4px 0; border-radius: 3px; cursor: pointer; box-sizing: border-box; text-align: center;">Force</button>`;
        contentHtml += `</div>`;
      }
      contentHtml += `</div>`;
    }
    contentHtml += "</div>";
  }

  return buildCollapsibleSectionHtml({
    sectionId,
    title,
    toggleTitle,
    containerClass: "sidepanel-ports-container",
    itemsCount: ports.length,
    contentHtml,
    wrapperClass: "sidepanel-section",
    buttonClass: "device-toggle side-toggle",
    expandedByDefault: true,
  });
}
