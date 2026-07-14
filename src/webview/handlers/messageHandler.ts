import { FBTypeModel } from "../../shared/models/fbtModel";
import type { SysModel } from "../../shared/models/sysModel";
import { COLORS } from "../../shared/colorScheme";
import { PluginSettings, clonePluginSettings, applyLockedPath } from "../../shared/pluginSettings";
import type { EditorState } from "../editorState";
import type { TreeNode } from "../panels/leftPanel";
import type { WebviewLogger } from "../logging";
import { tr, setLanguage } from "../i18nService";
import { resolveLanguage } from "../../shared/i18n";
import type { MonitoringSnapshot } from "../../shared/models/monitoringModel";

export interface ExtensionMessage {
  type: string;
  payload?: SysModel
  | PluginSettings
  | { settings?: PluginSettings; lockedPath?: string }
  | { success?: boolean; filePath?: string; error?: string }
  | MonitoringSnapshot
  | string;
  fbTypes?: [string, FBTypeModel][];
  fbTypesTree?: TreeNode[];
}

interface LeftPanelDeps {
  handleAllFbTypesLoaded: (tree: TreeNode[]) => void;
  handleAllFbTypesError: (message?: string) => void;
  isPaletteOpen: () => boolean;
}

interface MessageHandlerDeps {
  logger: WebviewLogger;
  state: EditorState;
  leftPanel: LeftPanelDeps;
  requestAllFbTypes: () => boolean;
  centerDiagramInCanvas: () => void;
  updateSidepanel: () => void;
  updateSettingsModal: () => void;
  closeSettingsModal: () => void;
  getSettingsDraft: () => PluginSettings;
  setSettingsDraft: (next: PluginSettings) => void;
  setLockedFbPath: (pathValue?: string) => void;
  getIsSettingsLoading: () => boolean;
  setIsSettingsLoading: (next: boolean) => void;
  getIsSettingsSaving: () => boolean;
  setIsSettingsSaving: (next: boolean) => void;
  setSettingsLoadError: (message?: string) => void;
  setSettingsDirty: (dirty: boolean) => void;
  updateSettingsDirtyState: (dirty: boolean) => void;
  setSettingsStatus: (text: string, color: string) => void;
  handleCreateFbTypeResult: (payload?: { success?: boolean; filePath?: string; error?: string }) => void;
  refreshStaticLabels: () => void;
}

function handleSettingsLoaded(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  if (!event.data.payload) {
    return;
  }

  const payload = event.data.payload as { settings?: PluginSettings; lockedPath?: string } | PluginSettings;
  const loadedSettings = "settings" in payload ? (payload.settings as PluginSettings) : (payload as PluginSettings);
  const lockedPath = "settings" in payload ? payload.lockedPath : undefined;
  const nextSettings = applyLockedPath(clonePluginSettings(loadedSettings), lockedPath);
  setLanguage(resolveLanguage(nextSettings.uiLanguage));
  deps.refreshStaticLabels();
  deps.setSettingsDraft(nextSettings);
  deps.setLockedFbPath(lockedPath);
  deps.setIsSettingsLoading(false);
  deps.setIsSettingsSaving(false);
  deps.setSettingsLoadError(undefined);
  deps.setSettingsDirty(false);
  deps.setSettingsStatus(tr("settings.saved"), COLORS.SUCCESS_TEXT);

  deps.updateSettingsModal();
}

function handleSettingsPathPicked(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  const selectedPath = typeof event.data.payload === "string" ? event.data.payload.trim() : "";
  if (!selectedPath) {
    return;
  }

  const settingsDraft = deps.getSettingsDraft();
  if (settingsDraft.fbPaths.includes(selectedPath)) {
    deps.setSettingsStatus(tr("settings.pathAlreadyAdded"), COLORS.WARNING_TEXT);
    deps.updateSettingsModal();
    return;
  }

  const nextDraft = clonePluginSettings(settingsDraft);
  nextDraft.fbPaths.push(selectedPath);
  deps.setSettingsDraft(nextDraft);
  deps.updateSettingsDirtyState(true);

  deps.updateSettingsModal();
}

function handleSettingsSaved(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  if (event.data.payload) {
    const payload = event.data.payload as { settings?: PluginSettings; lockedPath?: string } | PluginSettings;
    const savedSettings = "settings" in payload ? (payload.settings as PluginSettings) : (payload as PluginSettings);
    const lockedPath = "settings" in payload ? payload.lockedPath : undefined;
    const nextSettings = applyLockedPath(clonePluginSettings(savedSettings), lockedPath);
    setLanguage(resolveLanguage(nextSettings.uiLanguage));
    deps.refreshStaticLabels();
    deps.setSettingsDraft(nextSettings);
    deps.setLockedFbPath(lockedPath);
  }

  deps.setIsSettingsSaving(false);
  deps.setSettingsDirty(false);
  deps.setSettingsStatus(tr("settings.saved"), COLORS.SUCCESS_TEXT);

  deps.updateSettingsModal();
  deps.closeSettingsModal();

  if (deps.leftPanel.isPaletteOpen()) {
    const requested = deps.requestAllFbTypes();
    if (!requested) {
      deps.leftPanel.handleAllFbTypesError(tr("settings.hostApiUnavailable"));
    }
  }
}

function handleSettingsError(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  const message = typeof event.data.payload === "string" ? event.data.payload : tr("settings.loadError");

  if (deps.getIsSettingsLoading()) {
    deps.setSettingsLoadError(message);
    deps.setIsSettingsLoading(false);
  }

  if (deps.getIsSettingsSaving()) {
    deps.setIsSettingsSaving(false);
    deps.setSettingsStatus(message, COLORS.ERROR_TEXT);
  }

  deps.updateSettingsModal();
}

function handleLoadDiagram(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  deps.logger.debug("Processing load-diagram message");
  const fbTypes = new Map<string, FBTypeModel>(event.data.fbTypes || []);
  deps.logger.info("FB Types count", fbTypes.size);

  if (!event.data.payload) {
    deps.logger.error("No payload in load-diagram message");
    return;
  }

  const diagram = event.data.payload as SysModel;
  deps.logger.debug("Diagram blocks", diagram.subAppNetwork?.blocks);
  deps.logger.info(
    "Diagram connections count",
    diagram.subAppNetwork?.connections?.length || 0
  );
  if (diagram.subAppNetwork?.connections && diagram.subAppNetwork.connections.length > 0) {
    deps.logger.debug("Diagram connections", diagram.subAppNetwork.connections);
  }

  for (const block of diagram.subAppNetwork.blocks) {
    deps.logger.debug(`Block: ${block.id} (type=${block.typeShort}) at (${block.x}, ${block.y})`);
  }

  deps.state.loadFromDiagram(diagram, fbTypes);
  deps.centerDiagramInCanvas();
  deps.logger.debug("Loaded nodes", deps.state.nodes.length);
  deps.logger.debug("State nodes data", deps.state.nodes);
  deps.logger.debug("Loaded connections", deps.state.connections.length);

  deps.logger.debug("Diagram loaded, render triggered via subscription");
}

function handleAllFbTypesLoaded(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  deps.leftPanel.handleAllFbTypesLoaded(event.data.fbTypesTree || []);

  // Merge all FB type models into editor state so addNode() works for any type
  if (event.data.fbTypes && event.data.fbTypes.length > 0) {
    const currentTypes = deps.state.fbTypes ?? new Map<string, FBTypeModel>();
    const merged = new Map(currentTypes);
    for (const [name, model] of event.data.fbTypes) {
      merged.set(name, model);
    }
    deps.state.dispatch({ type: "SET_GRAPH_DATA",
      model: deps.state.model!,
      fbTypes: merged,
      nodes: deps.state.nodes,
      connections: deps.state.connections,
    });
    deps.logger.info(`Merged ${event.data.fbTypes.length} FB type models into state (total: ${merged.size})`);
  }
}

function handleAllFbTypesError(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  deps.leftPanel.handleAllFbTypesError(
    typeof event.data.payload === "string" ? event.data.payload : undefined
  );
}

function handleSaveSysResult(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  const result = event.data.payload as { success?: boolean; filePath?: string; error?: string } | undefined;
  if (result?.success) {
    deps.logger.info("File saved successfully:", result.filePath);
    if (result.filePath) {
      (window as Window & { __openfbTargetPath?: string }).__openfbTargetPath = result.filePath;
    }
    deps.state.dispatch({ type: "RESET_DIRTY" });
  } else {
    const error = result?.error || tr("saveSys.unknownError");
    deps.logger.error("Save failed:", error);
  }
}

function handleCreateFbTypeResult(event: MessageEvent<ExtensionMessage>, deps: MessageHandlerDeps): void {
  const payload = event.data.payload as { success?: boolean; filePath?: string; error?: string } | undefined;
  deps.handleCreateFbTypeResult(payload);

  if (payload?.success && deps.leftPanel.isPaletteOpen()) {
    const requested = deps.requestAllFbTypes();
    if (!requested) {
      deps.leftPanel.handleAllFbTypesError(tr("settings.hostApiUnavailable"));
    }
  }
}

export function createMessageHandler(deps: MessageHandlerDeps) {
  return (event: MessageEvent<ExtensionMessage>) => {
    deps.logger.debug("=== MESSAGE RECEIVED ===");
    deps.logger.debug("event.data type", typeof event.data);
    deps.logger.debug("event.data keys", Object.keys(event.data || {}));
    deps.logger.debug("event.data", event.data);

    switch (event.data?.type) {
      case "settings:loaded":
        handleSettingsLoaded(event, deps);
        return;
      case "settings:path-picked":
        handleSettingsPathPicked(event, deps);
        return;
      case "settings:saved":
        handleSettingsSaved(event, deps);
        return;
      case "settings:error":
        handleSettingsError(event, deps);
        return;
      case "load-diagram":
        handleLoadDiagram(event, deps);
        return;
      case "all-fb-types-loaded":
        handleAllFbTypesLoaded(event, deps);
        return;
      case "all-fb-types-error":
        handleAllFbTypesError(event, deps);
        return;
      case "save-sys-result":
        handleSaveSysResult(event, deps);
        return;
      case "create-fb-type-result":
        handleCreateFbTypeResult(event, deps);
        return;
      case "monitoring:values": {
        const payload = event.data.payload as MonitoringSnapshot | undefined;
        const values = payload?.values || [];

        for (const value of values) {
          const node = deps.state.nodes.find((n) =>
            value.fb.endsWith(`.${n.id}`) || value.fb === n.id,
          );
          const port = node?.ports.find((p) => p.name === value.port);

          if (port) {
            port.monitoringValue = value.value;
            port.monitoringForced = value.forced;
            port.monitoringActive = true;
          }
        }

        deps.state.requestRender();
        deps.updateSidepanel();
        return;
      }
      default:
        deps.logger.debug("Message type not recognized", event.data?.type);
        return;
    }
  };
}
