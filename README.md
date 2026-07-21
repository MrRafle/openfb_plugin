# OpenFB Plugin for VS Code

OpenFB Plugin adds an interactive IEC 61499 Function Block Diagram (FBD) editor to VS Code for 4diac and ForgeLogic projects (`.sys` files). It also supports deployment to the OpenFB runtime environment.

## Features

- Opens and visualizes IEC 61499 projects from `.sys` files as interactive diagrams.
- Supports pan/zoom, selection, and block drag-and-drop.
- Creates connections between ports (event/data) with compatibility validation.
- Deletes blocks and connections (`Delete` key and context menu).
- Allows editing block parameters and OPC UA mappings (marks inputs and outputs as publishable via an OPC UA server using a ForgeLogic-compatible format).
- **Real-time Monitoring:** Connect to a running FORTE device to read port values (`Watch`), simulate events (`Trigger`), and force variable values (`Force`) directly from the VS Code interface.
- **Live Block Search:** Instantly find blocks in the library with a dedicated search bar that auto-expands matching folders.
- Saves project changes back to `.sys` with robust parsing (no more lost connections or missing ports after saving).
- Generates `.fboot` and deploys to the OpenFB runtime.
- Shows logs in both Webview and Extension Output.
- During deployment, prompts to create a `.fboot` file if it is missing.
- When generating `.fboot`, asks for confirmation before overwriting existing files.
- Automatically refreshes the `Block Library` panel:
  - after creating a new FB type.
  - after saving library path settings.
- Supports panel UI localization (`ru`/`en`) via the `openfb.uiLanguage` setting.
- After changing language in settings, button labels, tab labels, and canvas text are refreshed immediately in the open panel.
- *Note: The current version supports only one compute node in the hardware configuration.*

## Quick Start

1. Install the extension in VS Code.
2. **Creating a new project**: Press `Ctrl+Shift+P`, type `OpenFB: Create SYS project` (or `OpenFB: Создать sys проект`), and follow the prompts to generate a new `.sys` file from scratch.
3. **Opening an existing project**: In the Explorer, right-click an existing `.sys` file and select **OpenFB: Open project diagram**.

## Settings

- `openfb.fbLibraryPaths` - search paths for `.fbt` libraries.
- `openfb.host` - OpenFB runtime host.
- `openfb.port` - OpenFB runtime port.
- `openfb.deployTimeoutMs` - deployment timeout in milliseconds.
- `openfb.uiLanguage` - OpenFB panel UI language (`en` by default).

## Localization

- `package.json` localization (Explorer context menu command title and settings descriptions) is defined via `package.nls.json` and `package.nls.ru.json`.
- These strings depend on VS Code Display Language, not on `openfb.uiLanguage`.
- `openfb.uiLanguage` controls only the OpenFB webview panel language and is applied immediately after saving settings.

## Recent Changes (v0.2.0)

- **Added Real-time Monitoring:** Full integration with 4diac FORTE protocol (Watch, Trigger, Force).
- **Added Live Search:** Instant filtering in the Block Library panel with auto-expanding folders.
- **Fixed Critical Save/Parse Bugs:** Resolved issues where blocks lost their ports (turned into "ovals") after saving. Implemented fuzzy type matching for reliable model reloading.
- **Fixed START Block Handling:** The virtual START block now correctly renders in the UI, and its connections are strictly read from/written to the `<Resource>` section, ensuring 100% compatibility with 4diac IDE and preventing XML duplication.
- Updated `.fboot` generation/deployment dialogs with action confirmations.
- Improved handling of `Type Library` paths for multiple `.sys` projects.

## Requirements

- VS Code 1.85.0+

## Development Team (v0.2.0)

The current version of the plugin was significantly expanded, stabilized, and brought to production-ready state through the combined efforts of:

- **Loushkin Felix Aleksandrovich** — *Technical lead, integration & stabilization.* Implemented per-block code generation, led the mass fix of critical parsing and saving bugs, and ensured architectural integrity through code review.
- **Lombrozov Andrei Vladimirovich** — *SYS generation & monitoring.* Developed the "Create SYS from scratch" feature and implemented the real-time monitoring subsystem over the 4diac FORTE protocol (Watch, Trigger, Force).
- **Astafiev Nikolai Georgievich** — *FBOOT generation & UI.* Fixed critical bugs in `.fboot` generation, normalized canvas coordinates, and contributed to debugging key plugin components.