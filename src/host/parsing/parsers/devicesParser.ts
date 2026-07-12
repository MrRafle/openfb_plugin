import { SysDevice, SysResource, SysBlock } from "../../../shared/models/sysModel";
import { parseFBBlock } from "./fbBlockParser";
import { parseConnections } from "./connectionsParser";
import { asArray } from "../../../shared/utils/arrayUtils";

export function parseDevices(
  system: any,
  sysDir: string,
  searchPaths: string[],
  logger: any,
): SysDevice[] {
  const devices: SysDevice[] = [];
  
  const deviceList = system.Device;
  if (!deviceList) {
    logger.debug("No devices found in system");
    return devices;
  }
  
  const deviceArray = asArray(deviceList);
  logger.debug(`Found ${deviceArray.length} device(s)`);
  
  for (const device of deviceArray) {
    if (!device || !device.Name) continue;
    
    // Parse device parameters
    const parameters: Array<{ name: string; value: string }> = [];
    if (device.Parameter) {
      const paramList = asArray(device.Parameter);
      for (const param of paramList) {
        if (param?.Name !== undefined) {
          parameters.push({
            name: param.Name,
            value: param.Value || "",
          });
        }
      }
    }
    
    // Parse device color attribute
    let color: string | undefined;
    if (device.Attribute) {
      const attrList = asArray(device.Attribute);
      for (const attr of attrList) {
        if (attr?.Name === "Color" && attr.Value) {
          color = String(attr.Value);
          break;
        }
      }
    }
    
    // Parse resources
    const resources: SysResource[] = [];
    if (device.Resource) {
      const resourceList = asArray(device.Resource);
      logger.debug(`Found ${resourceList.length} resource(s) in device ${device.Name}`);
      
      for (const res of resourceList) {
        if (!res || !res.Name) continue;
        
        // Parse resource FB blocks from FBNetwork, but keep them out of the main editor graph
        // unless they are explicitly needed as real blocks. START is synthesized separately.
        const blocks: SysBlock[] = [];
        if (res.FBNetwork?.FB) {
          const fbList = asArray(res.FBNetwork.FB);
          logger.debug(`Found ${fbList.length} FB(s) in resource ${res.Name}`);
          
          for (const fb of fbList) {
            if (!fb || !fb.Name) continue;
            const fbName = `${device.Name}.${res.Name}.${fb.Name}`;
            const block = parseFBBlock(fb, fbName, sysDir, searchPaths, logger);
            if (block.id.toUpperCase().endsWith(".START") || block.id.toUpperCase() === "START") {
              continue;
            }
            blocks.push(block);
          }
        }
        
        // Parse resource connections from FBNetwork
        let connections = parseConnections(res.FBNetwork, logger);
        
        resources.push({
          name: res.Name,
          type: res.Type || "",
          device: device.Name,
          blocks: blocks.length > 0 ? blocks : undefined,
          connections: connections.length > 0 ? connections : undefined,
        });
      }
    }
    
    devices.push({
      name: device.Name,
      type: device.Type,
      resources,
      color,
      parameters: parameters.length > 0 ? parameters : undefined,
    });
  }
  
  logger.info(`Parsed ${devices.length} device(s)`);
  return devices;
}
