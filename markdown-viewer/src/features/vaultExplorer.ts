import { exists, mkdir, readDir, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

type TreeNode =
  | {
      kind: "dir";
      name: string;
      path: string;
      expanded: boolean;
      loaded: boolean;
      children: TreeNode[];
    }
  | {
      kind: "file";
      name: string;
      path: string;
    };

export type VaultExplorerOptions = {
  vaultDir: string;
  notesDir: string;
  title?: string;
  allowedExtensions?: string[];
  defaultExtension?: "md" | "json";
};

function ensureStyles(): void {
  const id = "vei-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .vei-overlay{
      position:fixed; inset:0; z-index:9999;
      background: rgba(0,0,0,0.28);
      display:flex; align-items:center; justify-content:center;
      padding: 18px;
    }
    [data-theme="dark"] .vei-overlay{ background: rgba(0,0,0,0.55); }
    .vei-modal{
      width:min(980px, 96vw);
      max-height:min(78vh, 760px);
      display:flex; flex-direction:column;
      background: linear-gradient(180deg, var(--panel), var(--panel-2));
      border: 1px solid var(--border);
      box-shadow: 0 22px 44px var(--shadow);
      border-radius: 14px;
      overflow:hidden;
    }
    .vei-header{
      display:flex; align-items:center; justify-content:space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, var(--surface-tint-soft), transparent);
    }
    .vei-title{
      font-weight: 900;
      letter-spacing: 0.2px;
      white-space: nowrap;
      overflow:hidden;
      text-overflow: ellipsis;
    }
    .vei-close{
      appearance:none;
      border: 1px solid var(--border);
      background: var(--button-bg);
      color: var(--text);
      border-radius: 10px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 800;
      cursor:pointer;
    }
    .vei-close:hover{
      border-color: var(--button-hover-border);
      background: var(--button-hover-bg);
    }
    .vei-toolbar{
      padding: 10px 12px 12px;
      display:flex;
      gap: 10px;
      align-items:center;
      border-bottom: 1px solid var(--border);
      background: var(--history-bg);
    }
    .vei-search{
      flex: 1;
      min-width: 180px;
      border: 1px solid var(--border);
      background: var(--button-bg);
      color: var(--text);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 700;
      outline: none;
    }
    .vei-search:focus-visible{
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    .vei-body{
      display:flex;
      min-height: 0;
      flex: 1;
    }
    .vei-pane{
      min-width: 0;
      flex: 1;
      padding: 10px;
      overflow:auto;
    }
    .vei-pane + .vei-pane{
      border-left: 1px solid var(--border);
    }
    .vei-hint{
      font-size: 12px;
      color: var(--muted);
      padding: 0 2px 10px;
      font-weight: 650;
    }
    .vei-list{
      display:flex;
      flex-direction:column;
      gap: 6px;
    }
    .vei-item{
      width: 100%;
      text-align:left;
      border: 1px solid var(--border);
      background: var(--history-bg);
      border-radius: 12px;
      padding: 10px 10px 9px;
      cursor:pointer;
      display:flex;
      gap: 10px;
      align-items:flex-start;
    }
    .vei-item:hover{
      border-color: var(--history-hover-border);
      background: var(--history-hover-bg);
    }
    .vei-icon{
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      margin-top: 1px;
      opacity: 0.85;
    }
    .vei-item-main{
      flex: 1;
      min-width: 0;
      display:flex;
      flex-direction:column;
      gap: 2px;
    }
    .vei-item-title{
      font-weight: 900;
      font-size: 12px;
      overflow:hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .vei-item-meta{
      color: var(--muted);
      font-size: 11px;
      font-weight: 650;
      overflow:hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .vei-indent{ margin-left: calc(var(--vei-indent, 0) * 14px); }
    .vei-empty{
      border: 1px dashed var(--border);
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 700;
    }
    @media (prefers-reduced-motion: reduce){
      .vei-item, .vei-close { transition: none !important; }
    }
  `;
  document.head.append(style);
}

function dirIcon(): string {
  return `<svg class="vei-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
}

function fileIcon(): string {
  return `<svg class="vei-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h7l3 3V20.5H7V3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3.5v4h4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
}

async function ensureNotesDir(notesDir: string): Promise<void> {
  if (await exists(notesDir)) return;
  await mkdir(notesDir, { recursive: true });
}

function normalizeExtensions(extensions: string[] | undefined): Set<string> {
  const fallback = ["md", "markdown"];
  const source = extensions && extensions.length > 0 ? extensions : fallback;
  return new Set(source.map((ext) => ext.trim().toLowerCase().replace(/^\./, "")).filter(Boolean));
}

function fileAllowed(name: string, allowedExtensions: Set<string>): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return allowedExtensions.has(name.slice(dot + 1).toLowerCase());
}

async function readDirNodes(dirPath: string, allowedExtensions: Set<string>): Promise<TreeNode[]> {
  const entries = await readDir(dirPath);
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const fullPath = await join(dirPath, entry.name);
    if (entry.isDirectory) {
      nodes.push({
        kind: "dir",
        name: entry.name,
        path: fullPath,
        expanded: false,
        loaded: false,
        children: [],
      });
      continue;
    }
    if (entry.isFile) {
      if (!fileAllowed(entry.name, allowedExtensions)) continue;
      nodes.push({ kind: "file", name: entry.name, path: fullPath });
    }
  }
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

async function walkFiles(
  dirPath: string,
  token: { current: number },
  tokenValue: number,
  allowedExtensions: Set<string>,
): Promise<TreeNode[]> {
  if (token.current !== tokenValue) return [];
  const entries = await readDir(dirPath);
  const out: TreeNode[] = [];
  for (const entry of entries) {
    if (token.current !== tokenValue) return out;
    const fullPath = await join(dirPath, entry.name);
    if (entry.isDirectory) {
      out.push(...(await walkFiles(fullPath, token, tokenValue, allowedExtensions)));
      continue;
    }
    if (entry.isFile && fileAllowed(entry.name, allowedExtensions)) {
      out.push({ kind: "file", name: entry.name, path: fullPath });
    }
  }
  return out;
}

export async function openVaultExplorer(options: VaultExplorerOptions): Promise<string | null> {
  ensureStyles();
  await ensureNotesDir(options.notesDir);
  const allowedExtensions = normalizeExtensions(options.allowedExtensions);
  const defaultExtension = options.defaultExtension ?? "md";

  const overlay = document.createElement("div");
  overlay.className = "vei-overlay";

  const modal = document.createElement("div");
  modal.className = "vei-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", options.title ?? "Explorador de notas");

  const header = document.createElement("div");
  header.className = "vei-header";

  const title = document.createElement("div");
  title.className = "vei-title";
  title.textContent = options.title ?? "Explorador del vault";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "vei-close";
  closeBtn.textContent = "Cerrar";

  header.append(title, closeBtn);

  const toolbar = document.createElement("div");
  toolbar.className = "vei-toolbar";

  const searchInput = document.createElement("input");
  searchInput.className = "vei-search";
  searchInput.type = "search";
  searchInput.placeholder = "Buscar por nombre…";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;

  const newNoteBtn = document.createElement("button");
  newNoteBtn.type = "button";
  newNoteBtn.className = "vei-close";
  newNoteBtn.textContent = "Nuevo archivo";
  newNoteBtn.title = "Crear un archivo en la carpeta de notas";

  const newFolderBtn = document.createElement("button");
  newFolderBtn.type = "button";
  newFolderBtn.className = "vei-close";
  newFolderBtn.textContent = "Nueva carpeta";
  newFolderBtn.title = "Crear una carpeta en la carpeta de notas";

  toolbar.append(searchInput, newFolderBtn, newNoteBtn);

  const body = document.createElement("div");
  body.className = "vei-body";

  const leftPane = document.createElement("div");
  leftPane.className = "vei-pane";

  const rightPane = document.createElement("div");
  rightPane.className = "vei-pane";

  const hintLeft = document.createElement("div");
  hintLeft.className = "vei-hint";
  hintLeft.textContent = "Carpetas y archivos";

  const hintRight = document.createElement("div");
  hintRight.className = "vei-hint";
  hintRight.textContent = "Resultados";

  const treeList = document.createElement("div");
  treeList.className = "vei-list";

  const resultsList = document.createElement("div");
  resultsList.className = "vei-list";

  leftPane.append(hintLeft, treeList);
  rightPane.append(hintRight, resultsList);
  body.append(leftPane, rightPane);

  modal.append(header, toolbar, body);
  overlay.append(modal);

  const prevActive = document.activeElement as HTMLElement | null;
  document.body.append(overlay);

  let resolver: ((value: string | null) => void) | null = null;
  const done = (value: string | null) => {
    resolver?.(value);
  };
  const cleanup = () => {
    overlay.remove();
    if (prevActive) prevActive.focus();
    window.removeEventListener("keydown", onKeyDown, true);
  };

  const root: TreeNode = {
    kind: "dir",
    name: "notes",
    path: options.notesDir,
    expanded: true,
    loaded: false,
    children: [],
  };

  const renderTree = () => {
    treeList.innerHTML = "";
    const frag = document.createDocumentFragment();

    const renderNode = (node: TreeNode, indent: number) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vei-item vei-indent";
      btn.style.setProperty("--vei-indent", String(indent));

      const main = document.createElement("div");
      main.className = "vei-item-main";

      const titleEl = document.createElement("div");
      titleEl.className = "vei-item-title";
      titleEl.textContent = node.name;

      const metaEl = document.createElement("div");
      metaEl.className = "vei-item-meta";
      metaEl.textContent = node.kind === "dir" ? "Carpeta" : node.path;

      main.append(titleEl, metaEl);

      const iconWrap = document.createElement("span");
      iconWrap.innerHTML = node.kind === "dir" ? dirIcon() : fileIcon();

      btn.append(iconWrap, main);

      if (node.kind === "dir") {
        btn.title = node.expanded ? "Click para colapsar" : "Click para expandir";
        btn.addEventListener("click", async () => {
          node.expanded = !node.expanded;
          if (node.expanded && !node.loaded) {
            node.children = await readDirNodes(node.path, allowedExtensions);
            node.loaded = true;
          }
          renderTree();
        });
      } else {
        btn.title = "Abrir archivo";
        btn.addEventListener("click", () => done(node.path));
      }

      frag.append(btn);

      if (node.kind === "dir" && node.expanded) {
        if (!node.loaded) {
          // will be loaded on demand
          return;
        }
        for (const child of node.children) {
          renderNode(child, indent + 1);
        }
      }
    };

    renderNode(root, 0);
    treeList.append(frag);
  };

  const setResults = (items: TreeNode[], label: string) => {
    hintRight.textContent = label;
    resultsList.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "vei-empty";
      empty.textContent = "Sin resultados.";
      resultsList.append(empty);
      return;
    }

    for (const node of items.slice(0, 300)) {
      if (node.kind !== "file") continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vei-item";
      btn.innerHTML = `${fileIcon()}<div class="vei-item-main"><div class="vei-item-title"></div><div class="vei-item-meta"></div></div>`;
      const titleEl = btn.querySelector<HTMLElement>(".vei-item-title");
      const metaEl = btn.querySelector<HTMLElement>(".vei-item-meta");
      if (titleEl) titleEl.textContent = node.name;
      if (metaEl) metaEl.textContent = node.path;
      btn.addEventListener("click", () => done(node.path));
      resultsList.append(btn);
    }
  };

  const refreshRoot = async () => {
    root.children = await readDirNodes(root.path, allowedExtensions);
    root.loaded = true;
    renderTree();
  };

  const token = { current: 0 };
  let searchTimer: number | undefined;
  const onSearch = () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(async () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        setResults([], "Resultados");
        return;
      }
      token.current += 1;
      const t = token.current;
      setResults([], "Buscando…");
      const files = await walkFiles(options.notesDir, token, t, allowedExtensions);
      if (token.current !== t) return;
      const filtered = files.filter((n) => n.kind === "file" && n.name.toLowerCase().includes(q));
      setResults(filtered, `${filtered.length} resultado(s)`);
    }, 140);
  };

  const createFolder = async () => {
    const name = window.prompt("Nombre de carpeta:", "Nueva carpeta");
    if (!name) return;
    const path = await join(options.notesDir, name);
    await mkdir(path, { recursive: true });
    await refreshRoot();
  };

  const createNote = async () => {
    const name = window.prompt(
      "Nombre de archivo (sin extensión):",
      defaultExtension === "json" ? "Nuevo JSON" : "Nueva nota",
    );
    if (!name) return;
    const safe = name.trim();
    if (!safe) return;
    const hasExtension = /\.[a-z0-9]+$/i.test(safe);
    const filename = hasExtension ? safe : `${safe}.${defaultExtension}`;
    if (!fileAllowed(filename, allowedExtensions)) {
      setResults([], "Extensión no permitida");
      return;
    }
    const path = await join(options.notesDir, filename);
    if (await exists(path)) {
      setResults([{ kind: "file", name: filename, path }], "Ya existe");
      return;
    }
    const template = defaultExtension === "json" ? "{\n  \"nuevo\": true\n}" : `# ${safe}\n\n`;
    await writeTextFile(path, template);
    await refreshRoot();
    setResults([{ kind: "file", name: filename, path }], "Creada");
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      done(null);
    }
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) done(null);
  });

  closeBtn.addEventListener("click", () => done(null));
  searchInput.addEventListener("input", onSearch);
  newFolderBtn.addEventListener("click", () => void createFolder());
  newNoteBtn.addEventListener("click", () => void createNote());
  window.addEventListener("keydown", onKeyDown, true);

  await refreshRoot();
  setResults([], "Resultados");

  searchInput.focus();

  const result = await new Promise<string | null>((resolve) => {
    resolver = resolve;
  });

  cleanup();
  return result;
}
