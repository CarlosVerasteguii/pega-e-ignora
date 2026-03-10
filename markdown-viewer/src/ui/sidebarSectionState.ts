import type { SidebarSectionId } from "./sidebarSections";

export type SidebarSectionsState = Partial<Record<SidebarSectionId, boolean>>;

export type SidebarSectionStorage = Pick<Storage, "getItem" | "setItem">;

export const SIDEBAR_SECTIONS_STORAGE_KEY = "markdown-viewer.sidebarSections";

export const DEFAULT_SIDEBAR_SECTION_COLLAPSED: Record<SidebarSectionId, boolean> = {
  history: false,
  outline: false,
  format: true,
};

export function readSidebarSectionsState(storage: SidebarSectionStorage): SidebarSectionsState {
  try {
    const raw = storage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SidebarSectionsState;
    const state: SidebarSectionsState = {};
    for (const key of ["history", "outline", "format"] satisfies SidebarSectionId[]) {
      if (typeof parsed[key] === "boolean") {
        state[key] = parsed[key];
      }
    }
    return state;
  } catch {
    return {};
  }
}

export function writeSidebarSectionsState(storage: SidebarSectionStorage, state: SidebarSectionsState): void {
  storage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(state));
}

export function getInitialSidebarSectionExpandedState(
  storage: SidebarSectionStorage,
): Record<SidebarSectionId, boolean> {
  const persisted = readSidebarSectionsState(storage);
  return {
    history: !(persisted.history ?? DEFAULT_SIDEBAR_SECTION_COLLAPSED.history),
    outline: !(persisted.outline ?? DEFAULT_SIDEBAR_SECTION_COLLAPSED.outline),
    format: !(persisted.format ?? DEFAULT_SIDEBAR_SECTION_COLLAPSED.format),
  };
}

export function writeSidebarSectionExpandedState(
  storage: SidebarSectionStorage,
  id: SidebarSectionId,
  expanded: boolean,
): void {
  const state = readSidebarSectionsState(storage);
  state[id] = !expanded;
  writeSidebarSectionsState(storage, state);
}
