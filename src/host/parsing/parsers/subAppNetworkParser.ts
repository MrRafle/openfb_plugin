import { readAndParseXml } from "../xmlParserFactory";
import { SysSubAppNetwork, SysBlock, SysSubApp, SubAppInterfaceParam } from "../../../shared/models/sysModel";
import { parseFBBlock } from "./fbBlockParser";
import { parseConnections } from "./connectionsParser";
import { parseParameters } from "./parameterParser";
import { resolveTypeFilePath } from "../fileSearch";
import { asArray } from "../../../shared/utils/arrayUtils";
import { stripNamespacePrefix } from "../../../shared/utils/iecTypeUtils";

function resolveSubAppTypePath(
  typeShort: string,
  sysDir: string,
  searchPaths: string[],
): string | undefined {
  return resolveTypeFilePath(typeShort, "sub", [sysDir, ...searchPaths]);
}

function parseSubAppInterfaceList(node: any): SubAppInterfaceParam[] | undefined {
  if (!node) return undefined;

  const parameters: SubAppInterfaceParam[] = [];

  const addParams = (listNode: any, key: string, kind: "event" | "data", direction: "input" | "output") => {
    if (!listNode?.[key]) return;
    const arr = asArray(listNode[key]);
    for (const item of arr) {
      if (!item?.Name) continue;
      parameters.push({
        name: item.Name,
        kind,
        direction,
      });
    }
  };

  addParams(node.SubAppEventInputs, "SubAppEvent", "event", "input");
  addParams(node.SubAppEventOutputs, "SubAppEvent", "event", "output");
  addParams(node.InputVars, "VarDeclaration", "data", "input");
  addParams(node.OutputVars, "VarDeclaration", "data", "output");

  return parameters.length > 0 ? parameters : undefined;
}

function loadSubAppDefinitionFromFile(
  filePath: string,
  logger: any,
): { network?: any; subAppInterfaceParams?: SubAppInterfaceParam[] } | undefined {
  try {
    const doc = readAndParseXml(filePath);
    const subAppType = doc?.SubAppType;
    return {
      network: subAppType?.SubAppNetwork,
      subAppInterfaceParams: parseSubAppInterfaceList(subAppType?.SubAppInterfaceList),
    };
  } catch (err) {
    logger.warn(`Failed to parse SubApp file ${filePath}`, err);
    return undefined;
  }
}

function parseSubAppElement(
  subApp: any,
  sysDir: string,
  searchPaths: string[],
  logger: any,
): SysSubApp {
  const typeLong = subApp.Type || "";
  const typeShort = stripNamespacePrefix(typeLong);

  const parameters = parseParameters(subApp.Name, subApp);

  let subAppNetwork: SysSubAppNetwork = { blocks: [] };
  let subAppInterfaceParams: SubAppInterfaceParam[] | undefined;
  if (typeShort) {
    const subPath = resolveSubAppTypePath(typeShort, sysDir, searchPaths);
    if (subPath) {
      logger.debug(`Resolved SubApp type ${typeShort} at ${subPath}`);
      const def = loadSubAppDefinitionFromFile(subPath, logger);
      if (def?.network) {
        subAppNetwork = parseSubAppNetworkFromNode(def.network, sysDir, searchPaths, logger);
      }
      subAppInterfaceParams = def?.subAppInterfaceParams;
    } else {
      logger.debug(`No .sub file found for SubApp type ${typeShort}`);
    }
  }

  return {
    id: subApp.Name,
    typeShort,
    typeLong,
    x: Number(subApp.x ?? 0),
    y: Number(subApp.y ?? 0),
    parameters: parameters.length > 0 ? parameters : undefined,
    subAppNetwork,
    subAppInterfaceParams,
  };
}

function parseSubAppNetworkFromNode(
  network: any,
  sysDir: string,
  searchPaths: string[],
  logger: any,
): SysSubAppNetwork {
  const blocks: SysBlock[] = [];
  const subApps: SysSubApp[] = [];

  if (network?.FB) {
    const fbArray = asArray(network.FB);
    for (const fb of fbArray) {
      if (!fb || !fb.Name) continue;
      const block = parseFBBlock(fb, fb.Name, sysDir, searchPaths, logger);
      blocks.push(block);
    }
  }

  if (network?.SubApp) {
    const subAppArray = asArray(network.SubApp);
    for (const subApp of subAppArray) {
      if (!subApp || !subApp.Name) continue;
      const subAppNode = parseSubAppElement(subApp, sysDir, searchPaths, logger);
      subApps.push(subAppNode);
    }
  }

  logger.debug(`Found ${blocks.length} FB elements`);
  logger.debug(`Found ${subApps.length} SubApp elements`);

  const connections = parseConnections(network, logger, true);

  return {
    blocks,
    subApps: subApps.length > 0 ? subApps : undefined,
    connections: connections.length > 0 ? connections : undefined,
  };
}

export function parseSubAppNetwork(
  app: any,
  sysDir: string,
  searchPaths: string[],
  logger: any,
): SysSubAppNetwork {
  const network = app.SubAppNetwork || app;
  const result = parseSubAppNetworkFromNode(network, sysDir, searchPaths, logger);
  logger.info(
    `Parsed ${result.blocks.length} blocks, ${result.subApps?.length || 0} subApps, and ${result.connections?.length || 0} connections`
  );
  return result;
}
