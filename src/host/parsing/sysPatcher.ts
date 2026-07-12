/**
 * SYS file patcher — applies model changes to the original XML
 * preserving all untracked attributes (VersionInfo, dx1/dx2/dy,
 * Comment, Attribute.Type, Resource x/y, etc.).
 *
 * Approach:
 *  1. Parse the original .sys XML (full fidelity via fast-xml-parser)
 *  2. Walk the parsed JS tree, applying diffs from the webview model
 *  3. Serialize back to XML via XMLBuilder
 */

import * as fs from "fs";
import { XMLBuilder } from "fast-xml-parser";
import { createXmlParser } from "./xmlParserFactory";
import { SysModel, SUBAPP_INTERFACE_BLOCK } from "../../shared/models/sysModel";
import { asArray } from "../../shared/utils/arrayUtils";

export interface NormParams {
  minX: number;
  minY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface PatchOptions {
  model: SysModel;
  nodes: Array<{ id: string; x: number; y: number }>;
  normParams?: NormParams;
}

/**
 * Read the original .sys file, apply changes from the webview model,
 * and return the patched XML string.
 */
export function patchSysFile(originalPath: string, opts: PatchOptions): string {
  const originalXml = fs.readFileSync(originalPath, "utf8");

  const parser = createXmlParser({
    commentPropName: "__comment",
    isArray: (tagName: string) => {
      const arrayTags = new Set([
        "FB", "SubApp", "Connection", "Parameter", "Attribute",
        "Device", "Resource", "Mapping", "VersionInfo",
      ]);
      return arrayTags.has(tagName);
    },
  });

  const doc = parser.parse(originalXml);
  const system = doc?.System;
  if (!system) {
    throw new Error("patchSysFile: no <System> in original XML");
  }

  const app = system.Application;
  if (!app) {
    throw new Error("patchSysFile: no <Application> in original XML");
  }

  console.log("patchSysFile originalPath:", originalPath);
  console.log("patchSysFile app:", JSON.stringify(app, null, 2));
  console.log("patchSysFile app keys:", Object.keys(app || {}));

  const network =
  app.SubAppNetwork && typeof app.SubAppNetwork === "object"
    ? app.SubAppNetwork
    : {};

  app.SubAppNetwork = network;

  const { model, nodes, normParams } = opts;

  //  Patch blocks
  const xmlBlocks = asArray(network.FB);
  const xmlBlocksByName = new Map<string, any>();
  for (const fb of xmlBlocks) {
    if (fb?.Name) xmlBlocksByName.set(fb.Name, fb);
  }

  for (const modelBlock of model.subAppNetwork.blocks) {
    // Skip START and E_RESTART system blocks - they are built-in and not persisted
    if (modelBlock.id === "START" || modelBlock.id.toUpperCase().endsWith(".START") || modelBlock.typeShort?.toUpperCase() === "E_RESTART") {
      continue;
    }

    const xmlFb = xmlBlocksByName.get(modelBlock.id);

    // Denormalize coordinates from screen to original XML scale
    const nodePos = nodes.find(n => n.id === modelBlock.id);

    if (xmlFb) {
      //  Existing block: update in-place 
      if (nodePos && normParams && normParams.scale) {
        xmlFb.x = String(Math.round(
          (nodePos.x - normParams.offsetX) / normParams.scale + normParams.minX
        ));
        xmlFb.y = String(Math.round(
          (nodePos.y - normParams.offsetY) / normParams.scale + normParams.minY
        ));
      }

      // Patch parameters
      patchParameters(xmlFb, modelBlock.parameters || []);
    } else {
      //  New block: append to SubAppNetwork 
      const newFb: any = {
        Name: modelBlock.id,
        Type: modelBlock.typeLong,
        x: "0",
        y: "0",
      };
      if (nodePos && normParams && normParams.scale) {
        newFb.x = String(Math.round(
          (nodePos.x - normParams.offsetX) / normParams.scale + normParams.minX
        ));
        newFb.y = String(Math.round(
          (nodePos.y - normParams.offsetY) / normParams.scale + normParams.minY
        ));
      }
      if (modelBlock.parameters && modelBlock.parameters.length > 0) {
        newFb.Parameter = modelBlock.parameters.map(p => {
          const param: any = { Name: p.name, Value: p.value };
          if (p.attributes && p.attributes.length > 0) {
            param.Attribute = p.attributes.map(a => ({ Name: a.name, Value: a.value }));
          }
          return param;
        });
      }
      xmlBlocks.push(newFb);
    }
  }

  // Remove blocks that were deleted from the model
  const modelBlockIds = new Set(model.subAppNetwork.blocks.map(b => b.id));
  const survivingBlocks = xmlBlocks.filter((fb: any) => modelBlockIds.has(fb.Name));
  network.FB = survivingBlocks.length > 0 ? survivingBlocks : undefined;

  // Patch connections 

  patchConnections(network, model.subAppNetwork.connections || []);

  // Patch mappings 
  // Build set of model mapping keys (From values)
  const modelMappingFroms = new Set(model.mappings.map(m => m.fbInstance));

  // Start from XML mappings, remove deleted, add new
  let xmlMappings = asArray(system.Mapping);
  xmlMappings = xmlMappings.filter((m: any) => modelMappingFroms.has(m.From));

  const existingFroms = new Set(xmlMappings.map((m: any) => m.From));
  for (const mapping of model.mappings) {
    if (!existingFroms.has(mapping.fbInstance)) {
      xmlMappings.push({
        From: mapping.fbInstance,
        To: mapping.target || `${mapping.device}.${mapping.resource}`,
      });
    }
  }
  system.Mapping = xmlMappings.length > 0 ? xmlMappings : undefined;


  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    format: true,
    indentBy: "\t",
    suppressEmptyNode: true,
    suppressBooleanAttributes: false,
    commentPropName: "__comment",
    processEntities: true,
  });

  // Produce XML string with declaration
  let xml: string = builder.build(doc);

  // Ensure XML declaration at top
  if (!xml.startsWith("<?xml")) {
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n` + xml;
  }

  return xml;
}



function patchParameters(xmlFb: any, modelParams: Array<{
  fbName: string;
  name: string;
  value: string;
  attributes?: Array<{ name: string; value: string }>;
}>): void {
  const existing = asArray(xmlFb.Parameter);
  const existingByName = new Map<string, any>();
  for (const p of existing) {
    if (p?.Name) existingByName.set(p.Name, p);
  }

  for (const mp of modelParams) {
    const xmlParam = existingByName.get(mp.name);
    if (xmlParam) {
      // Update value (preserves Comment and other attrs)
      xmlParam.Value = mp.value;

      // Patch OPC attributes
      patchOpcAttributes(xmlParam, mp.attributes || []);
    } else {
      // New parameter
      const newParam: any = { Name: mp.name, Value: mp.value };
      if (mp.attributes && mp.attributes.length > 0) {
        newParam.Attribute = mp.attributes.map(a => ({ Name: a.name, Value: a.value }));
      }
      existing.push(newParam);
    }
  }

  xmlFb.Parameter = existing.length > 0 ? existing : undefined;
}

function patchOpcAttributes(xmlParam: any, modelAttrs: Array<{ name: string; value: string }>): void {
  const existing = asArray(xmlParam.Attribute);

  // Check if model has OpcMapping
  const xmlOpcIdx = existing.findIndex((a: any) => a.Name === "OpcMapping");

  const opcAttr = modelAttrs.find(a => a.name === "OpcMapping");

  if (opcAttr) {
    // Model has OpcMapping attribute — add or update
    if (xmlOpcIdx !== -1) {
      existing[xmlOpcIdx] = { ...existing[xmlOpcIdx], Value: String(opcAttr.value) };
    } else {
      existing.push({ Name: "OpcMapping", Value: String(opcAttr.value) });
    }
  }

  xmlParam.Attribute = existing.length > 0 ? existing : undefined;
}



function formatEndpoint(block: string, port: string): string {
  if (block === SUBAPP_INTERFACE_BLOCK) return port;
  return `${block}.${port}`;
}

function patchConnections(
  network: any,
  modelConnections: Array<{
    fromBlock: string;
    fromPort: string;
    toBlock: string;
    toPort: string;
    type?: "event" | "data";
  }>,
): void {
  // Build set of model connections as "Source->Destination" keys, split by type
  const modelEventKeys = new Set<string>();
  const modelDataKeys = new Set<string>();
  for (const mc of modelConnections) {
    const src = formatEndpoint(mc.fromBlock, mc.fromPort);
    const dst = formatEndpoint(mc.toBlock, mc.toPort);
    const key = `${src}->${dst}`;
    if (mc.type === "event") {
      modelEventKeys.add(key);
    } else if (mc.type === "data") {
      modelDataKeys.add(key);
    }
  }

  // Filter existing XML connections: keep only those still in the model
  if (network.EventConnections) {
    let eventConns = asArray(network.EventConnections.Connection);
    eventConns = eventConns.filter((c: any) =>
      c?.Source && c?.Destination && modelEventKeys.has(`${c.Source}->${c.Destination}`)
    );
    network.EventConnections.Connection = eventConns.length > 0 ? eventConns : undefined;
    if (!network.EventConnections.Connection) delete network.EventConnections;
  }
  if (network.DataConnections) {
    let dataConns = asArray(network.DataConnections.Connection);
    dataConns = dataConns.filter((c: any) =>
      c?.Source && c?.Destination && modelDataKeys.has(`${c.Source}->${c.Destination}`)
    );
    network.DataConnections.Connection = dataConns.length > 0 ? dataConns : undefined;
    if (!network.DataConnections.Connection) delete network.DataConnections;
  }

  // Add new model connections that don't yet exist in XML
  const existingEventConns = new Set<string>();
  const existingDataConns = new Set<string>();
  for (const conn of asArray(network.EventConnections?.Connection)) {
    if (conn?.Source && conn?.Destination) {
      existingEventConns.add(`${conn.Source}->${conn.Destination}`);
    }
  }
  for (const conn of asArray(network.DataConnections?.Connection)) {
    if (conn?.Source && conn?.Destination) {
      existingDataConns.add(`${conn.Source}->${conn.Destination}`);
    }
  }

  for (const mc of modelConnections) {
    const src = formatEndpoint(mc.fromBlock, mc.fromPort);
    const dst = formatEndpoint(mc.toBlock, mc.toPort);
    const key = `${src}->${dst}`;

    if (mc.type === "event") {
      if (!existingEventConns.has(key)) {
        if (!network.EventConnections) network.EventConnections = {};
        const conns = asArray(network.EventConnections.Connection);
        conns.push({ Source: src, Destination: dst });
        network.EventConnections.Connection = conns;
      }
    } else if (mc.type === "data") {
      if (!existingDataConns.has(key)) {
        if (!network.DataConnections) network.DataConnections = {};
        const conns = asArray(network.DataConnections.Connection);
        conns.push({ Source: src, Destination: dst });
        network.DataConnections.Connection = conns;
      }
    }
  }
}
