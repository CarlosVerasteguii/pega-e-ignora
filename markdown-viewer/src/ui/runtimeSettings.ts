import { invoke, isTauriRuntime } from "./desktopApi";

export type RuntimeSettings = {
  globalShortcut: string;
  closeToTray: boolean;
  restoreLastSession: boolean;
  launchOnStartup: boolean;
};

export const DEFAULT_GLOBAL_SHORTCUT = "Ctrl+Alt+M";

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  closeToTray: true,
  restoreLastSession: true,
  launchOnStartup: true,
};

const RUNTIME_SETTINGS_STORAGE_KEY = "markdown-viewer.runtime-settings";

const MODIFIER_CANONICAL = new Map<string, "Ctrl" | "Alt" | "Shift" | "Meta">([
  ["ctrl", "Ctrl"],
  ["control", "Ctrl"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["shift", "Shift"],
  ["meta", "Meta"],
  ["super", "Meta"],
  ["cmd", "Meta"],
  ["command", "Meta"],
]);

const PRIMARY_KEY_ALIASES = new Map<string, string>([
  ["esc", "Escape"],
  ["escape", "Escape"],
  ["space", "Space"],
  [" ", "Space"],
  ["enter", "Enter"],
  ["return", "Enter"],
  ["tab", "Tab"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["insert", "Insert"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"],
  ["up", "ArrowUp"],
  ["arrowup", "ArrowUp"],
  ["down", "ArrowDown"],
  ["arrowdown", "ArrowDown"],
  ["left", "ArrowLeft"],
  ["arrowleft", "ArrowLeft"],
  ["right", "ArrowRight"],
  ["arrowright", "ArrowRight"],
  ["plus", "Plus"],
  ["minus", "Minus"],
  ["comma", "Comma"],
  ["period", "Period"],
]);

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePrimaryKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const alias = PRIMARY_KEY_ALIASES.get(trimmed.toLowerCase());
  if (alias) return alias;

  if (/^f\d{1,2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^[a-z0-9]$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^numpad\d$/i.test(trimmed)) {
    return `Numpad${trimmed.slice(-1)}`;
  }

  return trimmed.length <= 24 ? trimmed : null;
}

export function normalizeGlobalShortcut(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return DEFAULT_GLOBAL_SHORTCUT;

  const rawParts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (rawParts.length === 0) return DEFAULT_GLOBAL_SHORTCUT;

  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  let primaryKey: string | null = null;

  for (const part of rawParts) {
    const modifier = MODIFIER_CANONICAL.get(part.toLowerCase());
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    if (primaryKey !== null) {
      return DEFAULT_GLOBAL_SHORTCUT;
    }

    primaryKey = normalizePrimaryKey(part);
    if (!primaryKey) return DEFAULT_GLOBAL_SHORTCUT;
  }

  if (!primaryKey) return DEFAULT_GLOBAL_SHORTCUT;
  if (!modifiers.has("Ctrl") && !modifiers.has("Alt") && !modifiers.has("Shift")) {
    return DEFAULT_GLOBAL_SHORTCUT;
  }

  const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  return [...orderedModifiers, primaryKey].join("+");
}

export function isValidGlobalShortcut(value: string | null | undefined): boolean {
  if (!value) return false;
  return normalizeGlobalShortcut(value) === value;
}

export function humanizeShortcut(value: string | null | undefined): string {
  return normalizeGlobalShortcut(value);
}

export function isValidShortcutString(value: string | null | undefined): boolean {
  return isValidGlobalShortcut(value);
}

export function normalizeRuntimeSettings(value: unknown): RuntimeSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RUNTIME_SETTINGS };
  }

  const candidate = value as Partial<RuntimeSettings>;
  return {
    globalShortcut: normalizeGlobalShortcut(candidate.globalShortcut),
    closeToTray: normalizeBoolean(candidate.closeToTray, DEFAULT_RUNTIME_SETTINGS.closeToTray),
    restoreLastSession: normalizeBoolean(candidate.restoreLastSession, DEFAULT_RUNTIME_SETTINGS.restoreLastSession),
    launchOnStartup: normalizeBoolean(candidate.launchOnStartup, DEFAULT_RUNTIME_SETTINGS.launchOnStartup),
  };
}

function isModifierOnlyKey(key: string): boolean {
  return key === "Control" || key === "Alt" || key === "Shift" || key === "Meta";
}

export function buildShortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (isModifierOnlyKey(event.key)) return null;

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");
  if (!event.ctrlKey && !event.altKey && !event.shiftKey) return null;

  const primaryKey = normalizePrimaryKey(event.key);
  if (!primaryKey) return null;

  const shortcut = [...modifiers, primaryKey].join("+");
  return normalizeGlobalShortcut(shortcut);
}

export function keyboardEventToShortcut(event: KeyboardEvent): string | null {
  return buildShortcutFromKeyboardEvent(event);
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  if (isTauriRuntime()) {
    const result = await invoke<unknown>("get_runtime_settings");
    return normalizeRuntimeSettings(result);
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
    return normalizeRuntimeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_RUNTIME_SETTINGS };
  }
}

export async function updateRuntimeSettings(settings: RuntimeSettings): Promise<RuntimeSettings> {
  const normalized = normalizeRuntimeSettings(settings);

  if (isTauriRuntime()) {
    const result = await invoke<unknown>("update_runtime_settings", {
      settings: normalized,
    });
    return normalizeRuntimeSettings(result);
  }

  window.localStorage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function toggleMainWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("toggle_main_window");
}

export async function exitApplication(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("exit_application");
}
