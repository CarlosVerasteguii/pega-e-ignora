import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { documentDir as tauriDocumentDir, join as tauriJoin } from "@tauri-apps/api/path";
import { getCurrentWindow as tauriGetCurrentWindow, type Window as TauriWindow } from "@tauri-apps/api/window";
import {
  exists as tauriExists,
  mkdir as tauriMkdir,
  readDir as tauriReadDir,
  readTextFile as tauriReadTextFile,
  remove as tauriRemove,
  rename as tauriRename,
  writeTextFile as tauriWriteTextFile,
} from "@tauri-apps/plugin-fs";
import {
  confirm as tauriConfirm,
  message as tauriMessage,
  open as tauriDialogOpen,
  save as tauriDialogSave,
} from "@tauri-apps/plugin-dialog";
import { openPath as tauriOpenPath } from "@tauri-apps/plugin-opener";

type TauriWindowInternals = {
  metadata?: {
    currentWindow?: {
      label?: string;
    };
  };
};

type BrowserFsState = {
  directories: string[];
  files: Record<string, string>;
};

const BROWSER_DOCUMENTS_DIR = "C:\\Users\\Browser\\Documents";
const BROWSER_FS_STORAGE_KEY = "markdown-viewer.browser-fs.v1";

function getTauriInternals(): TauriWindowInternals | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as Window & { __TAURI_INTERNALS__?: TauriWindowInternals };
  return maybeWindow.__TAURI_INTERNALS__ ?? null;
}

export function isTauriRuntime(): boolean {
  return typeof getTauriInternals()?.metadata?.currentWindow?.label === "string";
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";

  let normalized = trimmed.replace(/\//g, "\\").replace(/\\+/g, "\\");
  if (/^[A-Za-z]:$/.test(normalized)) {
    return `${normalized}\\`;
  }

  if (normalized.length > 3) {
    normalized = normalized.replace(/\\+$/, "");
  }

  return normalized;
}

function trimTrailingSlash(path: string): string {
  if (path.length <= 3) return path;
  return path.replace(/\\+$/, "");
}

function trimLeadingSlash(path: string): string {
  return path.replace(/^\\+/, "");
}

function joinBrowserPath(...parts: string[]): string {
  let current = "";

  for (const part of parts) {
    const normalizedPart = normalizePath(part);
    if (!normalizedPart) continue;

    if (!current || /^[A-Za-z]:\\/.test(normalizedPart)) {
      current = normalizedPart;
      continue;
    }

    current = `${trimTrailingSlash(current)}\\${trimLeadingSlash(normalizedPart)}`;
  }

  return normalizePath(current);
}

function parentPath(path: string): string | null {
  const normalized = normalizePath(path);
  const trimmed = trimTrailingSlash(normalized);
  const separatorIndex = trimmed.lastIndexOf("\\");
  if (separatorIndex <= 2) return null;
  return trimmed.slice(0, separatorIndex);
}

function emptyBrowserFsState(): BrowserFsState {
  return {
    directories: [BROWSER_DOCUMENTS_DIR],
    files: {},
  };
}

function readBrowserFsState(): BrowserFsState {
  if (typeof window === "undefined") return emptyBrowserFsState();

  try {
    const raw = window.localStorage.getItem(BROWSER_FS_STORAGE_KEY);
    if (!raw) return emptyBrowserFsState();

    const parsed = JSON.parse(raw) as Partial<BrowserFsState>;
    const directories = Array.isArray(parsed.directories)
      ? parsed.directories.filter((value): value is string => typeof value === "string").map(normalizePath)
      : [];
    const files =
      parsed.files && typeof parsed.files === "object"
        ? Object.fromEntries(
            Object.entries(parsed.files).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(
              ([path, content]) => [normalizePath(path), content],
            ),
          )
        : {};

    return {
      directories: Array.from(new Set([BROWSER_DOCUMENTS_DIR, ...directories])),
      files,
    };
  } catch {
    return emptyBrowserFsState();
  }
}

function writeBrowserFsState(state: BrowserFsState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    BROWSER_FS_STORAGE_KEY,
    JSON.stringify({
      directories: Array.from(new Set(state.directories.map(normalizePath))).sort((a, b) => a.localeCompare(b)),
      files: Object.fromEntries(Object.entries(state.files).sort(([left], [right]) => left.localeCompare(right))),
    }),
  );
}

function ensureDirectoryChain(state: BrowserFsState, path: string): void {
  const directories = new Set(state.directories.map(normalizePath));
  let current: string | null = normalizePath(path);
  while (current) {
    directories.add(current);
    current = parentPath(current);
  }
  directories.add(BROWSER_DOCUMENTS_DIR);
  state.directories = Array.from(directories);
}

function assertBrowserFileExists(state: BrowserFsState, path: string): void {
  if (!(normalizePath(path) in state.files)) {
    throw new Error(`No existe el archivo: ${path}`);
  }
}

type BrowserReadDirEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
};

function browserReadDirEntries(state: BrowserFsState, dirPath: string): BrowserReadDirEntry[] {
  const targetDir = normalizePath(dirPath);
  const entries = new Map<string, BrowserReadDirEntry>();

  for (const directory of state.directories) {
    const parent = parentPath(directory);
    if (parent !== targetDir) continue;
    const name = directory.slice(parent.length + 1);
    if (!name) continue;
    entries.set(name, { name, isDirectory: true, isFile: false, isSymlink: false });
  }

  for (const filePath of Object.keys(state.files)) {
    const parent = parentPath(filePath);
    if (parent !== targetDir) continue;
    const name = filePath.slice(parent.length + 1);
    if (!name) continue;
    entries.set(name, { name, isDirectory: false, isFile: true, isSymlink: false });
  }

  return Array.from(entries.values()).sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export function getCurrentWindow(): TauriWindow | null {
  if (!isTauriRuntime()) return null;

  try {
    return tauriGetCurrentWindow();
  } catch {
    return null;
  }
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`El comando "${command}" solo está disponible en la app de escritorio.`);
  }

  return tauriInvoke<T>(command, args);
}

export async function documentDir(): Promise<string> {
  if (isTauriRuntime()) {
    return tauriDocumentDir();
  }

  return BROWSER_DOCUMENTS_DIR;
}

export async function join(...paths: string[]): Promise<string> {
  if (isTauriRuntime()) {
    return tauriJoin(...paths);
  }

  return joinBrowserPath(...paths);
}

export async function exists(path: string): Promise<boolean> {
  if (isTauriRuntime()) {
    return tauriExists(path);
  }

  const normalizedPath = normalizePath(path);
  const state = readBrowserFsState();
  return state.directories.includes(normalizedPath) || normalizedPath in state.files;
}

export async function mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
  if (isTauriRuntime()) {
    await tauriMkdir(path, options);
    return;
  }

  const normalizedPath = normalizePath(path);
  const state = readBrowserFsState();

  if (options?.recursive) {
    ensureDirectoryChain(state, normalizedPath);
  } else {
    const parent = parentPath(normalizedPath);
    if (parent && !state.directories.includes(parent)) {
      throw new Error(`No existe la carpeta padre: ${parent}`);
    }
    state.directories = Array.from(new Set([...state.directories, normalizedPath]));
  }

  writeBrowserFsState(state);
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauriRuntime()) {
    return tauriReadTextFile(path);
  }

  const state = readBrowserFsState();
  const normalizedPath = normalizePath(path);
  assertBrowserFileExists(state, normalizedPath);
  return state.files[normalizedPath];
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  if (isTauriRuntime()) {
    await tauriWriteTextFile(path, contents);
    return;
  }

  const normalizedPath = normalizePath(path);
  const state = readBrowserFsState();
  const parent = parentPath(normalizedPath);

  if (parent) {
    ensureDirectoryChain(state, parent);
  }

  state.files[normalizedPath] = contents;
  writeBrowserFsState(state);
}

export async function remove(path: string): Promise<void> {
  if (isTauriRuntime()) {
    await tauriRemove(path);
    return;
  }

  const normalizedPath = normalizePath(path);
  const state = readBrowserFsState();

  if (normalizedPath in state.files) {
    delete state.files[normalizedPath];
    writeBrowserFsState(state);
    return;
  }

  const directoryPrefix = `${trimTrailingSlash(normalizedPath)}\\`;
  const nextDirectories = state.directories.filter(
    (directory) => directory !== normalizedPath && !directory.startsWith(directoryPrefix),
  );
  const nextFiles = Object.fromEntries(
    Object.entries(state.files).filter(([filePath]) => !filePath.startsWith(directoryPrefix)),
  );

  if (nextDirectories.length === state.directories.length && Object.keys(nextFiles).length === Object.keys(state.files).length) {
    throw new Error(`No existe la ruta: ${path}`);
  }

  writeBrowserFsState({
    directories: Array.from(new Set([BROWSER_DOCUMENTS_DIR, ...nextDirectories])),
    files: nextFiles,
  });
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  if (isTauriRuntime()) {
    await tauriRename(oldPath, newPath);
    return;
  }

  const state = readBrowserFsState();
  const normalizedOldPath = normalizePath(oldPath);
  const normalizedNewPath = normalizePath(newPath);

  if (normalizedOldPath in state.files) {
    const parent = parentPath(normalizedNewPath);
    if (parent) ensureDirectoryChain(state, parent);
    state.files[normalizedNewPath] = state.files[normalizedOldPath];
    delete state.files[normalizedOldPath];
    writeBrowserFsState(state);
    return;
  }

  const oldPrefix = `${trimTrailingSlash(normalizedOldPath)}\\`;
  const hasDirectory = state.directories.includes(normalizedOldPath);
  if (!hasDirectory) {
    throw new Error(`No existe la ruta: ${oldPath}`);
  }

  const nextDirectories = new Set<string>();
  for (const directory of state.directories) {
    if (directory === normalizedOldPath) {
      nextDirectories.add(normalizedNewPath);
      continue;
    }
    if (directory.startsWith(oldPrefix)) {
      nextDirectories.add(`${trimTrailingSlash(normalizedNewPath)}\\${directory.slice(oldPrefix.length)}`);
      continue;
    }
    nextDirectories.add(directory);
  }

  const nextFiles: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(state.files)) {
    if (filePath.startsWith(oldPrefix)) {
      nextFiles[`${trimTrailingSlash(normalizedNewPath)}\\${filePath.slice(oldPrefix.length)}`] = content;
      continue;
    }
    nextFiles[filePath] = content;
  }

  const nextState: BrowserFsState = {
    directories: Array.from(nextDirectories),
    files: nextFiles,
  };
  ensureDirectoryChain(nextState, normalizedNewPath);
  writeBrowserFsState(nextState);
}

export async function readDir(path: string): Promise<Awaited<ReturnType<typeof tauriReadDir>>> {
  if (isTauriRuntime()) {
    return tauriReadDir(path);
  }

  const state = readBrowserFsState();
  const normalizedPath = normalizePath(path);
  if (!state.directories.includes(normalizedPath)) {
    throw new Error(`No existe la carpeta: ${path}`);
  }

  return browserReadDirEntries(state, normalizedPath);
}

type ConfirmOptions = Parameters<typeof tauriConfirm>[1];
type MessageOptions = Parameters<typeof tauriMessage>[1];
type OpenDialogOptions = Parameters<typeof tauriDialogOpen>[0];
type OpenDialogResult = Awaited<ReturnType<typeof tauriDialogOpen>>;
type SaveDialogOptions = Parameters<typeof tauriDialogSave>[0];
type SaveDialogResult = Awaited<ReturnType<typeof tauriDialogSave>>;

export async function confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  if (isTauriRuntime()) {
    return tauriConfirm(message, options);
  }

  return window.confirm(message);
}

export async function message(message: string, _options?: MessageOptions): Promise<void> {
  if (isTauriRuntime()) {
    await tauriMessage(message, _options);
    return;
  }

  console.info(message);
}

export async function open(options?: OpenDialogOptions): Promise<OpenDialogResult> {
  if (isTauriRuntime()) {
    return tauriDialogOpen(options);
  }

  const initialPath = typeof options?.defaultPath === "string" ? options.defaultPath : "";
  const result = window.prompt(options?.title ?? "Ruta a abrir:", initialPath)?.trim();
  if (!result) return null;
  if (options?.multiple) return [result];
  return result;
}

export async function save(options?: SaveDialogOptions): Promise<SaveDialogResult> {
  if (isTauriRuntime()) {
    return tauriDialogSave(options);
  }

  const initialPath = typeof options?.defaultPath === "string" ? options.defaultPath : "";
  const result = window.prompt(options?.title ?? "Ruta a guardar:", initialPath)?.trim();
  return result || null;
}

export async function openPath(path: string): Promise<void> {
  if (isTauriRuntime()) {
    await tauriOpenPath(path);
    return;
  }

  if (/^(https?:|mailto:|tel:)/i.test(path)) {
    window.open(path, "_blank", "noopener,noreferrer");
    return;
  }

  console.info(`Abrir ruta no soportado en modo navegador: ${path}`);
}
