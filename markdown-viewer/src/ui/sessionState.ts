import { exists, readTextFile, writeTextFile } from "./desktopApi";

export type SessionDocumentMode = "markdown" | "json";
export type SessionRestoreSource = "file" | "scratch";

export type SessionState = {
  version: 1;
  currentPath: string | null;
  documentMode: SessionDocumentMode;
  isDirty: boolean;
  restoreSource: SessionRestoreSource;
  workspaceScrollTop: number;
  jsonSelectedPath: string | null;
  jsonSelectionStart: number | null;
  jsonSelectionEnd: number | null;
  updatedAt: number;
};

export type SessionRestorePlan =
  | { kind: "session-file"; session: SessionState }
  | { kind: "session-scratch"; session: SessionState }
  | { kind: "scratch"; documentMode: SessionDocumentMode }
  | { kind: "default"; documentMode: SessionDocumentMode };

export const SESSION_STATE_VERSION = 1 as const;

export const DEFAULT_SESSION_STATE: SessionState = {
  version: SESSION_STATE_VERSION,
  currentPath: null,
  documentMode: "markdown",
  isDirty: false,
  restoreSource: "scratch",
  workspaceScrollTop: 0,
  jsonSelectedPath: null,
  jsonSelectionStart: null,
  jsonSelectionEnd: null,
  updatedAt: 0,
};

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

export function normalizeSessionState(value: unknown): SessionState | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<SessionState>;
  const version = normalizeNumber(candidate.version, 0);
  if (version !== SESSION_STATE_VERSION) return null;

  const documentMode = candidate.documentMode === "json" ? "json" : candidate.documentMode === "markdown" ? "markdown" : null;
  const restoreSource = candidate.restoreSource === "file" || candidate.restoreSource === "scratch" ? candidate.restoreSource : null;
  if (!documentMode || !restoreSource) return null;

  return {
    version: SESSION_STATE_VERSION,
    currentPath: normalizeNullableString(candidate.currentPath),
    documentMode,
    isDirty: typeof candidate.isDirty === "boolean" ? candidate.isDirty : false,
    restoreSource,
    workspaceScrollTop: Math.max(0, normalizeNumber(candidate.workspaceScrollTop, 0)),
    jsonSelectedPath: normalizeNullableString(candidate.jsonSelectedPath),
    jsonSelectionStart: normalizeNullableIndex(candidate.jsonSelectionStart),
    jsonSelectionEnd: normalizeNullableIndex(candidate.jsonSelectionEnd),
    updatedAt: normalizeNumber(candidate.updatedAt, 0),
  };
}

export async function readSessionState(sessionPath: string): Promise<SessionState | null> {
  if (!(await exists(sessionPath))) return null;
  try {
    const raw = await readTextFile(sessionPath);
    return normalizeSessionState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeSessionState(sessionPath: string, state: SessionState): Promise<void> {
  await writeTextFile(sessionPath, JSON.stringify(state, null, 2));
}

export function createSessionState(partial: Partial<Omit<SessionState, "version">>): SessionState {
  return {
    version: SESSION_STATE_VERSION,
    currentPath: partial.currentPath ?? DEFAULT_SESSION_STATE.currentPath,
    documentMode: partial.documentMode ?? DEFAULT_SESSION_STATE.documentMode,
    isDirty: partial.isDirty ?? DEFAULT_SESSION_STATE.isDirty,
    restoreSource: partial.restoreSource ?? DEFAULT_SESSION_STATE.restoreSource,
    workspaceScrollTop: Math.max(0, partial.workspaceScrollTop ?? DEFAULT_SESSION_STATE.workspaceScrollTop),
    jsonSelectedPath: partial.jsonSelectedPath ?? DEFAULT_SESSION_STATE.jsonSelectedPath,
    jsonSelectionStart: partial.jsonSelectionStart ?? DEFAULT_SESSION_STATE.jsonSelectionStart,
    jsonSelectionEnd: partial.jsonSelectionEnd ?? DEFAULT_SESSION_STATE.jsonSelectionEnd,
    updatedAt: partial.updatedAt ?? DEFAULT_SESSION_STATE.updatedAt,
  };
}

export function resolveSessionRestorePlan({
  restoreLastSession,
  session,
  scratchExists,
  currentFileExists,
}: {
  restoreLastSession: boolean;
  session: SessionState | null;
  scratchExists: boolean;
  currentFileExists: boolean;
}): SessionRestorePlan {
  if (!restoreLastSession) {
    return {
      kind: "default",
      documentMode: session?.documentMode ?? DEFAULT_SESSION_STATE.documentMode,
    };
  }

  if (restoreLastSession && session) {
    if (session.restoreSource === "file" && session.currentPath && currentFileExists) {
      return { kind: "session-file", session };
    }

    if (scratchExists) {
      return { kind: "session-scratch", session };
    }
  }

  if (scratchExists) {
    return {
      kind: "scratch",
      documentMode: session?.documentMode ?? DEFAULT_SESSION_STATE.documentMode,
    };
  }

  return {
    kind: "default",
    documentMode: session?.documentMode ?? DEFAULT_SESSION_STATE.documentMode,
  };
}
