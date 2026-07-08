import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser'; // уже используется в проекте

export interface FBDataModel {
  name: string;
  comment: string;
  eventInputs: string[];
  eventOutputs: string[];
  inputVars: { name: string; type: string }[];
  outputVars: { name: string; type: string }[];
}

/**
 * Парсит .fbt файл (XML) и возвращает модель
 */
export function parseFbtXml(filePathOrContent: string): FBDataModel {
  let xmlContent: string;

  if (fs.existsSync(filePathOrContent)) {
    xmlContent = fs.readFileSync(filePathOrContent, 'utf-8');
  } else {
    xmlContent = filePathOrContent;
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });

  const result = parser.parse(xmlContent);
  const root = result.FBType || result.SubAppType || result;

  const fbName = root.Name || 'UnnamedFB';
  const fbComment = root.Comment || '';

  const model: FBDataModel = {
    name: fbName,
    comment: fbComment,
    eventInputs: [],
    eventOutputs: [],
    inputVars: [],
    outputVars: [],
  };

  const interfaceList = root.InterfaceList || root.SubAppInterfaceList;

  if (!interfaceList) return model;

  // Event Inputs
  if (interfaceList.EventInputs?.Event) {
    model.eventInputs = Array.isArray(interfaceList.EventInputs.Event)
      ? interfaceList.EventInputs.Event.map((e: any) => e.Name)
      : [interfaceList.EventInputs.Event.Name];
  }

  // Event Outputs
  if (interfaceList.EventOutputs?.Event) {
    model.eventOutputs = Array.isArray(interfaceList.EventOutputs.Event)
      ? interfaceList.EventOutputs.Event.map((e: any) => e.Name)
      : [interfaceList.EventOutputs.Event.Name];
  }

  // Input Variables
  if (interfaceList.InputVars?.VarDeclaration) {
    const vars = Array.isArray(interfaceList.InputVars.VarDeclaration)
      ? interfaceList.InputVars.VarDeclaration
      : [interfaceList.InputVars.VarDeclaration];
    model.inputVars = vars.map((v: any) => ({
      name: v.Name,
      type: v.Type,
    }));
  }

  // Output Variables
  if (interfaceList.OutputVars?.VarDeclaration) {
    const vars = Array.isArray(interfaceList.OutputVars.VarDeclaration)
      ? interfaceList.OutputVars.VarDeclaration
      : [interfaceList.OutputVars.VarDeclaration];
    model.outputVars = vars.map((v: any) => ({
      name: v.Name,
      type: v.Type,
    }));
  }

  return model;
}

/**
 * Генерирует Python-класс на основе модели
 */
export function generatePythonClass(model: FBDataModel): string {
  let code = `import logging\n\n`;
  code += `class ${model.name}:\n`;
  code += `    """ ${model.comment} """\n\n`;

  // __init__
  code += `    def __init__(self):\n`;
  code += `        # Input Variables\n`;
  for (const v of model.inputVars) {
    const defaultVal = v.type === "BOOL" ? "False" : v.type === "STRING" ? "''" : "0";
    code += `        self.${v.name} = ${defaultVal}  # Type: ${v.type}\n`;
  }

  code += `\n        # Output Variables\n`;
  for (const v of model.outputVars) {
    const defaultVal = v.type === "BOOL" ? "False" : "0";
    code += `        self.${v.name} = ${defaultVal}  # Type: ${v.type}\n`;
  }

  code += `\n    def __del__(self):\n`;
  code += `        # TODO Insert your code here\n`;
  code += `        pass\n`;

  // Service methods for events
  for (const event of model.eventInputs) {
    code += `\n    def service_${event}(self):\n`;
    code += `        """ Event Handler for ${event} """\n`;
    code += `        logging.info("Execution logic for ${event} triggered")\n`;
    code += `        # Implement internal algorithms here\n`;
  }

  // schedule method
  code += `\n    def schedule(self, IN_EVENT_NAME, EVNT_CNTR`;
  for (const v of model.inputVars) {
    code += `, ${v.name}`;
  }
  code += `):\n`;

  for (const v of model.inputVars) {
    code += `        self.${v.name} = ${v.name}\n`;
  }
  code += `\n`;

  for (const event of model.eventInputs) {
    code += `        if IN_EVENT_NAME == "${event}":\n`;
    code += `            self.service_${event}()\n`;
    code += `            return `;
    
    for (const ev of model.eventInputs) {
      code += ev === event ? `EVNT_CNTR, ` : `None, `;
    }
    for (const v of model.outputVars) {
      code += `self.${v.name}, `;
    }
    code = code.replace(/,\s*$/, "") + "\n";
  }

  return code;
}

/**
 * Основная функция: конвертирует .fbt в .py
 */
export function convertFbtToPython(fbtPath: string, outputDir?: string): string {
  const model = parseFbtXml(fbtPath);
  const pythonCode = generatePythonClass(model);

  const fbtName = path.basename(fbtPath, '.fbt');
  const outputPath = outputDir 
    ? path.join(outputDir, `${fbtName}.py`)
    : path.join(path.dirname(fbtPath), `${fbtName}.py`);

  fs.writeFileSync(outputPath, pythonCode, 'utf-8');
  console.log(`Generated ${outputPath}`);

  return outputPath;
}

// Для использования как standalone (если нужно)
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: ts-node fbtToPython.ts <fbt-file> [output-dir]");
    process.exit(1);
  }
  convertFbtToPython(args[0], args[1]);
}