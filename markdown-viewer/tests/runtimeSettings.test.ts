import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RUNTIME_SETTINGS,
  DEFAULT_GLOBAL_SHORTCUT,
  buildShortcutFromKeyboardEvent,
  getRuntimeSettings,
  humanizeShortcut,
  isValidShortcutString,
  normalizeGlobalShortcut,
  normalizeRuntimeSettings,
  updateRuntimeSettings,
} from "../src/ui/runtimeSettings";

describe("runtimeSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to defaults when values are missing or invalid", () => {
    expect(normalizeRuntimeSettings(null)).toEqual(DEFAULT_RUNTIME_SETTINGS);
    expect(normalizeRuntimeSettings({ globalShortcut: "Shift" }).globalShortcut).toBe(DEFAULT_GLOBAL_SHORTCUT);
  });

  it("normalizes shortcut strings into a stable format", () => {
    expect(normalizeGlobalShortcut(" alt + ctrl + m ")).toBe("Ctrl+Alt+M");
    expect(normalizeGlobalShortcut("shift+f8")).toBe("Shift+F8");
  });

  it("requires at least one modifier and one main key", () => {
    expect(isValidShortcutString("Ctrl+Alt+M")).toBe(true);
    expect(isValidShortcutString("Shift+F8")).toBe(true);
    expect(isValidShortcutString("Ctrl")).toBe(false);
    expect(isValidShortcutString("M")).toBe(false);
  });

  it("extracts shortcuts from keyboard events", () => {
    const shortcut = buildShortcutFromKeyboardEvent(
      new KeyboardEvent("keydown", {
        key: "m",
        ctrlKey: true,
        altKey: true,
      }),
    );
    expect(shortcut).toBe("Ctrl+Alt+M");
  });

  it("renders shortcuts in a readable way", () => {
    expect(humanizeShortcut("ctrl+alt+m")).toBe("Ctrl+Alt+M");
  });

  it("persists runtime settings in browser fallback mode", async () => {
    expect(await getRuntimeSettings()).toEqual(DEFAULT_RUNTIME_SETTINGS);

    const next = await updateRuntimeSettings({
      ...DEFAULT_RUNTIME_SETTINGS,
      globalShortcut: "Ctrl+Shift+J",
      closeToTray: false,
      restoreLastSession: false,
    });

    expect(next).toEqual({
      globalShortcut: "Ctrl+Shift+J",
      closeToTray: false,
      restoreLastSession: false,
      launchOnStartup: true,
    });
    expect(await getRuntimeSettings()).toEqual(next);
  });
});
