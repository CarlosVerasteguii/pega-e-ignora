import type { ToastPosition } from "./toast";

export type ToastProfile = "balanced-fast" | "standard";

export type UiPreferences = {
  toastProfile: ToastProfile;
  toastPosition: ToastPosition;
  reduceMotion: boolean;
};

export const UI_PREF_KEYS = {
  toastProfile: "markdown-viewer.toastProfile",
  toastPosition: "markdown-viewer.toastPosition",
  reduceMotion: "markdown-viewer.reduceMotion",
} as const;

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  toastProfile: "balanced-fast",
  toastPosition: "bottom-right",
  reduceMotion: false,
};

export function isToastProfile(value: string | null): value is ToastProfile {
  return value === "balanced-fast" || value === "standard";
}

export function isToastPosition(value: string | null): value is ToastPosition {
  return value === "bottom-right" || value === "top-right";
}

function readBoolean(storageKey: string, fallback: boolean): boolean {
  const raw = window.localStorage.getItem(storageKey);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}

export function readUiPreferences(): UiPreferences {
  const toastProfileRaw = window.localStorage.getItem(UI_PREF_KEYS.toastProfile);
  const toastPositionRaw = window.localStorage.getItem(UI_PREF_KEYS.toastPosition);
  return {
    toastProfile: isToastProfile(toastProfileRaw) ? toastProfileRaw : DEFAULT_UI_PREFERENCES.toastProfile,
    toastPosition: isToastPosition(toastPositionRaw) ? toastPositionRaw : DEFAULT_UI_PREFERENCES.toastPosition,
    reduceMotion: readBoolean(UI_PREF_KEYS.reduceMotion, DEFAULT_UI_PREFERENCES.reduceMotion),
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
