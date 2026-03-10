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

export type JsonSelectionSource = "tree" | "outline" | "editor" | "program";

export type JsonSelectionChange = {
  path: string | null;
  source: JsonSelectionSource;
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
  getSelectedPath: () => string | null;
  selectPath: (
    path: string | null,
    options?: {
      source: JsonSelectionSource;
      reveal?: boolean;
      focusTarget?: "tree" | "editor" | "none";
    },
  ) => void;
  onSelectionChange: (listener: (change: JsonSelectionChange) => void) => () => void;
  focusPath: (path: string) => void;
};

export type CreateJsonWorkspaceOptions = {
  textAreaEl: HTMLTextAreaElement;
  highlightEl?: HTMLElement;
  treeEl: HTMLElement;
  statusEl: HTMLElement;
  prettyBtn: HTMLButtonElement;
  minifyBtn: HTMLButtonElement;
  maxBytes?: number;
  maxNodes?: number;
  highlightMaxChars?: number;
  treeVisible?: boolean;
  onInform?: (message: string, kind: "info" | "warning" | "error") => void;
};

type JsonKind = JsonStructureEntry["kind"];

type JsonPathIndexEntry = {
  path: string;
  pathSegments: JsonPath;
  depth: number;
  label: string;
  kind: JsonKind;
  start: number;
  end: number;
  focusStart: number;
};

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type HighlightToken =
  | { kind: "ws"; raw: string }
  | { kind: "punct"; raw: string }
  | { kind: "string"; raw: string; inner: string }
  | { kind: "number"; raw: string }
  | { kind: "literal"; raw: "true" | "false" | "null" }
  | { kind: "other"; raw: string };

const JSON_NUMBER_RE = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/;

function tokenizeJson(text: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      let escaped = false;
      while (j < text.length) {
        const cj = text[j];
        if (escaped) {
          escaped = false;
          j += 1;
          continue;
        }
        if (cj === "\\") {
          escaped = true;
          j += 1;
          continue;
        }
        if (cj === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      const raw = text.slice(i, j);
      const inner = raw.length >= 2 ? raw.slice(1, raw.endsWith('"') ? -1 : raw.length) : raw;
      tokens.push({ kind: "string", raw, inner });
      i = j;
      continue;
    }

    if (ch <= " ") {
      let j = i + 1;
      while (j < text.length && text[j] <= " ") j += 1;
      tokens.push({ kind: "ws", raw: text.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === ":" || ch === ",") {
      tokens.push({ kind: "punct", raw: ch });
      i += 1;
      continue;
    }

    if (ch === "t" && text.startsWith("true", i)) {
      tokens.push({ kind: "literal", raw: "true" });
      i += 4;
      continue;
    }
    if (ch === "f" && text.startsWith("false", i)) {
      tokens.push({ kind: "literal", raw: "false" });
      i += 5;
      continue;
    }
    if (ch === "n" && text.startsWith("null", i)) {
      tokens.push({ kind: "literal", raw: "null" });
      i += 4;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const match = JSON_NUMBER_RE.exec(text.slice(i));
      if (match) {
        tokens.push({ kind: "number", raw: match[0] });
        i += match[0].length;
        continue;
      }
    }

    tokens.push({ kind: "other", raw: ch });
    i += 1;
  }
  return tokens;
}

function unescapeJsonStringInner(text: string, maxOutputChars = Number.MAX_SAFE_INTEGER): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    if (out.length >= maxOutputChars) break;
    const ch = text[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (!next) break;
    if (next === '"' || next === "\\" || next === "/") {
      out += next;
      i += 1;
      continue;
    }
    if (next === "b") {
      out += "\b";
      i += 1;
      continue;
    }
    if (next === "f") {
      out += "\f";
      i += 1;
      continue;
    }
    if (next === "n") {
      out += "\n";
      i += 1;
      continue;
    }
    if (next === "r") {
      out += "\r";
      i += 1;
      continue;
    }
    if (next === "t") {
      out += "\t";
      i += 1;
      continue;
    }
    if (next === "u") {
      const hex = text.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 5;
        continue;
      }
    }
    out += next;
    i += 1;
  }
  return out;
}

type JsonKeyKind = "id" | "type" | "text" | "hash" | "date" | "other";

function classifyKeyKind(key: string): JsonKeyKind {
  const k = key.trim().toLowerCase();
  if (!k) return "other";
  if (k === "id" || k.endsWith("_id") || k === "uuid") return "id";
  if (k === "type" || k.endsWith("_type") || k === "kind" || k.endsWith("_kind") || k.includes("status")) return "type";
  if (k.includes("checksum") || k.includes("hash") || k.includes("sha") || k.includes("md5")) return "hash";
  if (k.includes("date") || k.includes("timestamp") || k.endsWith("_at")) return "date";
  if (k.includes("scenario") || k.includes("prompt") || k.includes("notes") || k.includes("message") || k.includes("description") || k.includes("text")) {
    return "text";
  }
  return "other";
}

function isProbablyUrl(text: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(text.trim());
}

function buildJsonHighlightHtml(text: string): string {
  const tokens = tokenizeJson(text);
  const nextNonWs = new Array<number>(tokens.length).fill(-1);
  let next = -1;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    nextNonWs[i] = next;
    if (tokens[i].kind !== "ws") next = i;
  }

  let pendingKey: { key: string; kind: JsonKeyKind } | null = null;
  let lastKey: { key: string; kind: JsonKeyKind; tokenIndex: number } | null = null;
  let prevNonWsIndex = -1;

  const out: string[] = [];

  const wrap = (classes: string[], raw: string) =>
    `<span class="${classes.join(" ")}">${escapeHtml(raw)}</span>`;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind === "ws") {
      out.push(escapeHtml(token.raw));
      continue;
    }

    if (token.kind === "string") {
      const nextIndex = nextNonWs[i];
      const isKey = nextIndex !== -1 && tokens[nextIndex].kind === "punct" && tokens[nextIndex].raw === ":";
      if (isKey) {
        const decodedKey = unescapeJsonStringInner(token.inner, 220);
        const kind = classifyKeyKind(decodedKey);
        lastKey = { key: decodedKey, kind, tokenIndex: i };
        const classes = ["json-token", "json-key"];
        if (kind !== "other") classes.push(`json-key--${kind}`);
        out.push(wrap(classes, token.raw));
      } else {
        const classes = ["json-token", "json-string"];
        const valuePreview = unescapeJsonStringInner(token.inner, 420);
        const keyKind = pendingKey?.kind ?? null;
        if (keyKind === "id") classes.push("json-string--id");
        if (keyKind === "type") classes.push("json-string--enum");
        if (keyKind === "text") classes.push("json-string--text");
        if (keyKind === "hash") classes.push("json-string--hash");
        if (keyKind === "date") classes.push("json-string--date");
        if (keyKind === null && isProbablyUrl(valuePreview)) classes.push("json-string--url");
        out.push(wrap(classes, token.raw));
        pendingKey = null;
      }
      prevNonWsIndex = i;
      continue;
    }

    if (token.kind === "number") {
      const classes = ["json-token", "json-number"];
      if (pendingKey?.kind === "id") classes.push("json-number--id");
      if (pendingKey?.kind === "date") classes.push("json-number--date");
      out.push(wrap(classes, token.raw));
      pendingKey = null;
      prevNonWsIndex = i;
      continue;
    }

    if (token.kind === "literal") {
      if (token.raw === "null") {
        out.push(wrap(["json-token", "json-null"], token.raw));
      } else {
        out.push(wrap(["json-token", "json-boolean"], token.raw));
      }
      pendingKey = null;
      prevNonWsIndex = i;
      continue;
    }

    if (token.kind === "punct") {
      out.push(wrap(["json-token", "json-punct"], token.raw));
      if (token.raw === ":" && lastKey && lastKey.tokenIndex === prevNonWsIndex) {
        pendingKey = { key: lastKey.key, kind: lastKey.kind };
        lastKey = null;
      } else if ((token.raw === "{" || token.raw === "[") && pendingKey) {
        pendingKey = null;
      } else if (token.raw === "," || token.raw === "}" || token.raw === "]") {
        lastKey = null;
      }
      prevNonWsIndex = i;
      continue;
    }

    out.push(escapeHtml(token.raw));
    pendingKey = null;
    prevNonWsIndex = i;
  }

  return out.join("");
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

function pathTextToSegments(pathText: string): JsonPath | null {
  if (pathText === ROOT_PATH) return [];
  if (!pathText.startsWith(ROOT_PATH)) return null;

  const segments: JsonPath = [];
  let index = ROOT_PATH.length;
  while (index < pathText.length) {
    const ch = pathText[index];
    if (ch === ".") {
      let end = index + 1;
      while (end < pathText.length && /[A-Za-z0-9_$]/.test(pathText[end])) end += 1;
      const key = pathText.slice(index + 1, end);
      if (!key) return null;
      segments.push(key);
      index = end;
      continue;
    }
    if (ch === "[") {
      if (pathText[index + 1] === '"') {
        let end = index + 2;
        let escaped = false;
        while (end < pathText.length) {
          const current = pathText[end];
          if (escaped) {
            escaped = false;
            end += 1;
            continue;
          }
          if (current === "\\") {
            escaped = true;
            end += 1;
            continue;
          }
          if (current === '"') break;
          end += 1;
        }
        if (pathText[end] !== '"' || pathText[end + 1] !== "]") return null;
        const raw = pathText.slice(index + 1, end + 1);
        try {
          segments.push(JSON.parse(raw) as string);
        } catch {
          return null;
        }
        index = end + 2;
        continue;
      }
      let end = index + 1;
      while (end < pathText.length && pathText[end] !== "]") end += 1;
      if (pathText[end] !== "]") return null;
      const raw = pathText.slice(index + 1, end);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed)) return null;
      segments.push(parsed);
      index = end + 1;
      continue;
    }
    return null;
  }

  return segments;
}

function buildPathAncestorTexts(pathSegments: JsonPath): string[] {
  const ancestors: string[] = [];
  for (let i = 0; i <= pathSegments.length; i += 1) {
    ancestors.push(pathToText(pathSegments.slice(0, i)));
  }
  return ancestors;
}

function skipJsonWhitespace(text: string, index: number): number {
  let next = index;
  while (next < text.length && text[next] <= " ") next += 1;
  return next;
}

function parseJsonStringToken(
  text: string,
  index: number,
): { raw: string; inner: string; end: number } {
  if (text[index] !== '"') {
    throw new Error(`Expected string token at ${index}`);
  }

  let end = index + 1;
  let escaped = false;
  while (end < text.length) {
    const current = text[end];
    if (escaped) {
      escaped = false;
      end += 1;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      end += 1;
      continue;
    }
    if (current === '"') {
      end += 1;
      break;
    }
    end += 1;
  }

  const raw = text.slice(index, end);
  const inner = raw.length >= 2 ? raw.slice(1, raw.endsWith('"') ? -1 : raw.length) : raw;
  return { raw, inner, end };
}

function buildJsonPathIndex(text: string): JsonPathIndexEntry[] {
  const entries: JsonPathIndexEntry[] = [];

  const addEntry = (
    pathSegments: JsonPath,
    label: string,
    kind: JsonKind,
    start: number,
    focusStart: number,
  ): JsonPathIndexEntry => {
    const entry: JsonPathIndexEntry = {
      path: pathToText(pathSegments),
      pathSegments: [...pathSegments],
      depth: pathSegments.length,
      label,
      kind,
      start,
      end: start,
      focusStart,
    };
    entries.push(entry);
    return entry;
  };

  const parseValue = (
    rawIndex: number,
    pathSegments: JsonPath,
    label: string,
    rangeStartOverride?: number,
    focusStartOverride?: number,
  ): { end: number; kind: JsonKind } => {
    let index = skipJsonWhitespace(text, rawIndex);
    const rangeStart = rangeStartOverride ?? index;
    const focusStart = focusStartOverride ?? index;
    const current = text[index];

    if (current === "{") {
      const entry = addEntry(pathSegments, label, "object", rangeStart, focusStart);
      index += 1;
      index = skipJsonWhitespace(text, index);
      if (text[index] === "}") {
        entry.end = index + 1;
        return { end: entry.end, kind: "object" };
      }

      while (index < text.length) {
        const keyStart = skipJsonWhitespace(text, index);
        const keyToken = parseJsonStringToken(text, keyStart);
        const key = unescapeJsonStringInner(keyToken.inner, 400);
        index = skipJsonWhitespace(text, keyToken.end);
        if (text[index] !== ":") throw new Error(`Expected ":" at ${index}`);
        index += 1;
        const childPath = [...pathSegments, key];
        const child = parseValue(index, childPath, key, keyStart, keyStart);
        index = skipJsonWhitespace(text, child.end);
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        if (text[index] === "}") {
          entry.end = index + 1;
          return { end: entry.end, kind: "object" };
        }
        throw new Error(`Expected "}" at ${index}`);
      }
      throw new Error("Unexpected end of object");
    }

    if (current === "[") {
      const entry = addEntry(pathSegments, label, "array", rangeStart, focusStart);
      index += 1;
      index = skipJsonWhitespace(text, index);
      if (text[index] === "]") {
        entry.end = index + 1;
        return { end: entry.end, kind: "array" };
      }

      let itemIndex = 0;
      while (index < text.length) {
        const itemStart = skipJsonWhitespace(text, index);
        const childPath = [...pathSegments, itemIndex];
        const child = parseValue(itemStart, childPath, `[${itemIndex}]`, itemStart, itemStart);
        index = skipJsonWhitespace(text, child.end);
        itemIndex += 1;
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        if (text[index] === "]") {
          entry.end = index + 1;
          return { end: entry.end, kind: "array" };
        }
        throw new Error(`Expected "]" at ${index}`);
      }
      throw new Error("Unexpected end of array");
    }

    if (current === '"') {
      const token = parseJsonStringToken(text, index);
      const entry = addEntry(pathSegments, label, "string", rangeStart, focusStart);
      entry.end = token.end;
      return { end: token.end, kind: "string" };
    }

    if (current === "t" && text.startsWith("true", index)) {
      const entry = addEntry(pathSegments, label, "boolean", rangeStart, focusStart);
      entry.end = index + 4;
      return { end: entry.end, kind: "boolean" };
    }

    if (current === "f" && text.startsWith("false", index)) {
      const entry = addEntry(pathSegments, label, "boolean", rangeStart, focusStart);
      entry.end = index + 5;
      return { end: entry.end, kind: "boolean" };
    }

    if (current === "n" && text.startsWith("null", index)) {
      const entry = addEntry(pathSegments, label, "null", rangeStart, focusStart);
      entry.end = index + 4;
      return { end: entry.end, kind: "null" };
    }

    const match = JSON_NUMBER_RE.exec(text.slice(index));
    if (match) {
      const entry = addEntry(pathSegments, label, "number", rangeStart, focusStart);
      entry.end = index + match[0].length;
      return { end: entry.end, kind: "number" };
    }

    throw new Error(`Unexpected JSON token at ${index}`);
  };

  parseValue(0, [], ROOT_PATH);
  return entries;
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  const maybeStructuredClone = (globalThis as unknown as { structuredClone?: (input: unknown) => unknown }).structuredClone;
  if (typeof maybeStructuredClone === "function") {
    return maybeStructuredClone(value) as T;
  }
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
  const css = (globalThis as unknown as { CSS?: { escape?: (value: string) => string } }).CSS;
  const escaped = typeof css?.escape === "function" ? css.escape(path) : path.replace(/["\\]/g, "\\$&");
  return treeEl.querySelector<HTMLElement>(`[data-json-path="${escaped}"]`);
}

export function createJsonWorkspace(options: CreateJsonWorkspaceOptions): JsonWorkspace {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const highlightEl = options.highlightEl ?? null;
  const highlightMaxChars = Math.max(20_000, options.highlightMaxChars ?? 260_000);
  const textAreaEl = options.textAreaEl;
  const treeEl = options.treeEl;
  const statusEl = options.statusEl;
  const prettyBtn = options.prettyBtn;
  const minifyBtn = options.minifyBtn;
  const listeners = new Set<(change: JsonWorkspaceChange) => void>();
  const selectionListeners = new Set<(change: JsonSelectionChange) => void>();

  let text = "";
  let parsedValue: JsonValue = {};
  let parseError: ParseErrorInfo | null = null;
  let treeReadOnly = false;
  let nodeCount = 1;
  let nodeCountKnown = true;
  let byteCount = 0;
  let analysisPending = false;
  let parseToken = 0;
  let structureEntries: JsonStructureEntry[] = [];
  let pathIndexEntries: JsonPathIndexEntry[] = [];
  let pathIndexByPath = new Map<string, JsonPathIndexEntry>();
  let selectedPath: string | null = ROOT_PATH;
  const expandedPaths = new Set<string>([ROOT_PATH]);
  let treeVisible = options.treeVisible ?? true;
  let isApplyingText = false;
  let textInputTimer: number | null = null;
  let analysisTimer: number | null = null;
  const encoder = new TextEncoder();
  let highlightTimer: number | null = null;
  let lastHighlightText = "";
  let selectionSyncTimer: number | null = null;

  const syncHighlightScroll = () => {
    if (!highlightEl) return;
    highlightEl.scrollTop = textAreaEl.scrollTop;
    highlightEl.scrollLeft = textAreaEl.scrollLeft;
  };

  const renderHighlight = () => {
    if (!highlightEl) return;
    if (text === lastHighlightText) return;
    lastHighlightText = text;
    if (text.length > highlightMaxChars) {
      highlightEl.dataset.highlight = "off";
      highlightEl.textContent = "";
      return;
    }
    highlightEl.dataset.highlight = "on";
    highlightEl.innerHTML = buildJsonHighlightHtml(text);
    syncHighlightScroll();
  };

  const scheduleHighlight = () => {
    if (!highlightEl) return;
    if (highlightTimer !== null) window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => {
      highlightTimer = null;
      renderHighlight();
    }, 70);
  };

  const scheduleAnalysis = () => {
    if (!treeVisible) return;
    if (analysisTimer !== null) window.clearTimeout(analysisTimer);
    analysisTimer = window.setTimeout(() => {
      analysisTimer = null;
      const token = parseToken;
      const run = () => {
        if (parseToken !== token) return;
        if (!treeVisible) return;
        if (parseError) return;
        analysisPending = false;
        byteCount = encoder.encode(text).length;
        if (byteCount > maxBytes) {
          treeReadOnly = true;
          nodeCountKnown = false;
          nodeCount = 0;
          updateStatus();
          renderTree();
          return;
        }
        nodeCount = countJsonNodes(parsedValue);
        nodeCountKnown = true;
        treeReadOnly = nodeCount > maxNodes;
        if (treeReadOnly && !expandedPaths.has(ROOT_PATH)) expandedPaths.add(ROOT_PATH);
        updateStatus();
        renderTree();
      };

      const maybeIdle = (globalThis as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback;
      if (typeof maybeIdle === "function") {
        maybeIdle(run, { timeout: 800 });
        return;
      }
      window.setTimeout(run, 0);
    }, 240);
  };

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

  const notifySelection = (payload: JsonSelectionChange) => {
    for (const listener of selectionListeners) listener(payload);
  };

  const syncStructureEntriesFromIndex = () => {
    structureEntries = pathIndexEntries.map((entry) => ({
      path: entry.path,
      depth: entry.depth,
      label: entry.label,
      kind: entry.kind,
    }));
  };

  const getSelectionEntry = (path: string | null): JsonPathIndexEntry | null => {
    if (!path) return null;
    return pathIndexByPath.get(path) ?? null;
  };

  const resolveFallbackPath = (path: string | null): string | null => {
    if (!path || pathIndexEntries.length === 0) return null;
    if (pathIndexByPath.has(path)) return path;
    const segments = pathTextToSegments(path);
    if (!segments) return pathIndexByPath.has(ROOT_PATH) ? ROOT_PATH : null;
    for (let size = segments.length - 1; size >= 0; size -= 1) {
      const candidate = pathToText(segments.slice(0, size));
      if (pathIndexByPath.has(candidate)) return candidate;
    }
    return pathIndexByPath.has(ROOT_PATH) ? ROOT_PATH : null;
  };

  const ensureExpandedAncestors = (path: string | null) => {
    const entry = getSelectionEntry(resolveFallbackPath(path));
    if (!entry) return;
    for (const ancestor of buildPathAncestorTexts(entry.pathSegments.slice(0, -1))) {
      expandedPaths.add(ancestor);
    }
    if (entry.kind === "object" || entry.kind === "array") {
      expandedPaths.add(entry.path);
    }
  };

  const focusEditorPath = (path: string | null) => {
    const entry = getSelectionEntry(resolveFallbackPath(path));
    if (!entry) return;
    textAreaEl.focus();
    textAreaEl.setSelectionRange(entry.focusStart, entry.focusStart);
    const lineHeight = Number.parseFloat(getComputedStyle(textAreaEl).lineHeight) || 20;
    const valueBefore = text.slice(0, entry.focusStart);
    const row = valueBefore.split("\n").length - 1;
    textAreaEl.scrollTop = Math.max(0, row * lineHeight - textAreaEl.clientHeight * 0.35);
    syncHighlightScroll();
  };

  const applySelectionToTree = (path: string | null, reveal: boolean) => {
    if (!treeVisible) return;
    renderTree();
    if (!path) return;
    const row = findPathRow(treeEl, path);
    if (!row) return;
    row.classList.add("is-selected");
    if (reveal) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const selectPath = (
    path: string | null,
    options: {
      source: JsonSelectionSource;
      reveal?: boolean;
      focusTarget?: "tree" | "editor" | "none";
    } = { source: "program" },
  ) => {
    const normalizedPath = parseError ? null : resolveFallbackPath(path);
    const nextPath = normalizedPath ?? (parseError ? null : (pathIndexByPath.has(ROOT_PATH) ? ROOT_PATH : null));
    const changed = nextPath !== selectedPath;
    selectedPath = nextPath;

    if (!parseError && nextPath) {
      ensureExpandedAncestors(nextPath);
    }

    if (treeVisible) {
      applySelectionToTree(nextPath, options.reveal ?? false);
    }

    if (options.focusTarget === "editor" && nextPath) {
      focusEditorPath(nextPath);
    }

    if (changed || options.reveal || options.focusTarget === "editor") {
      notifySelection({ path: nextPath, source: options.source });
    }
  };

  const resolvePathAtIndex = (index: number): string | null => {
    if (parseError || pathIndexEntries.length === 0) return null;

    let bestContaining: JsonPathIndexEntry | null = null;
    for (const entry of pathIndexEntries) {
      if (index < entry.start || index > entry.end) continue;
      if (!bestContaining || entry.end - entry.start < bestContaining.end - bestContaining.start) {
        bestContaining = entry;
      }
    }
    if (bestContaining) return bestContaining.path;

    let bestNearest: JsonPathIndexEntry | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entry of pathIndexEntries) {
      const distance = index < entry.start ? entry.start - index : index - entry.end;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNearest = entry;
        continue;
      }
      if (distance === bestDistance && bestNearest && entry.end - entry.start < bestNearest.end - bestNearest.start) {
        bestNearest = entry;
      }
    }
    return bestNearest?.path ?? null;
  };

  const updateStatus = () => {
    if (parseError) {
      statusEl.dataset.state = "invalid";
      statusEl.textContent = `JSON inválido · L${parseError.line}:C${parseError.column}`;
      return;
    }
    if (!treeVisible) {
      statusEl.dataset.state = "valid";
      statusEl.textContent = "JSON válido";
      return;
    }
    if (analysisPending) {
      statusEl.dataset.state = "valid";
      statusEl.textContent = "JSON válido · analizando…";
      return;
    }
    if (treeReadOnly) {
      statusEl.dataset.state = "readonly";
      const nodeSuffix = nodeCountKnown ? `, ${nodeCount.toLocaleString()} nodos` : "";
      statusEl.textContent = `JSON válido · árbol solo lectura (${formatBytes(byteCount)}${nodeSuffix})`;
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
    setTextInternal(nextText, true, "tree");
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
      setTextInternal(nextText, true, "tree");
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
      selectPath(pathText, { source: "tree", reveal: true, focusTarget: "none" });
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

    if (analysisPending) {
      const empty = document.createElement("div");
      empty.className = "json-tree-empty";
      empty.textContent = "Analizando JSON…";
      treeEl.append(empty);
      return;
    }

    if (treeReadOnly) {
      const nodeSuffix = nodeCountKnown ? `, ${nodeCount.toLocaleString()} nodos` : "";
      const empty = document.createElement("div");
      empty.className = "json-tree-empty";
      empty.textContent = `Árbol deshabilitado por tamaño (${formatBytes(byteCount)}${nodeSuffix}). Usa el panel “Texto JSON”.`;
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
      treeEl.innerHTML = "";
      analysisPending = false;
      if (analysisTimer !== null) {
        window.clearTimeout(analysisTimer);
        analysisTimer = null;
      }
      return;
    }
    parseText("program");
  };

  const parseText = (reason: "input" | "program" | "tree") => {
    parseToken += 1;
    try {
      const parsed = JSON.parse(text) as JsonValue;
      parsedValue = parsed;
      parseError = null;
      pathIndexEntries = buildJsonPathIndex(text);
      pathIndexByPath = new Map(pathIndexEntries.map((entry) => [entry.path, entry]));
      syncStructureEntriesFromIndex();
      selectedPath = resolveFallbackPath(selectedPath) ?? ROOT_PATH;
      if (!treeVisible) {
        analysisPending = false;
        treeReadOnly = false;
        nodeCountKnown = false;
        nodeCount = 0;
      } else if (reason === "tree") {
        analysisPending = false;
      } else {
        analysisPending = true;
        treeReadOnly = false;
        nodeCountKnown = false;
        nodeCount = 0;
        scheduleAnalysis();
      }
    } catch (error) {
      parseError = parseErrorInfo(text, error);
      pathIndexEntries = [];
      pathIndexByPath = new Map();
      structureEntries = [];
      if (selectedPath !== null) {
        selectedPath = null;
        notifySelection({ path: null, source: "program" });
      }
      nodeCount = 1;
      treeReadOnly = false;
      nodeCountKnown = true;
      analysisPending = false;
      if (analysisTimer !== null) {
        window.clearTimeout(analysisTimer);
        analysisTimer = null;
      }
    }
    updateStatus();
    updateButtons();
    renderTree();
  };

  const setTextInternal = (nextText: string, emitChange: boolean, reason: "input" | "program" | "tree") => {
    isApplyingText = true;
    text = nextText;
    if (textAreaEl.value !== text) textAreaEl.value = text;
    isApplyingText = false;
    const previousSelectedPath = selectedPath;
    parseText(reason);
    scheduleHighlight();
    const selectionChanged = previousSelectedPath !== selectedPath;
    if (!parseError && selectedPath) {
      applySelectionToTree(selectedPath, false);
    }
    if (selectionChanged && !(parseError && selectedPath === null)) {
      notifySelection({ path: selectedPath, source: reason === "tree" ? "tree" : "program" });
    }
    if (emitChange) notify();
  };

  const setText = (nextText: string, emitChange = false) => setTextInternal(nextText, emitChange, "program");

  const scheduleParseFromInput = () => {
    if (textInputTimer !== null) window.clearTimeout(textInputTimer);
    textInputTimer = window.setTimeout(() => {
      textInputTimer = null;
      if (isApplyingText) return;
      const previousSelectedPath = selectedPath;
      text = textAreaEl.value;
      parseText("input");
      scheduleHighlight();
      syncHighlightScroll();
      if (!parseError && selectedPath) {
        applySelectionToTree(selectedPath, false);
      }
      if (previousSelectedPath !== selectedPath && !(parseError && selectedPath === null)) {
        notifySelection({ path: selectedPath, source: parseError ? "program" : "editor" });
      }
      scheduleSelectionSyncFromEditor();
      notify();
    }, 170);
  };

  const scheduleSelectionSyncFromEditor = () => {
    if (selectionSyncTimer !== null) window.clearTimeout(selectionSyncTimer);
    selectionSyncTimer = window.setTimeout(() => {
      selectionSyncTimer = null;
      if (parseError) {
        if (selectedPath !== null) {
          selectedPath = null;
          notifySelection({ path: null, source: "editor" });
        }
        return;
      }
      if (document.activeElement !== textAreaEl) return;
      const nextPath = resolvePathAtIndex(textAreaEl.selectionStart ?? 0);
      selectPath(nextPath, { source: "editor", reveal: true, focusTarget: "none" });
    }, 130);
  };

  const focusPath = (path: string) => {
    selectPath(path, { source: "outline", reveal: true, focusTarget: "tree" });
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
  textAreaEl.addEventListener("scroll", syncHighlightScroll, { passive: true });
  textAreaEl.addEventListener("click", scheduleSelectionSyncFromEditor);
  textAreaEl.addEventListener("keyup", scheduleSelectionSyncFromEditor);
  textAreaEl.addEventListener("select", scheduleSelectionSyncFromEditor);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement !== textAreaEl) return;
    scheduleSelectionSyncFromEditor();
  });
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
    getSelectedPath: () => selectedPath,
    selectPath,
    onSelectionChange: (listener) => {
      selectionListeners.add(listener);
      return () => selectionListeners.delete(listener);
    },
    focusPath,
  };
}
