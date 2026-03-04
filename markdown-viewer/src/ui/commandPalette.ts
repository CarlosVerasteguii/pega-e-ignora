export type CommandPaletteAction = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  group?: string;
};

export type CommandPaletteOptions = {
  actions: CommandPaletteAction[];
  onRun: (actionId: string) => void;
  mount?: HTMLElement;
  placeholder?: string;
  emptyText?: string;
  title?: string;
};

export type CommandPaletteApi = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  destroy: () => void;
  isOpen: () => boolean;
  setActions: (actions: CommandPaletteAction[]) => void;
  setTitle: (title: string) => void;
  setPlaceholder: (placeholder: string) => void;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function scoreAction(action: CommandPaletteAction, query: string): number {
  if (!query) return 1;
  const title = normalizeText(action.title);
  const subtitle = normalizeText(action.subtitle ?? "");
  const keywords = (action.keywords ?? []).map((k) => normalizeText(k)).join(" ");
  const haystack = `${title} ${subtitle} ${keywords}`.trim();
  const q = query;

  if (!haystack.includes(q)) return 0;
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 60;
  if (subtitle.includes(q)) return 40;
  return 20;
}

export function createCommandPalette(options: CommandPaletteOptions): CommandPaletteApi {
  const mount = options.mount ?? document.body;

  let actions: CommandPaletteAction[] = [...options.actions];
  let filtered: CommandPaletteAction[] = [];
  let query = "";
  let selectedIndex = 0;
  let openState = false;
  let lastActive: HTMLElement | null = null;

  const overlay = document.createElement("div");
  overlay.className = "cmdp-overlay";
  overlay.hidden = true;

  const panel = document.createElement("div");
  panel.className = "cmdp-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", options.title ?? "Comandos");

  const header = document.createElement("div");
  header.className = "cmdp-header";

  const titleEl = document.createElement("div");
  titleEl.className = "cmdp-title";
  titleEl.textContent = options.title ?? "Comandos";

  const hintEl = document.createElement("div");
  hintEl.className = "cmdp-hint";
  hintEl.textContent = "↑ ↓ para navegar · Enter para ejecutar · Esc para cerrar";

  const inputWrap = document.createElement("div");
  inputWrap.className = "cmdp-input-wrap";

  const input = document.createElement("input");
  input.className = "cmdp-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = options.placeholder ?? "Escribe un comando…";

  const list = document.createElement("div");
  list.className = "cmdp-list";
  list.setAttribute("role", "listbox");

  const footer = document.createElement("div");
  footer.className = "cmdp-footer";

  const countEl = document.createElement("div");
  countEl.className = "cmdp-count";

  inputWrap.append(input);
  header.append(titleEl, hintEl, inputWrap);
  footer.append(countEl);
  panel.append(header, list, footer);
  overlay.append(panel);
  mount.append(overlay);

  const updateCount = () => {
    countEl.textContent = `${filtered.length} acción${filtered.length === 1 ? "" : "es"}`;
  };

  const setSelectedIndex = (next: number) => {
    selectedIndex = Math.max(0, Math.min(next, Math.max(0, filtered.length - 1)));
    const optionsEls = Array.from(list.querySelectorAll<HTMLElement>("[role='option']"));
    for (const el of optionsEls) el.setAttribute("aria-selected", "false");
    const selected = optionsEls[selectedIndex] ?? null;
    if (selected) {
      selected.setAttribute("aria-selected", "true");
      const id = selected.getAttribute("id");
      if (id) input.setAttribute("aria-activedescendant", id);
      selected.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const runSelected = () => {
    const action = filtered[selectedIndex];
    if (!action || action.disabled) return;
    options.onRun(action.id);
    close();
  };

  const render = () => {
    const q = normalizeText(query);
    filtered = actions
      .map((action) => ({ action, score: scoreAction(action, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.action);

    list.innerHTML = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cmdp-empty";
      empty.textContent = options.emptyText ?? "Sin resultados.";
      list.append(empty);
      updateCount();
      return;
    }

    const grouped = new Map<string, CommandPaletteAction[]>();
    for (const action of filtered) {
      const group = action.group?.trim() || "";
      const bucket = grouped.get(group) ?? [];
      bucket.push(action);
      grouped.set(group, bucket);
    }

    const groupEntries = Array.from(grouped.entries()).sort(([a], [b]) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    });

    let optionIndex = 0;
    for (const [group, groupActions] of groupEntries) {
      if (group) {
        const groupEl = document.createElement("div");
        groupEl.className = "cmdp-group";
        groupEl.textContent = group;
        list.append(groupEl);
      }

      for (const action of groupActions) {
        const idx = optionIndex;
        const row = document.createElement("button");
        row.type = "button";
        row.className = "cmdp-item";
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");
        row.id = `cmdp-opt-${action.id}`;
        row.dataset.index = String(idx);
        if (action.disabled) row.setAttribute("aria-disabled", "true");

        const meta = document.createElement("div");
        meta.className = "cmdp-item-meta";

        const label = document.createElement("div");
        label.className = "cmdp-item-title";
        label.textContent = action.title;

        meta.append(label);
        if (action.subtitle) {
          const sub = document.createElement("div");
          sub.className = "cmdp-item-subtitle";
          sub.textContent = action.subtitle;
          meta.append(sub);
        }

        const right = document.createElement("div");
        right.className = "cmdp-item-right";
        right.textContent = action.shortcut ?? "";

        row.append(meta, right);

        row.addEventListener("mousemove", () => {
          if (Number(row.dataset.index) === selectedIndex) return;
          setSelectedIndex(idx);
        });

        row.addEventListener("click", () => {
          if (action.disabled) return;
          options.onRun(action.id);
          close();
        });

        list.append(row);
        optionIndex += 1;
      }
    }

    updateCount();
    setSelectedIndex(selectedIndex);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!openState) return;

    const key = event.key;
    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      close();
      return;
    }

    if (key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSelectedIndex(selectedIndex + 1);
      return;
    }

    if (key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSelectedIndex(selectedIndex - 1);
      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      runSelected();
    }
  };

  const onOverlayMouseDown = (event: MouseEvent) => {
    if (event.target !== overlay) return;
    close();
  };

  const open = () => {
    if (openState) return;
    openState = true;
    lastActive = (document.activeElement as HTMLElement | null) ?? null;

    overlay.hidden = false;
    overlay.dataset.state = "open";
    panel.dataset.state = "open";

    query = "";
    input.value = "";
    selectedIndex = 0;
    render();

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  };

  const close = () => {
    if (!openState) return;
    openState = false;
    overlay.dataset.state = "closed";
    panel.dataset.state = "closed";
    overlay.hidden = true;
    input.removeAttribute("aria-activedescendant");

    const nextFocus = lastActive;
    lastActive = null;
    if (nextFocus && typeof nextFocus.focus === "function") {
      window.setTimeout(() => nextFocus.focus(), 0);
    }
  };

  const toggle = () => (openState ? close() : open());

  const destroy = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    overlay.removeEventListener("mousedown", onOverlayMouseDown);
    input.removeEventListener("input", onInput);
    overlay.remove();
  };

  const onInput = () => {
    query = input.value;
    selectedIndex = 0;
    render();
  };

  input.addEventListener("input", onInput);
  overlay.addEventListener("mousedown", onOverlayMouseDown);
  window.addEventListener("keydown", onKeyDown, true);

  const setActions = (next: CommandPaletteAction[]) => {
    actions = [...next];
    if (openState) render();
  };

  const setTitle = (title: string) => {
    titleEl.textContent = title;
    panel.setAttribute("aria-label", title);
  };

  const setPlaceholder = (placeholder: string) => {
    input.placeholder = placeholder;
  };

  return {
    open,
    close,
    toggle,
    destroy,
    isOpen: () => openState,
    setActions,
    setTitle,
    setPlaceholder,
  };
}
