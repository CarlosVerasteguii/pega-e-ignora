import type { ToastPosition } from "./toast";

export type ToastProfile = "balanced-fast" | "standard";
export type VisualFamily = "studio-slate" | "editorial-warm" | "operator-console";
export type TypographyPresetId = "noto-sans" | "inter" | "atkinson" | "psudo-liga";

export type UiPreferences = {
  toastProfile: ToastProfile;
  toastPosition: ToastPosition;
  reduceMotion: boolean;
  visualFamily: VisualFamily;
};

export type TypographySettings = {
  presetId: TypographyPresetId;
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacingEm: number;
};

export type TypographyPreset = {
  id: TypographyPresetId;
  label: string;
  description: string;
  readingFont: string;
  writingFont: string;
  codeFont: string;
  jsonFont: string;
};

export const UI_PREF_KEYS = {
  toastProfile: "markdown-viewer.toastProfile",
  toastPosition: "markdown-viewer.toastPosition",
  reduceMotion: "markdown-viewer.reduceMotion",
  visualFamily: "markdown-viewer.visualFamily",
  typography: "markdown-viewer.typography",
} as const;

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  toastProfile: "balanced-fast",
  toastPosition: "bottom-right",
  reduceMotion: false,
  visualFamily: "studio-slate",
};

export const DEFAULT_TYPOGRAPHY_SETTINGS: TypographySettings = {
  presetId: "noto-sans",
  fontSizePx: 14,
  lineHeight: 1.5,
  paragraphSpacingEm: 0.22,
};

export const TYPOGRAPHY_PRESETS: readonly TypographyPreset[] = [
  {
    id: "noto-sans",
    label: "Noto Sans",
    description: "La opcion principal para leer documentos largos y densos en pantalla.",
    readingFont: '"Noto Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    writingFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    codeFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    jsonFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    id: "inter",
    label: "Inter",
    description: "Muy buena para lectura digital continua, con ritmo limpio y estable.",
    readingFont: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    writingFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    codeFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    jsonFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    id: "atkinson",
    label: "Atkinson",
    description: "La alternativa con mayor diferenciacion visual para sesiones largas o cansancio ocular.",
    readingFont: '"Atkinson Hyperlegible Next", "Noto Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    writingFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    codeFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    jsonFont: '"Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    id: "psudo-liga",
    label: "Psudo Liga",
    description: "Mantiene la lectura en sans y usa Psudo Liga Mono para escritura, codigo y JSON empaquetados dentro de la app.",
    readingFont: '"Noto Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    writingFont: '"Psudo Liga Mono", "Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    codeFont: '"Psudo Liga Mono", "Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    jsonFont: '"Psudo Liga Mono", "Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
] as const;

export function isToastProfile(value: string | null): value is ToastProfile {
  return value === "balanced-fast" || value === "standard";
}

export function isToastPosition(value: string | null): value is ToastPosition {
  return value === "bottom-right" || value === "top-right";
}

export function isVisualFamily(value: string | null): value is VisualFamily {
  return value === "studio-slate" || value === "editorial-warm" || value === "operator-console";
}

export function isTypographyPresetId(value: string | null): value is TypographyPresetId {
  return value === "noto-sans" || value === "inter" || value === "atkinson" || value === "psudo-liga";
}

function mapLegacyTypographyPresetId(value: string | null): TypographyPresetId | null {
  if (value === "sistema") return "noto-sans";
  if (value === "editorial") return "inter";
  if (value === "tecnica") return "atkinson";
  return null;
}

function mapLegacyThemeToVisualFamily(value: string | null): VisualFamily | null {
  if (!value) return null;
  if (value === "arena" || value === "papel" || value === "solarizado" || value === "cobre" || value === "coral") {
    return "editorial-warm";
  }
  if (value === "tinta" || value === "grafito" || value === "oceano" || value === "nordico") {
    return "studio-slate";
  }
  if (value === "carbon" || value === "noche" || value === "salvia" || value === "oliva" || value === "ciruela" || value === "lavanda") {
    return "operator-console";
  }
  return null;
}

function readBoolean(storageKey: string, fallback: boolean): boolean {
  const raw = window.localStorage.getItem(storageKey);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getDefaultTypographyPreset(): TypographyPreset {
  return TYPOGRAPHY_PRESETS[0];
}

export function getTypographyPreset(presetId: TypographyPresetId): TypographyPreset {
  return TYPOGRAPHY_PRESETS.find((preset) => preset.id === presetId) ?? getDefaultTypographyPreset();
}

export function readUiPreferences(): UiPreferences {
  const toastProfileRaw = window.localStorage.getItem(UI_PREF_KEYS.toastProfile);
  const toastPositionRaw = window.localStorage.getItem(UI_PREF_KEYS.toastPosition);
  const visualFamilyRaw = window.localStorage.getItem(UI_PREF_KEYS.visualFamily);
  const legacyVisualFamily = mapLegacyThemeToVisualFamily(window.localStorage.getItem("markdown-viewer.appTheme"));
  return {
    toastProfile: isToastProfile(toastProfileRaw) ? toastProfileRaw : DEFAULT_UI_PREFERENCES.toastProfile,
    toastPosition: isToastPosition(toastPositionRaw) ? toastPositionRaw : DEFAULT_UI_PREFERENCES.toastPosition,
    reduceMotion: readBoolean(UI_PREF_KEYS.reduceMotion, DEFAULT_UI_PREFERENCES.reduceMotion),
    visualFamily: isVisualFamily(visualFamilyRaw)
      ? visualFamilyRaw
      : (legacyVisualFamily ?? DEFAULT_UI_PREFERENCES.visualFamily),
  };
}

export function writeToastProfile(profile: ToastProfile): void {
  window.localStorage.setItem(UI_PREF_KEYS.toastProfile, profile);
}

export function writeToastPosition(position: ToastPosition): void {
  window.localStorage.setItem(UI_PREF_KEYS.toastPosition, position);
}

export function writeReduceMotion(enabled: boolean): void {
  window.localStorage.setItem(UI_PREF_KEYS.reduceMotion, enabled ? "1" : "0");
}

export function writeVisualFamily(visualFamily: VisualFamily): void {
  window.localStorage.setItem(UI_PREF_KEYS.visualFamily, visualFamily);
}

export function readTypographySettings(): TypographySettings {
  const raw = window.localStorage.getItem(UI_PREF_KEYS.typography);
  if (!raw) return DEFAULT_TYPOGRAPHY_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<TypographySettings>;
    const presetIdRaw = typeof parsed.presetId === "string" ? parsed.presetId : null;
    const legacyPresetId = mapLegacyTypographyPresetId(presetIdRaw);
    return {
      presetId: isTypographyPresetId(presetIdRaw)
        ? presetIdRaw
        : (legacyPresetId ?? DEFAULT_TYPOGRAPHY_SETTINGS.presetId),
      fontSizePx: clampNumber(Number(parsed.fontSizePx ?? DEFAULT_TYPOGRAPHY_SETTINGS.fontSizePx), 12, 22),
      lineHeight: clampNumber(Number(parsed.lineHeight ?? DEFAULT_TYPOGRAPHY_SETTINGS.lineHeight), 1.2, 2.2),
      paragraphSpacingEm: clampNumber(
        Number(parsed.paragraphSpacingEm ?? DEFAULT_TYPOGRAPHY_SETTINGS.paragraphSpacingEm),
        0,
        0.6,
      ),
    };
  } catch {
    return DEFAULT_TYPOGRAPHY_SETTINGS;
  }
}

export function writeTypographySettings(settings: TypographySettings): void {
  window.localStorage.setItem(UI_PREF_KEYS.typography, JSON.stringify(settings));
}
