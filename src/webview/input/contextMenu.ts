/**
 * Simple context menu component for the diagram canvas.
 * Creates a floating DOM element with a single "Delete" action.
 */

import { tr } from "../i18nService";

let activeMenu: HTMLDivElement | null = null;

/**
 * Show a context menu with a single "Удалить" item at the given screen position.
 */
export function showContextMenu(
  clientX: number,
  clientY: number,
  onDelete: () => void,
  onGeneratePython?: () => void
): void {
  hideContextMenu();

  const menu = document.createElement("div");
  menu.style.cssText = `
    position: fixed;
    left: ${clientX}px;
    top: ${clientY}px;
    background: var(--vscode-menu-background, #252526);
    color: var(--vscode-menu-foreground, #cccccc);
    border: 1px solid var(--vscode-menu-border, #454545);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 120px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    z-index: 10000;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: 13px;
  `;

  const item = document.createElement("div");
  item.textContent = tr("common.delete");
  item.style.cssText = `
    padding: 6px 24px;
    cursor: pointer;
    white-space: nowrap;
  `;
  item.addEventListener("mouseenter", () => {
    item.style.background =
      "var(--vscode-menu-selectionBackground, #094771)";
    item.style.color =
      "var(--vscode-menu-selectionForeground, #ffffff)";
  });
  item.addEventListener("mouseleave", () => {
    item.style.background = "transparent";
    item.style.color = "var(--vscode-menu-foreground, #cccccc)";
  });
  item.addEventListener("click", () => {
    onDelete();
    hideContextMenu();
  });


  // Generate Python Code
  if (onGeneratePython) {
    const separator = document.createElement("div");
    separator.style.cssText = "height: 1px; background: #454545; margin: 4px 8px;";
    menu.appendChild(separator);

    const pyItem = document.createElement("div");
    pyItem.textContent = "Generate Python Code";
    pyItem.style.cssText = `
      padding: 6px 24px;
      cursor: pointer;
      white-space: nowrap;
    `;
    pyItem.addEventListener("mouseenter", () => {
      pyItem.style.background = "var(--vscode-menu-selectionBackground, #094771)";
      pyItem.style.color = "var(--vscode-menu-selectionForeground, #ffffff)";
    });
    pyItem.addEventListener("mouseleave", () => {
      pyItem.style.background = "transparent";
      pyItem.style.color = "var(--vscode-menu-foreground, #cccccc)";
    });
    pyItem.addEventListener("click", () => {
      onGeneratePython();
      hideContextMenu();
    });

    menu.appendChild(pyItem);
  }

  menu.appendChild(item);
  document.body.appendChild(menu);
  activeMenu = menu;
}

/**
 * Hide the custom context menu if visible.
 */
export function hideContextMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

/**
 * Returns the active menu element (for click-outside detection).
 */
export function getActiveMenu(): HTMLDivElement | null {
  return activeMenu;
}
