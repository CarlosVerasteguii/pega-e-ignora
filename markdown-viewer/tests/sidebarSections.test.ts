import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createImmediateSidebarMotionDriver,
  createSidebarSections,
  type SidebarMotionDriver,
  type SidebarMotionHandle,
} from "../src/ui/sidebarSections";

type SectionFixture = {
  section: HTMLElement;
  toggle: HTMLButtonElement;
  body: HTMLElement;
  content: HTMLElement;
  inner: HTMLElement;
};

type SidebarFixture = {
  root: HTMLElement;
  fillGroup: HTMLElement;
  history: SectionFixture;
  outline: SectionFixture;
  format: SectionFixture;
  formatField: HTMLInputElement;
};

type DeferredMotionController = {
  driver: SidebarMotionDriver;
  finishAll: () => Promise<void>;
};

class ResizeObserverStub {
  observe(): void {}

  disconnect(): void {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
});

function defineRectMetric(element: HTMLElement, readHeight: () => number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      const height = readHeight();
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: height,
        width: 320,
        height,
        toJSON: () => ({}),
      };
    },
  });
}

function defineScrollHeight(element: HTMLElement, readHeight: () => number): void {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: readHeight,
  });
}

function bindBodyMetrics(body: HTMLElement, expandedHeight: number): void {
  defineScrollHeight(body, () => expandedHeight);
  defineRectMetric(body, () => {
    if (body.hidden) return 0;
    const inlineHeight = body.style.height.trim();
    if (inlineHeight && inlineHeight !== "auto") {
      return Number.parseFloat(inlineHeight) || 0;
    }
    return expandedHeight;
  });
}

function getSectionFixture(id: "history" | "outline" | "format"): SectionFixture {
  const section = document.querySelector<HTMLElement>(`.sidebar-section[data-section="${id}"]`);
  const toggle = section?.querySelector<HTMLButtonElement>(".sidebar-section-toggle");
  const body = section?.querySelector<HTMLElement>(".sidebar-body");
  const content = section?.querySelector<HTMLElement>(".sidebar-content");
  const inner = section?.querySelector<HTMLElement>(".sidebar-content-inner");

  if (!section || !toggle || !body || !content || !inner) {
    throw new Error(`Falta fixture para la sección ${id}`);
  }

  return { section, toggle, body, content, inner };
}

function createSidebarFixture(): SidebarFixture {
  document.body.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-fill-group" data-sidebar-group="fill" style="gap: 8px;">
        <section class="sidebar-section sidebar-section-history" data-section="history" data-sidebar-kind="fill">
          <h2 class="sidebar-header">
            <button
              id="sidebar-history-toggle"
              class="sidebar-section-toggle"
              type="button"
              data-section="history"
              aria-controls="sidebar-history-content"
              aria-expanded="true"
            >
              <span class="sidebar-section-title">Historial</span>
              <span class="sidebar-section-chevron" aria-hidden="true"></span>
            </button>
          </h2>
          <div id="sidebar-history-content" class="sidebar-body" role="region" aria-labelledby="sidebar-history-toggle">
            <div class="sidebar-content">
              <div class="sidebar-content-inner">
                <ul id="history" class="history"><li>Item</li></ul>
              </div>
            </div>
          </div>
        </section>
        <section class="sidebar-section sidebar-section-outline" data-section="outline" data-sidebar-kind="fill">
          <h2 class="sidebar-header">
            <button
              id="sidebar-outline-toggle"
              class="sidebar-section-toggle"
              type="button"
              data-section="outline"
              aria-controls="sidebar-outline-content"
              aria-expanded="true"
            >
              <span class="sidebar-section-title">Jerarquía</span>
              <span class="sidebar-section-chevron" aria-hidden="true"></span>
            </button>
          </h2>
          <div id="sidebar-outline-content" class="sidebar-body" role="region" aria-labelledby="sidebar-outline-toggle">
            <div class="sidebar-content">
              <div class="sidebar-content-inner">
                <ul id="outline" class="outline"><li>Heading</li></ul>
              </div>
            </div>
          </div>
        </section>
      </div>
      <section class="sidebar-section sidebar-section-format" data-section="format" data-sidebar-kind="intrinsic">
        <h2 class="sidebar-header">
          <button
            id="sidebar-format-toggle"
            class="sidebar-section-toggle"
            type="button"
            data-section="format"
            aria-controls="sidebar-format-content"
            aria-expanded="true"
          >
            <span class="sidebar-section-title">Formato</span>
            <span class="sidebar-section-chevron" aria-hidden="true"></span>
          </button>
        </h2>
        <div id="sidebar-format-content" class="sidebar-body" role="region" aria-labelledby="sidebar-format-toggle">
          <div class="sidebar-content">
            <div class="sidebar-content-inner">
              <div class="format-controls">
                <label for="format-field">Campo</label>
                <input id="format-field" type="text" value="demo" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </aside>
  `.trim();

  const root = document.querySelector<HTMLElement>(".sidebar");
  const fillGroup = document.querySelector<HTMLElement>(".sidebar-fill-group");
  const formatField = document.querySelector<HTMLInputElement>("#format-field");
  if (!root || !fillGroup || !formatField) {
    throw new Error("No pude crear el fixture del sidebar");
  }

  const history = getSectionFixture("history");
  const outline = getSectionFixture("outline");
  const format = getSectionFixture("format");

  const readVisibleFillHeaderStackHeight = () => {
    const visibleFillSections = [history, outline].filter((section) => !section.section.hidden);
    if (visibleFillSections.length === 0) return 0;
    return visibleFillSections.length * 44 + Math.max(0, visibleFillSections.length - 1) * 8;
  };

  defineRectMetric(fillGroup, () =>
    fillGroup.dataset.fillLayout === "collapsed" ? readVisibleFillHeaderStackHeight() : 400,
  );
  defineRectMetric(history.section, () => {
    if (history.section.hidden) return 0;
    return 44 + (history.body.hidden ? 0 : parseFloat(history.body.style.height || "0"));
  });
  defineRectMetric(outline.section, () => {
    if (outline.section.hidden) return 0;
    return 44 + (outline.body.hidden ? 0 : parseFloat(outline.body.style.height || "0"));
  });
  defineRectMetric(format.section, () => {
    if (format.section.hidden) return 0;
    return 44 + (format.body.hidden ? 0 : format.body.style.height === "auto"
      ? 216
      : parseFloat(format.body.style.height || "0"));
  });
  defineRectMetric(history.toggle, () => 24);
  defineRectMetric(outline.toggle, () => 24);
  defineRectMetric(format.toggle, () => 24);

  const headers = Array.from(document.querySelectorAll<HTMLElement>(".sidebar-header"));
  for (const header of headers) {
    defineRectMetric(header, () => 44);
  }

  bindBodyMetrics(history.body, 172);
  bindBodyMetrics(outline.body, 140);
  bindBodyMetrics(format.body, 216);

  return {
    root,
    fillGroup,
    history,
    outline,
    format,
    formatField,
  };
}

function createDeferredMotionController(): DeferredMotionController {
  const handles = new Set<SidebarMotionHandle>();

  const createHandle = (onFinish: () => void, onCancelToCurrent: () => void): SidebarMotionHandle => {
    let settled = false;
    let resolveFinished = () => {};
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });

    const settle = (commit: () => void) => {
      if (settled) return;
      settled = true;
      commit();
      resolveFinished();
    };

    const handle: SidebarMotionHandle = {
      finished,
      cancelToCurrent: () => settle(onCancelToCurrent),
      finishToEnd: () => settle(onFinish),
    };
    handles.add(handle);
    finished.finally(() => {
      handles.delete(handle);
    });
    return handle;
  };

  return {
    driver: {
      animateHeight: (element, fromPx, toPx) => {
        element.style.height = `${fromPx}px`;
        return createHandle(
          () => {
            element.style.height = `${toPx}px`;
          },
          () => {
            const current = element.getBoundingClientRect().height;
            element.style.height = `${current}px`;
          },
        );
      },
      animateOpacity: (element, from, to) => {
        element.style.opacity = String(from);
        return createHandle(
          () => {
            element.style.opacity = String(to);
          },
          () => {
            const current = window.getComputedStyle(element).opacity || String(from);
            element.style.opacity = current;
          },
        );
      },
    },
    finishAll: async () => {
      const active = Array.from(handles);
      for (const handle of active) {
        handle.finishToEnd();
      }
      await Promise.resolve();
    },
  };
}

describe("sidebarSections", () => {
  it("initializes fill and intrinsic sections with the expected default states", () => {
    const fixture = createSidebarFixture();
    createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: false },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    expect(fixture.history.section.dataset.state).toBe("expanded");
    expect(fixture.outline.section.dataset.state).toBe("expanded");
    expect(fixture.format.section.dataset.state).toBe("collapsed");
    expect(fixture.format.body.hidden).toBe(true);
    expect(parseFloat(fixture.history.body.style.height)).toBeCloseTo(167.2, 1);
    expect(parseFloat(fixture.outline.body.style.height)).toBeCloseTo(136.8, 1);
  });

  it("redistributes fill height when one fill section collapses", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: false },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    api.setExpanded("history", false);

    expect(fixture.history.body.hidden).toBe(true);
    expect(fixture.history.section.dataset.state).toBe("collapsed");
    expect(parseFloat(fixture.outline.body.style.height)).toBeCloseTo(304, 1);
    expect(fixture.outline.section.dataset.state).toBe("expanded");
  });

  it("keeps intrinsic content visible until the collapse animation finishes", async () => {
    const fixture = createSidebarFixture();
    const deferred = createDeferredMotionController();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: true },
      reducedMotion: () => false,
      motionDriver: deferred.driver,
    });

    api.setExpanded("format", false);

    expect(fixture.format.toggle.getAttribute("aria-expanded")).toBe("false");
    expect(fixture.format.section.dataset.state).toBe("collapsing");
    expect(fixture.format.body.hidden).toBe(false);

    await deferred.finishAll();

    expect(fixture.format.section.dataset.state).toBe("collapsed");
    expect(fixture.format.body.hidden).toBe(true);
  });

  it("handles rapid repeated clicks by canceling the previous intrinsic animation", async () => {
    const fixture = createSidebarFixture();
    const deferred = createDeferredMotionController();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: true },
      reducedMotion: () => false,
      motionDriver: deferred.driver,
    });

    api.setExpanded("format", false);
    api.setExpanded("format", true);

    await deferred.finishAll();

    expect(fixture.format.toggle.getAttribute("aria-expanded")).toBe("true");
    expect(fixture.format.section.dataset.state).toBe("expanded");
    expect(fixture.format.body.hidden).toBe(false);
    expect(fixture.format.body.style.height).toBe("auto");
  });

  it("preserves user-expanded state when outline is hidden and shown again by mode", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: false, format: false },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    api.setVisible("outline", false);
    expect(fixture.outline.section.hidden).toBe(true);
    expect(fixture.outline.section.dataset.visibility).toBe("hidden-by-mode");

    api.setVisible("outline", true);

    expect(fixture.outline.section.hidden).toBe(false);
    expect(fixture.outline.toggle.getAttribute("aria-expanded")).toBe("false");
    expect(fixture.outline.section.dataset.state).toBe("collapsed");
    expect(fixture.outline.body.hidden).toBe(true);
  });

  it("marks format as hidden-by-mode without losing the collapsed visual state", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: true },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    api.setVisible("format", false);

    expect(fixture.format.section.hidden).toBe(true);
    expect(fixture.format.body.hidden).toBe(true);
    expect(fixture.format.section.dataset.visibility).toBe("hidden-by-mode");
    expect(fixture.format.section.dataset.state).toBe("collapsed");
  });

  it("settles immediately when reduced motion is enabled", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: true },
      reducedMotion: () => true,
    });

    api.setExpanded("format", false);

    expect(fixture.format.section.dataset.state).toBe("collapsed");
    expect(fixture.format.body.hidden).toBe(true);
  });

  it("returns focus to the toggle when collapsing a section that contains the active element", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: true },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    fixture.formatField.focus();
    expect(document.activeElement).toBe(fixture.formatField);

    api.setExpanded("format", false);

    expect(document.activeElement).toBe(fixture.format.toggle);
  });

  it("supports arrow-key navigation across visible toggles without including hidden sections", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: true },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    api.setVisible("outline", false);
    fixture.history.toggle.focus();
    fixture.history.toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(fixture.format.toggle);

    fixture.format.toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(fixture.history.toggle);
  });

  it("switches the fill group to collapsed layout when both fill panels are collapsed", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: false },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    api.setExpanded("history", false);
    api.setExpanded("outline", false);

    expect(fixture.fillGroup.dataset.fillLayout).toBe("collapsed");
    expect(fixture.history.body.hidden).toBe(true);
    expect(fixture.outline.body.hidden).toBe(true);
  });

  it("keeps the fill group active while at least one visible fill panel is expanded", () => {
    const fixture = createSidebarFixture();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: false, format: false },
      reducedMotion: () => true,
      motionDriver: createImmediateSidebarMotionDriver(),
    });

    expect(fixture.fillGroup.dataset.fillLayout).toBe("active");

    api.setVisible("outline", false);

    expect(fixture.fillGroup.dataset.fillLayout).toBe("active");
    expect(parseFloat(fixture.history.body.style.height)).toBeGreaterThan(0);
  });

  it("keeps state attributes synchronized after settleAll finishes a pending collapse", async () => {
    const fixture = createSidebarFixture();
    const deferred = createDeferredMotionController();
    const api = createSidebarSections({
      root: fixture.root,
      initialExpanded: { history: true, outline: true, format: true },
      reducedMotion: () => false,
      motionDriver: deferred.driver,
    });

    api.setExpanded("format", false);
    api.settleAll();
    await Promise.resolve();

    expect(fixture.format.toggle.getAttribute("aria-expanded")).toBe("false");
    expect(fixture.format.section.dataset.state).toBe("collapsed");
    expect(fixture.format.section.dataset.visibility).toBe("visible");
    expect(fixture.format.body.hidden).toBe(true);
  });
});
