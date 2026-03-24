import { describe, expect, it } from "vitest";
import {
  createSessionState,
  normalizeSessionState,
  resolveSessionRestorePlan,
} from "../src/ui/sessionState";

describe("sessionState", () => {
  it("normalizes persisted session payloads safely", () => {
    expect(
      normalizeSessionState({
        version: 1,
        currentPath: "C:\\demo.md",
        documentMode: "markdown",
        isDirty: true,
        restoreSource: "scratch",
        workspaceScrollTop: 120,
        jsonSelectedPath: null,
        jsonSelectionStart: null,
        jsonSelectionEnd: null,
        updatedAt: 123,
      }),
    ).toEqual({
      version: 1,
      currentPath: "C:\\demo.md",
      documentMode: "markdown",
      isDirty: true,
      restoreSource: "scratch",
      workspaceScrollTop: 120,
      jsonSelectedPath: null,
      jsonSelectionStart: null,
      jsonSelectionEnd: null,
      updatedAt: 123,
    });
  });

  it("returns null for malformed payloads", () => {
    expect(normalizeSessionState({ documentMode: "xml" })).toBeNull();
    expect(normalizeSessionState("bad")).toBeNull();
  });

  it("prefers reopening the clean last file when it still exists", () => {
    const session = createSessionState({
      currentPath: "C:\\demo.md",
      documentMode: "markdown",
      isDirty: false,
      restoreSource: "file",
      updatedAt: 1,
    });

    expect(
      resolveSessionRestorePlan({
        restoreLastSession: true,
        session,
        scratchExists: true,
        currentFileExists: true,
      }),
    ).toEqual({
      kind: "session-file",
      session,
    });
  });

  it("falls back to scratch when the previous file is gone or the draft was dirty", () => {
    const session = createSessionState({
      currentPath: "C:\\demo.md",
      documentMode: "json",
      isDirty: true,
      restoreSource: "scratch",
      updatedAt: 1,
    });

    expect(
      resolveSessionRestorePlan({
        restoreLastSession: true,
        session,
        scratchExists: true,
        currentFileExists: false,
      }),
    ).toEqual({
      kind: "session-scratch",
      session,
    });
  });

  it("uses starter content only when there is no recoverable session or scratch", () => {
    expect(
      resolveSessionRestorePlan({
        restoreLastSession: false,
        session: null,
        scratchExists: false,
        currentFileExists: false,
      }),
    ).toEqual({
      kind: "default",
      documentMode: "markdown",
    });
  });

  it("starts clean when session restore is disabled even if scratch and session exist", () => {
    const session = createSessionState({
      currentPath: "C:\\demo.md",
      documentMode: "json",
      isDirty: true,
      restoreSource: "scratch",
      updatedAt: 1,
    });

    expect(
      resolveSessionRestorePlan({
        restoreLastSession: false,
        session,
        scratchExists: true,
        currentFileExists: true,
      }),
    ).toEqual({
      kind: "default",
      documentMode: "json",
    });
  });
});
