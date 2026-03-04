export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastShowOptions = {
  id?: string;
  title?: string;
  message: string;
  kind?: ToastKind;
  durationMs?: number;
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

export function createToastHost(options: ToastHostOptions = {}): ToastHost {
  const maxToasts = Math.floor(clampNumber(options.maxToasts ?? 4, 1, 10));
  const defaultDurationMs = Math.floor(clampNumber(options.defaultDurationMs ?? 3200, 800, 30_000));
  const mount = options.mount ?? document.body;

  const host = document.createElement("div");
  host.className = "toast-host";
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

    if (prefersReducedMotion()) {
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
    if (runtime.timeoutId) window.clearTimeout(runtime.timeoutId);
    runtime.lastStartAt = Date.now();
    runtime.timeoutId = window.setTimeout(() => dismiss(runtime.id), runtime.remainingMs);
  };

  const pause = (runtime: ToastRuntime) => {
    if (runtime.paused) return;
    runtime.paused = true;
    if (runtime.timeoutId) {
      window.clearTimeout(runtime.timeoutId);
      runtime.timeoutId = null;
      const elapsed = Date.now() - runtime.lastStartAt;
      runtime.remainingMs = Math.max(0, runtime.remainingMs - elapsed);
    }
  };

  const resume = (runtime: ToastRuntime) => {
    if (!runtime.paused) return;
    runtime.paused = false;
    if (runtime.remainingMs <= 0) {
      dismiss(runtime.id);
      return;
    }
    scheduleAutoDismiss(runtime);
  };

  const show = (opts: ToastShowOptions): ToastHandle => {
    const kind: ToastKind = opts.kind ?? "info";
    const durationMs = Math.floor(clampNumber(opts.durationMs ?? defaultDurationMs, 800, 30_000));
    const desiredId = opts.id?.trim();

    if (desiredId) {
      const existing = toastById.get(desiredId);
      if (existing) {
        existing.el.className = `toast toast--${kind}`;
        existing.el.setAttribute("role", kind === "error" ? "alert" : "status");

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

        existing.remainingMs = durationMs;
        if (!existing.paused) {
          scheduleAutoDismiss(existing);
        } else {
          existing.timeoutId = null;
          existing.lastStartAt = Date.now();
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
    toastEl.setAttribute("aria-atomic", "true");

    const role = kind === "error" ? "alert" : "status";
    toastEl.setAttribute("role", role);

    const content = document.createElement("div");
    content.className = "toast__content";

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
    closeBtn.textContent = "×";

    closeBtn.addEventListener("click", () => dismiss(id));

    toastEl.append(content, closeBtn);
    host.append(toastEl);

    const runtime: ToastRuntime = {
      id,
      el: toastEl,
      timeoutId: null,
      remainingMs: durationMs,
      lastStartAt: Date.now(),
      paused: false,
    };

    toastEl.addEventListener("mouseenter", () => pause(runtime));
    toastEl.addEventListener("mouseleave", () => resume(runtime));
    toastEl.addEventListener("focusin", () => pause(runtime));
    toastEl.addEventListener("focusout", () => resume(runtime));

    toasts.push(runtime);
    toastById.set(id, runtime);
    while (toasts.length > maxToasts) dismiss(toasts[0].id);

    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => {
        toastEl.dataset.state = "open";
      });
    } else {
      toastEl.dataset.state = "open";
    }

    scheduleAutoDismiss(runtime);

    return { id, dismiss: () => dismiss(id) };
  };

  const destroy = () => {
    clear();
    host.remove();
  };

  return { show, dismiss, clear, destroy, el: host };
}
