export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonPathSegment = string | number;
export type JsonPath = JsonPathSegment[];

export type JsonStructureEntry = {
  path: string;
  depth: number;
  label: string;
  kind: "object" | "array" | "string" | "number" | "boolean" | "null";
};

export type JsonWorkspaceChange = {
  text: string;
  valid: boolean;
};

export type JsonWorkspace = {
  getText: () => string;
  setText: (text: string, emitChange?: boolean) => void;
  setTreeVisible: (visible: boolean) => void;
  focus: () => void;
  onChange: (listener: (change: JsonWorkspaceChange) => void) => () => void;
  isValid: () => boolean;
  getErrorMessage: () => string | null;
  pretty: () => boolean;
  minify: () => boolean;
  getStructureEntries: () => JsonStructureEntry[];
  focusPath: (path: string) => void;
};

export type CreateJsonWorkspaceOptions = {
  textAreaEl: HTMLTextAreaElement;
  treeEl: HTMLElement;
  statusEl: HTMLElement;
  prettyBtn: HTMLButtonElement;
  minifyBtn: HTMLButtonElement;
  maxBytes?: number;
  maxNodes?: number;
  treeVisible?: boolean;
  onInform?: (message: string, kind: "info" | "warning" | "error") => void;
};

type JsonKind = JsonStructureEntry["kind"];

type ParseErrorInfo = {
  message: string;
  position: number;
  line: number;
  column: number;
};

const DEFAULT_MAX_BYTES = 500_000;
const DEFAULT_MAX_NODES = 10_000;
const ROOT_PATH = "$";

function isObjectValue(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getJsonKind(value: JsonValue): JsonKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}

function countJsonNodes(value: JsonValue): number {
  let count = 0;
  const stack: JsonValue[] = [value];
  while (stack.length > 0) {
    const current = stack.pop() as JsonValue;
    count += 1;
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        stack.push(current[i]);
      }
      continue;
    }
    if (isObjectValue(current)) {
      const keys = Object.keys(current);
      for (let i = keys.length - 1; i >= 0; i -= 1) {
        stack.push(current[keys[i]]);
      }
    }
  }
  return count;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function indexToLineColumn(text: string, index: number): { line: number; column: number } {
  const maxIndex = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < maxIndex; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      column = 1;
      continue;
    }
    column += 1;
  }
  return { line, column };
}

function parseErrorInfo(text: string, error: unknown): ParseErrorInfo {
  const message = error instanceof Error ? error.message : String(error);
  const match = /position\s+(\d+)/i.exec(message);
  const position = match ? Number(match[1]) : 0;
  const { line, column } = indexToLineColumn(text, Number.isFinite(position) ? position : 0);
  return { message, position, line, column };
}

function pathToText(path: JsonPath): string {
  if (path.length === 0) return ROOT_PATH;
  let out = ROOT_PATH;
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
      continue;
    }
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
      out += `.${segment}`;
      continue;
    }
    out += `[${JSON.stringify(segment)}]`;
  }
  return out;
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getValueAtPath(root: JsonValue, path: JsonPath): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of path) {
    if (current === undefined) return undefined;
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (!isObjectValue(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function getParentAtPath(
  root: JsonValue,
  path: JsonPath,
): { parent: JsonValue[] | { [key: string]: JsonValue }; key: JsonPathSegment } | null {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parentValue = getValueAtPath(root, parentPath);
  if (parentValue !== undefined && Array.isArray(parentValue)) return { parent: parentValue, key };
  if (parentValue !== undefined && isObjectValue(parentValue)) return { parent: parentValue, key };
  return null;
}

function findPathRow(treeEl: HTMLElement, path: string): HTMLElement | null {
  const rows = treeEl.querySelectorAll<HTMLElement>("[data-json-path]");
  for (const row of rows) {
    if ((row.dataset.jsonPath ?? "") === path) return row;
  }
  return null;
}

export function createJsonWorkspace(options: CreateJsonWorkspaceOptions): JsonWorkspace {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const textAreaEl = options.textAreaEl;
  const treeEl = options.treeEl;
  const statusEl = options.statusEl;
  const prettyBtn = options.prettyBtn;
  const minifyBtn = options.minifyBtn;
  const listeners = new Set<(change: JsonWorkspaceChange) => void>();

  let text = "";
  let parsedValue: JsonValue = {};
  let parseError: ParseErrorInfo | null = null;
  let treeReadOnly = false;
  let nodeCount = 1;
  let byteCount = 0;
  let structureEntries: JsonStructureEntry[] = [];
  let selectedPath = ROOT_PATH;
  const expandedPaths = new Set<string>([ROOT_PATH]);
  let treeVisible = options.treeVisible ?? true;
  let isApplyingText = false;
  let textInputTimer: number | null = null;

  const inform = (message: string, kind: "info" | "warning" | "error") => {
    if (!options.onInform) return;
    options.onInform(message, kind);
  };

  const notify = () => {
    const payload: JsonWorkspaceChange = {
      text,
      valid: parseError === null,
    };
    for (const listener of listeners) listener(payload);
  };

  const updateStatus = () => {
    if (parseError) {
      statusEl.dataset.state = "invalid";
      statusEl.textContent = `JSON inválido · L${parseError.line}:C${parseError.column}`;
      return;
    }
    if (treeReadOnly) {
      statusEl.dataset.state = "readonly";
      statusEl.textContent = `JSON válido · árbol solo lectura (${formatBytes(byteCount)}, ${nodeCount.toLocaleString()} nodos)`;
      return;
    }
    statusEl.dataset.state = "valid";
    statusEl.textContent = `JSON válido · ${nodeCount.toLocaleString()} nodos · ${formatBytes(byteCount)}`;
  };

  const updateButtons = () => {
    const disable = parseError !== null;
    prettyBtn.disabled = disable;
    minifyBtn.disabled = disable;
  };

  const applyMutation = (mutate: (draft: JsonValue) => boolean): boolean => {
    if (parseError) return false;
    const draft = cloneJsonValue(parsedValue);
    const changed = mutate(draft);
    if (!changed) return false;
    const nextText = JSON.stringify(draft, null, 2);
    setText(nextText, true);
    return true;
  };

  const renameKey = (parentPath: JsonPath, oldKey: string, nextKeyRaw: string): boolean => {
    const nextKey = nextKeyRaw.trim();
    if (!nextKey) {
      inform("La clave no puede estar vacía.", "warning");
      return false;
    }
    return applyMutation((draft) => {
      const parentValue = getValueAtPath(draft, parentPath);
      if (parentValue === undefined || !isObjectValue(parentValue)) return false;
      if (!Object.prototype.hasOwnProperty.call(parentValue, oldKey)) return false;
      if (oldKey === nextKey) return false;
      if (Object.prototype.hasOwnProperty.call(parentValue, nextKey)) {
        inform(`La clave "${nextKey}" ya existe.`, "warning");
        return false;
      }
      const entries = Object.entries(parentValue) as Array<[string, JsonValue]>;
      const nextEntries: Array<[string, JsonValue]> = entries.map(([entryKey, entryValue]) =>
        entryKey === oldKey ? [nextKey, entryValue] : [entryKey, entryValue],
      );
      for (const objectKey of Object.keys(parentValue)) delete parentValue[objectKey];
      for (const [entryKey, entryValue] of nextEntries) parentValue[entryKey] = entryValue;
      return true;
    });
  };

  const removePath = (path: JsonPath): boolean =>
    applyMutation((draft) => {
      const parentInfo = getParentAtPath(draft, path);
      if (!parentInfo) return false;
      const { parent, key } = parentInfo;
      if (Array.isArray(parent)) {
        if (typeof key !== "number") return false;
        if (key < 0 || key >= parent.length) return false;
        parent.splice(key, 1);
        return true;
      }
      if (typeof key !== "string") return false;
      if (!Object.prototype.hasOwnProperty.call(parent, key)) return false;
      delete parent[key];
      return true;
    });

  const setPathValue = (path: JsonPath, value: JsonValue): boolean => {
    if (path.length === 0) {
      const nextText = JSON.stringify(cloneJsonValue(value), null, 2);
      if (nextText === text) return false;
      setText(nextText, true);
      return true;
    }
    return applyMutation((draft) => {
      const parentInfo = getParentAtPath(draft, path);
      if (!parentInfo) return false;
      const { parent, key } = parentInfo;
      if (Array.isArray(parent)) {
        if (typeof key !== "number") return false;
        parent[key] = value;
        return true;
      }
      if (typeof key !== "string") return false;
      parent[key] = value;
      return true;
    });
  };

  const addChild = (path: JsonPath): boolean =>
    applyMutation((draft) => {
      const target = getValueAtPath(draft, path);
      if (Array.isArray(target)) {
        target.push(null);
        return true;
      }
      if (target === undefined || !isObjectValue(target)) return false;
      let nextIndex = 1;
      let key = `key${nextIndex}`;
      while (Object.prototype.hasOwnProperty.call(target, key)) {
        nextIndex += 1;
        key = `key${nextIndex}`;
      }
      target[key] = null;
      return true;
    });

  const moveArrayItem = (parentPath: JsonPath, index: number, delta: number): boolean =>
    applyMutation((draft) => {
      const target = getValueAtPath(draft, parentPath);
      if (!Array.isArray(target)) return false;
      const nextIndex = index + delta;
      if (index < 0 || index >= target.length) return false;
      if (nextIndex < 0 || nextIndex >= target.length) return false;
      const item = target[index];
      target.splice(index, 1);
      target.splice(nextIndex, 0, item);
      return true;
    });

  const buildPrimitiveEditor = (
    value: JsonValue,
    path: JsonPath,
    editable: boolean,
    rowMain: HTMLElement,
  ) => {
    const kind = getJsonKind(value);

    const typeSelect = document.createElement("select");
    typeSelect.className = "json-type-select";
    typeSelect.disabled = !editable;
    for (const optionKind of ["string", "number", "boolean", "null", "object", "array"] as const) {
      const option = document.createElement("option");
      option.value = optionKind;
      option.textContent = optionKind;
      option.selected = optionKind === kind;
      typeSelect.append(option);
    }

    typeSelect.addEventListener("change", () => {
      const targetType = typeSelect.value as "string" | "number" | "boolean" | "null" | "object" | "array";
      if (targetType === "string") {
        setPathValue(path, "");
        return;
      }
      if (targetType === "number") {
        setPathValue(path, 0);
        return;
      }
      if (targetType === "boolean") {
        setPathValue(path, false);
        return;
      }
      if (targetType === "null") {
        setPathValue(path, null);
        return;
      }
      if (targetType === "object") {
        setPathValue(path, {});
        return;
      }
      setPathValue(path, []);
    });

    rowMain.append(typeSelect);

    if (kind === "boolean") {
      const boolSelect = document.createElement("select");
      boolSelect.className = "json-bool-select";
      boolSelect.disabled = !editable;
      for (const optionValue of [true, false]) {
        const option = document.createElement("option");
        option.value = optionValue ? "true" : "false";
        option.textContent = optionValue ? "true" : "false";
        option.selected = typeof value === "boolean" && value === optionValue;
        boolSelect.append(option);
      }
      boolSelect.addEventListener("change", () => {
        setPathValue(path, boolSelect.value === "true");
      });
      rowMain.append(boolSelect);
      return;
    }

    if (kind === "null") {
      const nullLabel = document.createElement("span");
      nullLabel.className = "json-label";
      nullLabel.textContent = "null";
      rowMain.append(nullLabel);
      return;
    }

    const input = document.createElement("input");
    input.className = "json-value-input";
    input.type = "text";
    input.disabled = !editable;
    if (kind === "string" && typeof value === "string") {
      input.value = value;
    } else if (kind === "number" && typeof value === "number") {
      input.value = String(value);
    } else {
      input.value = "";
    }
    input.spellcheck = false;

    const commitInput = () => {
      if (kind === "string") {
        setPathValue(path, input.value);
        return;
      }
      if (kind === "number") {
        const nextNumber = Number(input.value.trim());
        if (!Number.isFinite(nextNumber)) {
          inform("Número inválido para JSON.", "warning");
          return;
        }
        setPathValue(path, nextNumber);
      }
    };

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitInput();
    });
    input.addEventListener("blur", commitInput);

    rowMain.append(input);
  };

  const createActionButton = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  };

  const renderNode = (
    value: JsonValue,
    path: JsonPath,
    depth: number,
    parentKind: "object" | "array" | null,
    parentPath: JsonPath,
    key: string | number | null,
    siblingCount: number,
    editable: boolean,
  ): HTMLElement => {
    const kind = getJsonKind(value);
    const nodeEl = document.createElement("div");
    nodeEl.className = "json-node";

    const row = document.createElement("div");
    row.className = "json-row json-indent";
    row.style.setProperty("--json-depth", String(depth));
    const pathText = pathToText(path);
    row.dataset.jsonPath = pathText;
    if (selectedPath === pathText) row.classList.add("is-selected");
    row.addEventListener("click", () => {
      selectedPath = pathText;
      const current = treeEl.querySelector<HTMLElement>(".json-row.is-selected");
      if (current && current !== row) current.classList.remove("is-selected");
      row.classList.add("is-selected");
    });

    const rowMain = document.createElement("div");
    rowMain.className = "json-row-main";

    if (kind === "object" || kind === "array") {
      const isExpanded = expandedPaths.has(pathText);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "json-toggle";
      toggle.textContent = isExpanded ? "−" : "+";
      toggle.title = isExpanded ? "Colapsar" : "Expandir";
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (expandedPaths.has(pathText)) {
          expandedPaths.delete(pathText);
        } else {
          expandedPaths.add(pathText);
        }
        renderTree();
      });
      rowMain.append(toggle);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "json-label";
      spacer.textContent = "•";
      rowMain.append(spacer);
    }

    if (parentKind === "object" && typeof key === "string") {
      if (editable) {
        const keyInput = document.createElement("input");
        keyInput.className = "json-key-input";
        keyInput.type = "text";
        keyInput.value = key;
        keyInput.spellcheck = false;
        const commitRename = () => {
          if (keyInput.value === key) return;
          const changed = renameKey(parentPath, key, keyInput.value);
          if (!changed) keyInput.value = key;
        };
        keyInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commitRename();
        });
        keyInput.addEventListener("blur", commitRename);
        rowMain.append(keyInput);
      } else {
        const keyLabel = document.createElement("span");
        keyLabel.className = "json-label";
        keyLabel.textContent = key;
        rowMain.append(keyLabel);
      }
    } else if (parentKind === "array" && typeof key === "number") {
      const indexLabel = document.createElement("span");
      indexLabel.className = "json-label";
      indexLabel.textContent = `[${key}]`;
      rowMain.append(indexLabel);
    } else {
      const rootLabel = document.createElement("span");
      rootLabel.className = "json-label";
      rootLabel.textContent = ROOT_PATH;
      rowMain.append(rootLabel);
    }

    const badge = document.createElement("span");
    badge.className = "json-badge";
    if (isObjectValue(value)) {
      badge.textContent = `object (${Object.keys(value).length})`;
    } else if (Array.isArray(value)) {
      badge.textContent = `array (${value.length})`;
    } else {
      badge.textContent = kind;
    }
    rowMain.append(badge);

    if (kind !== "object" && kind !== "array") {
      buildPrimitiveEditor(value, path, editable, rowMain);
    }

    const actions = document.createElement("div");
    actions.className = "json-row-actions";

    if (editable && (kind === "object" || kind === "array")) {
      actions.append(
        createActionButton(
          kind === "object" ? "+prop" : "+item",
          kind === "object" ? "Agregar propiedad" : "Agregar elemento",
          () => addChild(path),
        ),
      );
    }

    if (editable && parentKind === "array" && typeof key === "number") {
      actions.append(
        createActionButton("↑", "Mover arriba", () => moveArrayItem(parentPath, key, -1)),
        createActionButton("↓", "Mover abajo", () => moveArrayItem(parentPath, key, 1)),
      );
    }

    if (editable && path.length > 0) {
      actions.append(createActionButton("Quitar", "Eliminar nodo", () => removePath(path)));
    }

    row.append(rowMain, actions);
    nodeEl.append(row);

    structureEntries.push({
      path: pathText,
      depth,
      label:
        parentKind === "object" && typeof key === "string"
          ? key
          : parentKind === "array" && typeof key === "number"
            ? `[${key}]`
            : ROOT_PATH,
      kind,
    });

    if ((kind === "object" || kind === "array") && expandedPaths.has(pathText)) {
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "json-children";

      if (isObjectValue(value)) {
        const keys = Object.keys(value);
        for (const childKey of keys) {
          const childPath = [...path, childKey];
          childrenWrap.append(
            renderNode(value[childKey], childPath, depth + 1, "object", path, childKey, keys.length, editable),
          );
        }
      } else if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          const childPath = [...path, index];
          childrenWrap.append(
            renderNode(value[index], childPath, depth + 1, "array", path, index, value.length, editable),
          );
        }
      }

      if (childrenWrap.childElementCount === 0) {
        const empty = document.createElement("div");
        empty.className = "json-tree-empty json-indent";
        empty.style.setProperty("--json-depth", String(depth + 1));
        empty.textContent = kind === "object" ? "Objeto vacío." : "Arreglo vacío.";
        childrenWrap.append(empty);
      }

      nodeEl.append(childrenWrap);
    }

    if (parentKind === "array" && typeof key === "number") {
      const upButton = actions.querySelector<HTMLButtonElement>("button[title='Mover arriba']");
      const downButton = actions.querySelector<HTMLButtonElement>("button[title='Mover abajo']");
      if (upButton) upButton.disabled = key === 0 || !editable;
      if (downButton) downButton.disabled = key >= siblingCount - 1 || !editable;
    }

    return nodeEl;
  };

  const renderTree = () => {
    if (!treeVisible) return;
    structureEntries = [];
    treeEl.innerHTML = "";

    if (parseError) {
      const empty = document.createElement("div");
      empty.className = "json-tree-empty";
      empty.textContent = "JSON inválido. Corrige el texto para habilitar el árbol.";
      treeEl.append(empty);
      return;
    }

    const editable = !treeReadOnly;
    treeEl.append(renderNode(parsedValue, [], 0, null, [], null, 0, editable));
  };

  const setTreeVisible = (visible: boolean) => {
    if (treeVisible === visible) return;
    treeVisible = visible;
    if (!treeVisible) {
      structureEntries = [];
      treeEl.innerHTML = "";
      return;
    }
    renderTree();
  };

  const parseText = () => {
    byteCount = new TextEncoder().encode(text).length;
    try {
      const parsed = JSON.parse(text) as JsonValue;
      parsedValue = parsed;
      parseError = null;
      nodeCount = countJsonNodes(parsedValue);
      treeReadOnly = byteCount > maxBytes || nodeCount > maxNodes;
      if (treeReadOnly && !expandedPaths.has(ROOT_PATH)) expandedPaths.add(ROOT_PATH);
    } catch (error) {
      parseError = parseErrorInfo(text, error);
      nodeCount = 1;
      treeReadOnly = false;
    }
    updateStatus();
    updateButtons();
    renderTree();
  };

  const setText = (nextText: string, emitChange = false) => {
    isApplyingText = true;
    text = nextText;
    if (textAreaEl.value !== text) textAreaEl.value = text;
    isApplyingText = false;
    parseText();
    if (emitChange) notify();
  };

  const scheduleParseFromInput = () => {
    if (textInputTimer !== null) window.clearTimeout(textInputTimer);
    textInputTimer = window.setTimeout(() => {
      textInputTimer = null;
      if (isApplyingText) return;
      text = textAreaEl.value;
      parseText();
      notify();
    }, 170);
  };

  const focusPath = (path: string) => {
    selectedPath = path;
    if (!treeVisible) return;
    renderTree();
    const row = findPathRow(treeEl, path);
    if (!row) return;
    row.classList.add("is-selected");
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const pretty = (): boolean => {
    if (parseError) {
      inform("No se puede aplicar pretty: JSON inválido.", "warning");
      return false;
    }
    const nextText = JSON.stringify(parsedValue, null, 2);
    if (nextText === text) return true;
    setText(nextText, true);
    return true;
  };

  const minify = (): boolean => {
    if (parseError) {
      inform("No se puede minificar: JSON inválido.", "warning");
      return false;
    }
    const nextText = JSON.stringify(parsedValue);
    if (nextText === text) return true;
    setText(nextText, true);
    return true;
  };

  textAreaEl.addEventListener("input", scheduleParseFromInput);
  prettyBtn.addEventListener("click", () => {
    pretty();
  });
  minifyBtn.addEventListener("click", () => {
    minify();
  });

  setText("{}", false);

  return {
    getText: () => text,
    setText,
    setTreeVisible,
    focus: () => textAreaEl.focus(),
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isValid: () => parseError === null,
    getErrorMessage: () =>
      parseError ? `${parseError.message} (L${parseError.line}:C${parseError.column})` : null,
    pretty,
    minify,
    getStructureEntries: () => structureEntries.slice(),
    focusPath,
  };
}
