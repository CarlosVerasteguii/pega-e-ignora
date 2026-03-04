import "@toast-ui/editor/dist/toastui-editor.css";
import "./styles.css";
import Editor from "@toast-ui/editor";

import { join, documentDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { confirm, message, open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { openVaultExplorer } from "./features/vaultExplorer";
import { createCommandPalette, type CommandPaletteAction } from "./ui/commandPalette";
import { createFindReplace } from "./ui/findReplace";
import { createToastHost } from "./ui/toast";

type HistoryItem = {
  path: string;
  title: string;
  updatedAt: number;
};

type VaultPaths = {
  vaultDir: string;
  notesDir: string;
  scratchPath: string;
  historyPath: string;
};

type AppTheme = "light" | "dark";
type AppPalette =
  | "caramelo"
  | "oceano"
  | "bosque"
  | "uva"
  | "sakura"
  | "cobalto"
  | "menta"
  | "atardecer"
  | "grafito"
  | "limon";

type PaletteAccents = {
  a1: string;
  a2: string;
  a3: string;
  a4: string;
};

type PaletteDefinition = {
  id: AppPalette;
  name: string;
  light: PaletteAccents;
  dark: PaletteAccents;
};
type HeadingEntry = {
  level: number;
  text: string;
  line: number;
};

const THEME_STORAGE_KEY = "markdown-viewer.theme";
const PALETTE_STORAGE_KEY = "markdown-viewer.palette";
const WORKSPACE_ZOOM_STORAGE_KEY = "markdown-viewer.workspaceZoom";
const TYPOGRAPHY_STORAGE_KEY = "markdown-viewer.typography";
const SPELLCHECK_STORAGE_KEY = "markdown-viewer.spellcheck";
const READ_MODE_STORAGE_KEY = "markdown-viewer.readMode";
const SIDEBAR_SECTIONS_STORAGE_KEY = "markdown-viewer.sidebarSections";
const MIN_WORKSPACE_ZOOM = 0.8;
const MAX_WORKSPACE_ZOOM = 1.8;
const WORKSPACE_ZOOM_STEP = 0.05;

type TypographySettings = {
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacingEm: number;
};

type SidebarSectionId = "history" | "outline" | "format";
type SidebarSectionsState = Partial<Record<SidebarSectionId, boolean>>;

const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontSizePx: 14,
  lineHeight: 1.5,
  paragraphSpacingEm: 0.22,
};

const PALETTES: PaletteDefinition[] = [
  {
    id: "caramelo",
    name: "Caramelo",
    light: { a1: "140 107 66", a2: "191 160 122", a3: "165 132 90", a4: "109 82 52" },
    dark: { a1: "213 176 132", a2: "201 169 130", a3: "199 154 103", a4: "176 127 78" },
  },
  {
    id: "oceano",
    name: "Oceano",
    light: { a1: "47 127 130", a2: "93 179 182", a3: "59 157 160", a4: "32 95 99" },
    dark: { a1: "128 212 214", a2: "107 200 203", a3: "81 183 187", a4: "58 163 168" },
  },
  {
    id: "bosque",
    name: "Bosque",
    light: { a1: "47 122 61", a2: "123 189 138", a3: "78 160 95", a4: "34 88 44" },
    dark: { a1: "159 224 173", a2: "134 213 154", a3: "107 200 134", a4: "79 181 111" },
  },
  {
    id: "uva",
    name: "Uva",
    light: { a1: "109 74 168", a2: "181 154 223", a3: "143 107 198", a4: "79 50 123" },
    dark: { a1: "215 192 255", a2: "201 171 255", a3: "179 140 255", a4: "155 114 232" },
  },
  {
    id: "sakura",
    name: "Sakura",
    light: { a1: "178 70 107", a2: "226 162 184", a3: "208 112 147", a4: "127 46 74" },
    dark: { a1: "255 193 214", a2: "255 173 201", a3: "255 139 183", a4: "226 99 154" },
  },
  {
    id: "cobalto",
    name: "Cobalto",
    light: { a1: "47 79 163", a2: "147 168 230", a3: "78 113 207", a4: "32 53 111" },
    dark: { a1: "184 199 255", a2: "164 183 255", a3: "134 160 255", a4: "95 127 230" },
  },
  {
    id: "menta",
    name: "Menta",
    light: { a1: "31 138 106", a2: "134 215 192", a3: "58 182 150", a4: "23 96 74" },
    dark: { a1: "176 241 223", a2: "150 234 212", a3: "110 221 191", a4: "68 200 165" },
  },
  {
    id: "atardecer",
    name: "Atardecer",
    light: { a1: "196 87 45", a2: "240 179 138", a3: "224 123 76", a4: "122 55 31" },
    dark: { a1: "255 201 163", a2: "255 184 138", a3: "255 154 99", a4: "230 122 63" },
  },
  {
    id: "grafito",
    name: "Grafito",
    light: { a1: "71 85 105", a2: "148 163 184", a3: "100 116 139", a4: "31 41 55" },
    dark: { a1: "226 232 240", a2: "203 213 225", a3: "148 163 184", a4: "100 116 139" },
  },
  {
    id: "limon",
    name: "Limon",
    light: { a1: "106 143 0", a2: "207 227 138", a3: "150 184 15", a4: "68 89 0" },
    dark: { a1: "230 255 156", a2: "216 255 122", a3: "194 242 74", a4: "157 214 31" },
  },
];

const PALETTE_BY_ID = new Map<AppPalette, PaletteDefinition>(PALETTES.map((p) => [p.id, p]));
const DEFAULT_PALETTE: AppPalette = "caramelo";

function basename(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

function clamp(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

function inferTitle(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m?.[1]) return m[1].trim();
  }
  for (const line of lines) {
    const clean = line
      .replace(/[`*_~>#-]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .trim();
    if (clean) return clean;
  }
  return "Nota";
}

function slugify(title: string): string {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return "nota";
  return cleaned
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatDateForFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getStoredTheme(): AppTheme | null {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function isAppPalette(value: string | null): value is AppPalette {
  if (!value) return false;
  return PALETTE_BY_ID.has(value as AppPalette);
}

function getStoredPalette(): AppPalette | null {
  const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
  return isAppPalette(stored) ? stored : null;
}

function getInitialTheme(): AppTheme {
  const storedTheme = getStoredTheme();
  if (storedTheme) return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialPalette(): AppPalette {
  const storedPalette = getStoredPalette();
  if (storedPalette) return storedPalette;
  return DEFAULT_PALETTE;
}

function looksLikeMarkdown(text: string): boolean {
  return /(^\s{0,3}#{1,6}\s)|(^\s*[-*+]\s)|(^\s*\d+\.\s)|(^\s{0,3}\$\s+[A-Za-z_])|(\*\*[^*]+\*\*)|(```)|(\[[^\]]+\]\([^)]+\))|(^>\s)/m.test(
    text,
  );
}

function isPossiblyUnsafeUrl(url: string): boolean {
  const compact = url.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  return compact.startsWith("javascript:") || compact.startsWith("vbscript:");
}

function sanitizeInlineLinksInLine(line: string): { line: string; changed: boolean } {
  let changed = false;
  let result = "";
  let i = 0;
  let inCode = false;
  let codeFenceSize = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === "`") {
      let j = i;
      while (j < line.length && line[j] === "`") j += 1;
      const tickCount = j - i;
      if (!inCode) {
        inCode = true;
        codeFenceSize = tickCount;
      } else if (tickCount === codeFenceSize) {
        inCode = false;
        codeFenceSize = 0;
      }
      result += line.slice(i, j);
      i = j;
      continue;
    }

    if (!inCode && ch === "]" && line[i + 1] === "(") {
      result += "](";
      i += 2;

      while (i < line.length && /\s/.test(line[i])) {
        result += line[i];
        i += 1;
      }

      if (i >= line.length) break;

      if (line[i] === "<") {
        result += "<";
        i += 1;
        const destStart = i;
        while (i < line.length && line[i] !== ">") i += 1;
        const dest = line.slice(destStart, i);
        if (isPossiblyUnsafeUrl(dest.replace(/\\/g, ""))) {
          result += "#";
          changed = true;
        } else {
          result += dest;
        }
        if (i < line.length && line[i] === ">") {
          result += ">";
          i += 1;
        }
        continue;
      }

      const destStart = i;
      let depth = 0;
      while (i < line.length) {
        const c = line[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "(") {
          depth += 1;
          i += 1;
          continue;
        }
        if (c === ")") {
          if (depth === 0) break;
          depth -= 1;
          i += 1;
          continue;
        }
        if (/\s/.test(c) && depth === 0) break;
        i += 1;
      }

      const dest = line.slice(destStart, i);
      if (isPossiblyUnsafeUrl(dest.replace(/\\/g, ""))) {
        result += "#";
        changed = true;
      } else {
        result += dest;
      }
      continue;
    }

    result += ch;
    i += 1;
  }

  return { line: result + line.slice(i), changed };
}

function sanitizeMarkdownLinks(markdown: string): { markdown: string; changed: boolean } {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let fenceSize = 0;
  let changed = false;

  for (const rawLine of lines) {
    let line = rawLine;
    const fenceMatch = line.match(/^\s{0,3}([`~]{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceSize = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceSize) {
        inFence = false;
      }
      out.push(line);
      continue;
    }

    if (!inFence) {
      const refDefMatch = line.match(/^(\s*\[[^\]]+]:\s*)(<?)(\S+?)(>?)(\s+.+)?$/);
      if (refDefMatch) {
        const prefix = refDefMatch[1];
        const url = refDefMatch[3];
        const rest = refDefMatch[5] ?? "";
        if (isPossiblyUnsafeUrl(url)) {
          line = `${prefix}#${rest}`;
          changed = true;
        }
      }

      const autolinkBefore = line;
      line = line.replace(/<\s*(javascript|vbscript)\s*:[^>]*>/gi, "<#>");
      if (line !== autolinkBefore) changed = true;

      const htmlAnchorBefore = line;
      line = line.replace(/<a\b[^>]*>/gi, (tag) => {
        const hrefMatch = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        if (!hrefMatch) return tag;
        const hrefRaw = (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "").trim();
        if (!hrefRaw) return tag;
        if (!isPossiblyUnsafeUrl(hrefRaw)) return tag;
        changed = true;
        return tag.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, 'href="#"');
      });
      if (line !== htmlAnchorBefore) changed = true;

      const sanitizedInline = sanitizeInlineLinksInLine(line);
      line = sanitizedInline.line;
      if (sanitizedInline.changed) changed = true;
    }

    out.push(line);
  }

  const next = out.join("\n");
  return { markdown: next, changed };
}

function isMarkdownListLine(line: string): boolean {
  return /^\s{0,3}([-*+])\s+/.test(line) || /^\s{0,3}\d+\.\s+/.test(line);
}

function isShellPromptLine(line: string): boolean {
  return /^\s{0,3}\$\s+[A-Za-z_]/.test(line);
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end -= 1;
  return lines.slice(0, end);
}

function wrapInlineCodePatterns(line: string): string {
  if (line.includes("`")) return line;

  const fileRefRe =
    /\b(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:php|ts|tsx|js|jsx|md|yml|yaml|json|toml|rs|py|go|java|cs|cpp|h|hpp|css|html)\b(?::\d+(?::\d+)?)?/g;
  const dirTokenRe = /\b[A-Za-z0-9][A-Za-z0-9_.-]{3,}\/\b/g;
  const envVarRe = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g;
  const endpointRe = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s)]+)/g;

  let next = line.replace(endpointRe, (_m, method: string, path: string) => `\`${method} ${path}\``);
  next = next.replace(envVarRe, (m) => `\`${m}\``);
  next = next.replace(fileRefRe, (m) => `\`${m}\``);

  if (!next.includes("://")) {
    next = next.replace(dirTokenRe, (m) => `\`${m}\``);
  }

  return next;
}

function isMarkdownBlockLine(line: string): boolean {
  return (
    /^\s{0,3}>{1,}\s+/.test(line) ||
    /^\s{0,3}([`~]{3,})/.test(line) ||
    /^\s{0,3}#{1,6}\s+\S/.test(line) ||
    /^\s{0,3}(-{3,}|_{3,}|\*{3,})\s*$/.test(line)
  );
}

function isProbablySectionTitle(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 88) return false;
  if (/[.!?]\s*$/.test(trimmed)) return false;
  if (/^\$/.test(trimmed)) return false;
  if (isMarkdownListLine(trimmed)) return false;
  if (isMarkdownBlockLine(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  return true;
}

function normalizePastedMarkdown(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let fenceSize = 0;
  let sawAnyHeading = false;

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];

    const fenceMatch = line.match(/^\s{0,3}([`~]{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceSize = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceSize) {
        inFence = false;
      }
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    if (/[ \t]{2,}$/.test(line) && line.trim()) {
      line = `${line.replace(/[ \t]+$/, "")}\\`;
    }

    if (isShellPromptLine(line)) {
      let end = i + 1;
      for (; end < lines.length; end += 1) {
        const current = lines[end];
        if (!current.trim()) {
          let k = end + 1;
          while (k < lines.length && !lines[k].trim()) k += 1;
          if (k >= lines.length) {
            end = k;
            break;
          }
          const nextNonEmpty = lines[k];
          if (isShellPromptLine(nextNonEmpty)) continue;
          if (
            isMarkdownListLine(nextNonEmpty) ||
            /^\s{0,3}>{1,}\s+/.test(nextNonEmpty) ||
            /^\s{0,3}#{1,6}\s+\S/.test(nextNonEmpty) ||
            isProbablySectionTitle(nextNonEmpty.trim())
          ) {
            break;
          }
        }
      }

      const blockLines = trimTrailingBlankLines(lines.slice(i, end));
      out.push("~~~bash", ...blockLines, "~~~", "");
      i = end - 1;
      continue;
    }

    if (/^\s{0,3}#{1,6}\s+\S/.test(line)) {
      sawAnyHeading = true;
      out.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    // Heuristic: "Section title" followed by a blank line and then a list/quote/fence
    // is usually intended as a heading in pasted notes.
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const hasBlankGap = j > i + 1;
    const nextNonEmpty = j < lines.length ? lines[j] : "";
    const nextStartsStructure =
      isMarkdownListLine(nextNonEmpty) ||
      /^\s{0,3}>{1,}\s+/.test(nextNonEmpty) ||
      /^\s{0,3}([`~]{3,})/.test(nextNonEmpty) ||
      isShellPromptLine(nextNonEmpty);

    if (hasBlankGap && nextStartsStructure && isProbablySectionTitle(trimmed)) {
      const leading = line.match(/^\s{0,3}/)?.[0] ?? "";
      const headingLevel = sawAnyHeading || out.some((l) => l.trim()) ? 2 : 1;
      out.push(`${leading}${"#".repeat(headingLevel)} ${trimmed}`);
      sawAnyHeading = true;
      continue;
    }

    line = wrapInlineCodePatterns(line);
    out.push(line);
  }

  return out.join("\n");
}

function normalizeHeadingText(text: string): string {
  return text
    .replace(/!\[[^\]]*]\((?:\\\)|[^)])+\)/g, "")
    .replace(/\[([^\]]+)\]\((?:\\\)|[^)])+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadingEntries(markdown: string): HeadingEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: HeadingEntry[] = [];

  let startIndex = 0;
  while (startIndex < lines.length && !lines[startIndex].trim()) startIndex += 1;
  if (lines[startIndex]?.trim() === "---") {
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const t = lines[i].trim();
      if (t === "---" || t === "...") {
        startIndex = i + 1;
        break;
      }
    }
  }

  let inFence = false;
  let fenceChar = "";
  let fenceSize = 0;

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s{0,3}([`~]{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceSize = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceSize) {
        inFence = false;
      }
      continue;
    }

    if (inFence) continue;

    const atxMatch = line.match(/^\s{0,3}(#{1,6})[ \t]+(.+?)(?:\s+#+\s*)?$/);
    if (atxMatch?.[2]) {
      const text = normalizeHeadingText(atxMatch[2]);
      if (text) {
        entries.push({
          level: atxMatch[1].length,
          text,
          line: i + 1,
        });
      }
      continue;
    }

    if (i >= lines.length - 1) continue;
    if (!/\S/.test(line)) continue;
    const setextLine = lines[i + 1];
    const setextMatch = setextLine.match(/^\s{0,3}(=+|-+)\s*$/);
    if (!setextMatch) continue;

    const text = normalizeHeadingText(line);
    if (!text) {
      i += 1;
      continue;
    }

    entries.push({
      level: setextMatch[1][0] === "=" ? 1 : 2,
      text,
      line: i + 1,
    });
    i += 1;
  }

  return entries;
}

function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): (...args: TArgs) => void {
  let timer: number | undefined;
  return (...args: TArgs) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), waitMs);
  };
}

async function getVaultPaths(): Promise<VaultPaths> {
  const docs = await documentDir();
  const legacyVaultDir = await join(docs, "Markdown Viewer");
  const vaultDirV2 = await join(docs, "Pega e Ignora");
  let vaultDir = vaultDirV2;
  if (!(await exists(vaultDirV2)) && (await exists(legacyVaultDir))) {
    const shouldMigrate = await confirm(
      `Detecté un vault anterior:\n\n${legacyVaultDir}\n\n¿Quieres moverlo a:\n\n${vaultDirV2}\n\n(Esto renombra la carpeta; no borra contenido)`,
      {
        kind: "info",
        title: "Pega e Ignora",
        okLabel: "Mover",
        cancelLabel: "Mantener",
      },
    );
    if (shouldMigrate) {
      try {
        await rename(legacyVaultDir, vaultDirV2);
        vaultDir = vaultDirV2;
      } catch {
        vaultDir = legacyVaultDir;
      }
    } else {
      vaultDir = legacyVaultDir;
    }
  }
  const notesDir = await join(vaultDir, "notes");
  const scratchPath = await join(vaultDir, "scratch.md");
  const historyPath = await join(vaultDir, "history.json");
  return { vaultDir, notesDir, scratchPath, historyPath };
}

async function ensureVault(vault: VaultPaths): Promise<void> {
  await mkdir(vault.vaultDir, { recursive: true });
  await mkdir(vault.notesDir, { recursive: true });
}

async function loadHistory(vault: VaultPaths): Promise<HistoryItem[]> {
  if (!(await exists(vault.historyPath))) return [];
  try {
    const raw = await readTextFile(vault.historyPath);
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        if (typeof obj.path !== "string" || typeof obj.title !== "string") return null;
        const updatedAt = typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now();
        return { path: obj.path, title: obj.title, updatedAt } satisfies HistoryItem;
      })
      .filter((x): x is HistoryItem => Boolean(x));
  } catch {
    return [];
  }
}

async function saveHistory(vault: VaultPaths, history: HistoryItem[]): Promise<void> {
  await writeTextFile(vault.historyPath, JSON.stringify(history, null, 2));
}

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

window.addEventListener("DOMContentLoaded", async () => {
  const appEl = document.querySelector<HTMLElement>("#app");
  const statusEl = document.querySelector<HTMLElement>("#status");
  const workspaceMetaEl = document.querySelector<HTMLElement>("#workspace-meta");
  const editorEl = document.querySelector<HTMLElement>("#editor");
  const workspaceEl = document.querySelector<HTMLElement>(".workspace");
  const historyEl = document.querySelector<HTMLElement>("#history");
  const outlineEl = document.querySelector<HTMLElement>("#outline");
  const resetTypographyBtn = document.querySelector<HTMLButtonElement>("#btn-reset-typography");
  const typographyFontSize = document.querySelector<HTMLInputElement>("#typography-font-size");
  const typographyFontSizeValue = document.querySelector<HTMLElement>("#typography-font-size-value");
  const typographyLineHeight = document.querySelector<HTMLInputElement>("#typography-line-height");
  const typographyLineHeightValue = document.querySelector<HTMLElement>("#typography-line-height-value");
  const typographyParagraphSpacing = document.querySelector<HTMLInputElement>("#typography-paragraph-spacing");
  const typographyParagraphSpacingValue = document.querySelector<HTMLElement>("#typography-paragraph-spacing-value");
  const paletteGrid = document.querySelector<HTMLElement>("#palette-grid");
  const paletteSelectedName = document.querySelector<HTMLElement>("#palette-selected-name");

  const btnNew = document.querySelector<HTMLButtonElement>("#btn-new");
  const btnOpen = document.querySelector<HTMLButtonElement>("#btn-open");
  const btnSave = document.querySelector<HTMLButtonElement>("#btn-save");
  const btnSaveAs = document.querySelector<HTMLButtonElement>("#btn-save-as");
  const btnTheme = document.querySelector<HTMLButtonElement>("#btn-theme");
  const btnReadMode = document.querySelector<HTMLButtonElement>("#btn-read-mode");
  const btnSpellcheck = document.querySelector<HTMLButtonElement>("#btn-spellcheck");
  const btnSettings = document.querySelector<HTMLButtonElement>("#btn-settings");
  const btnOpenVault = document.querySelector<HTMLButtonElement>("#btn-open-vault");
  const btnRefreshHistory = document.querySelector<HTMLButtonElement>("#btn-refresh-history");
  const settingsOverlay = document.querySelector<HTMLElement>("#settings-overlay");
  const settingsCloseBtn = document.querySelector<HTMLButtonElement>("#settings-close");

  if (
    !appEl ||
    !statusEl ||
    !workspaceMetaEl ||
    !editorEl ||
    !workspaceEl ||
    !historyEl ||
    !outlineEl ||
    !resetTypographyBtn ||
    !typographyFontSize ||
    !typographyFontSizeValue ||
    !typographyLineHeight ||
    !typographyLineHeightValue ||
    !typographyParagraphSpacing ||
    !typographyParagraphSpacingValue ||
    !paletteGrid ||
    !paletteSelectedName ||
    !btnNew ||
    !btnOpen ||
    !btnSave ||
    !btnSaveAs ||
    !btnTheme ||
    !btnReadMode ||
    !btnSpellcheck ||
    !btnSettings ||
    !btnOpenVault ||
    !btnRefreshHistory ||
    !settingsOverlay ||
    !settingsCloseBtn
  ) {
    return;
  }

  const toasts = createToastHost();
  const updateStatus = (text: string) => setText(statusEl, text);

  let currentTheme: AppTheme = getInitialTheme();
  let currentPalette: AppPalette = getInitialPalette();
  const paletteButtons = new Map<AppPalette, HTMLButtonElement>();

  const applyPalette = (palette: AppPalette, theme: AppTheme) => {
    const def = PALETTE_BY_ID.get(palette) ?? PALETTE_BY_ID.get(DEFAULT_PALETTE);
    if (!def) return;
    const set = theme === "dark" ? def.dark : def.light;
    const root = document.documentElement;
    root.setAttribute("data-palette", def.id);
    root.style.setProperty("--accent-1-rgb", set.a1);
    root.style.setProperty("--accent-2-rgb", set.a2);
    root.style.setProperty("--accent-3-rgb", set.a3);
    root.style.setProperty("--accent-4-rgb", set.a4);
  };

  const syncPalettePicker = () => {
    const active = PALETTE_BY_ID.get(currentPalette) ?? PALETTE_BY_ID.get(DEFAULT_PALETTE);
    if (active) paletteSelectedName.textContent = active.name;

    for (const def of PALETTES) {
      const button = paletteButtons.get(def.id);
      if (!button) continue;
      const set = currentTheme === "dark" ? def.dark : def.light;
      button.style.setProperty("--sw-a1", `rgb(${set.a1})`);
      button.style.setProperty("--sw-a2", `rgb(${set.a2})`);
      button.style.setProperty("--sw-a3", `rgb(${set.a3})`);
      button.style.setProperty("--sw-a4", `rgb(${set.a4})`);

      const checked = def.id === currentPalette;
      button.setAttribute("aria-checked", checked ? "true" : "false");
      button.tabIndex = checked ? 0 : -1;
    }
  };

  const setPalette = (next: AppPalette, announce = true) => {
    if (!PALETTE_BY_ID.has(next)) return;
    currentPalette = next;
    window.localStorage.setItem(PALETTE_STORAGE_KEY, next);
    applyPalette(currentPalette, currentTheme);
    syncPalettePicker();

    if (announce) {
      const name = PALETTE_BY_ID.get(next)?.name ?? "Paleta";
      updateStatus(`Paleta: ${name}`);
      toasts.show({ kind: "info", message: `Paleta: ${name}` });
    }
  };

  const buildPalettePicker = () => {
    paletteGrid.innerHTML = "";
    paletteButtons.clear();

    for (const def of PALETTES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-option";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-label", `Paleta ${def.name}`);

      const dots = document.createElement("span");
      dots.className = "palette-dots";
      dots.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 4; i += 1) {
        const dot = document.createElement("span");
        dot.className = "palette-dot";
        dots.append(dot);
      }

      const label = document.createElement("span");
      label.className = "palette-name";
      label.textContent = def.name;

      button.append(dots, label);
      button.addEventListener("click", () => setPalette(def.id));

      paletteGrid.append(button);
      paletteButtons.set(def.id, button);
    }

    syncPalettePicker();
  };

  buildPalettePicker();

  const applyTheme = (theme: AppTheme) => {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    btnTheme.textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
    btnTheme.title = theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
    applyPalette(currentPalette, theme);
    syncPalettePicker();
  };
  applyTheme(currentTheme);

  btnTheme.addEventListener("click", () => {
    const nextTheme: AppTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    updateStatus(nextTheme === "dark" ? "Tema oscuro" : "Tema claro");
    toasts.show({ kind: "info", message: nextTheme === "dark" ? "Tema oscuro" : "Tema claro" });
  });

  const readReadModeEnabled = (): boolean => {
    const raw = window.localStorage.getItem(READ_MODE_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return false;
  };

  const writeReadModeEnabled = (enabled: boolean) => {
    window.localStorage.setItem(READ_MODE_STORAGE_KEY, enabled ? "1" : "0");
  };

  const applyReadMode = (enabled: boolean) => {
    appEl.dataset.readMode = enabled ? "true" : "false";
    btnReadMode.textContent = enabled ? "Editar" : "Lectura";
    btnReadMode.title = enabled ? "Salir de modo lectura" : "Entrar a modo lectura";
  };

  let readModeEnabled = readReadModeEnabled();
  applyReadMode(readModeEnabled);

  const readSidebarSectionsState = (): SidebarSectionsState => {
    const raw = window.localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return {};
      const obj = parsed as Record<string, unknown>;
      const state: SidebarSectionsState = {};
      for (const key of ["history", "outline", "format"] satisfies SidebarSectionId[]) {
        if (typeof obj[key] === "boolean") state[key] = obj[key];
      }
      return state;
    } catch {
      return {};
    }
  };

  const writeSidebarSectionsState = (state: SidebarSectionsState) => {
    window.localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(state));
  };

  const animateSidebarContent = (content: HTMLElement, expanded: boolean) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      content.hidden = !expanded;
      content.style.removeProperty("will-change");
      content.style.removeProperty("opacity");
      return;
    }

    const current = Number.parseFloat(content.style.opacity || "");
    if (!Number.isNaN(current)) content.style.opacity = String(current);
    content.style.willChange = "opacity";
    if (expanded) {
      content.hidden = false;
      content.style.opacity = "0";
      requestAnimationFrame(() => {
        content.style.opacity = "1";
      });
    } else {
      content.style.opacity = "1";
      requestAnimationFrame(() => {
        content.style.opacity = "0";
      });
    }
    const onDone = () => {
      content.style.removeProperty("will-change");
      content.style.removeProperty("opacity");
      if (!expanded) content.hidden = true;
    };
    content.addEventListener("transitionend", onDone, { once: true });
    window.setTimeout(onDone, 220);
  };

  const initSidebarSectionToggles = () => {
    const state = readSidebarSectionsState();
    const defaultCollapsed: Record<SidebarSectionId, boolean> = {
      history: false,
      outline: false,
      format: true,
    };
    const toggles = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar-section-toggle"));
    const resolve = (toggle: HTMLButtonElement) => {
      const section = (toggle.dataset.section ?? "") as SidebarSectionId;
      const contentId = toggle.getAttribute("aria-controls") ?? "";
      const content = contentId ? document.getElementById(contentId) : null;
      const container = toggle.closest<HTMLElement>(".sidebar-section");
      if (!content || !container) return null;
      return { section, content, container };
    };

    const setExpanded = (
      toggle: HTMLButtonElement,
      content: HTMLElement,
      container: HTMLElement,
      expanded: boolean,
      animate: boolean,
    ) => {
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      container.dataset.collapsed = expanded ? "false" : "true";
      if (!animate) {
        content.hidden = !expanded;
        return;
      }
      animateSidebarContent(content, expanded);
    };

    for (const toggle of toggles) {
      const resolved = resolve(toggle);
      if (!resolved) continue;
      const expanded = !(state[resolved.section] ?? defaultCollapsed[resolved.section] ?? false);
      setExpanded(toggle, resolved.content, resolved.container, expanded, false);

      toggle.addEventListener("click", () => {
        const currentExpanded = toggle.getAttribute("aria-expanded") === "true";
        const nextExpanded = !currentExpanded;
        setExpanded(toggle, resolved.content, resolved.container, nextExpanded, true);
        state[resolved.section] = !nextExpanded;
        writeSidebarSectionsState(state);
      });
    }
  };

  initSidebarSectionToggles();

  const readSpellcheckEnabled = (): boolean => {
    const raw = window.localStorage.getItem(SPELLCHECK_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true;
  };

  const writeSpellcheckEnabled = (enabled: boolean) => {
    window.localStorage.setItem(SPELLCHECK_STORAGE_KEY, enabled ? "1" : "0");
  };

  const setSpellcheck = (el: HTMLElement, enabled: boolean) => {
    (el as unknown as { spellcheck: boolean }).spellcheck = enabled;
    el.setAttribute("spellcheck", enabled ? "true" : "false");
    el.setAttribute("lang", "es");
  };

  const applySpellcheckToEditor = (enabled: boolean) => {
    document.documentElement.setAttribute("lang", "es");
    for (const node of editorEl.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
      setSpellcheck(node, enabled);
    }
    for (const node of editorEl.querySelectorAll<HTMLTextAreaElement>("textarea")) {
      node.spellcheck = enabled;
      node.setAttribute("spellcheck", enabled ? "true" : "false");
      node.setAttribute("lang", "es");
    }
  };

  const applyOrderedListStartFix = () => {
    for (const ol of editorEl.querySelectorAll<HTMLOListElement>(".ProseMirror ol[start]")) {
      const startRaw = ol.getAttribute("start") ?? "";
      const start = Number.parseInt(startRaw, 10);
      if (!Number.isFinite(start) || start <= 1) {
        ol.removeAttribute("data-counter-start");
        ol.style.removeProperty("--pm-ol-start");
        continue;
      }
      ol.setAttribute("data-counter-start", "true");
      ol.style.setProperty("--pm-ol-start", String(Math.max(0, start - 1)));
    }
  };

  const updateSpellcheckButton = (enabled: boolean) => {
    btnSpellcheck.textContent = enabled ? "Ortografía: Sí" : "Ortografía: No";
    btnSpellcheck.title = enabled
      ? "Ortografía activada (Español). Click para desactivar."
      : "Ortografía desactivada. Click para activar.";
  };

  let spellcheckEnabled = readSpellcheckEnabled();
  updateSpellcheckButton(spellcheckEnabled);

  const readTypographySettings = (): TypographySettings => {
    const raw = window.localStorage.getItem(TYPOGRAPHY_STORAGE_KEY);
    if (!raw) return DEFAULT_TYPOGRAPHY;
    try {
      const parsed = JSON.parse(raw) as Partial<TypographySettings>;
      return {
        fontSizePx: clampNumber(Number(parsed.fontSizePx ?? DEFAULT_TYPOGRAPHY.fontSizePx), 12, 22),
        lineHeight: clampNumber(Number(parsed.lineHeight ?? DEFAULT_TYPOGRAPHY.lineHeight), 1.2, 2.2),
        paragraphSpacingEm: clampNumber(
          Number(parsed.paragraphSpacingEm ?? DEFAULT_TYPOGRAPHY.paragraphSpacingEm),
          0,
          0.6,
        ),
      };
    } catch {
      return DEFAULT_TYPOGRAPHY;
    }
  };

  const writeTypographySettings = (settings: TypographySettings) => {
    window.localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(settings));
  };

  const applyTypographySettings = (settings: TypographySettings) => {
    editorEl.style.setProperty("--md-font-size", `${settings.fontSizePx}px`);
    editorEl.style.setProperty("--md-line-height", String(settings.lineHeight));
    editorEl.style.setProperty("--md-paragraph-spacing", `${settings.paragraphSpacingEm}em`);
  };

  const updateTypographyControls = (settings: TypographySettings) => {
    typographyFontSize.value = String(settings.fontSizePx);
    setText(typographyFontSizeValue, `${settings.fontSizePx}px`);

    typographyLineHeight.value = String(settings.lineHeight);
    setText(typographyLineHeightValue, settings.lineHeight.toFixed(2));

    typographyParagraphSpacing.value = String(settings.paragraphSpacingEm);
    setText(typographyParagraphSpacingValue, `${settings.paragraphSpacingEm.toFixed(2)}em`);
  };

  let typographySettings = readTypographySettings();
  applyTypographySettings(typographySettings);
  updateTypographyControls(typographySettings);

  const onTypographyChanged = () => {
    typographySettings = {
      fontSizePx: clampNumber(Number(typographyFontSize.value), 12, 22),
      lineHeight: clampNumber(Number(typographyLineHeight.value), 1.2, 2.2),
      paragraphSpacingEm: clampNumber(Number(typographyParagraphSpacing.value), 0, 0.6),
    };
    applyTypographySettings(typographySettings);
    updateTypographyControls(typographySettings);
    writeTypographySettings(typographySettings);
  };

  typographyFontSize.addEventListener("input", onTypographyChanged);
  typographyLineHeight.addEventListener("input", onTypographyChanged);
  typographyParagraphSpacing.addEventListener("input", onTypographyChanged);

  resetTypographyBtn.addEventListener("click", () => {
    typographySettings = DEFAULT_TYPOGRAPHY;
    applyTypographySettings(typographySettings);
    updateTypographyControls(typographySettings);
    window.localStorage.removeItem(TYPOGRAPHY_STORAGE_KEY);
    setText(statusEl, "Formato restablecido");
  });

  const editor = new Editor({
    el: editorEl,
    height: "100%",
    initialEditType: "wysiwyg",
    previewStyle: "tab",
    hideModeSwitch: true,
    usageStatistics: false,
    placeholder: "Escribe aquí…",
    extendedAutolinks: true,
    referenceDefinition: true,
    frontMatter: true,
    toolbarItems: [
      ["heading", "bold", "italic", "strike"],
      ["hr", "quote"],
      ["ul", "ol", "task", "indent", "outdent"],
      ["table", "link", "code", "codeblock"],
    ],
  });

  const findReplace = createFindReplace({ editor });

  const syncEditorDomEnhancements = () => {
    applySpellcheckToEditor(spellcheckEnabled);
    applyOrderedListStartFix();
  };

  syncEditorDomEnhancements();
  const syncEditorDomEnhancementsDebounced = debounce(() => syncEditorDomEnhancements(), 50);
  const editorDomObserver = new MutationObserver(() => syncEditorDomEnhancementsDebounced());
  editorDomObserver.observe(editorEl, { childList: true, subtree: true });

  btnSpellcheck.addEventListener("click", () => {
    spellcheckEnabled = !spellcheckEnabled;
    writeSpellcheckEnabled(spellcheckEnabled);
    updateSpellcheckButton(spellcheckEnabled);
    syncEditorDomEnhancements();
    const msg = spellcheckEnabled ? "Ortografía activada" : "Ortografía desactivada";
    setText(statusEl, msg);
    toasts.show({ kind: "info", message: msg });
  });

  btnReadMode.addEventListener("click", () => {
    readModeEnabled = !readModeEnabled;
    writeReadModeEnabled(readModeEnabled);
    applyReadMode(readModeEnabled);
    const msg = readModeEnabled ? "Modo lectura" : "Modo edición";
    setText(statusEl, msg);
    toasts.show({ kind: "info", message: msg });
  });

  let suppressEditorChange = false;
  let renderOutline = () => {};
  const getEditorValue = () => editor.getMarkdown();
  const setEditorValue = (markdown: string): { markdown: string; hadUnsafeLinks: boolean } => {
    const sanitized = sanitizeMarkdownLinks(markdown);
    suppressEditorChange = true;
    editor.setMarkdown(sanitized.markdown, false);
    suppressEditorChange = false;
    renderOutline();
    return { markdown: sanitized.markdown, hadUnsafeLinks: sanitized.changed };
  };

  let workspaceZoom = 1;
  const storedWorkspaceZoom = Number(window.localStorage.getItem(WORKSPACE_ZOOM_STORAGE_KEY));
  if (Number.isFinite(storedWorkspaceZoom)) {
    workspaceZoom = clampNumber(storedWorkspaceZoom, MIN_WORKSPACE_ZOOM, MAX_WORKSPACE_ZOOM);
  }
  const applyWorkspaceZoom = () => {
    editorEl.style.setProperty("--workspace-zoom", workspaceZoom.toFixed(2));
  };
  applyWorkspaceZoom();

  const paletteSelectionActions: CommandPaletteAction[] = PALETTES.map((p) => ({
    id: `palette.${p.id}`,
    title: `Paleta: ${p.name}`,
    subtitle: "Cambiar colores de la app",
    group: "Paleta",
    keywords: ["paleta", "colores", "tema", p.id, p.name],
  }));

  const basePaletteActions: CommandPaletteAction[] = [
    { id: "view.theme", title: "Cambiar tema", subtitle: "Claro / Oscuro", group: "Vista" },
    { id: "view.readMode", title: "Modo lectura", subtitle: "Ocultar sidebar", group: "Vista", keywords: ["lectura"] },
    { id: "tools.spellcheck", title: "Ortografía", subtitle: "Mostrar/ocultar subrayados", group: "Herramientas" },
    {
      id: "tools.find",
      title: "Buscar…",
      subtitle: "Buscar en el documento",
      shortcut: "Ctrl+F",
      group: "Herramientas",
      keywords: ["find", "buscar"],
    },
    {
      id: "tools.replace",
      title: "Reemplazar…",
      subtitle: "Buscar y reemplazar",
      shortcut: "Ctrl+H",
      group: "Herramientas",
      keywords: ["replace", "reemplazar"],
    },
    ...paletteSelectionActions,
  ];

  let palette = createCommandPalette({
    actions: basePaletteActions,
    title: "Comandos",
    placeholder: "Escribe para buscar…",
    onRun: (actionId) => {
      if (actionId.startsWith("palette.")) {
        const next = actionId.slice("palette.".length);
        if (isAppPalette(next)) setPalette(next);
        return;
      }

      if (actionId === "view.theme") {
        btnTheme.click();
        return;
      }
      if (actionId === "view.readMode") {
        btnReadMode.click();
        return;
      }
      if (actionId === "tools.spellcheck") {
        btnSpellcheck.click();
        return;
      }
      if (actionId === "tools.find") {
        findReplace.openFind();
        return;
      }
      if (actionId === "tools.replace") {
        findReplace.openReplace();
      }
    },
  });

  let settingsOpen = false;
  let settingsLastActive: HTMLElement | null = null;
  let settingsHideTimer: number | null = null;

  const reduceMotionEnabled = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const closeSettings = () => {
    if (!settingsOpen) return;
    settingsOpen = false;
    settingsOverlay.dataset.state = "closed";
    window.removeEventListener("keydown", onSettingsKeyDown, true);

    const restoreFocus = () => {
      const nextFocus = settingsLastActive;
      settingsLastActive = null;
      if (nextFocus && typeof nextFocus.focus === "function") {
        window.setTimeout(() => nextFocus.focus(), 0);
      }
    };

    if (settingsHideTimer !== null) {
      window.clearTimeout(settingsHideTimer);
      settingsHideTimer = null;
    }

    if (reduceMotionEnabled()) {
      settingsOverlay.hidden = true;
      restoreFocus();
      return;
    }

    settingsHideTimer = window.setTimeout(() => {
      settingsHideTimer = null;
      settingsOverlay.hidden = true;
      restoreFocus();
    }, 170);
  };

  const onSettingsKeyDown = (event: KeyboardEvent) => {
    if (!settingsOpen) return;
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeSettings();
  };

  const openSettings = () => {
    if (settingsOpen) return;
    settingsOpen = true;
    settingsLastActive = (document.activeElement as HTMLElement | null) ?? null;

    if (settingsHideTimer !== null) {
      window.clearTimeout(settingsHideTimer);
      settingsHideTimer = null;
    }

    palette.close();
    if (findReplace.isOpen()) findReplace.close();

    settingsOverlay.hidden = false;
    settingsOverlay.dataset.state = "open";
    window.addEventListener("keydown", onSettingsKeyDown, true);

    window.setTimeout(() => {
      settingsCloseBtn.focus();
    }, 0);
  };

  const toggleSettings = () => (settingsOpen ? closeSettings() : openSettings());

  settingsOverlay.addEventListener("mousedown", (event) => {
    if (event.target !== settingsOverlay) return;
    closeSettings();
  });

  settingsCloseBtn.addEventListener("click", closeSettings);
  btnSettings.addEventListener("click", toggleSettings);

  const shortcutsPreVault = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const cmdOrCtrl = e.ctrlKey || e.metaKey;
    if (!cmdOrCtrl) return;
    if (key === "k") {
      e.preventDefault();
      palette.toggle();
      return;
    }
    if (key === "f") {
      e.preventDefault();
      findReplace.openFind();
      return;
    }
    if (key === "h") {
      e.preventDefault();
      findReplace.openReplace();
    }
  };

  window.addEventListener("keydown", shortcutsPreVault);

  let vault: VaultPaths;
  try {
    vault = await getVaultPaths();
    await ensureVault(vault);
  } catch (err) {
    try {
      await message(`No pude crear la carpeta del vault.\n\n${String(err)}`, {
        kind: "error",
        title: "Pega e Ignora",
      });
    } catch {
      updateStatus("Vault no disponible");
      toasts.show({ kind: "error", message: "Vault no disponible (solo modo lectura)." });
    }

    btnOpen.disabled = true;
    btnSave.disabled = true;
    btnSaveAs.disabled = true;
    btnOpenVault.disabled = true;
    btnRefreshHistory.disabled = true;
    return;
  }

  let currentPath: string | null = null;
  let history: HistoryItem[] = await loadHistory(vault);
  let isDirty = false;

  const normalizeForCompare = (p: string) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
  const vaultDirNorm = normalizeForCompare(vault.vaultDir);
  const isInsideVault = (p: string) => {
    const norm = normalizeForCompare(p);
    return norm === vaultDirNorm || norm.startsWith(vaultDirNorm + "/");
  };

  const updateMeta = () => {
    const fileLabel = currentPath ? basename(currentPath) : "(sin archivo)";
    setText(workspaceMetaEl, `${fileLabel}${isDirty ? " • editando" : ""}`);
  };

  editorEl.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";
      if (!href) return;

      if (isPossiblyUnsafeUrl(href)) {
        event.preventDefault();
        event.stopPropagation();
        anchor.setAttribute("href", "#");
        updateStatus("Link bloqueado por seguridad.");
        toasts.show({ kind: "warning", message: "Link bloqueado por seguridad." });
        return;
      }

      const mouseEvent = event as MouseEvent;
      if (!(mouseEvent.ctrlKey || mouseEvent.metaKey)) return;
      if (!/^(https?:|mailto:|tel:)/i.test(href)) return;

      event.preventDefault();
      void (async () => {
        try {
          await openPath(href);
        } catch {
          // ignore
        }
      })();
    },
    { capture: true },
  );

  const debouncedAutosave = debounce(async () => {
    try {
      await writeTextFile(vault.scratchPath, getEditorValue());
    } catch {
      // autosave best-effort
    }
  }, 450);

  const renderHistory = () => {
    historyEl.innerHTML = "";
    if (history.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "Aún no hay historial. Guarda algo y aparecerá aquí.";
      historyEl.append(empty);
      return;
    }

    for (const item of history) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";

      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = clamp(item.title, 44);

      const meta = document.createElement("span");
      meta.className = "history-meta";
      meta.textContent = `${basename(item.path)} • ${new Date(item.updatedAt).toLocaleString()}`;

      btn.append(title, meta);
      btn.addEventListener("click", async () => {
        if (isDirty) {
          const ok = await confirm("Tienes cambios sin guardar. ¿Abrir igual?", {
            kind: "warning",
            title: "Pega e Ignora",
            okLabel: "Abrir",
            cancelLabel: "Cancelar",
          });
          if (!ok) return;
        }
        await openNote(item.path);
      });

      historyEl.append(btn);
    }
  };

  const jumpToHeading = (entry: HeadingEntry) => {
    try {
      editor.setSelection([entry.line, 1], [entry.line, 1]);
      editor.focus();
      updateStatus(`Sección: ${entry.text}`);
      return;
    } catch {
      // fallback to DOM query below
    }

    const headingNodes = Array.from(
      editorEl.querySelectorAll<HTMLElement>(
        ".toastui-editor-ww-container .ProseMirror h1, .toastui-editor-ww-container .ProseMirror h2, .toastui-editor-ww-container .ProseMirror h3, .toastui-editor-ww-container .ProseMirror h4, .toastui-editor-ww-container .ProseMirror h5, .toastui-editor-ww-container .ProseMirror h6",
      ),
    );
    const target = headingNodes.find((node) => {
      const nodeLevel = Number(node.tagName.slice(1));
      const nodeText = (node.textContent ?? "").trim();
      return nodeLevel === entry.level && nodeText === entry.text;
    });
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      updateStatus(`Sección: ${entry.text}`);
    }
  };

  renderOutline = () => {
    outlineEl.innerHTML = "";
    const headings = extractHeadingEntries(getEditorValue());
    if (headings.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "Sin encabezados. Usa #, ##, ### para crear jerarquía.";
      outlineEl.append(empty);
      return;
    }

    for (const entry of headings.slice(0, 240)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "outline-item";
      btn.setAttribute("data-level", String(entry.level));
      btn.style.setProperty("--outline-level", String(entry.level));
      btn.title = `${entry.text} (línea ${entry.line})`;

      const level = document.createElement("span");
      level.className = "outline-level";
      level.textContent = `H${entry.level}`;

      const text = document.createElement("span");
      text.className = "outline-text";
      text.textContent = clamp(entry.text, 80);

      const line = document.createElement("span");
      line.className = "outline-line";
      line.textContent = `L${entry.line}`;

      btn.append(level, text, line);
      btn.addEventListener("click", () => jumpToHeading(entry));
      outlineEl.append(btn);
    }
  };
  const debouncedOutlineRender = debounce(renderOutline, 120);

  const upsertHistory = async (path: string, title: string) => {
    const updatedAt = Date.now();
    history = [
      { path, title, updatedAt },
      ...history.filter((h) => h.path !== path),
    ].slice(0, 40);
    renderHistory();
    try {
      await saveHistory(vault, history);
    } catch {
      // best-effort
    }
  };

  const openNote = async (path: string) => {
    if (!isInsideVault(path)) {
      await message(
        `Por ahora esta app solo abre/guarda dentro del vault:\n\n${vault.vaultDir}`,
        { kind: "warning", title: "Pega e Ignora" },
      );
      return;
    }
    try {
      const content = await readTextFile(path);
      const { markdown, hadUnsafeLinks } = setEditorValue(content);
      currentPath = path;
      isDirty = false;
      updateMeta();
      updateStatus(
        `Abierto: ${basename(path)}${hadUnsafeLinks ? " • links inseguros bloqueados (guarda para aplicar)" : ""}`,
      );
      toasts.show({ kind: "info", message: `Abierto: ${basename(path)}` });
      await upsertHistory(path, inferTitle(markdown));
    } catch (err) {
      await message(`No pude abrir el archivo.\n\n${String(err)}`, {
        kind: "error",
        title: "Pega e Ignora",
      });
    }
  };

  const saveToPath = async (path: string) => {
    if (!isInsideVault(path)) {
      await message(
        `Por ahora esta app solo guarda dentro del vault:\n\n${vault.vaultDir}`,
        { kind: "warning", title: "Pega e Ignora" },
      );
      return;
    }
    try {
      const markdownRaw = getEditorValue();
      const sanitized = sanitizeMarkdownLinks(markdownRaw);
      await writeTextFile(path, sanitized.markdown);
      if (sanitized.changed) setEditorValue(sanitized.markdown);
      currentPath = path;
      isDirty = false;
      updateMeta();
      updateStatus(`Guardado: ${basename(path)}${sanitized.changed ? " • links inseguros bloqueados" : ""}`);
      toasts.show({ kind: "success", message: `Guardado: ${basename(path)}` });
      await upsertHistory(path, inferTitle(sanitized.markdown));
    } catch (err) {
      await message(`No pude guardar el archivo.\n\n${String(err)}`, {
        kind: "error",
        title: "Pega e Ignora",
      });
    }
  };

  const saveNewNote = async () => {
    const title = inferTitle(getEditorValue());
    const filename = `${formatDateForFilename(new Date())}_${slugify(title)}.md`;
    const path = await join(vault.notesDir, filename);
    await saveToPath(path);
  };

  const openVaultExplorerAndOpenNote = async () => {
    const selected = await openVaultExplorer({
      vaultDir: vault.vaultDir,
      notesDir: vault.notesDir,
      title: "Explorar notas",
    });
    if (!selected) return;
    await openNote(selected);
  };

  const paletteActions: CommandPaletteAction[] = [
    {
      id: "file.new",
      title: "Nuevo documento",
      subtitle: "Limpiar editor",
      shortcut: "Ctrl+N",
      group: "Archivo",
      keywords: ["nuevo", "limpiar"],
    },
    { id: "file.open", title: "Abrir…", subtitle: "Elegir un .md", shortcut: "Ctrl+O", group: "Archivo" },
    { id: "file.save", title: "Guardar", subtitle: "Guardar cambios", shortcut: "Ctrl+S", group: "Archivo" },
    {
      id: "file.saveAs",
      title: "Guardar como…",
      subtitle: "Guardar en otra ruta",
      shortcut: "Ctrl+Shift+S",
      group: "Archivo",
      keywords: ["exportar"],
    },
    {
      id: "vault.explore",
      title: "Explorar notas…",
      subtitle: "Buscar y abrir dentro del vault",
      group: "Vault",
      keywords: ["vault", "notes", "notas"],
    },
    { id: "vault.folder", title: "Abrir carpeta del vault", subtitle: "Abrir en Explorer", group: "Vault" },
    { id: "history.refresh", title: "Actualizar historial", group: "Vault", keywords: ["recientes"] },
    { id: "view.theme", title: "Cambiar tema", subtitle: "Claro / Oscuro", group: "Vista" },
    { id: "view.readMode", title: "Modo lectura", subtitle: "Ocultar sidebar", group: "Vista", keywords: ["lectura"] },
    { id: "tools.spellcheck", title: "Ortografía", subtitle: "Mostrar/ocultar subrayados", group: "Herramientas" },
    {
      id: "tools.find",
      title: "Buscar…",
      subtitle: "Buscar en el documento",
      shortcut: "Ctrl+F",
      group: "Herramientas",
      keywords: ["find", "buscar"],
    },
    {
      id: "tools.replace",
      title: "Reemplazar…",
      subtitle: "Buscar y reemplazar",
      shortcut: "Ctrl+H",
      group: "Herramientas",
      keywords: ["replace", "reemplazar"],
    },
    ...paletteSelectionActions,
  ];

  palette.destroy();
  palette = createCommandPalette({
    actions: paletteActions,
    title: "Comandos",
    placeholder: "Escribe para buscar…",
    onRun: (actionId) => {
      void (async () => {
        if (actionId.startsWith("palette.")) {
          const next = actionId.slice("palette.".length);
          if (isAppPalette(next)) setPalette(next);
          return;
        }

        if (actionId === "file.new") {
          if (!(await maybeDiscardChanges())) return;
          setEditorValue("");
          currentPath = null;
          isDirty = false;
          updateMeta();
          updateStatus("Nuevo documento");
          toasts.show({ kind: "info", message: "Nuevo documento" });
          return;
        }

        if (actionId === "file.open") {
          if (!(await maybeDiscardChanges())) return;
          const selection = await dialogOpen({
            title: "Abrir Markdown",
            defaultPath: vault.notesDir,
            filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
            multiple: false,
            directory: false,
          });
          if (!selection) return;
          const path = Array.isArray(selection) ? selection[0] : selection;
          if (typeof path === "string") await openNote(path);
          return;
        }

        if (actionId === "file.save") {
          if (currentPath) {
            await saveToPath(currentPath);
          } else {
            await saveNewNote();
          }
          return;
        }

        if (actionId === "file.saveAs") {
          const savePath = await dialogSave({
            title: "Guardar Markdown como…",
            defaultPath: await join(vault.notesDir, `${slugify(inferTitle(getEditorValue()))}.md`),
            filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
          });
          if (savePath) await saveToPath(savePath);
          return;
        }

        if (actionId === "vault.explore") {
          await openVaultExplorerAndOpenNote();
          return;
        }

        if (actionId === "vault.folder") {
          try {
            await openPath(vault.notesDir);
            toasts.show({ kind: "info", message: "Carpeta del vault abierta" });
          } catch {
            // ignore
          }
          return;
        }

        if (actionId === "history.refresh") {
          history = await loadHistory(vault);
          renderHistory();
          updateStatus("Historial actualizado");
          toasts.show({ kind: "info", message: "Historial actualizado" });
          return;
        }

        if (actionId === "view.theme") {
          const nextTheme: AppTheme = currentTheme === "light" ? "dark" : "light";
          applyTheme(nextTheme);
          updateStatus(nextTheme === "dark" ? "Tema oscuro" : "Tema claro");
          toasts.show({ kind: "info", message: nextTheme === "dark" ? "Tema oscuro" : "Tema claro" });
          return;
        }

        if (actionId === "view.readMode") {
          readModeEnabled = !readModeEnabled;
          writeReadModeEnabled(readModeEnabled);
          applyReadMode(readModeEnabled);
          updateStatus(readModeEnabled ? "Modo lectura" : "Modo edición");
          toasts.show({ kind: "info", message: readModeEnabled ? "Modo lectura" : "Modo edición" });
          return;
        }

        if (actionId === "tools.spellcheck") {
          spellcheckEnabled = !spellcheckEnabled;
          writeSpellcheckEnabled(spellcheckEnabled);
          updateSpellcheckButton(spellcheckEnabled);
          syncEditorDomEnhancements();
          const msg = spellcheckEnabled ? "Ortografía activada" : "Ortografía desactivada";
          setText(statusEl, msg);
          toasts.show({ kind: "info", message: msg });
          return;
        }

        if (actionId === "tools.find") {
          findReplace.openFind();
          return;
        }

        if (actionId === "tools.replace") {
          findReplace.openReplace();
          return;
        }
      })();
    },
  });

  const maybeDiscardChanges = async (): Promise<boolean> => {
    if (!isDirty) return true;
    return await confirm("Tienes cambios sin guardar. ¿Descartar cambios?", {
      kind: "warning",
      title: "Pega e Ignora",
      okLabel: "Descartar",
      cancelLabel: "Cancelar",
    });
  };

  editor.on("change", () => {
    if (suppressEditorChange) return;
    isDirty = true;
    updateMeta();
    debouncedAutosave();
    debouncedOutlineRender();
  });

  let selectAllPrimedAt = 0;
  editorEl.addEventListener(
    "keydown",
    (event) => {
      const key = event.key.toLowerCase();
      const cmdOrCtrl = event.ctrlKey || event.metaKey;
      if (!cmdOrCtrl) return;
      if (key !== "a") return;
      selectAllPrimedAt = Date.now();
    },
    { capture: true },
  );

  editorEl.addEventListener(
    "paste",
    (event) => {
      if (!editor.isWysiwygMode()) return;
      const pastedText = event.clipboardData?.getData("text/plain") ?? "";
      if (!looksLikeMarkdown(pastedText)) return;
      const normalizedText = normalizePastedMarkdown(pastedText);
      const sanitizedText = sanitizeMarkdownLinks(normalizedText);

      const docIsEmpty = !getEditorValue().trim();
      const selectAllPrimed = Date.now() - selectAllPrimedAt < 1500;

      // Only intercept pastes when it's safe to replace the whole document.
      // Otherwise, let ProseMirror handle the paste so selection replacement behaves normally.
      if (!docIsEmpty && !selectAllPrimed) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const applied = setEditorValue(sanitizedText.markdown);
      if (sanitizedText.changed || applied.hadUnsafeLinks) {
        toasts.show({ kind: "warning", message: "Se eliminaron enlaces no seguros del contenido pegado." });
      }

      isDirty = true;
      updateMeta();
      debouncedAutosave();
      debouncedOutlineRender();
    },
    { capture: true },
  );

  const shortcuts = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const cmdOrCtrl = e.ctrlKey || e.metaKey;

    if (palette.isOpen()) {
      if (cmdOrCtrl && key === "k") {
        e.preventDefault();
        palette.toggle();
      }
      return;
    }

    if (!cmdOrCtrl) return;

    if (key === "f") {
      e.preventDefault();
      findReplace.openFind();
      return;
    }

    if (key === "h") {
      e.preventDefault();
      findReplace.openReplace();
      return;
    }

    if (key === "k") {
      e.preventDefault();
      palette.toggle();
      return;
    }

    if (key === "s") {
      e.preventDefault();
      void (async () => {
        if (e.shiftKey) {
          const savePath = await dialogSave({
            title: "Guardar Markdown como…",
            defaultPath: await join(vault.notesDir, `${slugify(inferTitle(getEditorValue()))}.md`),
            filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
          });
          if (savePath) await saveToPath(savePath);
          return;
        }

        if (currentPath) {
          await saveToPath(currentPath);
          return;
        }
        await saveNewNote();
      })();
    }

    if (key === "o") {
      e.preventDefault();
      void (async () => {
        if (!(await maybeDiscardChanges())) return;
        const selection = await dialogOpen({
          title: "Abrir Markdown",
          defaultPath: vault.notesDir,
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
          multiple: false,
          directory: false,
        });
        if (!selection) return;
        const path = Array.isArray(selection) ? selection[0] : selection;
        if (typeof path === "string") await openNote(path);
      })();
    }

    if (key === "n") {
      e.preventDefault();
      void (async () => {
        if (!(await maybeDiscardChanges())) return;
        setEditorValue("");
        currentPath = null;
        isDirty = false;
        updateMeta();
        updateStatus("Nuevo documento");
        toasts.show({ kind: "info", message: "Nuevo documento" });
      })();
    }
  };

  window.removeEventListener("keydown", shortcutsPreVault);
  window.addEventListener("keydown", shortcuts);

  btnNew.addEventListener("click", () => {
    const event = new KeyboardEvent("keydown", { key: "n", ctrlKey: true });
    window.dispatchEvent(event);
  });

  btnOpen.addEventListener("click", () => {
    const event = new KeyboardEvent("keydown", { key: "o", ctrlKey: true });
    window.dispatchEvent(event);
  });

  btnSave.addEventListener("click", () => {
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });
    window.dispatchEvent(event);
  });

  btnSaveAs.addEventListener("click", () => {
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, shiftKey: true });
    window.dispatchEvent(event);
  });

  workspaceEl.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY < 0 ? WORKSPACE_ZOOM_STEP : -WORKSPACE_ZOOM_STEP;
      const nextZoom = clampNumber(workspaceZoom + delta, MIN_WORKSPACE_ZOOM, MAX_WORKSPACE_ZOOM);
      if (nextZoom === workspaceZoom) return;
      workspaceZoom = nextZoom;
      applyWorkspaceZoom();
      window.localStorage.setItem(WORKSPACE_ZOOM_STORAGE_KEY, workspaceZoom.toFixed(2));
    },
    { passive: false },
  );

  btnRefreshHistory.addEventListener("click", async () => {
    history = await loadHistory(vault);
    renderHistory();
    updateStatus("Historial actualizado");
    toasts.show({ kind: "info", message: "Historial actualizado" });
  });

  btnOpenVault.addEventListener("click", async () => {
    try {
      await openPath(vault.notesDir);
    } catch {
      // ignore
    }
  });

  // Bootstrap initial content
  if (await exists(vault.scratchPath)) {
    try {
      setEditorValue(await readTextFile(vault.scratchPath));
    } catch {
      setEditorValue("");
    }
  } else {
    setEditorValue(`# Pega e Ignora

Esta vista es única: editas y ves el resultado renderizado en el mismo espacio.

## Colores / Jerarquías

- **H2** es verde
- **H3** es amarillo
- Enlaces, tablas, quotes, código… todo con tema oscuro

### Código

\`\`\`ts
type Nota = { titulo: string; contenido: string }
console.log("Hola mundo")
\`\`\`

> Tip: usa \`Ctrl+S\` para guardar en tu carpeta de notas.
`);
    await writeTextFile(vault.scratchPath, getEditorValue());
  }

  updateMeta();
  renderHistory();
  editor.focus();
});
