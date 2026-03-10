export type SidebarSectionId = "history" | "outline" | "format";
export type SidebarSectionKind = "fill" | "intrinsic";
export type SidebarVisibility = "visible" | "hidden-by-mode";
export type SidebarPhase = "idle" | "expanding" | "collapsing";

export type SidebarSectionsApi = {
  toggle: (id: SidebarSectionId) => void;
  setExpanded: (id: SidebarSectionId, expanded: boolean) => void;
  setVisible: (id: SidebarSectionId, visible: boolean) => void;
  refreshLayout: () => void;
  settleAll: () => void;
  destroy: () => void;
};

export type SidebarMotionHandle = {
  finished: Promise<void>;
  cancelToCurrent: () => void;
  finishToEnd: () => void;
};

export type SidebarMotionDriver = {
  animateHeight: (
    element: HTMLElement,
    fromPx: number,
    toPx: number,
    options: { durationMs: number; easing: string },
  ) => SidebarMotionHandle;
  animateOpacity: (
    element: HTMLElement,
    from: number,
    to: number,
    options: { durationMs: number; easing: string },
  ) => SidebarMotionHandle;
};

type SidebarSectionsOptions = {
  root: HTMLElement;
  initialExpanded: Record<SidebarSectionId, boolean>;
  reducedMotion: () => boolean;
  onExpandedChange?: (id: SidebarSectionId, expanded: boolean) => void;
  motionDriver?: SidebarMotionDriver;
  fillWeights?: Partial<Record<Extract<SidebarSectionId, "history" | "outline">, number>>;
};

type FillSectionId = Extract<SidebarSectionId, "history" | "outline">;

type RunningAnimation = {
  finished: Promise<void>;
  cancelToCurrent: () => void;
  finishToEnd: () => void;
};

type SectionRecord = {
  id: SidebarSectionId;
  kind: SidebarSectionKind;
  weight: number;
  sectionEl: HTMLElement;
  headerEl: HTMLElement;
  toggleEl: HTMLButtonElement;
  bodyEl: HTMLElement;
  contentEl: HTMLElement;
  innerEl: HTMLElement;
  userExpanded: boolean;
  visibility: SidebarVisibility;
  phase: SidebarPhase;
  runningAnimation: RunningAnimation | null;
};

const HEIGHT_DURATION_MS = 240;
const OPACITY_DURATION_MS = 180;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const OPACITY_EASING = "ease";
const DEFAULT_FILL_WEIGHTS: Record<FillSectionId, number> = {
  history: 1.1,
  outline: 0.9,
};
const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"]);

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseGapPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getActiveElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function getBodyHeight(section: SectionRecord): number {
  if (section.bodyEl.hidden) return 0;
  return section.bodyEl.getBoundingClientRect().height;
}

function getContentOpacity(section: SectionRecord): number {
  if (section.bodyEl.hidden) return 0;
  const parsed = Number.parseFloat(window.getComputedStyle(section.contentEl).opacity);
  return Number.isFinite(parsed) ? clampNumber(parsed, 0, 1) : 1;
}

function setHeightPx(element: HTMLElement, value: number): void {
  element.style.height = `${Math.max(0, value).toFixed(2)}px`;
}

function setOpacity(element: HTMLElement, value: number): void {
  element.style.opacity = clampNumber(value, 0, 1).toFixed(3);
}

function isFillSection(section: SectionRecord): section is SectionRecord & { id: FillSectionId } {
  return section.kind === "fill";
}

function isElementVisibleForNavigation(section: SectionRecord): boolean {
  return section.visibility === "visible" && !section.sectionEl.hidden;
}

function createImmediateHandle(commitFinal: () => void): SidebarMotionHandle {
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    commitFinal();
  };
  settle();
  return {
    finished: Promise.resolve(),
    cancelToCurrent: settle,
    finishToEnd: settle,
  };
}

function createAnimationHandle(
  animation: Animation,
  onFinish: () => void,
  onCancelToCurrent: () => void,
): SidebarMotionHandle {
  let settled = false;
  let resolveFinished = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const settle = (action: () => void) => {
    if (settled) return;
    settled = true;
    action();
    resolveFinished();
  };

  animation.finished.then(
    () => {
      settle(() => {
        onFinish();
        animation.cancel();
      });
    },
    () => {
      settle(onCancelToCurrent);
    },
  );

  return {
    finished,
    cancelToCurrent: () => {
      settle(() => {
        onCancelToCurrent();
        animation.cancel();
      });
    },
    finishToEnd: () => {
      settle(() => {
        onFinish();
        try {
          animation.finish();
        } catch {
          animation.cancel();
        }
      });
    },
  };
}

export function createImmediateSidebarMotionDriver(): SidebarMotionDriver {
  return {
    animateHeight: (element, _fromPx, toPx) => {
      return createImmediateHandle(() => setHeightPx(element, toPx));
    },
    animateOpacity: (element, _from, to) => {
      return createImmediateHandle(() => setOpacity(element, to));
    },
  };
}

export function createWebSidebarMotionDriver(reducedMotion: () => boolean): SidebarMotionDriver {
  const immediate = createImmediateSidebarMotionDriver();

  return {
    animateHeight: (element, fromPx, toPx, options) => {
      setHeightPx(element, fromPx);
      if (reducedMotion() || typeof element.animate !== "function") {
        return immediate.animateHeight(element, fromPx, toPx, options);
      }
      const animation = element.animate(
        [{ height: `${fromPx}px` }, { height: `${toPx}px` }],
        {
          duration: options.durationMs,
          easing: options.easing,
          fill: "forwards",
        },
      );
      return createAnimationHandle(animation, () => setHeightPx(element, toPx), () =>
        setHeightPx(element, element.getBoundingClientRect().height),
      );
    },
    animateOpacity: (element, from, to, options) => {
      setOpacity(element, from);
      if (reducedMotion() || typeof element.animate !== "function") {
        return immediate.animateOpacity(element, from, to, options);
      }
      const animation = element.animate(
        [{ opacity: `${from}` }, { opacity: `${to}` }],
        {
          duration: options.durationMs,
          easing: options.easing,
          fill: "forwards",
        },
      );
      return createAnimationHandle(animation, () => setOpacity(element, to), () =>
        setOpacity(element, getContentOpacityValue(element)),
      );
    },
  };
}

function getContentOpacityValue(element: HTMLElement): number {
  const parsed = Number.parseFloat(window.getComputedStyle(element).opacity);
  return Number.isFinite(parsed) ? clampNumber(parsed, 0, 1) : 1;
}

function createRunningAnimation(
  section: SectionRecord,
  handles: SidebarMotionHandle[],
  commitFinal: () => void,
): RunningAnimation {
  const running: RunningAnimation = {
    finished: Promise.all(handles.map((handle) => handle.finished)).then(() => {
      if (section.runningAnimation !== running) return;
      section.runningAnimation = null;
      commitFinal();
    }),
    cancelToCurrent: () => {
      if (section.runningAnimation !== running) return;
      section.runningAnimation = null;
      for (const handle of handles) {
        handle.cancelToCurrent();
      }
    },
    finishToEnd: () => {
      if (section.runningAnimation !== running) return;
      section.runningAnimation = null;
      for (const handle of handles) {
        handle.finishToEnd();
      }
      commitFinal();
    },
  };
  return running;
}

function findSectionDom(
  root: HTMLElement,
  id: SidebarSectionId,
  weight: number,
  initialExpanded: boolean,
): SectionRecord {
  const sectionEl = root.querySelector<HTMLElement>(`.sidebar-section[data-section="${id}"]`);
  if (!sectionEl) {
    throw new Error(`Falta sección del sidebar: ${id}`);
  }
  const kind = (sectionEl.dataset.sidebarKind ?? "") as SidebarSectionKind;
  const headerEl = sectionEl.querySelector<HTMLElement>(".sidebar-header");
  const toggleEl = sectionEl.querySelector<HTMLButtonElement>(".sidebar-section-toggle");
  const bodyEl = sectionEl.querySelector<HTMLElement>(".sidebar-body");
  const contentEl = sectionEl.querySelector<HTMLElement>(".sidebar-content");
  const innerEl = sectionEl.querySelector<HTMLElement>(".sidebar-content-inner");

  if (!headerEl || !toggleEl || !bodyEl || !contentEl || !innerEl) {
    throw new Error(`Falta estructura del sidebar en sección: ${id}`);
  }
  if (kind !== "fill" && kind !== "intrinsic") {
    throw new Error(`Tipo de sección inválido: ${id}`);
  }

  return {
    id,
    kind,
    weight,
    sectionEl,
    headerEl,
    toggleEl,
    bodyEl,
    contentEl,
    innerEl,
    userExpanded: initialExpanded,
    visibility: sectionEl.hidden ? "hidden-by-mode" : "visible",
    phase: "idle",
    runningAnimation: null,
  };
}

export function createSidebarSections(options: SidebarSectionsOptions): SidebarSectionsApi {
  const fillWeights = {
    ...DEFAULT_FILL_WEIGHTS,
    ...(options.fillWeights ?? {}),
  };
  const fillGroupEl = options.root.querySelector<HTMLElement>("[data-sidebar-group='fill']");
  if (!fillGroupEl) {
    throw new Error("Falta contenedor del grupo fill del sidebar");
  }

  const sections = new Map<SidebarSectionId, SectionRecord>([
    [
      "history",
      findSectionDom(options.root, "history", fillWeights.history, options.initialExpanded.history),
    ],
    [
      "outline",
      findSectionDom(options.root, "outline", fillWeights.outline, options.initialExpanded.outline),
    ],
    [
      "format",
      findSectionDom(options.root, "format", 0, options.initialExpanded.format),
    ],
  ]);

  const sectionOrder = ["history", "outline", "format"] satisfies SidebarSectionId[];
  const motionDriver = options.motionDriver ?? createWebSidebarMotionDriver(options.reducedMotion);
  const listenerController = typeof AbortController !== "undefined" ? new AbortController() : null;
  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          refreshLayout();
        })
      : null;

  const updateSectionDomState = (section: SectionRecord) => {
    section.sectionEl.dataset.visibility = section.visibility;
    section.toggleEl.setAttribute("aria-expanded", section.userExpanded ? "true" : "false");

    let dataState: "expanded" | "collapsed" | "expanding" | "collapsing";
    if (section.phase === "expanding") {
      dataState = "expanding";
    } else if (section.phase === "collapsing") {
      dataState = "collapsing";
    } else {
      dataState = section.visibility === "visible" && section.userExpanded ? "expanded" : "collapsed";
    }
    section.sectionEl.dataset.state = dataState;
  };

  const getSection = (id: SidebarSectionId): SectionRecord => {
    const section = sections.get(id);
    if (!section) throw new Error(`Sección no registrada: ${id}`);
    return section;
  };

  const getVisibleFillSections = () =>
    sectionOrder
      .map((id) => getSection(id))
      .filter((section): section is SectionRecord & { id: FillSectionId } => isFillSection(section))
      .filter(isElementVisibleForNavigation);

  const updateFillGroupLayoutState = () => {
    const hasExpandedVisibleFillSection = getVisibleFillSections().some((section) => section.userExpanded);
    fillGroupEl.dataset.fillLayout = hasExpandedVisibleFillSection ? "active" : "collapsed";
  };

  const focusToggleIfNeeded = (section: SectionRecord) => {
    const activeElement = getActiveElement();
    if (!activeElement) return;
    if (section.bodyEl.contains(activeElement)) {
      section.toggleEl.focus();
    }
  };

  const clearContentOpacity = (section: SectionRecord) => {
    section.contentEl.style.opacity = "";
  };

  const setCollapsedIdleState = (section: SectionRecord) => {
    section.phase = "idle";
    section.bodyEl.hidden = true;
    setHeightPx(section.bodyEl, 0);
    clearContentOpacity(section);
    updateSectionDomState(section);
  };

  const setIntrinsicExpandedIdleState = (section: SectionRecord) => {
    section.phase = "idle";
    section.bodyEl.hidden = false;
    section.bodyEl.style.height = "auto";
    clearContentOpacity(section);
    updateSectionDomState(section);
  };

  const freezeSectionAnimation = (section: SectionRecord) => {
    if (!section.runningAnimation) return;
    section.runningAnimation.cancelToCurrent();
    section.phase = "idle";
    section.bodyEl.hidden = false;
    updateSectionDomState(section);
  };

  const settleSectionAnimation = (section: SectionRecord) => {
    if (!section.runningAnimation) return;
    section.runningAnimation.finishToEnd();
  };

  const computeFillTargets = () => {
    const visibleFillSections = getVisibleFillSections();
    if (visibleFillSections.length === 0) {
      return new Map<FillSectionId, number>();
    }

    const groupGap = parseGapPx(
      window.getComputedStyle(fillGroupEl).rowGap || window.getComputedStyle(fillGroupEl).gap,
    );
    const groupHeight = fillGroupEl.getBoundingClientRect().height;
    const totalHeaderHeight = visibleFillSections.reduce(
      (sum, section) => sum + section.headerEl.getBoundingClientRect().height,
      0,
    );
    const totalGap = Math.max(0, visibleFillSections.length - 1) * groupGap;
    const availableBodyHeight = Math.max(0, groupHeight - totalHeaderHeight - totalGap);
    const expandedSections = visibleFillSections.filter((section) => section.userExpanded);
    const totalWeight = expandedSections.reduce((sum, section) => sum + section.weight, 0);
    const targets = new Map<FillSectionId, number>();

    for (const section of visibleFillSections) {
      if (!section.userExpanded || totalWeight <= 0) {
        targets.set(section.id, 0);
        continue;
      }
      targets.set(section.id, availableBodyHeight * (section.weight / totalWeight));
    }

    return targets;
  };

  const applyFillTargetsImmediately = () => {
    const visibleFillSections = getVisibleFillSections();
    updateFillGroupLayoutState();
    const targets = computeFillTargets();

    for (const section of visibleFillSections) {
      const targetHeight = targets.get(section.id) ?? 0;
      section.sectionEl.hidden = false;
      section.phase = "idle";
      if (targetHeight <= 0 || !section.userExpanded) {
        setCollapsedIdleState(section);
      } else {
        section.bodyEl.hidden = false;
        setHeightPx(section.bodyEl, targetHeight);
        clearContentOpacity(section);
        updateSectionDomState(section);
      }
    }
  };

  const animateFillGroup = (targetSection: SectionRecord & { id: FillSectionId }) => {
    const visibleFillSections = getVisibleFillSections();
    updateFillGroupLayoutState();
    const targets = computeFillTargets();

    for (const section of visibleFillSections) {
      freezeSectionAnimation(section);
    }

    for (const section of visibleFillSections) {
      section.sectionEl.hidden = false;
      section.bodyEl.hidden = false;

      const fromHeight = getBodyHeight(section);
      const targetHeight = targets.get(section.id) ?? 0;
      const shouldAnimateOpacity = section.id === targetSection.id;
      const fromOpacity = shouldAnimateOpacity ? getContentOpacity(section) : 1;
      const toOpacity = shouldAnimateOpacity ? (targetSection.userExpanded ? 1 : 0) : 1;

      if (shouldAnimateOpacity) {
        section.phase = targetSection.userExpanded ? "expanding" : "collapsing";
      } else {
        section.phase = "idle";
      }
      updateSectionDomState(section);

      if (options.reducedMotion()) {
        if (targetHeight <= 0 || !section.userExpanded) {
          setCollapsedIdleState(section);
        } else {
          section.bodyEl.hidden = false;
          setHeightPx(section.bodyEl, targetHeight);
          clearContentOpacity(section);
          section.phase = "idle";
          updateSectionDomState(section);
        }
        continue;
      }

      const handles = [
        motionDriver.animateHeight(section.bodyEl, fromHeight, targetHeight, {
          durationMs: HEIGHT_DURATION_MS,
          easing: EASING,
        }),
      ];

      if (shouldAnimateOpacity) {
        handles.push(
          motionDriver.animateOpacity(section.contentEl, fromOpacity, toOpacity, {
            durationMs: OPACITY_DURATION_MS,
            easing: OPACITY_EASING,
          }),
        );
      }

      const running = createRunningAnimation(section, handles, () => {
        if (targetHeight <= 0 || !section.userExpanded) {
          setCollapsedIdleState(section);
          return;
        }
        section.bodyEl.hidden = false;
        setHeightPx(section.bodyEl, targetHeight);
        clearContentOpacity(section);
        section.phase = "idle";
        updateSectionDomState(section);
      });
      section.runningAnimation = running;
    }
  };

  const setIntrinsicExpanded = (section: SectionRecord, expanded: boolean) => {
    freezeSectionAnimation(section);

    if (!isElementVisibleForNavigation(section)) {
      section.userExpanded = expanded;
      section.phase = "idle";
      updateSectionDomState(section);
      return;
    }

    if (!expanded) {
      focusToggleIfNeeded(section);
    }

    section.userExpanded = expanded;
    section.sectionEl.hidden = false;
    section.bodyEl.hidden = false;
    const fromHeight = getBodyHeight(section);
    const fromOpacity = getContentOpacity(section);

    if (expanded) {
      section.phase = "expanding";
      updateSectionDomState(section);
      setHeightPx(section.bodyEl, fromHeight);
      setOpacity(section.contentEl, fromHeight <= 0 ? 0 : fromOpacity);
      section.bodyEl.style.height = "auto";
      const targetHeight = section.bodyEl.scrollHeight;
      setHeightPx(section.bodyEl, fromHeight);

      if (options.reducedMotion()) {
        setIntrinsicExpandedIdleState(section);
        return;
      }

      const handles = [
        motionDriver.animateHeight(section.bodyEl, fromHeight, targetHeight, {
          durationMs: HEIGHT_DURATION_MS,
          easing: EASING,
        }),
        motionDriver.animateOpacity(section.contentEl, fromHeight <= 0 ? 0 : fromOpacity, 1, {
          durationMs: OPACITY_DURATION_MS,
          easing: OPACITY_EASING,
        }),
      ];

      const running = createRunningAnimation(section, handles, () => {
        setIntrinsicExpandedIdleState(section);
      });
      section.runningAnimation = running;
      return;
    }

    section.phase = "collapsing";
    updateSectionDomState(section);
    setHeightPx(section.bodyEl, fromHeight);
    setOpacity(section.contentEl, fromOpacity <= 0 ? 1 : fromOpacity);

    if (options.reducedMotion()) {
      setCollapsedIdleState(section);
      return;
    }

    const handles = [
      motionDriver.animateHeight(section.bodyEl, fromHeight, 0, {
        durationMs: HEIGHT_DURATION_MS,
        easing: EASING,
      }),
      motionDriver.animateOpacity(section.contentEl, fromOpacity <= 0 ? 1 : fromOpacity, 0, {
        durationMs: OPACITY_DURATION_MS,
        easing: OPACITY_EASING,
      }),
    ];

    const running = createRunningAnimation(section, handles, () => {
      setCollapsedIdleState(section);
    });
    section.runningAnimation = running;
  };

  const applyVisibilityStateImmediately = (section: SectionRecord) => {
    settleSectionAnimation(section);

    if (section.visibility === "hidden-by-mode") {
      focusToggleIfNeeded(section);
      section.sectionEl.hidden = true;
      section.bodyEl.hidden = true;
      setHeightPx(section.bodyEl, 0);
      clearContentOpacity(section);
      section.phase = "idle";
      updateSectionDomState(section);
      return;
    }

    section.sectionEl.hidden = false;
    if (section.kind === "intrinsic") {
      if (section.userExpanded) {
        setIntrinsicExpandedIdleState(section);
      } else {
        setCollapsedIdleState(section);
      }
      return;
    }

    section.bodyEl.hidden = !section.userExpanded;
    section.phase = "idle";
    updateSectionDomState(section);
  };

  const persistExpandedChange = (section: SectionRecord) => {
    options.onExpandedChange?.(section.id, section.userExpanded);
  };

  const refreshLayout = () => {
    for (const section of sections.values()) {
      settleSectionAnimation(section);
      if (!isElementVisibleForNavigation(section)) {
        applyVisibilityStateImmediately(section);
        continue;
      }

      if (section.kind === "intrinsic") {
        if (section.userExpanded) {
          setIntrinsicExpandedIdleState(section);
        } else {
          setCollapsedIdleState(section);
        }
      }
    }
    applyFillTargetsImmediately();
  };

  const setExpanded = (id: SidebarSectionId, expanded: boolean) => {
    const section = getSection(id);
    if (section.userExpanded === expanded) return;
    section.userExpanded = expanded;
    persistExpandedChange(section);

    if (isFillSection(section)) {
      animateFillGroup(section);
      return;
    }

    setIntrinsicExpanded(section, expanded);
  };

  const toggle = (id: SidebarSectionId) => {
    const section = getSection(id);
    setExpanded(id, !section.userExpanded);
  };

  const setVisible = (id: SidebarSectionId, visible: boolean) => {
    const section = getSection(id);
    const nextVisibility: SidebarVisibility = visible ? "visible" : "hidden-by-mode";
    if (section.visibility === nextVisibility) {
      if (visible) {
        refreshLayout();
      }
      return;
    }

    section.visibility = nextVisibility;
    applyVisibilityStateImmediately(section);
    refreshLayout();
  };

  const settleAll = () => {
    for (const section of sections.values()) {
      settleSectionAnimation(section);
    }
    updateFillGroupLayoutState();
  };

  const onToggleKeyDown = (event: KeyboardEvent) => {
    if (!ARROW_KEYS.has(event.key)) return;

    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLButtonElement)) return;

    const visibleToggles = sectionOrder
      .map((id) => getSection(id))
      .filter(isElementVisibleForNavigation)
      .map((section) => section.toggleEl);
    const currentIndex = visibleToggles.indexOf(currentTarget);
    if (currentIndex === -1 || visibleToggles.length === 0) return;

    event.preventDefault();

    let nextIndex = currentIndex;
    if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + visibleToggles.length) % visibleToggles.length;
    } else if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % visibleToggles.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = visibleToggles.length - 1;
    }

    visibleToggles[nextIndex]?.focus();
  };

  for (const section of sections.values()) {
    updateSectionDomState(section);
    section.toggleEl.addEventListener("click", () => toggle(section.id), {
      signal: listenerController?.signal,
    });
    section.toggleEl.addEventListener("keydown", onToggleKeyDown, {
      signal: listenerController?.signal,
    });
  }

  resizeObserver?.observe(fillGroupEl);
  for (const section of sections.values()) {
    if (section.kind === "fill") {
      resizeObserver?.observe(section.headerEl);
    }
  }

  for (const section of sections.values()) {
    if (section.visibility !== "visible") {
      applyVisibilityStateImmediately(section);
      continue;
    }

    if (section.kind === "intrinsic") {
      if (section.userExpanded) {
        setIntrinsicExpandedIdleState(section);
      } else {
        setCollapsedIdleState(section);
      }
      continue;
    }

    section.bodyEl.hidden = !section.userExpanded;
    section.phase = "idle";
    updateSectionDomState(section);
  }
  updateFillGroupLayoutState();
  applyFillTargetsImmediately();

  return {
    toggle,
    setExpanded,
    setVisible,
    refreshLayout,
    settleAll,
    destroy: () => {
      settleAll();
      listenerController?.abort();
      resizeObserver?.disconnect();
    },
  };
}
