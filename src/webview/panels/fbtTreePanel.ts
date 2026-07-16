import type { WebviewLogger } from "../logging";
import { renderTreeHtml, attachTreeHandlers } from "./components/treeView";
import { renderButton } from "./components/button";
import { tr } from "../i18nService";

export type { TreeNode } from "./components/treeView";
import type { TreeNode } from "./components/treeView";

export interface FbtTreePanelController {
  openFbtTreePanel: () => void;
  closeFbtTreePanel: () => void;
  renderFbtTree: () => void;
  handleAllFbTypesLoaded: (tree: TreeNode[]) => void;
  handleAllFbTypesError: (message?: string) => void;
  getDraggedBlockType: () => string | null;
  clearDraggedBlockType: () => void;
  isFbtTreeOpen: () => boolean;
}

interface FbtTreePanelOptions {
  logger: WebviewLogger;
  onClose: () => void;
}

/**
 * Рекурсивно фильтрует дерево узлов по поисковому запросу.
 * Автоматически раскрывает папки, в которых найдены совпадения.
 */
function filterTreeNodes(
  nodes: TreeNode[], 
  query: string, 
  expandedState: Map<string, boolean>, 
  parentPath: string = ""
): TreeNode[] {
  if (!query || query.trim() === "") {
    return nodes;
  }

  const lowerQuery = query.toLowerCase();

  return nodes.reduce<TreeNode[]>((acc, node) => {
    const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
    
    const matchesName = node.name.toLowerCase().includes(lowerQuery);
    
    const filteredChildren = node.children 
      ? filterTreeNodes(node.children, query, expandedState, nodePath) 
      : [];

    if (matchesName || filteredChildren.length > 0) {
      if (node.type === "folder" && filteredChildren.length > 0) {
        expandedState.set(nodePath, true);
      }
      
      acc.push({
        ...node,
        children: filteredChildren.length > 0 ? filteredChildren : node.children,
      });
    }
    return acc;
  }, []);
}

export function createFbtTreePanelController(options: FbtTreePanelOptions): FbtTreePanelController {
  const { logger, onClose } = options;

  let draggedBlockType: string | null = null;
  let fbTypesTree: TreeNode[] | null = null;
  let fbTypesTreeLoading = false;
  let fbTypesTreeError: string | undefined;
  let fbTypesNodeExpanded: Map<string, boolean> = new Map();
  let isFbtTreeOpened = false;
  let searchQuery = "";

  function renderFbtTree(): void {
    const leftContent = document.getElementById("left-sidepanel-content");
    if (!leftContent) return;

    if (fbTypesTreeLoading) {
      leftContent.innerHTML = `<div class="fbt-loading">${tr("panel.typeLibrary.loading")}</div>`;
      return;
    }

    if (fbTypesTreeError) {
      leftContent.innerHTML = `<div class="fbt-error"><strong>${tr("common.error")}:</strong> ${fbTypesTreeError}</div>`;
      return;
    }

    if (!fbTypesTree || fbTypesTree.length === 0) {
      leftContent.innerHTML = `<div class="sidepanel-empty">${tr("panel.typeLibrary.empty")}</div>`;
      return;
    }

    const filteredTree = filterTreeNodes(fbTypesTree, searchQuery, fbTypesNodeExpanded);

    const treeOptions = { expandedState: fbTypesNodeExpanded };
    
    // HTML поля поиска
    const searchHtml = `
      <div style="padding: 10px; border-bottom: 1px solid rgba(128,128,128,0.2); margin-bottom: 10px;">
        <input 
          type="text" 
          id="block-library-search" 
          placeholder="Поиск блоков..." 
          value="${searchQuery}"
          style="width: 100%; padding: 8px 12px; border: 1px solid rgba(128,128,128,0.3); border-radius: 6px; background: rgba(255,255,255,0.05); color: inherit; font-size: 13px; outline: none; box-sizing: border-box;"
        />
      </div>
    `;

    let html = searchHtml + renderTreeHtml(filteredTree, treeOptions);

    html += `<div class="fbt-tree-footer">
      ${renderButton({ id: "closeFbtTreeBtn", label: tr("common.close"), style: "secondary", fullWidth: true, extraCss: "font-size:12px; padding:8px 10px;" })}
    </div>`;

    leftContent.innerHTML = html;

    // Обработчик живого поиска с сохранением фокуса
    const searchInput = leftContent.querySelector("#block-library-search") as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = (e.target as HTMLInputElement).value;
        renderFbtTree();
        
        // Возвращаем фокус и курсор в конец строки
        const input = leftContent.querySelector("#block-library-search") as HTMLInputElement;
        if (input) {
          input.focus();
          input.setSelectionRange(searchQuery.length, searchQuery.length);
        }
      });
    }

    attachTreeHandlers(leftContent, {
      onToggle: (nodePath) => {
        const currentState = fbTypesNodeExpanded.get(nodePath) ?? false;
        fbTypesNodeExpanded.set(nodePath, !currentState);
        renderFbtTree();
      },
      onDragStart: (fbType) => {
        draggedBlockType = fbType;
        logger.debug(`Drag started: block type ${draggedBlockType}`);
      },
      onDragEnd: () => {
        draggedBlockType = null;
      },
    });

    const closeBtn = leftContent.querySelector("#closeFbtTreeBtn") as HTMLButtonElement | null;
    if (closeBtn) {
      closeBtn.addEventListener("click", closeFbtTreePanel);
    }
  }

  function openFbtTreePanel(): void {
    isFbtTreeOpened = true;
    fbTypesTreeLoading = true;
    fbTypesTreeError = undefined;
    fbTypesNodeExpanded.clear();
    searchQuery = "";

    renderFbtTree();
  }

  function closeFbtTreePanel(): void {
    isFbtTreeOpened = false;
    draggedBlockType = null;
    searchQuery = "";
    onClose();
  }

  function handleAllFbTypesLoaded(tree: TreeNode[]): void {
    fbTypesTree = tree;
    fbTypesTreeLoading = false;
    fbTypesTreeError = undefined;

    if (isFbtTreeOpened) {
      renderFbtTree();
    }
  }

  function handleAllFbTypesError(message?: string): void {
    fbTypesTree = [];
    fbTypesTreeLoading = false;
    fbTypesTreeError = message || tr("fbType.loadFailed");

    if (isFbtTreeOpened) {
      renderFbtTree();
    }
  }

  return {
    openFbtTreePanel,
    closeFbtTreePanel,
    renderFbtTree,
    handleAllFbTypesLoaded,
    handleAllFbTypesError,
    getDraggedBlockType: () => draggedBlockType,
    clearDraggedBlockType: () => {
      draggedBlockType = null;
    },
    isFbtTreeOpen: () => isFbtTreeOpened,
  };
}
