import { FBKind } from "./FBKind";

export interface SysModel {
  systemName: string; // System name
  applicationName: string; // Application name
  subAppNetwork: SysSubAppNetwork; // Application SubAppNetwork
  devices: SysDevice[]; // Devices with their resources
  mappings: SysMapping[]; // FB to Device/Resource mappings (CRITICAL)
}

export const SUBAPP_INTERFACE_BLOCK = "__SUBAPP_INTERFACE__";

export interface SysSubAppNetwork {
  blocks: SysBlock[]; // FB instances with parameters
  subApps?: SysSubApp[]; // SubApp instances parsed from SubAppNetwork
  connections?: SysConnection[]; // EventConnections + DataConnections
}

export interface SysBlock {
  id: string; // instance name
  typeShort: string; // FB type short (e.g., "E_CYCLE")
  typeLong: string; // FB type long (e.g., "iec61499::system::E_CYCLE")
  x: number; // x coordinate
  y: number; // y coordinate
  fbKind?: FBKind; // FB type classification: BASIC | COMPOSITE | SERVICE | ADAPTER | SUBAPP | UNKNOWN
  parameters?: SysParameter[]; // FB parameters (Literal Assignments)
  resolvedTypePath?: string; // Resolved file path for this FB type (set at runtime by extension)
}

export interface SysSubApp {
  id: string; // instance name
  typeShort: string; // type short
  typeLong: string; // type long
  x: number; // x coordinate
  y: number; // y coordinate
  parameters?: SysParameter[];
  subAppNetwork: SysSubAppNetwork; // Application SubAppNetwork
  subAppInterfaceParams?: SubAppInterfaceParam[];
}

export interface SubAppInterfaceParam {
  name: string;
  kind: "event" | "data";
  direction: "input" | "output";
}

export interface SysParameter {
  fbName: string; // FB instance name to which parameter belongs
  name: string; // parameter name
  value: string; // parameter value
  attributes?: Array<{
    // parameter attributes
    name: string;
    value: string;
  }>;
}

export interface SysConnection {
  fromBlock: string;
  fromPort: string;
  toBlock: string;
  toPort: string;
  type?: "event" | "data"; // connection type
}

export interface SysResource {
  name: string; // resource name (e.g., "EMB_RES")
  type: string; // resource type (e.g., "iec61499::system::EMB_RES")
  device: string; // parent device name
  blocks?: SysBlock[]; // FB instances in resource FBNetwork
  connections?: SysConnection[]; // Resource FBNetwork connections
}

export interface SysDiagramNode extends SysBlock {
  source: "application" | "resource";
  resourceName?: string;
}

export interface SysDevice {
  name: string; // device name (e.g., "FORTE_PC")
  type?: string; // device type (e.g., "iec61499::system::FORTE_PC")
  resources: SysResource[];
  color?: string; // optional color attribute in format "R,G,B"
  parameters?: Array<{
    // device parameters
    name: string;
    value: string;
  }>;
}

export interface SysMapping {
  fbInstance: string; // FB instance (e.g., "App.FB_Name")
  device: string; // Target device (e.g., "FORTE_PC")
  resource: string; // Target resource (e.g., "EMB_RES")
  target?: string; // Full "To" path (e.g., "FORTE_PC.EMB_RES.OUT_ANY_CONSOLE")
}
