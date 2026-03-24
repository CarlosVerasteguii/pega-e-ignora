import "@toast-ui/editor/dist/toastui-editor.css";
import "./styles.css";

import { createJsonWorkspace, type JsonWorkspace } from "./features/jsonWorkspace";
import { createCommandPalette, type CommandPaletteAction } from "./ui/commandPalette";
import {
  confirm,
  documentDir,
  exists,
  getCurrentWindow,
  isTauriRuntime,
  join,
  message,
  mkdir,
  open as dialogOpen,
  openPath,
  readTextFile,
  remove,
  rename,
  save as dialogSave,
  writeTextFile,
} from "./ui/desktopApi";
import { createFindReplace } from "./ui/findReplace";
import { createSidebarSections, type SidebarSectionsApi } from "./ui/sidebarSections";
import {
  SIDEBAR_SECTIONS_STORAGE_KEY,
  getInitialSidebarSectionExpandedState,
  writeSidebarSectionExpandedState,
} from "./ui/sidebarSectionState";
import { createToastHost, type ToastKind, type ToastPosition, type ToastShowOptions } from "./ui/toast";
import {
  DEFAULT_RUNTIME_SETTINGS,
  exitApplication as exitDesktopApplication,
  getRuntimeSettings,
  humanizeShortcut,
  isValidShortcutString,
  keyboardEventToShortcut,
  normalizeRuntimeSettings,
  toggleMainWindow as toggleDesktopMainWindow,
  updateRuntimeSettings,
  type RuntimeSettings,
} from "./ui/runtimeSettings";
import {
  createSessionState,
  normalizeSessionState,
  resolveSessionRestorePlan,
  type SessionState,
} from "./ui/sessionState";
import {
  UI_PREF_KEYS,
  DEFAULT_TYPOGRAPHY_SETTINGS,
  TYPOGRAPHY_PRESETS,
  type ToastProfile,
  type TypographyPresetId,
  type TypographySettings,
  type VisualFamily,
  getTypographyPreset,
  readTypographySettings,
  readUiPreferences,
  writeReduceMotion,
  writeToastPosition,
  writeToastProfile,
  writeTypographySettings,
  writeVisualFamily,
} from "./ui/uiPreferences";

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
  sessionPath: string;
};

type AppTheme = "light" | "dark";
type DocumentMode = "markdown" | "json";
type TypographyModeContext = "markdown" | "json";
type AccentPalette =
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

type AccentPaletteAccents = {
  a1: string;
  a2: string;
  a3: string;
  a4: string;
};

type AccentPaletteDefinition = {
  id: AccentPalette;
  name: string;
  light: AccentPaletteAccents;
  dark: AccentPaletteAccents;
};

type AppThemePalette =
  | "arena"
  | "papel"
  | "grafito"
  | "tinta"
  | "salvia"
  | "ciruela"
  | "oceano"
  | "nordico"
  | "solarizado"
  | "carbon"
  | "cobre"
  | "noche"
  | "lavanda"
  | "oliva"
  | "coral";

type AppThemeSurfaces = {
  bg: string;
  panel: string;
  panel2: string;
  panel3: string;
  text: string;
  muted: string;
  border: string;
  shadow: string;
  topbarStart: string;
  topbarEnd: string;
  buttonBg: string;
  sidebarEnd: string;
  historyBg: string;
  editorShellBg: string;
  editorMainBg: string;
  codeBlockBg: string;
};

type AppThemePaletteDefinition = {
  id: AppThemePalette;
  name: string;
  light: AppThemeSurfaces;
  dark: AppThemeSurfaces;
};

type VisualFamilyDefinition = {
  id: VisualFamily;
  name: string;
  description: string;
  appTheme: AppThemePalette;
  accentPalette: AccentPalette;
};
type HeadingEntry = {
  level: number;
  text: string;
  line: number;
};

type ToastUiEditor = InstanceType<typeof import("@toast-ui/editor").default>;

const THEME_STORAGE_KEY = "markdown-viewer.theme";
const LEGACY_APP_THEME_STORAGE_KEY = "markdown-viewer.appTheme";
const LEGACY_ACCENT_PALETTE_STORAGE_KEY = "markdown-viewer.palette";
const WORKSPACE_ZOOM_STORAGE_KEY = "markdown-viewer.workspaceZoom";
const SPELLCHECK_STORAGE_KEY = "markdown-viewer.spellcheck";
const READ_MODE_STORAGE_KEY = "markdown-viewer.readMode";
const AUTOSAVE_STORAGE_KEY = "markdown-viewer.autosaveScratch";
const DOCUMENT_MODE_STORAGE_KEY = "markdown-viewer.documentMode";
const JSON_TREE_VISIBLE_STORAGE_KEY = "markdown-viewer.jsonTreeVisible";
const JSON_WRAP_LINES_STORAGE_KEY = "markdown-viewer.jsonWrapLines";
const JSON_TREE_WIDTH_STORAGE_KEY = "markdown-viewer.jsonTreePaneWidth";
const MIN_WORKSPACE_ZOOM = 0.8;
const MAX_WORKSPACE_ZOOM = 1.8;
const WORKSPACE_ZOOM_STEP = 0.05;

const TOAST_DURATIONS_BY_PROFILE: Record<ToastProfile, Partial<Record<ToastKind, number>>> = {
  "balanced-fast": {
    info: 1800,
    success: 1800,
    warning: 2400,
  },
  standard: {
    info: 2600,
    success: 2600,
    warning: 3200,
  },
};

const ACCENT_PALETTES: AccentPaletteDefinition[] = [
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

const ACCENT_PALETTE_BY_ID = new Map<AccentPalette, AccentPaletteDefinition>(ACCENT_PALETTES.map((p) => [p.id, p]));
const DEFAULT_ACCENT_PALETTE: AccentPalette = "caramelo";

const APP_THEME_PALETTES: AppThemePaletteDefinition[] = [
  {
    id: "arena",
    name: "Arena",
    light: {
      bg: "#f2f2f0",
      panel: "#f2e5d5",
      panel2: "#f7efe5",
      panel3: "#ead8c1",
      text: "#32281f",
      muted: "#7a6853",
      border: "#d9c2a7",
      shadow: "rgba(89, 67, 43, 0.14)",
      topbarStart: "#f5ebde",
      topbarEnd: "#f2e5d5",
      buttonBg: "#f7efe5",
      sidebarEnd: "#e3cdb3",
      historyBg: "rgba(242, 242, 240, 0.65)",
      editorShellBg: "rgba(247, 239, 229, 0.65)",
      editorMainBg: "rgba(242, 242, 240, 0.5)",
      codeBlockBg: "#f2f2f0",
    },
    dark: {
      bg: "#10141a",
      panel: "#182029",
      panel2: "#141b23",
      panel3: "#111820",
      text: "#e9dfd0",
      muted: "#b0a391",
      border: "#2f3b49",
      shadow: "rgba(0, 0, 0, 0.45)",
      topbarStart: "#1a232d",
      topbarEnd: "#141b23",
      buttonBg: "#1b2430",
      sidebarEnd: "#18212a",
      historyBg: "rgba(16, 20, 26, 0.56)",
      editorShellBg: "rgba(20, 27, 35, 0.75)",
      editorMainBg: "rgba(16, 20, 26, 0.66)",
      codeBlockBg: "#0f141b",
    },
  },
  {
    id: "papel",
    name: "Papel",
    light: {
      bg: "#fbfbf8",
      panel: "#ffffff",
      panel2: "#f7f7f2",
      panel3: "#efefe6",
      text: "#24211c",
      muted: "#6d665c",
      border: "#d8d5cf",
      shadow: "rgba(20, 20, 20, 0.1)",
      topbarStart: "#ffffff",
      topbarEnd: "#f7f7f2",
      buttonBg: "#f7f7f2",
      sidebarEnd: "#efefe6",
      historyBg: "rgba(251, 251, 248, 0.75)",
      editorShellBg: "rgba(255, 255, 255, 0.72)",
      editorMainBg: "rgba(251, 251, 248, 0.58)",
      codeBlockBg: "#fbfbf8",
    },
    dark: {
      bg: "#0f0f10",
      panel: "#17171a",
      panel2: "#141417",
      panel3: "#111114",
      text: "#ece7df",
      muted: "#bdb4a8",
      border: "#2a2a2e",
      shadow: "rgba(0, 0, 0, 0.52)",
      topbarStart: "#19191d",
      topbarEnd: "#141417",
      buttonBg: "#1a1a1f",
      sidebarEnd: "#17171a",
      historyBg: "rgba(15, 15, 16, 0.6)",
      editorShellBg: "rgba(20, 20, 23, 0.78)",
      editorMainBg: "rgba(15, 15, 16, 0.68)",
      codeBlockBg: "#0d0d0e",
    },
  },
  {
    id: "grafito",
    name: "Grafito",
    light: {
      bg: "#eef1f5",
      panel: "#e3e8ef",
      panel2: "#f3f6fb",
      panel3: "#d7dee8",
      text: "#1f2a37",
      muted: "#5b6776",
      border: "#c2ccd9",
      shadow: "rgba(17, 24, 39, 0.12)",
      topbarStart: "#f3f6fb",
      topbarEnd: "#e3e8ef",
      buttonBg: "#f3f6fb",
      sidebarEnd: "#d7dee8",
      historyBg: "rgba(238, 241, 245, 0.72)",
      editorShellBg: "rgba(243, 246, 251, 0.72)",
      editorMainBg: "rgba(238, 241, 245, 0.58)",
      codeBlockBg: "#eef1f5",
    },
    dark: {
      bg: "#0c1116",
      panel: "#121a22",
      panel2: "#0f161d",
      panel3: "#0d131a",
      text: "#e7edf6",
      muted: "#a6b2c1",
      border: "#263242",
      shadow: "rgba(0, 0, 0, 0.55)",
      topbarStart: "#141e27",
      topbarEnd: "#0f161d",
      buttonBg: "#16202a",
      sidebarEnd: "#121a22",
      historyBg: "rgba(12, 17, 22, 0.6)",
      editorShellBg: "rgba(15, 22, 29, 0.8)",
      editorMainBg: "rgba(12, 17, 22, 0.7)",
      codeBlockBg: "#0a1015",
    },
  },
  {
    id: "tinta",
    name: "Tinta",
    light: {
      bg: "#eef3fb",
      panel: "#e2ecff",
      panel2: "#f3f7ff",
      panel3: "#d3e0ff",
      text: "#0f1a2a",
      muted: "#4b5d76",
      border: "#b6c9ea",
      shadow: "rgba(15, 26, 42, 0.12)",
      topbarStart: "#f3f7ff",
      topbarEnd: "#e2ecff",
      buttonBg: "#f3f7ff",
      sidebarEnd: "#d3e0ff",
      historyBg: "rgba(238, 243, 251, 0.72)",
      editorShellBg: "rgba(243, 247, 255, 0.72)",
      editorMainBg: "rgba(238, 243, 251, 0.58)",
      codeBlockBg: "#eef3fb",
    },
    dark: {
      bg: "#0b1020",
      panel: "#111a33",
      panel2: "#0f172e",
      panel3: "#0d1428",
      text: "#e8efff",
      muted: "#a8b6d8",
      border: "#293661",
      shadow: "rgba(0, 0, 0, 0.58)",
      topbarStart: "#131d39",
      topbarEnd: "#0f172e",
      buttonBg: "#142042",
      sidebarEnd: "#111a33",
      historyBg: "rgba(11, 16, 32, 0.6)",
      editorShellBg: "rgba(15, 23, 46, 0.8)",
      editorMainBg: "rgba(11, 16, 32, 0.7)",
      codeBlockBg: "#090e1c",
    },
  },
  {
    id: "salvia",
    name: "Salvia",
    light: {
      bg: "#eff6f1",
      panel: "#e2f1e7",
      panel2: "#f4fbf6",
      panel3: "#d3e7da",
      text: "#1b2a21",
      muted: "#5b6e63",
      border: "#b5cfbf",
      shadow: "rgba(27, 42, 33, 0.12)",
      topbarStart: "#f4fbf6",
      topbarEnd: "#e2f1e7",
      buttonBg: "#f4fbf6",
      sidebarEnd: "#d3e7da",
      historyBg: "rgba(239, 246, 241, 0.72)",
      editorShellBg: "rgba(244, 251, 246, 0.72)",
      editorMainBg: "rgba(239, 246, 241, 0.58)",
      codeBlockBg: "#eff6f1",
    },
    dark: {
      bg: "#0b1410",
      panel: "#112019",
      panel2: "#0f1b16",
      panel3: "#0d1712",
      text: "#e7f4ec",
      muted: "#a7c3b4",
      border: "#264033",
      shadow: "rgba(0, 0, 0, 0.58)",
      topbarStart: "#14261d",
      topbarEnd: "#0f1b16",
      buttonBg: "#172b21",
      sidebarEnd: "#112019",
      historyBg: "rgba(11, 20, 16, 0.6)",
      editorShellBg: "rgba(15, 27, 22, 0.8)",
      editorMainBg: "rgba(11, 20, 16, 0.7)",
      codeBlockBg: "#09120d",
    },
  },
  {
    id: "ciruela",
    name: "Ciruela",
    light: {
      bg: "#f5f1f8",
      panel: "#efe4f6",
      panel2: "#faf7fc",
      panel3: "#e5d4f1",
      text: "#2a1930",
      muted: "#6f5a77",
      border: "#d7c0e5",
      shadow: "rgba(42, 25, 48, 0.12)",
      topbarStart: "#faf7fc",
      topbarEnd: "#efe4f6",
      buttonBg: "#faf7fc",
      sidebarEnd: "#e5d4f1",
      historyBg: "rgba(245, 241, 248, 0.72)",
      editorShellBg: "rgba(250, 247, 252, 0.72)",
      editorMainBg: "rgba(245, 241, 248, 0.58)",
      codeBlockBg: "#f5f1f8",
    },
    dark: {
      bg: "#140b17",
      panel: "#231328",
      panel2: "#1c101f",
      panel3: "#190d1c",
      text: "#f4e9f8",
      muted: "#c8b2d2",
      border: "#3e2247",
      shadow: "rgba(0, 0, 0, 0.6)",
      topbarStart: "#28162f",
      topbarEnd: "#1c101f",
      buttonBg: "#2c1834",
      sidebarEnd: "#231328",
      historyBg: "rgba(20, 11, 23, 0.6)",
      editorShellBg: "rgba(28, 16, 31, 0.82)",
      editorMainBg: "rgba(20, 11, 23, 0.72)",
      codeBlockBg: "#120914",
    },
  },
  {
    id: "oceano",
    name: "Oceano",
    light: {
      bg: "#edf7f8",
      panel: "#dff1f3",
      panel2: "#f5fcfd",
      panel3: "#cfe7ea",
      text: "#102a2c",
      muted: "#5a7476",
      border: "#b5d6db",
      shadow: "rgba(16, 42, 44, 0.12)",
      topbarStart: "#f5fcfd",
      topbarEnd: "#dff1f3",
      buttonBg: "#f5fcfd",
      sidebarEnd: "#cfe7ea",
      historyBg: "rgba(237, 247, 248, 0.72)",
      editorShellBg: "rgba(245, 252, 253, 0.72)",
      editorMainBg: "rgba(237, 247, 248, 0.58)",
      codeBlockBg: "#edf7f8",
    },
    dark: {
      bg: "#081517",
      panel: "#0e2326",
      panel2: "#0b1d20",
      panel3: "#0a191b",
      text: "#e5f7f8",
      muted: "#a8c9cd",
      border: "#224146",
      shadow: "rgba(0, 0, 0, 0.6)",
      topbarStart: "#10292d",
      topbarEnd: "#0b1d20",
      buttonBg: "#123136",
      sidebarEnd: "#0e2326",
      historyBg: "rgba(8, 21, 23, 0.6)",
      editorShellBg: "rgba(11, 29, 32, 0.82)",
      editorMainBg: "rgba(8, 21, 23, 0.72)",
      codeBlockBg: "#071214",
    },
  },
  {
    id: "nordico",
    name: "Nordico",
    light: {
      bg: "#eef2f6",
      panel: "#e3e9f1",
      panel2: "#f6f8fb",
      panel3: "#d5dde8",
      text: "#2e3440",
      muted: "#4c566a",
      border: "#c1cad8",
      shadow: "rgba(46, 52, 64, 0.12)",
      topbarStart: "#f6f8fb",
      topbarEnd: "#e3e9f1",
      buttonBg: "#f6f8fb",
      sidebarEnd: "#d5dde8",
      historyBg: "rgba(238, 242, 246, 0.74)",
      editorShellBg: "rgba(246, 248, 251, 0.74)",
      editorMainBg: "rgba(238, 242, 246, 0.6)",
      codeBlockBg: "#eef2f6",
    },
    dark: {
      bg: "#141923",
      panel: "#1f2533",
      panel2: "#1a2030",
      panel3: "#171d2b",
      text: "#eceff4",
      muted: "#a3b1c2",
      border: "#2f3a50",
      shadow: "rgba(0, 0, 0, 0.6)",
      topbarStart: "#212a3b",
      topbarEnd: "#1a2030",
      buttonBg: "#232c3f",
      sidebarEnd: "#1f2533",
      historyBg: "rgba(20, 25, 35, 0.62)",
      editorShellBg: "rgba(26, 32, 48, 0.82)",
      editorMainBg: "rgba(20, 25, 35, 0.72)",
      codeBlockBg: "#101621",
    },
  },
  {
    id: "solarizado",
    name: "Solarizado",
    light: {
      bg: "#fdf6e3",
      panel: "#eee8d5",
      panel2: "#fffaf0",
      panel3: "#e3ddc9",
      text: "#3b4b52",
      muted: "#6b7c82",
      border: "#d6cfb9",
      shadow: "rgba(59, 75, 82, 0.12)",
      topbarStart: "#fffaf0",
      topbarEnd: "#eee8d5",
      buttonBg: "#fffaf0",
      sidebarEnd: "#e3ddc9",
      historyBg: "rgba(253, 246, 227, 0.76)",
      editorShellBg: "rgba(255, 250, 240, 0.74)",
      editorMainBg: "rgba(253, 246, 227, 0.62)",
      codeBlockBg: "#fdf6e3",
    },
    dark: {
      bg: "#002b36",
      panel: "#073642",
      panel2: "#032e38",
      panel3: "#022a33",
      text: "#e5e0d2",
      muted: "#93a1a1",
      border: "#1b4b55",
      shadow: "rgba(0, 0, 0, 0.65)",
      topbarStart: "#0a3b47",
      topbarEnd: "#032e38",
      buttonBg: "#0a3b47",
      sidebarEnd: "#073642",
      historyBg: "rgba(0, 43, 54, 0.6)",
      editorShellBg: "rgba(3, 46, 56, 0.84)",
      editorMainBg: "rgba(0, 43, 54, 0.72)",
      codeBlockBg: "#001f27",
    },
  },
  {
    id: "carbon",
    name: "Carbon",
    light: {
      bg: "#f5f6f8",
      panel: "#e9edf2",
      panel2: "#f8fafc",
      panel3: "#dbe2eb",
      text: "#161b22",
      muted: "#57606a",
      border: "#c8d1dc",
      shadow: "rgba(22, 27, 34, 0.12)",
      topbarStart: "#f8fafc",
      topbarEnd: "#e9edf2",
      buttonBg: "#f8fafc",
      sidebarEnd: "#dbe2eb",
      historyBg: "rgba(245, 246, 248, 0.74)",
      editorShellBg: "rgba(248, 250, 252, 0.74)",
      editorMainBg: "rgba(245, 246, 248, 0.6)",
      codeBlockBg: "#f5f6f8",
    },
    dark: {
      bg: "#0b0c0f",
      panel: "#12141a",
      panel2: "#0f1116",
      panel3: "#0d0e12",
      text: "#e6edf3",
      muted: "#9aa4ad",
      border: "#242833",
      shadow: "rgba(0, 0, 0, 0.7)",
      topbarStart: "#141822",
      topbarEnd: "#0f1116",
      buttonBg: "#161b26",
      sidebarEnd: "#12141a",
      historyBg: "rgba(11, 12, 15, 0.64)",
      editorShellBg: "rgba(15, 17, 22, 0.84)",
      editorMainBg: "rgba(11, 12, 15, 0.74)",
      codeBlockBg: "#090a0d",
    },
  },
  {
    id: "cobre",
    name: "Cobre",
    light: {
      bg: "#f7f2ec",
      panel: "#f1e2d2",
      panel2: "#fbf6f1",
      panel3: "#e8d2bd",
      text: "#3a2418",
      muted: "#7a5f4f",
      border: "#d8bda6",
      shadow: "rgba(58, 36, 24, 0.12)",
      topbarStart: "#fbf6f1",
      topbarEnd: "#f1e2d2",
      buttonBg: "#fbf6f1",
      sidebarEnd: "#e8d2bd",
      historyBg: "rgba(247, 242, 236, 0.74)",
      editorShellBg: "rgba(251, 246, 241, 0.74)",
      editorMainBg: "rgba(247, 242, 236, 0.6)",
      codeBlockBg: "#f7f2ec",
    },
    dark: {
      bg: "#120c0a",
      panel: "#1d1411",
      panel2: "#17100d",
      panel3: "#140e0c",
      text: "#f4e6d7",
      muted: "#c9b3a3",
      border: "#3a2b23",
      shadow: "rgba(0, 0, 0, 0.65)",
      topbarStart: "#211714",
      topbarEnd: "#17100d",
      buttonBg: "#251a16",
      sidebarEnd: "#1d1411",
      historyBg: "rgba(18, 12, 10, 0.62)",
      editorShellBg: "rgba(23, 16, 13, 0.84)",
      editorMainBg: "rgba(18, 12, 10, 0.72)",
      codeBlockBg: "#0e0907",
    },
  },
  {
    id: "noche",
    name: "Noche",
    light: {
      bg: "#eef2f8",
      panel: "#e1e7f5",
      panel2: "#f4f6fc",
      panel3: "#d0d9ee",
      text: "#0b1630",
      muted: "#4a607e",
      border: "#b3c3e0",
      shadow: "rgba(11, 22, 48, 0.12)",
      topbarStart: "#f4f6fc",
      topbarEnd: "#e1e7f5",
      buttonBg: "#f4f6fc",
      sidebarEnd: "#d0d9ee",
      historyBg: "rgba(238, 242, 248, 0.74)",
      editorShellBg: "rgba(244, 246, 252, 0.74)",
      editorMainBg: "rgba(238, 242, 248, 0.6)",
      codeBlockBg: "#eef2f8",
    },
    dark: {
      bg: "#050a16",
      panel: "#0b1426",
      panel2: "#081022",
      panel3: "#060c1b",
      text: "#e7eefc",
      muted: "#9fb3d7",
      border: "#1d2e53",
      shadow: "rgba(0, 0, 0, 0.72)",
      topbarStart: "#0d1830",
      topbarEnd: "#081022",
      buttonBg: "#101e3a",
      sidebarEnd: "#0b1426",
      historyBg: "rgba(5, 10, 22, 0.64)",
      editorShellBg: "rgba(8, 16, 34, 0.86)",
      editorMainBg: "rgba(5, 10, 22, 0.74)",
      codeBlockBg: "#040815",
    },
  },
  {
    id: "lavanda",
    name: "Lavanda",
    light: {
      bg: "#f6f3fb",
      panel: "#efe7fa",
      panel2: "#faf7fe",
      panel3: "#e3d6f3",
      text: "#24182d",
      muted: "#6e5a7a",
      border: "#d3c1e2",
      shadow: "rgba(36, 24, 45, 0.12)",
      topbarStart: "#faf7fe",
      topbarEnd: "#efe7fa",
      buttonBg: "#faf7fe",
      sidebarEnd: "#e3d6f3",
      historyBg: "rgba(246, 243, 251, 0.74)",
      editorShellBg: "rgba(250, 247, 254, 0.74)",
      editorMainBg: "rgba(246, 243, 251, 0.6)",
      codeBlockBg: "#f6f3fb",
    },
    dark: {
      bg: "#0f0a14",
      panel: "#1a1023",
      panel2: "#140c1c",
      panel3: "#120a18",
      text: "#f2e9fb",
      muted: "#c7b2d8",
      border: "#352047",
      shadow: "rgba(0, 0, 0, 0.68)",
      topbarStart: "#1f132a",
      topbarEnd: "#140c1c",
      buttonBg: "#241633",
      sidebarEnd: "#1a1023",
      historyBg: "rgba(15, 10, 20, 0.62)",
      editorShellBg: "rgba(20, 12, 28, 0.85)",
      editorMainBg: "rgba(15, 10, 20, 0.74)",
      codeBlockBg: "#0c070f",
    },
  },
  {
    id: "oliva",
    name: "Oliva",
    light: {
      bg: "#f6f6e9",
      panel: "#eef0d4",
      panel2: "#fbfcee",
      panel3: "#dde2b8",
      text: "#2a2a18",
      muted: "#76724f",
      border: "#c9cd9e",
      shadow: "rgba(42, 42, 24, 0.12)",
      topbarStart: "#fbfcee",
      topbarEnd: "#eef0d4",
      buttonBg: "#fbfcee",
      sidebarEnd: "#dde2b8",
      historyBg: "rgba(246, 246, 233, 0.74)",
      editorShellBg: "rgba(251, 252, 238, 0.74)",
      editorMainBg: "rgba(246, 246, 233, 0.6)",
      codeBlockBg: "#f6f6e9",
    },
    dark: {
      bg: "#141407",
      panel: "#20200c",
      panel2: "#1b1b0a",
      panel3: "#171708",
      text: "#f2f2d6",
      muted: "#c5c39d",
      border: "#3a3a1a",
      shadow: "rgba(0, 0, 0, 0.68)",
      topbarStart: "#24240f",
      topbarEnd: "#1b1b0a",
      buttonBg: "#2b2b12",
      sidebarEnd: "#20200c",
      historyBg: "rgba(20, 20, 7, 0.64)",
      editorShellBg: "rgba(27, 27, 10, 0.86)",
      editorMainBg: "rgba(20, 20, 7, 0.74)",
      codeBlockBg: "#0f0f05",
    },
  },
  {
    id: "coral",
    name: "Coral",
    light: {
      bg: "#fff1f0",
      panel: "#ffe3dc",
      panel2: "#fff6f4",
      panel3: "#ffd2c8",
      text: "#3a1d18",
      muted: "#7a5953",
      border: "#e6b8ae",
      shadow: "rgba(58, 29, 24, 0.12)",
      topbarStart: "#fff6f4",
      topbarEnd: "#ffe3dc",
      buttonBg: "#fff6f4",
      sidebarEnd: "#ffd2c8",
      historyBg: "rgba(255, 241, 240, 0.74)",
      editorShellBg: "rgba(255, 246, 244, 0.74)",
      editorMainBg: "rgba(255, 241, 240, 0.6)",
      codeBlockBg: "#fff1f0",
    },
    dark: {
      bg: "#160a0b",
      panel: "#241012",
      panel2: "#1d0d0f",
      panel3: "#190b0c",
      text: "#f8e6e4",
      muted: "#d0b0ac",
      border: "#3d1e21",
      shadow: "rgba(0, 0, 0, 0.7)",
      topbarStart: "#2a1416",
      topbarEnd: "#1d0d0f",
      buttonBg: "#32181b",
      sidebarEnd: "#241012",
      historyBg: "rgba(22, 10, 11, 0.64)",
      editorShellBg: "rgba(29, 13, 15, 0.86)",
      editorMainBg: "rgba(22, 10, 11, 0.74)",
      codeBlockBg: "#120607",
    },
  },
];

const APP_THEME_BY_ID = new Map<AppThemePalette, AppThemePaletteDefinition>(APP_THEME_PALETTES.map((p) => [p.id, p]));
const DEFAULT_APP_THEME: AppThemePalette = "arena";
const VISUAL_FAMILIES: VisualFamilyDefinition[] = [
  {
    id: "studio-slate",
    name: "Studio Slate",
    description: "Sobrio y editorial; baja el look tech y refuerza jerarquía.",
    appTheme: "grafito",
    accentPalette: "oceano",
  },
  {
    id: "editorial-warm",
    name: "Editorial Warm",
    description: "Más humano y premium; papel cálido con acento discreto.",
    appTheme: "papel",
    accentPalette: "caramelo",
  },
  {
    id: "operator-console",
    name: "Operator Console",
    description: "Contraste táctico y foco operativo para sesiones largas.",
    appTheme: "carbon",
    accentPalette: "menta",
  },
];
const VISUAL_FAMILY_BY_ID = new Map<VisualFamily, VisualFamilyDefinition>(VISUAL_FAMILIES.map((family) => [family.id, family]));
const DEFAULT_VISUAL_FAMILY: VisualFamily = "studio-slate";

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

function inferJsonTitle(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      if (keys.length > 0) return keys.slice(0, 2).join(" · ");
      return "JSON";
    }
    if (Array.isArray(parsed)) return `Array (${parsed.length})`;
    if (parsed === null) return "null";
    return String(parsed);
  } catch {
    return "JSON";
  }
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

function getFileExtension(path: string): string {
  const name = basename(path);
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function modeFromPath(path: string): DocumentMode | null {
  const ext = getFileExtension(path);
  if (ext === "json") return "json";
  if (ext === "md" || ext === "markdown") return "markdown";
  return null;
}

function extensionForMode(mode: DocumentMode): "md" | "json" {
  return mode === "json" ? "json" : "md";
}

function defaultFileFilterForMode(mode: DocumentMode): { name: string; extensions: string[] } {
  if (mode === "json") return { name: "JSON", extensions: ["json"] };
  return { name: "Markdown", extensions: ["md", "markdown"] };
}

function getInitialDocumentMode(): DocumentMode {
  const raw = window.localStorage.getItem(DOCUMENT_MODE_STORAGE_KEY);
  return raw === "json" ? "json" : "markdown";
}

function inferDocumentTitle(content: string, mode: DocumentMode, fallbackPath: string | null): string {
  if (mode === "json") {
    const jsonTitle = inferJsonTitle(content).trim();
    if (jsonTitle) return clamp(jsonTitle, 60);
    if (fallbackPath) return basename(fallbackPath);
    return "JSON";
  }
  const markdownTitle = inferTitle(content).trim();
  if (markdownTitle) return clamp(markdownTitle, 60);
  if (fallbackPath) return basename(fallbackPath);
  return "Nota";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getStoredTheme(): AppTheme | null {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function getInitialTheme(): AppTheme {
  const storedTheme = getStoredTheme();
  if (storedTheme) return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isVisualFamilyId(value: string): value is VisualFamily {
  return VISUAL_FAMILY_BY_ID.has(value as VisualFamily);
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
  const sessionPath = await join(vaultDir, "session.json");
  return { vaultDir, notesDir, scratchPath, historyPath, sessionPath };
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

async function readSessionState(vault: VaultPaths): Promise<SessionState | null> {
  if (!(await exists(vault.sessionPath))) return null;
  try {
    const raw = await readTextFile(vault.sessionPath);
    return normalizeSessionState(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeSessionState(vault: VaultPaths, session: SessionState): Promise<void> {
  await writeTextFile(vault.sessionPath, JSON.stringify(session, null, 2));
}

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

function setButtonLabel(button: HTMLButtonElement, label: string): void {
  const labelEl = button.querySelector<HTMLElement>(".btn-label");
  if (labelEl) {
    labelEl.textContent = label;
    return;
  }
  button.textContent = label;
}

window.addEventListener("DOMContentLoaded", async () => {
  const appEl = document.querySelector<HTMLElement>("#app");
  const statusEl = document.querySelector<HTMLElement>("#status");
  const workspaceMetaEl = document.querySelector<HTMLElement>("#workspace-meta");
  const tabMarkdown = document.querySelector<HTMLButtonElement>("#tab-markdown");
  const tabJson = document.querySelector<HTMLButtonElement>("#tab-json");
  const markdownPanelEl = document.querySelector<HTMLElement>("#workspace-markdown-panel");
  const jsonPanelEl = document.querySelector<HTMLElement>("#workspace-json-panel");
  const editorEl = document.querySelector<HTMLElement>("#editor");
  const jsonTextEditorEl = document.querySelector<HTMLTextAreaElement>("#json-text-editor");
  const jsonHighlightEl = document.querySelector<HTMLElement>("#json-highlight");
  const jsonTreeEl = document.querySelector<HTMLElement>("#json-tree");
  const jsonTreePaneEl = document.querySelector<HTMLElement>("#json-tree-pane");
  const jsonLayoutEl = document.querySelector<HTMLElement>("#json-layout");
  const jsonSplitterEl = document.querySelector<HTMLElement>("#json-splitter");
  const jsonParseStatusEl = document.querySelector<HTMLElement>("#json-parse-status");
  const jsonEditorWrapEl = document.querySelector<HTMLElement>(".json-editor");
  const btnJsonPretty = document.querySelector<HTMLButtonElement>("#btn-json-pretty");
  const btnJsonMinify = document.querySelector<HTMLButtonElement>("#btn-json-minify");
  const btnJsonWrapToggle = document.querySelector<HTMLButtonElement>("#btn-json-wrap-toggle");
  const btnJsonTreeToggle = document.querySelector<HTMLButtonElement>("#btn-json-tree-toggle");
  const workspaceEl = document.querySelector<HTMLElement>(".workspace");
  const sidebarEl = document.querySelector<HTMLElement>(".sidebar");
  const historyEl = document.querySelector<HTMLElement>("#history");
  const outlineEl = document.querySelector<HTMLElement>("#outline");
  const outlineSectionToggleEl = document.querySelector<HTMLButtonElement>(".sidebar-section-outline .sidebar-section-toggle");
  const outlineSectionTitleEl = document.querySelector<HTMLElement>(".sidebar-section-outline .sidebar-section-title");
  const resetTypographyBtn = document.querySelector<HTMLButtonElement>("#btn-reset-typography");
  const typographyFontSize = document.querySelector<HTMLInputElement>("#typography-font-size");
  const typographyFontSizeValue = document.querySelector<HTMLElement>("#typography-font-size-value");
  const typographyLineHeight = document.querySelector<HTMLInputElement>("#typography-line-height");
  const typographyLineHeightValue = document.querySelector<HTMLElement>("#typography-line-height-value");
  const typographyParagraphSpacing = document.querySelector<HTMLInputElement>("#typography-paragraph-spacing");
  const typographySpacingLabel = document.querySelector<HTMLElement>("#typography-spacing-label");
  const typographyParagraphSpacingValue = document.querySelector<HTMLElement>("#typography-paragraph-spacing-value");
  const typographyPresetGroup = document.querySelector<HTMLElement>("#typography-preset-group");
  const typographyPresetSelectedName = document.querySelector<HTMLElement>("#typography-preset-selected-name");
  const formatContextNote = document.querySelector<HTMLElement>("#format-context-note");
  const visualFamilyGrid = document.querySelector<HTMLElement>("#visual-family-grid");
  const visualFamilySelectedName = document.querySelector<HTMLElement>("#visual-family-selected-name");

  const btnNew = document.querySelector<HTMLButtonElement>("#btn-new");
  const btnOpen = document.querySelector<HTMLButtonElement>("#btn-open");
  const btnSave = document.querySelector<HTMLButtonElement>("#btn-save");
  const btnSaveAs = document.querySelector<HTMLButtonElement>("#btn-save-as");
  const btnTheme = document.querySelector<HTMLButtonElement>("#btn-theme");
  const btnReadMode = document.querySelector<HTMLButtonElement>("#btn-read-mode");
  const btnSpellcheck = document.querySelector<HTMLButtonElement>("#btn-spellcheck");
  const btnSettings = document.querySelector<HTMLButtonElement>("#btn-settings");
  const btnOpenVault = document.querySelector<HTMLButtonElement>("#btn-open-vault");
  const btnExploreVault = document.querySelector<HTMLButtonElement>("#btn-explore-vault");
  const vaultNotesPathEl = document.querySelector<HTMLElement>("#vault-notes-path");
  const btnAutosave = document.querySelector<HTMLButtonElement>("#btn-autosave");
  const btnCloseToTray = document.querySelector<HTMLButtonElement>("#btn-close-to-tray");
  const btnRestoreSession = document.querySelector<HTMLButtonElement>("#btn-restore-session");
  const btnLaunchOnStartup = document.querySelector<HTMLButtonElement>("#btn-launch-on-startup");
  const btnShortcutCapture = document.querySelector<HTMLButtonElement>("#btn-shortcut-capture");
  const btnShortcutReset = document.querySelector<HTMLButtonElement>("#btn-shortcut-reset");
  const runtimeShortcutSelectedName = document.querySelector<HTMLElement>("#runtime-shortcut-selected-name");
  const runtimeShortcutStatus = document.querySelector<HTMLElement>("#runtime-shortcut-status");
  const shortcutGlobalDisplay = document.querySelector<HTMLElement>("#shortcut-global-display");
  const btnToastProfileBalanced = document.querySelector<HTMLButtonElement>("#btn-toast-profile-balanced");
  const btnToastProfileStandard = document.querySelector<HTMLButtonElement>("#btn-toast-profile-standard");
  const toastProfileSelectedName = document.querySelector<HTMLElement>("#toast-profile-selected-name");
  const btnToastPositionBottom = document.querySelector<HTMLButtonElement>("#btn-toast-position-bottom");
  const btnToastPositionTop = document.querySelector<HTMLButtonElement>("#btn-toast-position-top");
  const toastPositionSelectedName = document.querySelector<HTMLElement>("#toast-position-selected-name");
  const btnReduceMotion = document.querySelector<HTMLButtonElement>("#btn-reduce-motion");
  const btnResetPreferences = document.querySelector<HTMLButtonElement>("#btn-reset-preferences");
  const btnRefreshHistory = document.querySelector<HTMLButtonElement>("#btn-refresh-history");
  const settingsOverlay = document.querySelector<HTMLElement>("#settings-overlay");
  const settingsCloseBtn = document.querySelector<HTMLButtonElement>("#settings-close");
  const settingsPanel = document.querySelector<HTMLElement>("#settings-overlay .settings-panel");

  if (
    !appEl ||
    !statusEl ||
    !workspaceMetaEl ||
    !tabMarkdown ||
    !tabJson ||
    !markdownPanelEl ||
    !jsonPanelEl ||
    !editorEl ||
    !jsonTextEditorEl ||
    !jsonHighlightEl ||
    !jsonTreeEl ||
    !jsonTreePaneEl ||
    !jsonLayoutEl ||
    !jsonSplitterEl ||
    !jsonParseStatusEl ||
    !jsonEditorWrapEl ||
    !btnJsonPretty ||
    !btnJsonMinify ||
    !btnJsonWrapToggle ||
    !btnJsonTreeToggle ||
    !workspaceEl ||
    !sidebarEl ||
    !historyEl ||
    !outlineEl ||
    !outlineSectionToggleEl ||
    !outlineSectionTitleEl ||
    !resetTypographyBtn ||
    !typographyFontSize ||
    !typographyFontSizeValue ||
    !typographyLineHeight ||
    !typographyLineHeightValue ||
    !typographyParagraphSpacing ||
    !typographySpacingLabel ||
    !typographyParagraphSpacingValue ||
    !typographyPresetGroup ||
    !typographyPresetSelectedName ||
    !formatContextNote ||
    !visualFamilyGrid ||
    !visualFamilySelectedName ||
    !btnNew ||
    !btnOpen ||
    !btnSave ||
    !btnSaveAs ||
    !btnTheme ||
    !btnReadMode ||
    !btnSpellcheck ||
    !btnSettings ||
    !btnOpenVault ||
    !btnExploreVault ||
    !vaultNotesPathEl ||
    !btnAutosave ||
    !btnCloseToTray ||
    !btnRestoreSession ||
    !btnLaunchOnStartup ||
    !btnShortcutCapture ||
    !btnShortcutReset ||
    !runtimeShortcutSelectedName ||
    !runtimeShortcutStatus ||
    !shortcutGlobalDisplay ||
    !btnToastProfileBalanced ||
    !btnToastProfileStandard ||
    !toastProfileSelectedName ||
    !btnToastPositionBottom ||
    !btnToastPositionTop ||
    !toastPositionSelectedName ||
    !btnReduceMotion ||
    !btnResetPreferences ||
    !btnRefreshHistory ||
    !settingsOverlay ||
    !settingsCloseBtn ||
    !settingsPanel
  ) {
    return;
  }

  const initialUiPreferences = readUiPreferences();
  const appWindow = getCurrentWindow();
  const desktopRuntimeAvailable = isTauriRuntime();
  let runtimeSettings = await getRuntimeSettings();
  let shortcutCaptureActive = false;
  let runtimeShortcutStatusMessage = "Listo";
  let toastProfile: ToastProfile = initialUiPreferences.toastProfile;
  let toastPosition: ToastPosition = initialUiPreferences.toastPosition;
  let reduceMotionPreference = initialUiPreferences.reduceMotion;
  const reduceMotionMediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  const reduceMotionEnabled = () => reduceMotionPreference || (reduceMotionMediaQuery?.matches ?? false);
  let sidebarSections: SidebarSectionsApi | null = null;
  const settleSidebarSectionTransitions = () => {
    sidebarSections?.settleAll();
  };

  const toasts = createToastHost({
    position: toastPosition,
    durationsByKind: TOAST_DURATIONS_BY_PROFILE[toastProfile],
    reducedMotion: reduceMotionEnabled,
  });
  const applyToastHostPosition = (position: ToastPosition) => {
    toasts.el.dataset.position = position;
  };
  const applyReducedMotionState = () => {
    settleSidebarSectionTransitions();
    document.documentElement.setAttribute("data-reduce-motion", reduceMotionEnabled() ? "true" : "false");
  };
  applyToastHostPosition(toastPosition);
  applyReducedMotionState();
  if (reduceMotionMediaQuery) {
    const onSystemReduceMotionChange = () => applyReducedMotionState();
    reduceMotionMediaQuery.addEventListener("change", onSystemReduceMotionChange);
  }

  const updateStatus = (text: string) => setText(statusEl, text);
  const notify = (options: ToastShowOptions) => {
    const kind: ToastKind = options.kind ?? "info";
    const sticky = options.sticky ?? kind === "error";
    const profileDuration = TOAST_DURATIONS_BY_PROFILE[toastProfile][kind];
    const durationMs = sticky ? undefined : (options.durationMs ?? profileDuration);
    return toasts.show({
      ...options,
      kind,
      sticky,
      durationMs,
    });
  };

  const updateRuntimeToggleButton = (button: HTMLButtonElement, label: string, enabled: boolean) => {
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    setText(button.querySelector("span"), `${label}: ${enabled ? "Sí" : "No"}`);
  };

  const syncRuntimeSettingsControls = () => {
    updateRuntimeToggleButton(btnCloseToTray, "Cerrar a bandeja", runtimeSettings.closeToTray);
    updateRuntimeToggleButton(btnRestoreSession, "Reanudar sesión", runtimeSettings.restoreLastSession);
    updateRuntimeToggleButton(btnLaunchOnStartup, "Iniciar con Windows", runtimeSettings.launchOnStartup);
    runtimeShortcutSelectedName.textContent = humanizeShortcut(runtimeSettings.globalShortcut);
    shortcutGlobalDisplay.textContent = humanizeShortcut(runtimeSettings.globalShortcut);
    runtimeShortcutStatus.textContent = shortcutCaptureActive ? "Presiona tu combinación…" : runtimeShortcutStatusMessage;
    btnShortcutCapture.setAttribute("aria-pressed", shortcutCaptureActive ? "true" : "false");
    setText(btnShortcutCapture.querySelector("span"), shortcutCaptureActive ? "Escuchando atajo…" : "Grabar atajo…");
  };

  const applyRuntimeSettings = async (
    next: RuntimeSettings,
    options: { announceMessage?: string; successMessage?: string } = {},
  ): Promise<boolean> => {
    try {
      runtimeSettings = await updateRuntimeSettings(next);
      syncRuntimeSettingsControls();
      if (options.successMessage) {
        updateStatus(options.successMessage);
        notify({ kind: "info", message: options.successMessage });
      }
      return true;
    } catch (error) {
      runtimeSettings = normalizeRuntimeSettings(runtimeSettings);
      syncRuntimeSettingsControls();
      const detail = error instanceof Error ? error.message : String(error);
      updateStatus(options.announceMessage ?? "No pude aplicar la configuración.");
      notify({ kind: "error", message: `${options.announceMessage ?? "No pude aplicar la configuración."} ${detail}` });
      return false;
    }
  };

  syncRuntimeSettingsControls();

  let activeDocumentMode: DocumentMode = getInitialDocumentMode();
  let onDocumentModeChanged = () => {};
  let renderOutline = () => {};

  let jsonWorkspaceTreeApi: Pick<JsonWorkspace, "setTreeVisible"> | null = null;

  const readJsonTreeVisible = (): boolean => {
    const raw = window.localStorage.getItem(JSON_TREE_VISIBLE_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return false;
  };

  const writeJsonTreeVisible = (visible: boolean) => {
    window.localStorage.setItem(JSON_TREE_VISIBLE_STORAGE_KEY, visible ? "1" : "0");
  };

  const readJsonWrapLines = (): boolean => {
    const raw = window.localStorage.getItem(JSON_WRAP_LINES_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return false;
  };

  const writeJsonWrapLines = (enabled: boolean) => {
    window.localStorage.setItem(JSON_WRAP_LINES_STORAGE_KEY, enabled ? "1" : "0");
  };

  const JSON_TREE_WIDTH_DEFAULT = 38;
  const JSON_TREE_WIDTH_MIN = 25;
  const JSON_TREE_WIDTH_MAX = 60;
  const JSON_TREE_WIDTH_KEYBOARD_STEP = 2;
  const jsonSplitterCompactMedia = window.matchMedia("(max-width: 1150px)");

  const readJsonTreePaneWidth = (): number => {
    const raw = Number(window.localStorage.getItem(JSON_TREE_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(raw)) return JSON_TREE_WIDTH_DEFAULT;
    return clampNumber(raw, JSON_TREE_WIDTH_MIN, JSON_TREE_WIDTH_MAX);
  };

  const writeJsonTreePaneWidth = (widthPercent: number) => {
    window.localStorage.setItem(JSON_TREE_WIDTH_STORAGE_KEY, widthPercent.toFixed(1));
  };

  let jsonTreeVisible = readJsonTreeVisible();
  let jsonWrapLines = readJsonWrapLines();
  let jsonTreePaneWidth = readJsonTreePaneWidth();
  let jsonSplitterPointerId: number | null = null;

  sidebarSections = createSidebarSections({
    root: sidebarEl,
    initialExpanded: getInitialSidebarSectionExpandedState(window.localStorage),
    reducedMotion: reduceMotionEnabled,
    onExpandedChange: (id, expanded) => {
      writeSidebarSectionExpandedState(window.localStorage, id, expanded);
    },
  });

  const syncOutlineSectionVisibility = () => {
    settleSidebarSectionTransitions();
    sidebarSections?.setVisible("outline", activeDocumentMode === "markdown" || jsonTreeVisible);
  };

  const updateJsonSplitterState = () => {
    const enabled = jsonTreeVisible && !jsonSplitterCompactMedia.matches;
    jsonSplitterEl.hidden = !enabled;
    jsonSplitterEl.tabIndex = enabled ? 0 : -1;
    jsonSplitterEl.setAttribute("aria-hidden", enabled ? "false" : "true");
    jsonSplitterEl.setAttribute("aria-valuenow", String(Math.round(jsonTreePaneWidth)));
    const valueText = `${Math.round(jsonTreePaneWidth)}% del ancho para Árbol JSON`;
    jsonSplitterEl.setAttribute("aria-valuetext", valueText);
  };

  const applyJsonTreePaneWidth = (widthPercent: number, persist = false) => {
    jsonTreePaneWidth = clampNumber(widthPercent, JSON_TREE_WIDTH_MIN, JSON_TREE_WIDTH_MAX);
    jsonLayoutEl.style.setProperty("--json-tree-pane-width", `${jsonTreePaneWidth}%`);
    updateJsonSplitterState();
    if (persist) writeJsonTreePaneWidth(jsonTreePaneWidth);
  };

  const setJsonSplitterDragging = (dragging: boolean) => {
    jsonSplitterEl.dataset.dragging = dragging ? "true" : "false";
    document.body.style.cursor = dragging ? "col-resize" : "";
    document.body.style.userSelect = dragging ? "none" : "";
  };

  const resizeJsonTreePaneFromPointer = (clientX: number, persist = false) => {
    if (!jsonTreeVisible || jsonSplitterCompactMedia.matches) return;
    const rect = jsonLayoutEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const splitterSize = jsonSplitterEl.getBoundingClientRect().width || 12;
    const treeWidthPx = rect.right - clientX;
    const widthPercent = (treeWidthPx / Math.max(rect.width - splitterSize, 1)) * 100;
    applyJsonTreePaneWidth(widthPercent, persist);
  };

  const applyJsonTreeVisible = (visible: boolean) => {
    jsonTreeVisible = visible;
    jsonLayoutEl.dataset.tree = visible ? "shown" : "hidden";
    jsonTreePaneEl.hidden = !visible;
    btnJsonTreeToggle.setAttribute("aria-pressed", visible ? "true" : "false");
    const label = visible ? "Ocultar árbol JSON" : "Mostrar árbol JSON";
    btnJsonTreeToggle.title = label;
    btnJsonTreeToggle.setAttribute("aria-label", label);
    jsonWorkspaceTreeApi?.setTreeVisible(visible);
    updateJsonSplitterState();
    syncOutlineSectionVisibility();
    renderOutline();
  };

  const applyJsonWrapLines = (enabled: boolean) => {
    jsonWrapLines = enabled;
    jsonEditorWrapEl.dataset.wrap = enabled ? "on" : "off";
    jsonTextEditorEl.setAttribute("wrap", enabled ? "soft" : "off");
    btnJsonWrapToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    const label = enabled ? "Desactivar ajuste de línea" : "Activar ajuste de línea";
    btnJsonWrapToggle.title = label;
    btnJsonWrapToggle.setAttribute("aria-label", label);
  };

  applyJsonTreePaneWidth(jsonTreePaneWidth);
  applyJsonTreeVisible(jsonTreeVisible);
  applyJsonWrapLines(jsonWrapLines);

  btnJsonTreeToggle.addEventListener("click", () => {
    const next = !jsonTreeVisible;
    writeJsonTreeVisible(next);
    applyJsonTreeVisible(next);
  });

  btnJsonWrapToggle.addEventListener("click", () => {
    const next = !jsonWrapLines;
    writeJsonWrapLines(next);
    applyJsonWrapLines(next);
    const msg = next ? "Ajuste de línea activado" : "Ajuste de línea desactivado";
    updateStatus(msg);
    notify({ kind: "info", message: msg });
  });

  jsonSplitterCompactMedia.addEventListener("change", () => {
    updateJsonSplitterState();
  });

  jsonSplitterEl.addEventListener("pointerdown", (event) => {
    if (!jsonTreeVisible || jsonSplitterCompactMedia.matches) return;
    jsonSplitterPointerId = event.pointerId;
    jsonSplitterEl.setPointerCapture(event.pointerId);
    setJsonSplitterDragging(true);
    event.preventDefault();
  });

  jsonSplitterEl.addEventListener("pointermove", (event) => {
    if (jsonSplitterPointerId !== event.pointerId) return;
    resizeJsonTreePaneFromPointer(event.clientX, false);
  });

  jsonSplitterEl.addEventListener("pointerup", (event) => {
    if (jsonSplitterPointerId !== event.pointerId) return;
    resizeJsonTreePaneFromPointer(event.clientX, true);
    jsonSplitterEl.releasePointerCapture(event.pointerId);
    jsonSplitterPointerId = null;
    setJsonSplitterDragging(false);
  });

  jsonSplitterEl.addEventListener("pointercancel", (event) => {
    if (jsonSplitterPointerId !== event.pointerId) return;
    jsonSplitterPointerId = null;
    setJsonSplitterDragging(false);
  });

  jsonSplitterEl.addEventListener("keydown", (event) => {
    if (!jsonTreeVisible || jsonSplitterCompactMedia.matches) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyJsonTreePaneWidth(jsonTreePaneWidth + JSON_TREE_WIDTH_KEYBOARD_STEP, true);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      applyJsonTreePaneWidth(jsonTreePaneWidth - JSON_TREE_WIDTH_KEYBOARD_STEP, true);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      applyJsonTreePaneWidth(JSON_TREE_WIDTH_MIN, true);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      applyJsonTreePaneWidth(JSON_TREE_WIDTH_MAX, true);
      return;
    }
  });

  const readAutosaveEnabled = (): boolean => {
    const raw = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true;
  };

  const writeAutosaveEnabled = (enabled: boolean) => {
    window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, enabled ? "1" : "0");
  };

  const updateAutosaveButton = (enabled: boolean) => {
    btnAutosave.setAttribute("aria-pressed", enabled ? "true" : "false");
    const labelEl = btnAutosave.querySelector<HTMLElement>("span");
    if (labelEl) labelEl.textContent = enabled ? "Auto-guardado: Sí" : "Auto-guardado: No";
    btnAutosave.title = enabled
      ? "Guardar en scratch.md mientras editas"
      : "Auto-guardado desactivado (scratch.md no se actualizará)";
  };

  const toastProfileOptions: ReadonlyArray<{ id: ToastProfile; label: string; button: HTMLButtonElement }> = [
    { id: "balanced-fast", label: "Rápido balanceado", button: btnToastProfileBalanced },
    { id: "standard", label: "Estándar", button: btnToastProfileStandard },
  ];

  const toastPositionOptions: ReadonlyArray<{ id: ToastPosition; label: string; button: HTMLButtonElement }> = [
    { id: "bottom-right", label: "Inferior derecha", button: btnToastPositionBottom },
    { id: "top-right", label: "Superior derecha", button: btnToastPositionTop },
  ];

  const syncToastProfileControls = () => {
    const selected = toastProfileOptions.find((option) => option.id === toastProfile);
    if (selected) toastProfileSelectedName.textContent = selected.label;

    for (const option of toastProfileOptions) {
      const checked = option.id === toastProfile;
      option.button.setAttribute("aria-checked", checked ? "true" : "false");
      option.button.tabIndex = checked ? 0 : -1;
    }
  };

  const syncToastPositionControls = () => {
    const selected = toastPositionOptions.find((option) => option.id === toastPosition);
    if (selected) toastPositionSelectedName.textContent = selected.label;

    for (const option of toastPositionOptions) {
      const checked = option.id === toastPosition;
      option.button.setAttribute("aria-checked", checked ? "true" : "false");
      option.button.tabIndex = checked ? 0 : -1;
    }

    applyToastHostPosition(toastPosition);
  };

  const updateReduceMotionButton = (enabled: boolean) => {
    btnReduceMotion.setAttribute("aria-pressed", enabled ? "true" : "false");
    const labelEl = btnReduceMotion.querySelector<HTMLElement>("span");
    if (labelEl) labelEl.textContent = enabled ? "Reducir animaciones: Sí" : "Reducir animaciones: No";
    btnReduceMotion.title = enabled
      ? "Reducir transiciones y animaciones visuales"
      : "Usar transiciones y animaciones normales";
  };

  const setToastProfile = (next: ToastProfile, announce = true) => {
    if (toastProfile === next) return;
    toastProfile = next;
    writeToastProfile(next);
    syncToastProfileControls();

    if (announce) {
      const selected = toastProfileOptions.find((option) => option.id === next);
      const label = selected?.label ?? "Perfil";
      const message = `Notificaciones: ${label}`;
      updateStatus(message);
      notify({ kind: "info", message });
    }
  };

  const setToastPosition = (next: ToastPosition, announce = true) => {
    if (toastPosition === next) return;
    toastPosition = next;
    writeToastPosition(next);
    syncToastPositionControls();

    if (announce) {
      const selected = toastPositionOptions.find((option) => option.id === next);
      const label = selected?.label ?? "Posición";
      const message = `Toasts: ${label}`;
      updateStatus(message);
      notify({ kind: "info", message });
    }
  };

  const setReduceMotionPreference = (enabled: boolean, announce = true) => {
    if (reduceMotionPreference === enabled) return;
    reduceMotionPreference = enabled;
    writeReduceMotion(enabled);
    applyReducedMotionState();
    updateReduceMotionButton(enabled);

    if (announce) {
      const message = reduceMotionEnabled() ? "Animaciones reducidas" : "Animaciones completas";
      updateStatus(message);
      notify({ kind: "info", message });
    }
  };

  syncToastProfileControls();
  syncToastPositionControls();
  updateReduceMotionButton(reduceMotionPreference);

  const bindChoiceGroupKeyboard = <T extends string>(
    options: ReadonlyArray<{ id: T; button: HTMLButtonElement }>,
    onSelect: (id: T) => void,
  ) => {
    for (const [index, option] of options.entries()) {
      option.button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowUp") {
          return;
        }
        event.preventDefault();
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (index + direction + options.length) % options.length;
        const next = options[nextIndex];
        onSelect(next.id);
        next.button.focus();
      });
    }
  };

  for (const option of toastProfileOptions) {
    option.button.addEventListener("click", () => setToastProfile(option.id));
  }
  for (const option of toastPositionOptions) {
    option.button.addEventListener("click", () => setToastPosition(option.id));
  }
  bindChoiceGroupKeyboard(toastProfileOptions, (id) => setToastProfile(id));
  bindChoiceGroupKeyboard(toastPositionOptions, (id) => setToastPosition(id));
  btnReduceMotion.addEventListener("click", () => {
    setReduceMotionPreference(!reduceMotionPreference);
  });

  let autosaveEnabled = readAutosaveEnabled();
  updateAutosaveButton(autosaveEnabled);

  btnAutosave.addEventListener("click", () => {
    autosaveEnabled = !autosaveEnabled;
    writeAutosaveEnabled(autosaveEnabled);
    updateAutosaveButton(autosaveEnabled);
    const msg = autosaveEnabled ? "Auto-guardado activado" : "Auto-guardado desactivado";
    updateStatus(msg);
    notify({ kind: "info", message: msg });
    scheduleSessionStateSave();
  });

  const stopShortcutCapture = (statusText = "Listo") => {
    shortcutCaptureActive = false;
    runtimeShortcutStatusMessage = statusText;
    runtimeShortcutStatus.textContent = statusText;
    syncRuntimeSettingsControls();
  };

  btnCloseToTray.addEventListener("click", () => {
    void applyRuntimeSettings(
      { ...runtimeSettings, closeToTray: !runtimeSettings.closeToTray },
      {
        announceMessage: "No pude actualizar el cierre a bandeja.",
        successMessage: `Cerrar a bandeja: ${!runtimeSettings.closeToTray ? "Sí" : "No"}`,
      },
    );
  });

  btnRestoreSession.addEventListener("click", () => {
    void applyRuntimeSettings(
      { ...runtimeSettings, restoreLastSession: !runtimeSettings.restoreLastSession },
      {
        announceMessage: "No pude actualizar la reanudación de sesión.",
        successMessage: `Reanudar sesión: ${!runtimeSettings.restoreLastSession ? "Sí" : "No"}`,
      },
    );
  });

  btnLaunchOnStartup.addEventListener("click", () => {
    void applyRuntimeSettings(
      { ...runtimeSettings, launchOnStartup: !runtimeSettings.launchOnStartup },
      {
        announceMessage: "No pude actualizar el inicio con Windows.",
        successMessage: `Iniciar con Windows: ${!runtimeSettings.launchOnStartup ? "Sí" : "No"}`,
      },
    );
  });

  btnShortcutCapture.addEventListener("click", () => {
    shortcutCaptureActive = !shortcutCaptureActive;
    runtimeShortcutStatusMessage = shortcutCaptureActive ? "Presiona tu combinación…" : "Listo";
    runtimeShortcutStatus.textContent = runtimeShortcutStatusMessage;
    syncRuntimeSettingsControls();
  });

  btnShortcutReset.addEventListener("click", () => {
    shortcutCaptureActive = false;
    void applyRuntimeSettings(
      { ...runtimeSettings, globalShortcut: DEFAULT_RUNTIME_SETTINGS.globalShortcut },
      {
        announceMessage: "No pude restablecer el atajo global.",
        successMessage: `Atajo global: ${humanizeShortcut(DEFAULT_RUNTIME_SETTINGS.globalShortcut)}`,
      },
    );
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (!shortcutCaptureActive) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        stopShortcutCapture("Captura cancelada");
        return;
      }
      const shortcut = keyboardEventToShortcut(event);
      if (!shortcut || !isValidShortcutString(shortcut)) {
        runtimeShortcutStatusMessage = "Usa Ctrl, Alt o Shift junto con otra tecla.";
        runtimeShortcutStatus.textContent = runtimeShortcutStatusMessage;
        return;
      }

      runtimeShortcutStatusMessage = `Probando ${humanizeShortcut(shortcut)}…`;
      runtimeShortcutStatus.textContent = runtimeShortcutStatusMessage;
      void (async () => {
        const applied = await applyRuntimeSettings(
          { ...runtimeSettings, globalShortcut: shortcut },
          {
            announceMessage: "No pude actualizar el atajo global.",
            successMessage: `Atajo global: ${humanizeShortcut(shortcut)}`,
          },
        );
        stopShortcutCapture(applied ? "Listo" : "Elige otra combinación");
      })();
    },
    true,
  );

  btnResetPreferences.addEventListener("click", () => {
    void (async () => {
      const ok = await confirm(
        "¿Restablecer ajustes?\n\nEsto reinicia tema, familia visual, zoom y preferencias. La app se recargará.",
        {
          kind: "warning",
          title: "Pega e Ignora",
          okLabel: "Restablecer",
          cancelLabel: "Cancelar",
        },
      );
      if (!ok) return;

      for (const key of [
        THEME_STORAGE_KEY,
        LEGACY_APP_THEME_STORAGE_KEY,
        LEGACY_ACCENT_PALETTE_STORAGE_KEY,
        WORKSPACE_ZOOM_STORAGE_KEY,
        UI_PREF_KEYS.typography,
        SPELLCHECK_STORAGE_KEY,
        READ_MODE_STORAGE_KEY,
        SIDEBAR_SECTIONS_STORAGE_KEY,
        AUTOSAVE_STORAGE_KEY,
        UI_PREF_KEYS.toastProfile,
        UI_PREF_KEYS.toastPosition,
        UI_PREF_KEYS.reduceMotion,
        UI_PREF_KEYS.visualFamily,
        JSON_TREE_VISIBLE_STORAGE_KEY,
        JSON_WRAP_LINES_STORAGE_KEY,
        JSON_TREE_WIDTH_STORAGE_KEY,
      ]) {
        window.localStorage.removeItem(key);
      }

      window.location.reload();
    })();
  });

  let currentTheme: AppTheme = getInitialTheme();
  let currentVisualFamily: VisualFamily = VISUAL_FAMILY_BY_ID.has(initialUiPreferences.visualFamily)
    ? initialUiPreferences.visualFamily
    : DEFAULT_VISUAL_FAMILY;

  const typographyPresetButtons = new Map<TypographyPresetId, HTMLButtonElement>();
  const visualFamilyButtons = new Map<VisualFamily, HTMLButtonElement>();

  const applyAccentPalette = (palette: AccentPalette, theme: AppTheme) => {
    const def = ACCENT_PALETTE_BY_ID.get(palette) ?? ACCENT_PALETTE_BY_ID.get(DEFAULT_ACCENT_PALETTE);
    if (!def) return;
    const set = theme === "dark" ? def.dark : def.light;
    const root = document.documentElement;
    root.setAttribute("data-accent-palette", def.id);
    root.style.setProperty("--accent-1-rgb", set.a1);
    root.style.setProperty("--accent-2-rgb", set.a2);
    root.style.setProperty("--accent-3-rgb", set.a3);
    root.style.setProperty("--accent-4-rgb", set.a4);
  };

  const applyAppThemePalette = (palette: AppThemePalette, theme: AppTheme) => {
    const def = APP_THEME_BY_ID.get(palette) ?? APP_THEME_BY_ID.get(DEFAULT_APP_THEME);
    if (!def) return;
    const set = theme === "dark" ? def.dark : def.light;
    const root = document.documentElement;
    root.setAttribute("data-app-theme", def.id);
    root.style.setProperty("--bg", set.bg);
    root.style.setProperty("--panel", set.panel);
    root.style.setProperty("--panel-2", set.panel2);
    root.style.setProperty("--panel-3", set.panel3);
    root.style.setProperty("--text", set.text);
    root.style.setProperty("--muted", set.muted);
    root.style.setProperty("--border", set.border);
    root.style.setProperty("--shadow", set.shadow);
    root.style.setProperty("--topbar-start", set.topbarStart);
    root.style.setProperty("--topbar-end", set.topbarEnd);
    root.style.setProperty("--button-bg", set.buttonBg);
    root.style.setProperty("--sidebar-end", set.sidebarEnd);
    root.style.setProperty("--history-bg", set.historyBg);
    root.style.setProperty("--editor-shell-bg", set.editorShellBg);
    root.style.setProperty("--editor-main-bg", set.editorMainBg);
    root.style.setProperty("--code-block-bg", set.codeBlockBg);
  };

  const getVisualFamilyDefinition = (family: VisualFamily) =>
    VISUAL_FAMILY_BY_ID.get(family) ?? VISUAL_FAMILY_BY_ID.get(DEFAULT_VISUAL_FAMILY);

  const applyVisualFamily = (family: VisualFamily, theme: AppTheme) => {
    const definition = getVisualFamilyDefinition(family);
    if (!definition) return;
    document.documentElement.setAttribute("data-visual-family", definition.id);
    applyAppThemePalette(definition.appTheme, theme);
    applyAccentPalette(definition.accentPalette, theme);
  };

  const syncVisualFamilyPicker = () => {
    const active = getVisualFamilyDefinition(currentVisualFamily);
    if (active) visualFamilySelectedName.textContent = active.name;

    for (const definition of VISUAL_FAMILIES) {
      const button = visualFamilyButtons.get(definition.id);
      if (!button) continue;
      const appThemeDefinition = APP_THEME_BY_ID.get(definition.appTheme) ?? APP_THEME_BY_ID.get(DEFAULT_APP_THEME);
      const accentDefinition =
        ACCENT_PALETTE_BY_ID.get(definition.accentPalette) ?? ACCENT_PALETTE_BY_ID.get(DEFAULT_ACCENT_PALETTE);
      if (!appThemeDefinition || !accentDefinition) continue;
      const appThemeSet = currentTheme === "dark" ? appThemeDefinition.dark : appThemeDefinition.light;
      const accentSet = currentTheme === "dark" ? accentDefinition.dark : accentDefinition.light;
      button.style.setProperty("--sw-bg", appThemeSet.bg);
      button.style.setProperty("--sw-panel", appThemeSet.panel);
      button.style.setProperty("--sw-panel-3", appThemeSet.panel3);
      button.style.setProperty("--sw-accent", `rgb(${accentSet.a1})`);
      button.style.setProperty("--sw-border", appThemeSet.border);

      const checked = definition.id === currentVisualFamily;
      button.setAttribute("aria-checked", checked ? "true" : "false");
      button.tabIndex = checked ? 0 : -1;
    }
  };

  const setVisualFamily = (next: VisualFamily, announce = true) => {
    if (!VISUAL_FAMILY_BY_ID.has(next)) return;
    currentVisualFamily = next;
    writeVisualFamily(next);
    window.localStorage.removeItem(LEGACY_APP_THEME_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_ACCENT_PALETTE_STORAGE_KEY);
    applyVisualFamily(currentVisualFamily, currentTheme);
    syncVisualFamilyPicker();

    if (announce) {
      const name = getVisualFamilyDefinition(next)?.name ?? "Familia visual";
      updateStatus(`Familia visual: ${name}`);
      notify({ kind: "info", message: `Familia visual: ${name}` });
    }
  };

  const buildVisualFamilyPicker = () => {
    visualFamilyGrid.innerHTML = "";
    visualFamilyButtons.clear();

    for (const definition of VISUAL_FAMILIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-option";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-label", `${definition.name}. ${definition.description}`);

      const swatches = document.createElement("span");
      swatches.className = "theme-swatches";
      swatches.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 4; i += 1) {
        const sw = document.createElement("span");
        sw.className = "theme-swatch";
        swatches.append(sw);
      }

      const copy = document.createElement("span");
      copy.className = "theme-copy";

      const label = document.createElement("span");
      label.className = "theme-name";
      label.textContent = definition.name;

      const description = document.createElement("span");
      description.className = "theme-description";
      description.textContent = definition.description;

      copy.append(label, description);
      button.append(swatches, copy);
      button.addEventListener("click", () => setVisualFamily(definition.id));

      visualFamilyGrid.append(button);
      visualFamilyButtons.set(definition.id, button);
    }

    syncVisualFamilyPicker();
  };

  buildVisualFamilyPicker();
  bindChoiceGroupKeyboard(
    VISUAL_FAMILIES.map((definition) => {
      const button = visualFamilyButtons.get(definition.id);
      if (!button) throw new Error(`Falta botón de familia visual: ${definition.id}`);
      return { id: definition.id, button };
    }),
    (id) => setVisualFamily(id),
  );

  const applyTheme = (theme: AppTheme) => {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    btnTheme.dataset.mode = theme;
    btnTheme.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    const nextAction = theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
    btnTheme.title = nextAction;
    btnTheme.setAttribute("aria-label", nextAction);
    applyVisualFamily(currentVisualFamily, theme);
    syncVisualFamilyPicker();
  };
  applyTheme(currentTheme);

  btnTheme.addEventListener("click", () => {
    const nextTheme: AppTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    updateStatus(nextTheme === "dark" ? "Tema oscuro" : "Tema claro");
    notify({ kind: "info", message: nextTheme === "dark" ? "Tema oscuro" : "Tema claro" });
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
    btnReadMode.setAttribute("aria-pressed", enabled ? "true" : "false");
    btnReadMode.title = enabled ? "Salir de modo lectura" : "Entrar a modo lectura";
  };

  let readModeEnabled = readReadModeEnabled();
  applyReadMode(readModeEnabled);

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
    setSpellcheck(editorEl, enabled);
    const proseMirror = editorEl.querySelector<HTMLElement>(".ProseMirror");
    if (proseMirror) setSpellcheck(proseMirror, enabled);
    for (const node of editorEl.querySelectorAll<HTMLTextAreaElement>("textarea")) {
      node.spellcheck = enabled;
      node.setAttribute("spellcheck", enabled ? "true" : "false");
      node.setAttribute("lang", "es");
    }
  };

  const applyOrderedListStartFix = () => {
    for (const ol of editorEl.querySelectorAll<HTMLOListElement>(".ProseMirror ol[start]")) {
      const startRaw = ol.getAttribute("start") ?? "";
      if ((ol.dataset.pmOlStart ?? "") === startRaw) continue;
      ol.dataset.pmOlStart = startRaw;
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
    setButtonLabel(btnSpellcheck, enabled ? "Ortografía: Sí" : "Ortografía: No");
    btnSpellcheck.setAttribute("aria-pressed", enabled ? "true" : "false");
    btnSpellcheck.title = enabled
      ? "Ortografía activada (Español). Click para desactivar."
      : "Ortografía desactivada. Click para activar.";
  };

  let spellcheckEnabled = readSpellcheckEnabled();
  updateSpellcheckButton(spellcheckEnabled);

  let typographySettings: TypographySettings = readTypographySettings();
  let typographyModeContext: TypographyModeContext = activeDocumentMode === "json" ? "json" : "markdown";

  const getJsonBlockGapPx = (settings: TypographySettings): number =>
    Math.round(settings.paragraphSpacingEm * settings.fontSizePx * 1.15);

  const getJsonLineHeight = (settings: TypographySettings): number =>
    clampNumber(Number((settings.lineHeight + settings.paragraphSpacingEm * 0.52).toFixed(2)), 1.2, 2.6);

  const getOutlineFontSizePx = (settings: TypographySettings): number =>
    clampNumber(settings.fontSizePx - 2, 11, 20);

  const getOutlineLineHeight = (settings: TypographySettings): number =>
    clampNumber(Number((settings.lineHeight + settings.paragraphSpacingEm * 0.28).toFixed(2)), 1.15, 2.4);

  const getOutlineItemGapPx = (settings: TypographySettings): number =>
    Math.round(settings.paragraphSpacingEm * settings.fontSizePx * 1.05);

  const formatTypographySpacingValue = (settings: TypographySettings, context: TypographyModeContext): string =>
    context === "json"
      ? `${getJsonBlockGapPx(settings)}px`
      : `${settings.paragraphSpacingEm.toFixed(2)}em`;

  const syncTypographyContext = () => {
    typographyModeContext = activeDocumentMode === "json" ? "json" : "markdown";

    if (typographyModeContext === "json") {
      setText(typographySpacingLabel, "Separación entre bloques");
      setText(
        formatContextNote,
        "JSON: controla el editor, el árbol y la estructura lateral. El espaciado ajusta la separación visual entre bloques.",
      );
      typographyParagraphSpacing.setAttribute("aria-label", "Separación entre bloques JSON");
      typographyParagraphSpacing.title = "Ajusta la separación visual entre bloques, nodos y estructura JSON.";
    } else {
      setText(typographySpacingLabel, "Espaciado entre párrafos");
      setText(
        formatContextNote,
        "Markdown: controla lectura, escritura y separación entre párrafos.",
      );
      typographyParagraphSpacing.setAttribute("aria-label", "Espaciado entre párrafos");
      typographyParagraphSpacing.title = "Ajusta la separación vertical entre párrafos y bloques de Markdown.";
    }
  };

  const syncTypographyPresetPicker = () => {
    const activePreset = getTypographyPreset(typographySettings.presetId);
    setText(typographyPresetSelectedName, activePreset.label);

    for (const preset of TYPOGRAPHY_PRESETS) {
      const button = typographyPresetButtons.get(preset.id);
      if (!button) continue;
      const checked = preset.id === typographySettings.presetId;
      button.setAttribute("aria-checked", checked ? "true" : "false");
      button.tabIndex = checked ? 0 : -1;
    }
  };

  const applyTypographySettings = (settings: TypographySettings) => {
    const preset = getTypographyPreset(settings.presetId);
    const jsonBlockGapPx = getJsonBlockGapPx(settings);
    const jsonLineHeight = getJsonLineHeight(settings);
    const outlineFontSizePx = getOutlineFontSizePx(settings);
    const outlineLineHeight = getOutlineLineHeight(settings);
    const outlineItemGapPx = getOutlineItemGapPx(settings);
    appEl.style.setProperty("--md-reading-font", preset.readingFont);
    appEl.style.setProperty("--md-writing-font", preset.writingFont);
    appEl.style.setProperty("--md-code-font", preset.codeFont);
    appEl.style.setProperty("--json-font", preset.jsonFont);
    appEl.style.setProperty("--md-font-size", `${settings.fontSizePx}px`);
    appEl.style.setProperty("--md-line-height", String(settings.lineHeight));
    appEl.style.setProperty("--md-paragraph-spacing", `${settings.paragraphSpacingEm}em`);
    appEl.style.setProperty("--json-font-size", `${settings.fontSizePx}px`);
    appEl.style.setProperty("--json-line-height", String(jsonLineHeight));
    appEl.style.setProperty("--json-block-gap", `${jsonBlockGapPx}px`);
    appEl.style.setProperty("--outline-font-size", `${outlineFontSizePx}px`);
    appEl.style.setProperty("--outline-line-height", String(outlineLineHeight));
    appEl.style.setProperty("--outline-item-gap", `${outlineItemGapPx}px`);
  };

  const updateTypographyControls = (settings: TypographySettings) => {
    syncTypographyPresetPicker();
    typographyFontSize.value = String(settings.fontSizePx);
    setText(typographyFontSizeValue, `${settings.fontSizePx}px`);

    typographyLineHeight.value = String(settings.lineHeight);
    setText(typographyLineHeightValue, settings.lineHeight.toFixed(2));

    typographyParagraphSpacing.value = String(settings.paragraphSpacingEm);
    setText(typographyParagraphSpacingValue, formatTypographySpacingValue(settings, typographyModeContext));
  };

  const setTypographyPreset = (presetId: TypographyPresetId, announce = true) => {
    if (typographySettings.presetId === presetId) return;
    typographySettings = { ...typographySettings, presetId };
    applyTypographySettings(typographySettings);
    updateTypographyControls(typographySettings);
    writeTypographySettings(typographySettings);

    if (announce) {
      const message = `Tipografia: ${getTypographyPreset(presetId).label}`;
      updateStatus(message);
      notify({ kind: "info", message });
    }
  };

  const buildTypographyPresetPicker = () => {
    typographyPresetGroup.innerHTML = "";
    typographyPresetButtons.clear();

    for (const preset of TYPOGRAPHY_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "typography-option";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-label", `${preset.label}. ${preset.description}`);

      const sample = document.createElement("span");
      sample.className = "typography-option-sample";
      sample.textContent = "Aa Bb 123";
      sample.style.fontFamily = preset.readingFont;

      const copy = document.createElement("span");
      copy.className = "typography-option-copy";

      const name = document.createElement("span");
      name.className = "typography-option-name";
      name.textContent = preset.label;

      const description = document.createElement("span");
      description.className = "typography-option-description";
      description.textContent = preset.description;

      copy.append(name, description);
      button.append(sample, copy);
      button.addEventListener("click", () => setTypographyPreset(preset.id));

      typographyPresetGroup.append(button);
      typographyPresetButtons.set(preset.id, button);
    }

    syncTypographyPresetPicker();
    sidebarSections?.refreshLayout();
  };

  buildTypographyPresetPicker();
  bindChoiceGroupKeyboard(
    TYPOGRAPHY_PRESETS.map((preset) => {
      const button = typographyPresetButtons.get(preset.id);
      if (!button) throw new Error(`Falta boton de tipografia: ${preset.id}`);
      return { id: preset.id, button };
    }),
    (id) => setTypographyPreset(id),
  );

  applyTypographySettings(typographySettings);
  syncTypographyContext();
  updateTypographyControls(typographySettings);

  const onTypographyChanged = () => {
    typographySettings = {
      ...typographySettings,
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
    typographySettings = DEFAULT_TYPOGRAPHY_SETTINGS;
    applyTypographySettings(typographySettings);
    updateTypographyControls(typographySettings);
    window.localStorage.removeItem(UI_PREF_KEYS.typography);
    updateStatus("Formato restablecido");
  });

  editorEl.innerHTML = `<div class="editor-loading" role="status" aria-live="polite">Cargando editor…</div>`;
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

  let editor: ToastUiEditor;
  try {
    const { default: Editor } = await import("@toast-ui/editor");
    editor = new Editor({
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
  } catch (err) {
    editorEl.innerHTML = `<div class="editor-loading" role="alert">No pude cargar el editor.</div>`;
    updateStatus("Editor no disponible");
    notify({ kind: "error", message: "No pude cargar el editor." });
    return;
  }
  const jsonWorkspace = createJsonWorkspace({
    textAreaEl: jsonTextEditorEl,
    highlightEl: jsonHighlightEl,
    treeEl: jsonTreeEl,
    statusEl: jsonParseStatusEl,
    prettyBtn: btnJsonPretty,
    minifyBtn: btnJsonMinify,
    treeVisible: jsonTreeVisible,
    onInform: (messageText, kind) => {
      updateStatus(messageText);
      notify({
        kind: kind === "error" ? "error" : kind === "warning" ? "warning" : "info",
        message: messageText,
      });
    },
  });
  jsonWorkspaceTreeApi = jsonWorkspace;

  let jsonUiSyncTimer: number | null = null;
  const scheduleJsonUiSync = ({
    revealOutline = false,
    delayMs = 0,
    rerenderOutline = false,
    updateStatusText = false,
  }: {
    revealOutline?: boolean;
    delayMs?: number;
    rerenderOutline?: boolean;
    updateStatusText?: boolean;
  } = {}) => {
    if (jsonUiSyncTimer !== null) {
      window.clearTimeout(jsonUiSyncTimer);
    }
    jsonUiSyncTimer = window.setTimeout(() => {
      jsonUiSyncTimer = null;
      if (activeDocumentMode !== "json") return;
      if (rerenderOutline) renderOutline();
      const path = jsonWorkspace.getSelectedPath();
      syncJsonOutlineSelection(path, revealOutline);
      if (updateStatusText && path) {
        updateStatus(`Nodo: ${path}`);
      }
    }, delayMs);
  };

  const syncJsonOutlineSelection = (path: string | null, reveal = false) => {
    if (activeDocumentMode !== "json") return;
    let activeItem: HTMLElement | null = null;
    for (const item of outlineEl.querySelectorAll<HTMLElement>(".outline-item[data-json-path]")) {
      const matches = item.dataset.jsonPath === path;
      item.classList.toggle("is-active", matches);
      if (matches) activeItem = item;
    }
    if (reveal && activeItem) {
      activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const renderJsonOutline = () => {
    outlineEl.innerHTML = "";
    const activeJsonPath = jsonWorkspace.getSelectedPath();
    if (!jsonWorkspace.isValid()) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "JSON inválido. Corrige el texto para ver estructura.";
      outlineEl.append(empty);
      sidebarSections?.refreshLayout();
      return;
    }

    const entries = jsonWorkspace.getStructureEntries().slice(0, 260);
    if (entries.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = jsonTreeVisible
        ? "Estructura JSON no disponible (árbol deshabilitado o analizando)."
        : "Árbol JSON oculto. Activa “Árbol” para ver estructura.";
      outlineEl.append(empty);
      sidebarSections?.refreshLayout();
      return;
    }

    for (const entry of entries) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "outline-item";
      btn.dataset.jsonPath = entry.path;
      btn.setAttribute("data-level", String(Math.min(6, entry.depth + 1)));
      btn.style.setProperty("--outline-level", String(Math.min(6, entry.depth + 1)));
      btn.title = entry.path;
      if (entry.path === activeJsonPath) btn.classList.add("is-active");

      const level = document.createElement("span");
      level.className = "outline-level";
      level.textContent = entry.kind;

      const text = document.createElement("span");
      text.className = "outline-text";
      text.textContent = clamp(entry.label, 80);

      const line = document.createElement("span");
      line.className = "outline-line";
      line.textContent = entry.path;

      btn.append(level, text, line);
      btn.addEventListener("click", () => {
        jsonWorkspace.selectPath(entry.path, { source: "outline", reveal: true, focusTarget: "none" });
        scheduleJsonUiSync({ revealOutline: true, updateStatusText: true, delayMs: 0 });
      });
      outlineEl.append(btn);
    }

    sidebarSections?.refreshLayout();
  };

  onDocumentModeChanged = () => {
    if (activeDocumentMode === "json") {
      renderJsonOutline();
    }
  };

  jsonWorkspace.onChange(() => {
    if (activeDocumentMode !== "json") return;
    renderJsonOutline();
    syncJsonOutlineSelection(jsonWorkspace.getSelectedPath(), false);
    scheduleJsonUiSync({ rerenderOutline: true, updateStatusText: false, delayMs: 0 });
  });

  jsonWorkspace.onSelectionChange((change) => {
    if (activeDocumentMode !== "json") return;
    syncJsonOutlineSelection(change.path, change.source !== "editor");
    if (change.path) {
      updateStatus(`Nodo: ${change.path}`);
    }
    scheduleSessionStateSave(180);
  });

  jsonTextEditorEl.addEventListener("select", () => scheduleSessionStateSave(180));
  jsonTextEditorEl.addEventListener("keyup", () => scheduleSessionStateSave(180));
  jsonTextEditorEl.addEventListener("click", () => scheduleSessionStateSave(180));
  jsonTextEditorEl.addEventListener("scroll", () => scheduleSessionStateSave(180), { passive: true });

  jsonTreeEl.addEventListener(
    "click",
    () => {
      scheduleJsonUiSync({ revealOutline: true, updateStatusText: true, delayMs: 0 });
    },
    { capture: true },
  );
  jsonTextEditorEl.addEventListener("input", () => {
    scheduleJsonUiSync({ rerenderOutline: true, updateStatusText: false, delayMs: 240 });
  });
  jsonTextEditorEl.addEventListener("click", () => {
    scheduleJsonUiSync({ updateStatusText: true, delayMs: 180 });
  });
  jsonTextEditorEl.addEventListener("keyup", () => {
    scheduleJsonUiSync({ updateStatusText: true, delayMs: 180 });
  });
  jsonTextEditorEl.addEventListener("select", () => {
    scheduleJsonUiSync({ updateStatusText: true, delayMs: 180 });
  });

  applySpellcheckToEditor(spellcheckEnabled);
  applyOrderedListStartFix();
  const debouncedOrderedListStartFix = debounce(applyOrderedListStartFix, 240);

  btnSpellcheck.addEventListener("click", () => {
    spellcheckEnabled = !spellcheckEnabled;
    writeSpellcheckEnabled(spellcheckEnabled);
    updateSpellcheckButton(spellcheckEnabled);
    applySpellcheckToEditor(spellcheckEnabled);
    const msg = spellcheckEnabled ? "Ortografía activada" : "Ortografía desactivada";
    setText(statusEl, msg);
    notify({ kind: "info", message: msg });
  });

  btnReadMode.addEventListener("click", () => {
    readModeEnabled = !readModeEnabled;
    writeReadModeEnabled(readModeEnabled);
    applyReadMode(readModeEnabled);
    const msg = readModeEnabled ? "Modo lectura" : "Modo edición";
    setText(statusEl, msg);
    notify({ kind: "info", message: msg });
  });

  const syncModeTabs = () => {
    const markdownActive = activeDocumentMode === "markdown";
    tabMarkdown.setAttribute("aria-selected", markdownActive ? "true" : "false");
    tabMarkdown.tabIndex = markdownActive ? 0 : -1;
    tabJson.setAttribute("aria-selected", markdownActive ? "false" : "true");
    tabJson.tabIndex = markdownActive ? -1 : 0;
    markdownPanelEl.hidden = !markdownActive;
    jsonPanelEl.hidden = markdownActive;
    settleSidebarSectionTransitions();
    sidebarSections?.setVisible("format", true);
    outlineSectionTitleEl.textContent = markdownActive ? "Jerarquía" : "Estructura JSON";
    outlineSectionToggleEl.title = markdownActive ? "Mostrar/ocultar Jerarquía" : "Mostrar/ocultar Estructura JSON";
    syncTypographyContext();
    updateTypographyControls(typographySettings);
    sidebarSections?.refreshLayout();
    syncOutlineSectionVisibility();
    renderOutline();
  };

  const setActiveDocumentMode = (mode: DocumentMode, announce = false) => {
    activeDocumentMode = mode;
    window.localStorage.setItem(DOCUMENT_MODE_STORAGE_KEY, mode);
    syncModeTabs();
    onDocumentModeChanged();
    if (announce) {
      const label = mode === "markdown" ? "Modo Markdown" : "Modo JSON";
      updateStatus(label);
      notify({ kind: "info", message: label });
    }
  };

  tabMarkdown.addEventListener("click", () => {
    if (activeDocumentMode === "markdown") return;
    setActiveDocumentMode("markdown", true);
    editor.focus();
  });

  tabJson.addEventListener("click", () => {
    if (activeDocumentMode === "json") return;
    setActiveDocumentMode("json", true);
    jsonWorkspace.focus();
  });

  const tabs = [tabMarkdown, tabJson];
  for (const tab of tabs) {
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      if (index === -1) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        tabs[(index + 1) % tabs.length].click();
        tabs[(index + 1) % tabs.length].focus();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        tabs[(index + tabs.length - 1) % tabs.length].click();
        tabs[(index + tabs.length - 1) % tabs.length].focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        tabs[0].click();
        tabs[0].focus();
      } else if (event.key === "End") {
        event.preventDefault();
        tabs[tabs.length - 1].click();
        tabs[tabs.length - 1].focus();
      }
    });
  }

  const selectionPosToIndex = (text: string, pos: number | number[]): number => {
    if (typeof pos === "number") return clampNumber(pos, 0, text.length);
    const line = clampNumber(pos[0] ?? 1, 1, Number.MAX_SAFE_INTEGER);
    const charOffset = clampNumber(pos[1] ?? 1, 1, Number.MAX_SAFE_INTEGER);
    let currentLine = 1;
    let index = 0;
    while (currentLine < line && index < text.length) {
      if (text[index] === "\n") currentLine += 1;
      index += 1;
    }
    return clampNumber(index + charOffset - 1, 0, text.length);
  };

  const findReplace = createFindReplace({
    editor: {
      getMarkdown: () => (activeDocumentMode === "json" ? jsonWorkspace.getText() : editor.getMarkdown()),
      setMarkdown: (markdown: string) => {
        if (activeDocumentMode === "json") {
          jsonWorkspace.setText(markdown, true);
          return;
        }
        editor.setMarkdown(markdown, false);
      },
      setSelection: (start, end) => {
        if (activeDocumentMode === "json") {
          const textValue = jsonWorkspace.getText();
          const from = selectionPosToIndex(textValue, start);
          const to = selectionPosToIndex(textValue, end);
          jsonTextEditorEl.focus();
          jsonTextEditorEl.setSelectionRange(from, to);
          return;
        }
        editor.setSelection(start, end);
      },
      focus: () => {
        if (activeDocumentMode === "json") {
          jsonWorkspace.focus();
          return;
        }
        editor.focus();
      },
      isWysiwygMode: () => (activeDocumentMode === "json" ? false : editor.isWysiwygMode()),
      convertPosToMatchEditorMode: (start, end, mode) => {
        if (activeDocumentMode === "json") return [start, end ?? start];
        return editor.convertPosToMatchEditorMode(start, end, mode);
      },
      replaceSelection: (nextText, start, end) => {
        if (activeDocumentMode === "json") {
          const source = jsonWorkspace.getText();
          const from = selectionPosToIndex(source, start ?? jsonTextEditorEl.selectionStart);
          const to = selectionPosToIndex(source, end ?? jsonTextEditorEl.selectionEnd);
          const next = source.slice(0, from) + nextText + source.slice(to);
          jsonWorkspace.setText(next, true);
          const cursor = from + nextText.length;
          jsonTextEditorEl.focus();
          jsonTextEditorEl.setSelectionRange(cursor, cursor);
          return;
        }
        editor.replaceSelection(nextText, start, end);
      },
    },
  });

  let suppressEditorChange = false;
  const getEditorValue = () => editor.getMarkdown();
  const setEditorValue = (markdown: string): { markdown: string; hadUnsafeLinks: boolean } => {
    const sanitized = sanitizeMarkdownLinks(markdown);
    suppressEditorChange = true;
    editor.setMarkdown(sanitized.markdown, false);
    suppressEditorChange = false;
    renderOutline();
    return { markdown: sanitized.markdown, hadUnsafeLinks: sanitized.changed };
  };
  const getActiveDocumentValue = () => (activeDocumentMode === "json" ? jsonWorkspace.getText() : getEditorValue());
  const inferCurrentDocumentTitle = (path: string | null) =>
    inferDocumentTitle(getActiveDocumentValue(), activeDocumentMode, path);
  const modeCompatibleWithPath = (mode: DocumentMode, path: string) => {
    const inferred = modeFromPath(path);
    if (!inferred) return false;
    return inferred === mode;
  };

  let sessionWriteTimer: number | null = null;
  let restoreUiTimer: number | null = null;

  const collectSessionState = (): SessionState =>
    createSessionState({
      currentPath,
      documentMode: activeDocumentMode,
      isDirty,
      restoreSource: isDirty || !currentPath ? "scratch" : "file",
      workspaceScrollTop: workspaceEl.scrollTop,
      jsonSelectedPath: jsonWorkspace.getSelectedPath(),
      jsonSelectionStart: activeDocumentMode === "json" ? jsonTextEditorEl.selectionStart : null,
      jsonSelectionEnd: activeDocumentMode === "json" ? jsonTextEditorEl.selectionEnd : null,
      updatedAt: Date.now(),
    });

  const persistSessionStateNow = async () => {
    try {
      const next = collectSessionState();
      lastSessionState = next;
      await writeSessionState(vault, next);
    } catch {
      // best-effort
    }
  };

  const scheduleSessionStateSave = (delayMs = 220) => {
    if (sessionWriteTimer !== null) {
      window.clearTimeout(sessionWriteTimer);
    }
    sessionWriteTimer = window.setTimeout(() => {
      sessionWriteTimer = null;
      void persistSessionStateNow();
    }, delayMs);
  };

  const scheduleRestoreUiState = () => {
    if (restoreUiTimer !== null) {
      window.clearTimeout(restoreUiTimer);
    }
    restoreUiTimer = window.setTimeout(() => {
      restoreUiTimer = null;
      if (pendingRestoreWorkspaceScrollTop > 0) {
        workspaceEl.scrollTop = pendingRestoreWorkspaceScrollTop;
      }
      if (pendingRestoreJsonSelection && activeDocumentMode === "json") {
        const { path, start, end } = pendingRestoreJsonSelection;
        if (path) {
          jsonWorkspace.selectPath(path, { source: "program", reveal: true, focusTarget: "none" });
        }
        if (start !== null) {
          jsonTextEditorEl.setSelectionRange(start, end ?? start);
        }
      }
    }, 60);
  };

  let workspaceZoom = 1;
  const storedWorkspaceZoom = Number(window.localStorage.getItem(WORKSPACE_ZOOM_STORAGE_KEY));
  if (Number.isFinite(storedWorkspaceZoom)) {
    workspaceZoom = clampNumber(storedWorkspaceZoom, MIN_WORKSPACE_ZOOM, MAX_WORKSPACE_ZOOM);
  }
  const applyWorkspaceZoom = () => {
    const zoomValue = workspaceZoom.toFixed(2);
    appEl.style.setProperty("--workspace-zoom", zoomValue);
    editorEl.style.setProperty("--workspace-zoom", zoomValue);
  };
  applyWorkspaceZoom();
  syncModeTabs();

  const visualFamilyActions: CommandPaletteAction[] = VISUAL_FAMILIES.map((family) => ({
    id: `family.${family.id}`,
    title: `Familia visual: ${family.name}`,
    subtitle: family.description,
    group: "Vista",
    keywords: ["familia", "estilo", "tema", family.id, family.name.toLowerCase()],
  }));

  const basePaletteActions: CommandPaletteAction[] = [
    { id: "view.theme", title: "Cambiar tema", subtitle: "Claro / Oscuro", group: "Vista" },
    { id: "view.modeMarkdown", title: "Vista Markdown", subtitle: "Activar editor Markdown", group: "Vista" },
    { id: "view.modeJson", title: "Vista JSON", subtitle: "Activar editor JSON", group: "Vista" },
    { id: "view.readMode", title: "Modo lectura", subtitle: "Ocultar sidebar", group: "Vista", keywords: ["lectura"] },
    { id: "tools.spellcheck", title: "Ortografía", subtitle: "Mostrar/ocultar subrayados", group: "Herramientas" },
    { id: "tools.jsonPretty", title: "JSON Pretty", subtitle: "Formatear con 2 espacios", group: "Herramientas" },
    { id: "tools.jsonMinify", title: "JSON Minify", subtitle: "Compactar JSON", group: "Herramientas" },
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
    ...visualFamilyActions,
  ];

  let palette = createCommandPalette({
    actions: basePaletteActions,
    title: "Comandos",
    placeholder: "Escribe para buscar…",
    onRun: (actionId) => {
      if (actionId.startsWith("family.")) {
        const next = actionId.slice("family.".length);
        if (isVisualFamilyId(next)) setVisualFamily(next);
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
      if (actionId === "view.modeMarkdown") {
        if (activeDocumentMode !== "markdown") setActiveDocumentMode("markdown", true);
        return;
      }
      if (actionId === "view.modeJson") {
        if (activeDocumentMode !== "json") setActiveDocumentMode("json", true);
        return;
      }
      if (actionId === "tools.spellcheck") {
        btnSpellcheck.click();
        return;
      }
      if (actionId === "tools.jsonPretty") {
        if (activeDocumentMode !== "json") {
          notify({ kind: "info", message: "Cambia a vista JSON para formatear." });
          return;
        }
        if (jsonWorkspace.pretty()) {
          updateStatus("JSON formateado");
        }
        return;
      }
      if (actionId === "tools.jsonMinify") {
        if (activeDocumentMode !== "json") {
          notify({ kind: "info", message: "Cambia a vista JSON para minificar." });
          return;
        }
        if (jsonWorkspace.minify()) {
          updateStatus("JSON minificado");
        }
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
  btnSettings.setAttribute("aria-expanded", "false");

  const getSettingsFocusable = (): HTMLElement[] => {
    const nodes = Array.from(
      settingsPanel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    return nodes.filter((node) => {
      if (node.hasAttribute("disabled")) return false;
      if (node.getAttribute("aria-hidden") === "true") return false;
      if (node.tabIndex < 0) return false;
      return node.getClientRects().length > 0;
    });
  };

  const closeSettings = () => {
    if (!settingsOpen) return;
    settingsOpen = false;
    settingsOverlay.dataset.state = "closed";
    btnSettings.setAttribute("aria-expanded", "false");
    window.removeEventListener("keydown", onSettingsKeyDown, true);

    const restoreFocus = () => {
      appEl.removeAttribute("inert");
      appEl.removeAttribute("aria-hidden");
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

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeSettings();
      return;
    }

    if (event.key !== "Tab") return;

    const focusables = getSettingsFocusable();
    if (focusables.length === 0) {
      event.preventDefault();
      settingsCloseBtn.focus();
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const goingBack = event.shiftKey;

    if (!active || !settingsPanel.contains(active)) {
      event.preventDefault();
      (goingBack ? last : first).focus();
      return;
    }

    if (!goingBack && active === last) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (goingBack && active === first) {
      event.preventDefault();
      last.focus();
    }
  };

  const openSettings = () => {
    if (settingsOpen) return;
    settingsOpen = true;
    btnSettings.setAttribute("aria-expanded", "true");
    settingsLastActive = (document.activeElement as HTMLElement | null) ?? null;
    appEl.setAttribute("inert", "");
    appEl.setAttribute("aria-hidden", "true");

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
      notify({ kind: "error", message: "Vault no disponible (solo modo lectura)." });
    }

    btnOpen.disabled = true;
    btnSave.disabled = true;
    btnSaveAs.disabled = true;
    btnOpenVault.disabled = true;
    btnExploreVault.disabled = true;
    btnRefreshHistory.disabled = true;
    setText(vaultNotesPathEl, "Vault no disponible");
    return;
  }

  setText(vaultNotesPathEl, vault.notesDir);

  let lastSessionState: SessionState | null = await readSessionState(vault);
  let currentPath: string | null = null;
  let history: HistoryItem[] = await loadHistory(vault);
  let isDirty = false;
  let saveInProgress = false;
  let pendingRestoreWorkspaceScrollTop = 0;
  let pendingRestoreJsonSelection: { path: string | null; start: number | null; end: number | null } | null = null;

  const normalizeForCompare = (p: string) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
  const vaultDirNorm = normalizeForCompare(vault.vaultDir);
  const isInsideVault = (p: string) => {
    const norm = normalizeForCompare(p);
    return norm === vaultDirNorm || norm.startsWith(vaultDirNorm + "/");
  };

  const syncFileButtons = () => {
    const jsonValid = activeDocumentMode !== "json" || jsonWorkspace.isValid();
    const canSave = !saveInProgress && jsonValid && (currentPath === null || isDirty);
    btnSave.disabled = !canSave;
    btnSaveAs.disabled = saveInProgress || !jsonValid;
  };

  const updateMeta = () => {
    const fileLabel = currentPath ? basename(currentPath) : "(sin archivo)";
    const modeLabel = activeDocumentMode === "json" ? "JSON" : "Markdown";
    setText(workspaceMetaEl, `${fileLabel} • ${modeLabel}${isDirty ? " • editando" : ""}`);
    syncFileButtons();
    scheduleSessionStateSave();
  };

  onDocumentModeChanged = () => {
    if (currentPath && !modeCompatibleWithPath(activeDocumentMode, currentPath)) {
      currentPath = null;
      isDirty = false;
    }
    renderOutline();
    updateMeta();
    syncFileButtons();
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
        notify({ kind: "warning", message: "Link bloqueado por seguridad." });
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
      await writeTextFile(vault.scratchPath, getActiveDocumentValue());
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
      sidebarSections?.refreshLayout();
      return;
    }

    for (const item of history) {
      const row = document.createElement("li");
      row.className = "history-row";

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

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "history-delete";
      deleteBtn.title = "Borrar archivo";
      deleteBtn.setAttribute("aria-label", `Borrar ${basename(item.path)}`);
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 6l1 16h10l1-16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `.trim();

      deleteBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (saveInProgress) return;

        if (!isInsideVault(item.path)) {
          await message(
            `Por ahora esta app solo borra dentro del vault:\n\n${vault.vaultDir}`,
            { kind: "warning", title: "Pega e Ignora" },
          );
          return;
        }

        const filename = basename(item.path);
        const ok = await confirm(`¿Borrar "${filename}"?\n\nEsto elimina el archivo del vault.`, {
          kind: "warning",
          title: "Pega e Ignora",
          okLabel: "Borrar",
          cancelLabel: "Cancelar",
        });
        if (!ok) return;

        deleteBtn.disabled = true;
        let deleted = false;
        try {
          await remove(item.path);
          deleted = true;
          updateStatus(`Borrado: ${filename}`);
          notify({ id: "file.deleted", kind: "warning", message: `Borrado: ${filename}` });
        } catch (err) {
          updateStatus(`No pude borrar: ${filename}`);
          notify({ id: "file.deleteError", kind: "error", message: `No pude borrar: ${filename}` });
        } finally {
          let shouldDrop = deleted;
          if (!shouldDrop) {
            try {
              shouldDrop = !(await exists(item.path));
            } catch {
              shouldDrop = false;
            }
          }

          if (shouldDrop) {
            history = history.filter((h) => h.path !== item.path);
            renderHistory();
            try {
              await saveHistory(vault, history);
            } catch {
              // best-effort
            }

            if (currentPath && normalizeForCompare(currentPath) === normalizeForCompare(item.path)) {
              currentPath = null;
              isDirty = true;
              updateMeta();
            }
            return;
          }

          deleteBtn.disabled = false;
        }
      });

      row.append(btn, deleteBtn);
      historyEl.append(row);
    }

    sidebarSections?.refreshLayout();
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
    if (activeDocumentMode === "json") {
      renderJsonOutline();
      return;
    }

    const headings = extractHeadingEntries(getEditorValue());
    if (headings.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "Sin encabezados. Usa #, ##, ### para crear jerarquía.";
      outlineEl.append(empty);
      sidebarSections?.refreshLayout();
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

    sidebarSections?.refreshLayout();
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
      const fileMode = modeFromPath(path) ?? activeDocumentMode;
      setActiveDocumentMode(fileMode);
      let hadUnsafeLinks = false;

      if (fileMode === "json") {
        jsonWorkspace.setText(content, false);
      } else {
        const result = setEditorValue(content);
        hadUnsafeLinks = result.hadUnsafeLinks;
      }

      currentPath = path;
      isDirty = false;
      updateMeta();

      const jsonInvalidSuffix =
        fileMode === "json" && !jsonWorkspace.isValid() ? " • JSON inválido (guardado bloqueado)" : "";
      updateStatus(
        `Abierto: ${basename(path)}${hadUnsafeLinks ? " • links inseguros bloqueados (guarda para aplicar)" : ""}${jsonInvalidSuffix}`,
      );
      notify({ kind: "info", message: `Abierto: ${basename(path)}` });
      await upsertHistory(path, inferDocumentTitle(content, fileMode, path));
      renderOutline();
      syncFileButtons();
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

    const targetMode = modeFromPath(path);
    if (!targetMode) {
      await message("Extensión no soportada. Usa .md/.markdown o .json.", {
        kind: "warning",
        title: "Pega e Ignora",
      });
      return;
    }
    if (targetMode !== activeDocumentMode) {
      await message(`La extensión no coincide con el modo activo (${activeDocumentMode}).`, {
        kind: "warning",
        title: "Pega e Ignora",
      });
      return;
    }
    if (activeDocumentMode === "json" && !jsonWorkspace.isValid()) {
      await message("No se puede guardar: el JSON es inválido.", {
        kind: "warning",
        title: "Pega e Ignora",
      });
      return;
    }

    try {
      let savedText = "";
      let hadUnsafeLinks = false;
      if (activeDocumentMode === "json") {
        savedText = jsonWorkspace.getText();
      } else {
        const markdownRaw = getEditorValue();
        const sanitized = sanitizeMarkdownLinks(markdownRaw);
        savedText = sanitized.markdown;
        hadUnsafeLinks = sanitized.changed;
        if (sanitized.changed) setEditorValue(sanitized.markdown);
      }

      await writeTextFile(path, savedText);
      currentPath = path;
      isDirty = false;
      updateMeta();
      updateStatus(`Guardado: ${basename(path)}${hadUnsafeLinks ? " • links inseguros bloqueados" : ""}`);
      notify({ id: "file.saved", kind: "success", message: `Guardado: ${basename(path)}` });
      await upsertHistory(path, inferDocumentTitle(savedText, activeDocumentMode, path));
    } catch (err) {
      await message(`No pude guardar el archivo.\n\n${String(err)}`, {
        kind: "error",
        title: "Pega e Ignora",
      });
    }
  };

  const saveNewNote = async () => {
    const title = inferCurrentDocumentTitle(null);
    const filename = `${formatDateForFilename(new Date())}_${slugify(title)}.${extensionForMode(activeDocumentMode)}`;
    const path = await join(vault.notesDir, filename);
    await saveToPath(path);
  };

  const openVaultExplorerAndOpenNote = async () => {
    const { openVaultExplorer } = await import("./features/vaultExplorer");
    const selected = await openVaultExplorer({
      vaultDir: vault.vaultDir,
      notesDir: vault.notesDir,
      title: "Explorar archivos",
      allowedExtensions: ["md", "markdown", "json"],
      defaultExtension: extensionForMode(activeDocumentMode),
    });
    if (!selected) return;
    await openNote(selected);
  };

  let exitingApplication = false;

  const toggleMainWindowVisibility = async () => {
    await persistSessionStateNow();
    if (!desktopRuntimeAvailable) {
      updateStatus("Mostrar u ocultar solo funciona en la app de escritorio.");
      notify({ kind: "warning", message: "Mostrar u ocultar solo funciona en la app de escritorio." });
      return;
    }
    await toggleDesktopMainWindow();
  };

  const exitApplication = async () => {
    if (!desktopRuntimeAvailable) {
      updateStatus("Salir completamente solo funciona en la app de escritorio.");
      notify({ kind: "warning", message: "Salir completamente solo funciona en la app de escritorio." });
      return;
    }
    exitingApplication = true;
    await persistSessionStateNow();
    await exitDesktopApplication();
  };

  if (appWindow) {
    void appWindow.onCloseRequested(async (event) => {
      if (exitingApplication || !runtimeSettings.closeToTray) return;
      event.preventDefault();
      await toggleMainWindowVisibility();
    });
  }

  window.addEventListener("beforeunload", () => {
    void persistSessionStateNow();
  });

  const paletteActions: CommandPaletteAction[] = [
    {
      id: "file.new",
      title: "Nuevo documento",
      subtitle: "Limpiar editor",
      shortcut: "Ctrl+N",
      group: "Archivo",
      keywords: ["nuevo", "limpiar"],
    },
    { id: "file.open", title: "Abrir…", subtitle: "Elegir .md o .json", shortcut: "Ctrl+O", group: "Archivo" },
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
      title: "Explorar archivos…",
      subtitle: "Buscar y abrir dentro del vault",
      group: "Vault",
      keywords: ["vault", "notes", "notas", "json"],
    },
    { id: "vault.folder", title: "Abrir carpeta del vault", subtitle: "Abrir en Explorer", group: "Vault" },
    { id: "history.refresh", title: "Actualizar historial", group: "Vault", keywords: ["recientes"] },
    {
      id: "app.toggleWindow",
      title: "Mostrar / ocultar app",
      subtitle: "Alternar ventana principal",
      group: "App",
      keywords: ["bandeja", "ocultar", "mostrar"],
    },
    {
      id: "app.exit",
      title: "Salir completamente",
      subtitle: "Cerrar la app residente",
      group: "App",
      keywords: ["cerrar", "salir", "terminar"],
    },
    { id: "view.theme", title: "Cambiar tema", subtitle: "Claro / Oscuro", group: "Vista" },
    { id: "view.modeMarkdown", title: "Vista Markdown", subtitle: "Activar editor Markdown", group: "Vista" },
    { id: "view.modeJson", title: "Vista JSON", subtitle: "Activar editor JSON", group: "Vista" },
    { id: "view.readMode", title: "Modo lectura", subtitle: "Ocultar sidebar", group: "Vista", keywords: ["lectura"] },
    { id: "tools.spellcheck", title: "Ortografía", subtitle: "Mostrar/ocultar subrayados", group: "Herramientas" },
    { id: "tools.jsonPretty", title: "JSON Pretty", subtitle: "Formatear con 2 espacios", group: "Herramientas" },
    { id: "tools.jsonMinify", title: "JSON Minify", subtitle: "Compactar JSON", group: "Herramientas" },
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
    ...visualFamilyActions,
  ];

  palette.destroy();
  palette = createCommandPalette({
    actions: paletteActions,
    title: "Comandos",
    placeholder: "Escribe para buscar…",
    onRun: (actionId) => {
      void (async () => {
        if (actionId.startsWith("family.")) {
          const next = actionId.slice("family.".length);
          if (isVisualFamilyId(next)) setVisualFamily(next);
          return;
        }

        if (actionId === "file.new") {
          if (!(await maybeDiscardChanges())) return;
          if (activeDocumentMode === "json") {
            jsonWorkspace.setText("{}", false);
          } else {
            setEditorValue("");
          }
          currentPath = null;
          isDirty = false;
          updateMeta();
          renderOutline();
          syncFileButtons();
          updateStatus("Nuevo documento");
          notify({ kind: "info", message: "Nuevo documento" });
          return;
        }

        if (actionId === "file.open") {
          if (!(await maybeDiscardChanges())) return;
          const selection = await dialogOpen({
            title: "Abrir documento",
            defaultPath: vault.notesDir,
            filters: [
              { name: "Documentos", extensions: ["md", "markdown", "json"] },
              { name: "Markdown", extensions: ["md", "markdown"] },
              { name: "JSON", extensions: ["json"] },
            ],
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
          if (activeDocumentMode === "json" && !jsonWorkspace.isValid()) {
            await message("No se puede guardar: el JSON es inválido.", {
              kind: "warning",
              title: "Pega e Ignora",
            });
            return;
          }
          const extension = extensionForMode(activeDocumentMode);
          const filter = defaultFileFilterForMode(activeDocumentMode);
          const savePath = await dialogSave({
            title: activeDocumentMode === "json" ? "Guardar JSON como…" : "Guardar Markdown como…",
            defaultPath: await join(vault.notesDir, `${slugify(inferCurrentDocumentTitle(currentPath))}.${extension}`),
            filters: [filter],
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
            notify({ kind: "info", message: "Carpeta del vault abierta" });
          } catch {
            // ignore
          }
          return;
        }

        if (actionId === "history.refresh") {
          history = await loadHistory(vault);
          renderHistory();
          updateStatus("Historial actualizado");
          notify({ kind: "info", message: "Historial actualizado" });
          return;
        }

        if (actionId === "app.toggleWindow") {
          closeSettings();
          await toggleMainWindowVisibility();
          return;
        }

        if (actionId === "app.exit") {
          closeSettings();
          await exitApplication();
          return;
        }

        if (actionId === "view.theme") {
          const nextTheme: AppTheme = currentTheme === "light" ? "dark" : "light";
          applyTheme(nextTheme);
          updateStatus(nextTheme === "dark" ? "Tema oscuro" : "Tema claro");
          notify({ kind: "info", message: nextTheme === "dark" ? "Tema oscuro" : "Tema claro" });
          return;
        }

        if (actionId === "view.modeMarkdown") {
          if (activeDocumentMode !== "markdown") {
            setActiveDocumentMode("markdown", true);
            updateMeta();
            syncFileButtons();
          }
          return;
        }

        if (actionId === "view.modeJson") {
          if (activeDocumentMode !== "json") {
            setActiveDocumentMode("json", true);
            updateMeta();
            syncFileButtons();
          }
          return;
        }

        if (actionId === "view.readMode") {
          readModeEnabled = !readModeEnabled;
          writeReadModeEnabled(readModeEnabled);
          applyReadMode(readModeEnabled);
          updateStatus(readModeEnabled ? "Modo lectura" : "Modo edición");
          notify({ kind: "info", message: readModeEnabled ? "Modo lectura" : "Modo edición" });
          return;
        }

        if (actionId === "tools.spellcheck") {
          spellcheckEnabled = !spellcheckEnabled;
          writeSpellcheckEnabled(spellcheckEnabled);
          updateSpellcheckButton(spellcheckEnabled);
          applySpellcheckToEditor(spellcheckEnabled);
          const msg = spellcheckEnabled ? "Ortografía activada" : "Ortografía desactivada";
          setText(statusEl, msg);
          notify({ kind: "info", message: msg });
          return;
        }

        if (actionId === "tools.jsonPretty") {
          if (activeDocumentMode !== "json") {
            notify({ kind: "info", message: "Cambia a vista JSON para formatear." });
            return;
          }
          if (jsonWorkspace.pretty()) {
            updateStatus("JSON formateado");
            notify({ kind: "info", message: "JSON formateado" });
          }
          return;
        }

        if (actionId === "tools.jsonMinify") {
          if (activeDocumentMode !== "json") {
            notify({ kind: "info", message: "Cambia a vista JSON para minificar." });
            return;
          }
          if (jsonWorkspace.minify()) {
            updateStatus("JSON minificado");
            notify({ kind: "info", message: "JSON minificado" });
          }
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
    if (activeDocumentMode !== "markdown") return;
    isDirty = true;
    updateMeta();
    if (autosaveEnabled) debouncedAutosave();
    debouncedOutlineRender();
    debouncedOrderedListStartFix();
  });

  jsonWorkspace.onChange(() => {
    if (activeDocumentMode !== "json") {
      syncFileButtons();
      return;
    }
    isDirty = true;
    updateMeta();
    if (autosaveEnabled) debouncedAutosave();
    syncFileButtons();
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
      if (activeDocumentMode !== "markdown") return;
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
        notify({ kind: "warning", message: "Se eliminaron enlaces no seguros del contenido pegado." });
      }

      isDirty = true;
      updateMeta();
      if (autosaveEnabled) debouncedAutosave();
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
      if (saveInProgress) return;
      void (async () => {
        if (activeDocumentMode === "json" && !jsonWorkspace.isValid()) {
          await message("No se puede guardar: el JSON es inválido.", {
            kind: "warning",
            title: "Pega e Ignora",
          });
          return;
        }
        if (!e.shiftKey && currentPath && !isDirty) {
          updateStatus(`Sin cambios: ${basename(currentPath)}`);
          notify({ id: "file.noChanges", kind: "info", message: "Sin cambios para guardar." });
          return;
        }

        saveInProgress = true;
        updateMeta();
        try {
          if (e.shiftKey) {
            const extension = extensionForMode(activeDocumentMode);
            const filter = defaultFileFilterForMode(activeDocumentMode);
            const savePath = await dialogSave({
              title: activeDocumentMode === "json" ? "Guardar JSON como…" : "Guardar Markdown como…",
              defaultPath: await join(vault.notesDir, `${slugify(inferCurrentDocumentTitle(currentPath))}.${extension}`),
              filters: [filter],
            });
            if (savePath) await saveToPath(savePath);
            return;
          }

          if (currentPath) {
            await saveToPath(currentPath);
            return;
          }
          await saveNewNote();
        } finally {
          saveInProgress = false;
          updateMeta();
        }
      })();
    }

    if (key === "o") {
      e.preventDefault();
      void (async () => {
        if (!(await maybeDiscardChanges())) return;
        const selection = await dialogOpen({
          title: "Abrir documento",
          defaultPath: vault.notesDir,
          filters: [
            { name: "Documentos", extensions: ["md", "markdown", "json"] },
            { name: "Markdown", extensions: ["md", "markdown"] },
            { name: "JSON", extensions: ["json"] },
          ],
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
        if (activeDocumentMode === "json") {
          jsonWorkspace.setText("{}", false);
        } else {
          setEditorValue("");
        }
        currentPath = null;
        isDirty = false;
        updateMeta();
        renderOutline();
        syncFileButtons();
        updateStatus("Nuevo documento");
        notify({ kind: "info", message: "Nuevo documento" });
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
  workspaceEl.addEventListener("scroll", () => scheduleSessionStateSave(180), { passive: true });

  btnRefreshHistory.addEventListener("click", async () => {
    history = await loadHistory(vault);
    renderHistory();
    updateStatus("Historial actualizado");
    notify({ kind: "info", message: "Historial actualizado" });
  });

  btnExploreVault.addEventListener("click", () => {
    void (async () => {
      closeSettings();
      await openVaultExplorerAndOpenNote();
    })();
  });

  btnOpenVault.addEventListener("click", async () => {
    try {
      closeSettings();
      await openPath(vault.notesDir);
      notify({ kind: "info", message: "Carpeta del vault abierta" });
    } catch {
      // ignore
    }
  });

  // Bootstrap initial content / session
  const hasScratch = await exists(vault.scratchPath);
  let sessionFileExists = false;
  if (lastSessionState?.currentPath) {
    try {
      sessionFileExists = await exists(lastSessionState.currentPath);
    } catch {
      sessionFileExists = false;
    }
  }

  const restorePlan = resolveSessionRestorePlan({
    restoreLastSession: runtimeSettings.restoreLastSession,
    session: lastSessionState,
    scratchExists: hasScratch,
    currentFileExists: sessionFileExists,
  });

  const applyScratchContent = async (mode: DocumentMode) => {
    try {
      const scratchContent = hasScratch ? await readTextFile(vault.scratchPath) : "";
      if (mode === "json") {
        jsonWorkspace.setText(scratchContent || "{}", false);
      } else {
        setEditorValue(scratchContent);
      }
    } catch {
      if (mode === "json") {
        jsonWorkspace.setText("{}", false);
      } else {
        setEditorValue("");
      }
    }
  };

  if (lastSessionState) {
    pendingRestoreWorkspaceScrollTop = lastSessionState.workspaceScrollTop;
    pendingRestoreJsonSelection = {
      path: lastSessionState.jsonSelectedPath,
      start: lastSessionState.jsonSelectionStart,
      end: lastSessionState.jsonSelectionEnd,
    };
  }

  if (restorePlan.kind === "session-file") {
    await openNote(restorePlan.session.currentPath ?? vault.scratchPath);
    isDirty = restorePlan.session.isDirty;
    updateMeta();
  } else if (restorePlan.kind === "session-scratch") {
    setActiveDocumentMode(restorePlan.session.documentMode);
    await applyScratchContent(restorePlan.session.documentMode);
    currentPath = restorePlan.session.currentPath;
    isDirty = restorePlan.session.isDirty;
    updateMeta();
    renderOutline();
    syncFileButtons();
    if (restorePlan.session.currentPath && !sessionFileExists) {
      notify({ kind: "warning", message: "Recuperé el borrador porque el archivo anterior ya no estaba disponible." });
    } else {
      notify({ kind: "info", message: "Sesión anterior recuperada." });
    }
  } else if (restorePlan.kind === "scratch") {
    setActiveDocumentMode(lastSessionState?.documentMode ?? "markdown");
    await applyScratchContent(lastSessionState?.documentMode ?? "markdown");
    currentPath = null;
    isDirty = false;
    updateMeta();
    renderOutline();
    syncFileButtons();
  } else {
    const starterMode = lastSessionState?.documentMode ?? "markdown";
    setActiveDocumentMode(starterMode);
    if (starterMode === "json") {
      jsonWorkspace.setText("{\n  \"nuevo\": true\n}", false);
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
    }
    await writeTextFile(vault.scratchPath, getActiveDocumentValue());
  }

  renderOutline();
  syncFileButtons();
  updateMeta();
  renderHistory();
  scheduleRestoreUiState();
  if (activeDocumentMode === "json") {
    jsonWorkspace.focus();
  } else {
    editor.focus();
  }
  await persistSessionStateNow();
});
