import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createJsonWorkspace,
  type JsonSelectionChange,
  type JsonWorkspace,
} from "../src/features/jsonWorkspace";

type WorkspaceFixture = {
  workspace: JsonWorkspace;
  textarea: HTMLTextAreaElement;
  tree: HTMLElement;
  status: HTMLElement;
};

const SAMPLE_JSON = JSON.stringify(
  {
    id: "demo",
    meta: {
      title: "Documento",
      tags: ["a", "b"],
    },
    sections: [
      { kind: "hero", title: "Inicio" },
      { kind: "body", title: "Detalle" },
    ],
  },
  null,
  2,
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function createFixture(treeVisible = true): WorkspaceFixture {
  document.body.innerHTML = `
    <textarea id="json"></textarea>
    <pre id="highlight"></pre>
    <div id="tree"></div>
    <div id="status"></div>
    <button id="pretty" type="button"></button>
    <button id="minify" type="button"></button>
  `;

  const textarea = document.querySelector<HTMLTextAreaElement>("#json");
  const highlight = document.querySelector<HTMLElement>("#highlight");
  const tree = document.querySelector<HTMLElement>("#tree");
  const status = document.querySelector<HTMLElement>("#status");
  const pretty = document.querySelector<HTMLButtonElement>("#pretty");
  const minify = document.querySelector<HTMLButtonElement>("#minify");

  if (!textarea || !highlight || !tree || !status || !pretty || !minify) {
    throw new Error("No pude construir el fixture de jsonWorkspace.");
  }

  const workspace = createJsonWorkspace({
    textAreaEl: textarea,
    highlightEl: highlight,
    treeEl: tree,
    statusEl: status,
    prettyBtn: pretty,
    minifyBtn: minify,
    treeVisible,
  });

  return { workspace, textarea, tree, status };
}

function findJsonPathNode(root: ParentNode, selector: string, path: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find((node) => node.dataset.jsonPath === path);
}

describe("jsonWorkspace selection sync", () => {
  it("selectPath updates the active path and emits selection changes", () => {
    const { workspace } = createFixture();
    workspace.setText(SAMPLE_JSON, false);

    const events: JsonSelectionChange[] = [];
    workspace.onSelectionChange((event) => {
      events.push(event);
    });

    workspace.selectPath("$.meta.title", { source: "program", reveal: true, focusTarget: "none" });

    expect(workspace.getSelectedPath()).toBe("$.meta.title");
    expect(events.at(-1)).toEqual({
      path: "$.meta.title",
      source: "program",
    });
  });

  it("focusPath keeps working as a legacy wrapper and highlights the tree row", () => {
    vi.useFakeTimers();
    const { workspace, tree } = createFixture();
    workspace.setText(SAMPLE_JSON, false);
    vi.advanceTimersByTime(300);

    workspace.focusPath("$.meta.title");

    expect(workspace.getSelectedPath()).toBe("$.meta.title");
    const row = findJsonPathNode(tree, ".json-row", "$.meta.title");
    expect(row?.classList.contains("is-selected")).toBe(true);
  });

  it("falls back to the closest valid ancestor when a selected path disappears", () => {
    const { workspace } = createFixture();
    workspace.setText(SAMPLE_JSON, false);
    workspace.selectPath("$.meta.title", { source: "program", reveal: false, focusTarget: "none" });

    workspace.setText(
      JSON.stringify(
        {
          id: "demo",
          meta: {},
          sections: [],
        },
        null,
        2,
      ),
      false,
    );

    expect(workspace.getSelectedPath()).toBe("$.meta");
  });

  it("clears the active path when JSON becomes invalid", () => {
    const { workspace } = createFixture();
    workspace.setText(SAMPLE_JSON, false);
    workspace.selectPath("$.meta.title", { source: "program", reveal: false, focusTarget: "none" });

    const events: JsonSelectionChange[] = [];
    workspace.onSelectionChange((event) => {
      events.push(event);
    });

    workspace.setText('{"broken"', false);

    expect(workspace.getSelectedPath()).toBeNull();
    expect(events.at(-1)).toEqual({
      path: null,
      source: "program",
    });
  });

  it("syncs tree selection from the editor caret after a short pause", () => {
    vi.useFakeTimers();
    const { workspace, textarea, tree } = createFixture();
    workspace.setText(SAMPLE_JSON, false);
    vi.advanceTimersByTime(300);

    const events: JsonSelectionChange[] = [];
    workspace.onSelectionChange((event) => {
      events.push(event);
    });

    const caret = SAMPLE_JSON.indexOf('"title": "Documento"') + 3;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));

    vi.advanceTimersByTime(140);

    expect(workspace.getSelectedPath()).toBe("$.meta.title");
    expect(events.at(-1)).toEqual({
      path: "$.meta.title",
      source: "editor",
    });
    const row = findJsonPathNode(tree, ".json-row", "$.meta.title");
    expect(row?.classList.contains("is-selected")).toBe(true);
  });

  it("renders container and leaf rows with hierarchy classes and marks active ancestors", () => {
    vi.useFakeTimers();
    const { workspace, tree } = createFixture();
    workspace.setText(SAMPLE_JSON, false);
    vi.advanceTimersByTime(300);

    workspace.selectPath("$.meta.title", { source: "program", reveal: true, focusTarget: "none" });

    const rootRow = findJsonPathNode(tree, ".json-row", "$");
    const metaRow = findJsonPathNode(tree, ".json-row", "$.meta");
    const titleRow = findJsonPathNode(tree, ".json-row", "$.meta.title");

    expect(rootRow?.classList.contains("json-row--container")).toBe(true);
    expect(rootRow?.classList.contains("json-row--active-ancestor")).toBe(true);
    expect(metaRow?.classList.contains("json-row--container")).toBe(true);
    expect(metaRow?.classList.contains("json-row--active-ancestor")).toBe(true);
    expect(titleRow?.classList.contains("json-row--leaf")).toBe(true);
    expect(titleRow?.classList.contains("is-selected")).toBe(true);
    expect(metaRow?.querySelector(".json-row-path")?.textContent).toBe("$.meta");
    expect(titleRow?.querySelector(".json-row-editor .json-value-input")).toBeTruthy();
    expect(metaRow?.querySelector(".json-row-actions--secondary .json-action-button")).toBeTruthy();
  });
});
