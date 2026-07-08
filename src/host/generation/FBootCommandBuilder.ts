import { SysResource } from "../../shared/models/sysModel";
import { QualifiedParam } from "./NetworkTraverser";
import { escapeXml } from "../../shared/utils/xmlEscape";

/**
 * Builds FBOOT command strings (CREATE, WRITE, START) with proper XML escaping.
 */
export class FBootCommandBuilder {
  /**
   * Builds CREATE command for resource.
   */
  buildCreateResourceCmd(resource: SysResource, id: number): string {
    const escapedType = escapeXml(resource.type);
    return `;<Request ID="${id}" Action="CREATE"><FB Name="${resource.name}" Type="${escapedType}" /></Request>`;
  }

private normalizeLiteral(value: string): string {
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1);
  }

  return value.replace(/^(string#)'(.*)'$/i, "$1$2");
}
  /**
   * Builds CREATE command for FB with optional OpcMapping content.
   */
  buildCreateFBCmd(
    qualifiedName: string,
    typeLong: string,
    id: number,
    resourceName: string,
    params?: QualifiedParam[],
  ): string {
    const escapedType = escapeXml(typeLong);
    const fbContent = this.buildOpcMappingXml(params);

    const fbTag = fbContent
      ? `<FB Name="${qualifiedName}" Type="${escapedType}">${fbContent}</FB>`
      : `<FB Name="${qualifiedName}" Type="${escapedType}"></FB>`;

    return `${resourceName};<Request ID="${id}" Action="CREATE">${fbTag}</Request>`;
  }

  /**
   * Builds WRITE command for parameter with literal value.
   */
  buildWriteParameterCmd(
    qualifiedName: string,
    paramName: string,
    value: string,
    id: number,
    resourceName: string,
  ): string {
    const escapedValue = escapeXml(this.normalizeLiteral(value));
    const destination = `${qualifiedName}.${paramName}`;
    return `${resourceName};<Request ID="${id}" Action="WRITE"><Connection Source="${escapedValue}" Destination="${destination}" /></Request>`;
  }

  /**
   * Builds WRITE command with literal value to arbitrary destination.
   */
  buildWriteLiteralCmd(
    value: string,
    destination: string,
    id: number,
    resourceName: string,
  ): string {
    const escapedValue = escapeXml(this.normalizeLiteral(value));
    return `${resourceName};<Request ID="${id}" Action="WRITE"><Connection Source="${escapedValue}" Destination="${destination}" /></Request>`;
  }

  /**
   * Builds CREATE command for connection.
   */
  buildCreateConnectionCmd(
    source: string,
    destination: string,
    id: number,
    resourceName: string,
  ): string {
    return `${resourceName};<Request ID="${id}" Action="CREATE"><Connection Source="${source}" Destination="${destination}" /></Request>`;
  }

  /**
   * Builds START command.
   */
  buildStartCmd(id: number, resourceName: string): string {
    return `${resourceName};<Request ID="${id}" Action="START"/>`;
  }

  /**
   * Builds OpcMapping XML content for FB if any parameters have OpcMapping attribute.
   */
  private buildOpcMappingXml(params?: QualifiedParam[]): string {
    if (!params) return "";

    const opcMappingParams = params.filter((p) =>
      p.attributes?.some((attr) => attr.name === "OpcMapping" && attr.value === "true"),
    );

    if (opcMappingParams.length === 0) return "";

    const varElements = opcMappingParams
      .map((p) => {
        const escapedName = escapeXml(p.name);
        const attrs = [`Name="${escapedName}"`];
        if (p.direction) {
          attrs.push(`Direction="${escapeXml(p.direction.toUpperCase())}"`);
        }
        if (p.type) {
          attrs.push(`Type="${escapeXml(p.type)}"`);
        }
        return `<Var ${attrs.join(" ")}/>`;
      })
      .join("");

    return `<OpcMapping>${varElements}</OpcMapping>`;
  }
}
