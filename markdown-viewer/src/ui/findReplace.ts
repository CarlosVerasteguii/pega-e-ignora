type EditorLike = {
  getMarkdown: () => string;
  setMarkdown?: (markdown: string, cursorToEnd?: boolean) => void;
  setSelection: (start: number | number[], end: number | number[]) => void;
  focus: () => void;
  isWysiwygMode?: () => boolean;
  convertPosToMatchEditorMode?: (
    start: number | number[],
    end?: number | number[],
    mode?: "markdown" | "wysiwyg",
  ) => [number | number[], number | number[]];
  replaceSelection?: (text: string, start?: number | number[], end?: number | number[]) => void;
};

type FindReplaceOptions = {
  editor: EditorLike;
  mount?: HTMLElement;
};

type FindReplaceApi = {
  openFind: () => void;
  openReplace: () => void;
  close: () => void;
  destroy: () => void;
  isOpen: () => boolean;
};

type MdPos = [line: number, charOffset: number];

type Match = {
  startIndex: number;
  endIndex: number;
  start: MdPos;
  end: MdPos;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function indexToMdPos(index: number, lineStarts: number[]): MdPos {
  let lo = 0;
  let hi = lineStarts.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = lineStarts[mid];
    const nextStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.POSITIVE_INFINITY;
    if (index < start) {
      hi = mid - 1;
      continue;
    }
    if (index >= nextStart) {
      lo = mid + 1;
      continue;
    }
    return [mid + 1, Math.max(1, index - start + 1)];
  }

  const fallbackLine = clampNumber(lineStarts.length, 1, Number.MAX_SAFE_INTEGER);
  const fallbackStart = lineStarts[fallbackLine - 1] ?? 0;
  return [fallbackLine, Math.max(1, index - fallbackStart + 1)];
}

function findMatches(markdown: string, query: string, matchCase: boolean): Match[] {
  const q = matchCase ? query : query.toLowerCase();
  const haystack = matchCase ? markdown : markdown.toLowerCase();
  if (!q) return [];

  const lineStarts = buildLineStarts(markdown);
  const matches: Match[] = [];

  let fromIndex = 0;
  while (fromIndex <= haystack.length) {
    const idx = haystack.indexOf(q, fromIndex);
    if (idx === -1) break;
    const startIndex = idx;
    const endIndex = idx + q.length;
    matches.push({
      startIndex,
      endIndex,
      start: indexToMdPos(startIndex, lineStarts),
      end: indexToMdPos(endIndex, lineStarts),
    });
    fromIndex = idx + Math.max(1, q.length);
  }

  return matches;
}

export function createFindReplace(options: FindReplaceOptions): FindReplaceApi {
  const mount = options.mount ?? document.body;
  const editor = options.editor;

  let openState = false;
  let replaceMode = false;
  let lastActive: HTMLElement | null = null;

  let query = "";
  let replacement = "";
  let matchCase = false;

  let matches: Match[] = [];
  let currentIndex = 0;

  const overlay = document.createElement("div");
  overlay.className = "fr-overlay";
  overlay.hidden = true;

  const panel = document.createElement("div");
  panel.className = "fr-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Buscar y reemplazar");

  const row1 = document.createElement("div");
  row1.className = "fr-row";

  const inputFind = document.createElement("input");
  inputFind.className = "fr-input";
  inputFind.type = "search";
  inputFind.placeholder = "Buscar…";
  inputFind.autocomplete = "off";
  inputFind.spellcheck = false;

  const countEl = document.createElement("div");
  countEl.className = "fr-count";
  countEl.textContent = "0/0";

  const btnPrev = document.createElement("button");
  btnPrev.type = "button";
  btnPrev.className = "fr-btn";
  btnPrev.title = "Anterior (Shift+Enter)";
  btnPrev.textContent = "↑";

  const btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.className = "fr-btn";
  btnNext.title = "Siguiente (Enter)";
  btnNext.textContent = "↓";

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.className = "fr-btn fr-btn--close";
  btnClose.title = "Cerrar (Esc)";
  btnClose.textContent = "×";

  row1.append(inputFind, countEl, btnPrev, btnNext, btnClose);

  const row2 = document.createElement("div");
  row2.className = "fr-row fr-row--replace";
  row2.hidden = true;

  const inputReplace = document.createElement("input");
  inputReplace.className = "fr-input";
  inputReplace.type = "text";
  inputReplace.placeholder = "Reemplazar con…";
  inputReplace.autocomplete = "off";
  inputReplace.spellcheck = false;

  const btnReplace = document.createElement("button");
  btnReplace.type = "button";
  btnReplace.className = "fr-btn fr-btn--text";
  btnReplace.textContent = "Reemplazar";

  const btnReplaceAll = document.createElement("button");
  btnReplaceAll.type = "button";
  btnReplaceAll.className = "fr-btn fr-btn--text";
  btnReplaceAll.textContent = "Todo";
  btnReplaceAll.title = "Reemplazar todas las coincidencias";

  row2.append(inputReplace, btnReplace, btnReplaceAll);

  const row3 = document.createElement("div");
  row3.className = "fr-row fr-row--options";

  const caseLabel = document.createElement("label");
  caseLabel.className = "fr-toggle";

  const caseToggle = document.createElement("input");
  caseToggle.type = "checkbox";
  caseToggle.checked = matchCase;

  const caseText = document.createElement("span");
  caseText.textContent = "Aa";

  caseLabel.append(caseToggle, caseText);

  const hint = document.createElement("div");
  hint.className = "fr-hint";
  hint.textContent = "Enter siguiente · Shift+Enter anterior · Esc cerrar";

  row3.append(caseLabel, hint);

  panel.append(row1, row2, row3);
  overlay.append(panel);
  mount.append(overlay);

  const updateCount = () => {
    if (!query || matches.length === 0) {
      countEl.textContent = "0/0";
      countEl.dataset.kind = query ? "none" : "idle";
      return;
    }
    const shown = Math.min(matches.length, 9_999);
    const current = clampNumber(currentIndex + 1, 1, shown);
    countEl.textContent = `${current}/${shown}`;
    countEl.dataset.kind = "ok";
  };

  const refreshMatches = () => {
    const md = editor.getMarkdown() ?? "";
    matches = findMatches(md, query, matchCase);
    currentIndex = clampNumber(currentIndex, 0, Math.max(0, matches.length - 1));
    updateCount();
  };

  const toEditorRange = (start: MdPos, end: MdPos): [number | number[], number | number[]] => {
    const targetMode = editor.isWysiwygMode?.() ? "wysiwyg" : "markdown";
    const convert = editor.convertPosToMatchEditorMode;
    if (typeof convert === "function") {
      const [from, to] = convert(start, end, targetMode);
      return [from, to];
    }
    return [start, end];
  };

  const selectMatch = (idx: number) => {
    if (!query) return;
    if (matches.length === 0) return;
    currentIndex = clampNumber(idx, 0, matches.length - 1);
    const match = matches[currentIndex];
    const [from, to] = toEditorRange(match.start, match.end);
    editor.setSelection(from, to);
    editor.focus();
    updateCount();
  };

  const move = (delta: number) => {
    refreshMatches();
    if (matches.length === 0) return;
    const next = (currentIndex + delta + matches.length) % matches.length;
    selectMatch(next);
  };

  const replaceCurrent = () => {
    refreshMatches();
    if (matches.length === 0) return;
    const match = matches[currentIndex];
    const [from, to] = toEditorRange(match.start, match.end);
    if (typeof editor.replaceSelection === "function") {
      editor.replaceSelection(replacement, from, to);
    } else {
      // Fallback: naive replace in markdown
      const md = editor.getMarkdown() ?? "";
      const next = md.slice(0, match.startIndex) + replacement + md.slice(match.endIndex);
      editor.setMarkdown?.(next, false);
    }

    window.setTimeout(() => {
      refreshMatches();
      if (matches.length === 0) return;
      const postIdx = matches.findIndex((m) => m.startIndex >= match.startIndex + Math.max(1, replacement.length));
      currentIndex = postIdx === -1 ? clampNumber(currentIndex, 0, matches.length - 1) : postIdx;
      selectMatch(currentIndex);
    }, 0);
  };

  const replaceAll = () => {
    refreshMatches();
    if (!query || matches.length === 0) return;
    const md = editor.getMarkdown() ?? "";

    if (matchCase) {
      const next = md.split(query).join(replacement);
      editor.setMarkdown?.(next, false);
      window.setTimeout(() => {
        refreshMatches();
        selectMatch(0);
      }, 0);
      return;
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "gi");
    const next = md.replace(rx, replacement);
    editor.setMarkdown?.(next, false);
    window.setTimeout(() => {
      refreshMatches();
      selectMatch(0);
    }, 0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!openState) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const onEnterNav = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    move(event.shiftKey ? -1 : 1);
  };

  const open = (mode: "find" | "replace") => {
    if (!openState) {
      openState = true;
      lastActive = (document.activeElement as HTMLElement | null) ?? null;
      overlay.hidden = false;
      overlay.dataset.state = "open";
      panel.dataset.state = "open";
      document.addEventListener("keydown", onKeyDown, true);
    }
    replaceMode = mode === "replace";
    row2.hidden = !replaceMode;
    panel.setAttribute("aria-label", replaceMode ? "Buscar y reemplazar" : "Buscar");

    refreshMatches();
    window.setTimeout(() => {
      inputFind.focus();
      inputFind.select();
    }, 0);
  };

  const close = () => {
    if (!openState) return;
    openState = false;
    overlay.dataset.state = "closed";
    panel.dataset.state = "closed";
    overlay.hidden = true;
    document.removeEventListener("keydown", onKeyDown, true);

    const nextFocus = lastActive;
    lastActive = null;
    if (nextFocus && typeof nextFocus.focus === "function") {
      window.setTimeout(() => nextFocus.focus(), 0);
    }
  };

  inputFind.addEventListener("input", () => {
    query = inputFind.value;
    currentIndex = 0;
    refreshMatches();
    selectMatch(0);
  });

  inputFind.addEventListener("keydown", onEnterNav);
  inputReplace.addEventListener("keydown", onEnterNav);

  inputReplace.addEventListener("input", () => {
    replacement = inputReplace.value;
  });

  caseToggle.addEventListener("change", () => {
    matchCase = caseToggle.checked;
    currentIndex = 0;
    refreshMatches();
    selectMatch(0);
  });

  btnPrev.addEventListener("click", () => move(-1));
  btnNext.addEventListener("click", () => move(1));
  btnClose.addEventListener("click", close);
  btnReplace.addEventListener("click", replaceCurrent);
  btnReplaceAll.addEventListener("click", replaceAll);

  overlay.addEventListener("mousedown", (event) => {
    if (event.target !== overlay) return;
    close();
  });

  const destroy = () => {
    close();
    overlay.remove();
  };

  return {
    openFind: () => open("find"),
    openReplace: () => open("replace"),
    close,
    destroy,
    isOpen: () => openState,
  };
}
