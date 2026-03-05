export type ToastKind = "info" | "success" | "warning" | "error";
export type ToastPosition = "bottom-right" | "top-right";

export type ToastShowOptions = {
  id?: string;
  title?: string;
  message: string;
  kind?: ToastKind;
  durationMs?: number;
  sticky?: boolean;
  closeLabel?: string;
};

export type ToastHandle = {
  id: string;
  dismiss: () => void;
};

export type ToastHost = {
  show: (options: ToastShowOptions) => ToastHandle;
  dismiss: (id: string) => void;
  clear: () => void;
  destroy: () => void;
  el: HTMLElement;
};

export type ToastHostOptions = {
  maxToasts?: number;
  defaultDurationMs?: number;
  durationsByKind?: Partial<Record<ToastKind, number>>;
  position?: ToastPosition;
  reducedMotion?: () => boolean;
  mount?: HTMLElement;
};

function uid(): string {
  return `t_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toastKindLabel(kind: ToastKind): string {
  if (kind === "success") return "Exito";
  if (kind === "warning") return "Aviso";
  if (kind === "error") return "Error";
  return "Info";
}

function toastIconSvg(kind: ToastKind): string {
  if (kind === "success") {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
        <path d="m8.5 12 2.2 2.2 4.8-4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `.trim();
  }
  if (kind === "warning") {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5 21 19H3L12 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M12 9v4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="12" cy="16.6" r="1" fill="currentColor" />
      </svg>
    `.trim();
  }
  if (kind === "error") {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 3h6l6 6v6l-6 6H9l-6-6V9l6-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
        <path d="m9.6 9.6 4.8 4.8M14.4 9.6l-4.8 4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    `.trim();
  }
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
      <path d="M12 10.4V16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="12" cy="7.6" r="1" fill="currentColor" />
    </svg>
  `.trim();
}

function setToastKind(toastEl: HTMLElement, kind: ToastKind): void {
  toastEl.className = `toast toast--${kind}`;
  const icon = toastEl.querySelector<HTMLElement>(".toast__icon");
  if (icon) icon.innerHTML = toastIconSvg(kind);
  const assistive = toastEl.querySelector<HTMLElement>(".toast__assistive");
  if (assistive) assistive.textContent = `${toastKindLabel(kind)}. `;
}

function restartProgressAnimation(toastEl: HTMLElement): void {
  const progress = toastEl.querySelector<HTMLElement>(".toast__progress-bar");
  if (!progress) return;
  progress.style.animation = "none";
  void progress.offsetWidth;
  progress.style.removeProperty("animation");
}

export function createToastHost(options: ToastHostOptions = {}): ToastHost {
  const maxToasts = Math.floor(clampNumber(options.maxToasts ?? 4, 1, 10));
  const defaultDurationMs = Math.floor(clampNumber(options.defaultDurationMs ?? 2600, 800, 30_000));
  const durationsByKind: Record<ToastKind, number> = {
    info: Math.floor(clampNumber(options.durationsByKind?.info ?? defaultDurationMs, 800, 30_000)),
    success: Math.floor(clampNumber(options.durationsByKind?.success ?? defaultDurationMs, 800, 30_000)),
    warning: Math.floor(clampNumber(options.durationsByKind?.warning ?? defaultDurationMs, 800, 30_000)),
    error: Math.floor(clampNumber(options.durationsByKind?.error ?? defaultDurationMs, 800, 30_000)),
  };
  const position: ToastPosition = options.position === "top-right" ? "top-right" : "bottom-right";
  const reducedMotionEnabled = () => options.reducedMotion?.() ?? prefersReducedMotion();
  const mount = options.mount ?? document.body;

  const host = document.createElement("div");
  host.className = "toast-host";
  host.dataset.position = position;
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Notificaciones");
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-relevant", "additions text");

  mount.append(host);

  type ToastRuntime = {
    id: string;
    el: HTMLElement;
    timeoutId: number | null;
    remainingMs: number;
    lastStartAt: number;
    paused: boolean;
    sticky: boolean;
  };

  const toasts: ToastRuntime[] = [];
  const toastById = new Map<string, ToastRuntime>();

  const removeToastEl = (toastEl: HTMLElement) => {
    toastEl.remove();
  };

  const dismiss = (id: string) => {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const runtime = toasts[idx];
    if (runtime.timeoutId) window.clearTimeout(runtime.timeoutId);
    runtime.timeoutId = null;

    toasts.splice(idx, 1);
    toastById.delete(id);

    if (reducedMotionEnabled()) {
      removeToastEl(runtime.el);
      return;
    }

    runtime.el.dataset.state = "closing";
    const onDone = () => removeToastEl(runtime.el);
    runtime.el.addEventListener("transitionend", onDone, { once: true });
    window.setTimeout(onDone, 260);
  };

  const clear = () => {
    for (const toast of [...toasts]) dismiss(toast.id);
  };

  const scheduleAutoDismiss = (runtime: ToastRuntime) => {
    if (runtime.sticky) return;
    if (runtime.timeoutId) window.clearTimeout(runtime.timeoutId);
    runtime.lastStartAt = Date.now();
    runtime.el.dataset.paused = "false";
    runtime.timeoutId = window.setTimeout(() => dismiss(runtime.id), runtime.remainingMs);
  };

  const pause = (runtime: ToastRuntime) => {
    if (runtime.sticky) return;
    if (runtime.paused) return;
    runtime.paused = true;
    runtime.el.dataset.paused = "true";
    if (runtime.timeoutId) {
      window.clearTimeout(runtime.timeoutId);
      runtime.timeoutId = null;
      const elapsed = Date.now() - runtime.lastStartAt;
      runtime.remainingMs = Math.max(0, runtime.remainingMs - elapsed);
    }
  };

  const resume = (runtime: ToastRuntime) => {
    if (runtime.sticky) return;
    if (!runtime.paused) return;
    runtime.paused = false;
    runtime.el.dataset.paused = "false";
    if (runtime.remainingMs <= 0) {
      dismiss(runtime.id);
      return;
    }
    scheduleAutoDismiss(runtime);
  };

  const show = (opts: ToastShowOptions): ToastHandle => {
    const kind: ToastKind = opts.kind ?? "info";
    const sticky = opts.sticky ?? false;
    const durationMs = Math.floor(clampNumber(opts.durationMs ?? durationsByKind[kind], 800, 30_000));
    const desiredId = opts.id?.trim();

    if (desiredId) {
      const existing = toastById.get(desiredId);
      if (existing) {
        setToastKind(existing.el, kind);
        existing.el.setAttribute("role", kind === "error" ? "alert" : "status");
        existing.el.dataset.sticky = sticky ? "true" : "false";

        const content = existing.el.querySelector<HTMLElement>(".toast__content");
        const messageEl = content?.querySelector<HTMLElement>(".toast__message") ?? null;
        const existingTitleEl = content?.querySelector<HTMLElement>(".toast__title") ?? null;

        if (content) {
          if (opts.title) {
            if (existingTitleEl) {
              existingTitleEl.textContent = opts.title;
            } else {
              const title = document.createElement("div");
              title.className = "toast__title";
              title.textContent = opts.title;
              if (messageEl) {
                content.insertBefore(title, messageEl);
              } else {
                content.append(title);
              }
            }
          } else if (existingTitleEl) {
            existingTitleEl.remove();
          }

          if (messageEl) {
            messageEl.textContent = opts.message;
          } else {
            const msg = document.createElement("div");
            msg.className = "toast__message";
            msg.textContent = opts.message;
            content.append(msg);
          }
        }

        existing.sticky = sticky;
        if (sticky) {
          if (existing.timeoutId) {
            window.clearTimeout(existing.timeoutId);
            existing.timeoutId = null;
          }
          existing.paused = false;
          existing.el.dataset.paused = "false";
        } else {
          existing.remainingMs = durationMs;
          existing.el.style.setProperty("--toast-duration-ms", `${durationMs}ms`);
          restartProgressAnimation(existing.el);
          if (!existing.paused) {
            scheduleAutoDismiss(existing);
          } else {
            existing.timeoutId = null;
            existing.lastStartAt = Date.now();
          }
        }

        const toastIndex = toasts.findIndex((t) => t.id === desiredId);
        if (toastIndex !== -1) {
          const [runtime] = toasts.splice(toastIndex, 1);
          toasts.push(runtime);
        }

        host.append(existing.el);
        return { id: desiredId, dismiss: () => dismiss(desiredId) };
      }
    }

    const id = desiredId ?? uid();

    const toastEl = document.createElement("div");
    toastEl.className = `toast toast--${kind}`;
    toastEl.dataset.state = "enter";
    toastEl.dataset.paused = "false";
    toastEl.dataset.sticky = sticky ? "true" : "false";
    toastEl.setAttribute("aria-atomic", "true");
    toastEl.style.setProperty("--toast-duration-ms", `${durationMs}ms`);

    const role = kind === "error" ? "alert" : "status";
    toastEl.setAttribute("role", role);

    const icon = document.createElement("div");
    icon.className = "toast__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = toastIconSvg(kind);

    const content = document.createElement("div");
    content.className = "toast__content";

    const assistive = document.createElement("span");
    assistive.className = "toast__assistive";
    assistive.textContent = `${toastKindLabel(kind)}. `;
    content.append(assistive);

    if (opts.title) {
      const title = document.createElement("div");
      title.className = "toast__title";
      title.textContent = opts.title;
      content.append(title);
    }

    const msg = document.createElement("div");
    msg.className = "toast__message";
    msg.textContent = opts.message;
    content.append(msg);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "toast__close";
    closeBtn.setAttribute("aria-label", opts.closeLabel ?? "Cerrar notificación");
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    `.trim();

    closeBtn.addEventListener("click", () => dismiss(id));

    const progress = document.createElement("div");
    progress.className = "toast__progress";
    progress.setAttribute("aria-hidden", "true");

    const progressBar = document.createElement("span");
    progressBar.className = "toast__progress-bar";
    progress.append(progressBar);

    toastEl.append(icon, content, closeBtn, progress);
    host.append(toastEl);

    const runtime: ToastRuntime = {
      id,
      el: toastEl,
      timeoutId: null,
      remainingMs: durationMs,
      lastStartAt: Date.now(),
      paused: false,
      sticky,
    };

    toastEl.addEventListener("mouseenter", () => pause(runtime));
    toastEl.addEventListener("mouseleave", () => resume(runtime));
    toastEl.addEventListener("focusin", () => pause(runtime));
    toastEl.addEventListener("focusout", () => resume(runtime));

    toasts.push(runtime);
    toastById.set(id, runtime);
    while (toasts.length > maxToasts) dismiss(toasts[0].id);

    if (!reducedMotionEnabled()) {
      requestAnimationFrame(() => {
        toastEl.dataset.state = "open";
      });
    } else {
      toastEl.dataset.state = "open";
    }

    if (!sticky) scheduleAutoDismiss(runtime);

    return { id, dismiss: () => dismiss(id) };
  };

  const destroy = () => {
    clear();
    host.remove();
  };

  return { show, dismiss, clear, destroy, el: host };
}
