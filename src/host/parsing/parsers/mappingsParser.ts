import { SysMapping } from "../../../shared/models/sysModel";

export function parseMappings(
  system: any,
  logger: any,
): SysMapping[] {
  const mappings: SysMapping[] = [];
  
  const mappingList = system.Mapping;
  if (!mappingList) {
    logger.debug("No mappings found in system");
    return mappings;
  }
  
  const mappingArray = Array.isArray(mappingList) ? mappingList : [mappingList];
  logger.debug(`Found ${mappingArray.length} mapping(s)`);
  
  for (const mapping of mappingArray) {
    if (!mapping?.From || !mapping?.To) continue;
    
    const fbInstance = mapping.From;
    const toFullPath = mapping.To;
    
    // Parse "To" - format: "Device.Resource.BlockName"
    const toParts = toFullPath.split(".");
    const device = toParts[0];
    const resource = toParts[1] || "EMB_RES"; // Default resource name
    
    mappings.push({
      fbInstance,
      device,
      resource,
      target: toFullPath, // Keep full path for duplicate filtering
    });
  }
  
  logger.info(`Parsed ${mappings.length} mapping(s)`);
  return mappings;
}
