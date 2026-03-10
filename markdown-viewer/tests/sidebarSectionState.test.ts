import { afterEach, describe, expect, it } from "vitest";
import {
  SIDEBAR_SECTIONS_STORAGE_KEY,
  getInitialSidebarSectionExpandedState,
  readSidebarSectionsState,
  writeSidebarSectionExpandedState,
} from "../src/ui/sidebarSectionState";

afterEach(() => {
  window.localStorage.clear();
});

describe("sidebarSectionState", () => {
  it("derives the correct default expanded state when storage is empty", () => {
    expect(getInitialSidebarSectionExpandedState(window.localStorage)).toEqual({
      history: true,
      outline: true,
      format: false,
    });
  });

  it("persists independent multi-open states without overwriting sibling sections", () => {
    writeSidebarSectionExpandedState(window.localStorage, "history", true);
    writeSidebarSectionExpandedState(window.localStorage, "outline", true);
    writeSidebarSectionExpandedState(window.localStorage, "format", false);

    expect(readSidebarSectionsState(window.localStorage)).toEqual({
      history: false,
      outline: false,
      format: true,
    });

    const raw = window.localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY);
    expect(raw).toBe(JSON.stringify({ history: false, outline: false, format: true }));
  });

  it("ignores malformed persisted values and falls back safely", () => {
    window.localStorage.setItem(
      SIDEBAR_SECTIONS_STORAGE_KEY,
      JSON.stringify({ history: "bad", outline: false, format: 12 }),
    );

    expect(readSidebarSectionsState(window.localStorage)).toEqual({
      outline: false,
    });

    expect(getInitialSidebarSectionExpandedState(window.localStorage)).toEqual({
      history: true,
      outline: true,
      format: false,
    });
  });
});
