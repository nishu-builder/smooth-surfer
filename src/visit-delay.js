// Visit delay. Runs at document_start so a listed site is covered before it
// paints. The countdown only runs while the tab is visible; finishing it grants
// this tab a pass, and only a finished wait advances the site's daily step.
(function installSmoothSurferVisitDelay() {
  "use strict";

  const storage = window.SmoothSurferStorage;
  const shared = window.SmoothSurferSettings;

  if (!storage || !shared || window !== window.top || !/^https?:$/.test(window.location.protocol)) {
    return;
  }

  const PASS_KEY = "smoothSurferVisitPass";
  // A tab left in the background this long counts as a fresh visit on return.
  const REVISIT_AFTER_MS = 30 * 60 * 1000;
  const TICK_MS = 250;
  const WAITING_CLASS = "smooth-surfer-visit-waiting";
  const STYLES = `
    :host { all: initial; }
    .backdrop {
      position: fixed; inset: 0; display: grid; place-items: center; overflow: auto;
      background-color: var(--ss-canvas, #fffdf4);
      background-image: radial-gradient(var(--ss-dot, #cecfbb) 1px, transparent 1px);
      background-size: 14px 14px;
      color: var(--ss-ink, #20221e);
      font: 14px/1.55 var(--ss-sans, Arial, Helvetica, sans-serif);
    }
    .card {
      display: grid; gap: 14px; width: min(460px, calc(100vw - 32px)); margin: 16px; padding: 28px;
      border: 1px solid var(--ss-ink, #20221e); border-radius: 8px; outline: none;
      background: var(--ss-paper, #fffef9); box-shadow: 5px 6px 0 var(--ss-stamp, #e7e7dc);
    }
    .brand, .meta, .time, .domain, button {
      font-family: var(--ss-mono, "SFMono-Regular", Consolas, "Liberation Mono", monospace);
    }
    .brand { display: flex; align-items: center; gap: 8px; color: var(--ss-muted, #64655b); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
    .brand::before { content: ""; width: 8px; height: 8px; border: 1px solid var(--ss-ink, #20221e); border-radius: 50%; background: var(--ss-accent, #e3ff73); }
    .domain { margin: 0; font-size: 28px; line-height: 1.15; font-weight: 700; letter-spacing: -1.2px; overflow-wrap: anywhere; }
    .time { font-size: 76px; font-weight: 700; line-height: 1; letter-spacing: -4px; font-variant-numeric: tabular-nums; }
    .bar { height: 12px; overflow: hidden; border: 1px solid var(--ss-ink, #20221e); border-radius: 999px; background: var(--ss-gray, #f4f4e8); }
    .fill { height: 100%; width: 100%; background: var(--ss-accent, #e3ff73); box-shadow: inset -1px 0 0 var(--ss-ink, #20221e); transform: scaleX(0); transform-origin: left; }
    .meta { color: var(--ss-ink, #20221e); font-size: 12px; }
    .note { margin: 0; color: var(--ss-muted, #64655b); font-size: 13px; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 4px; }
    button {
      appearance: none; min-height: 40px; padding: 0 18px; border: 1px solid var(--ss-ink, #20221e);
      border-radius: 5px; background: var(--ss-accent, #e3ff73); color: var(--ss-accent-ink, #20221e);
      font-size: 13px; cursor: pointer; box-shadow: 2px 3px 0 var(--ss-stamp, #dfdfd1);
    }
    button:hover { background: var(--ss-accent-hover, #d9f765); }
    button.link {
      min-height: 0; padding: 0; border: 0; background: none; box-shadow: none;
      color: var(--ss-muted, #64655b); font-size: 12px; text-decoration: underline; text-underline-offset: 3px;
    }
    button.link:hover { color: var(--ss-ink, #20221e); background: none; }
    button:disabled { cursor: default; opacity: 0.45; }
    button:focus-visible { outline: 3px solid var(--ss-focus, #355dad); outline-offset: 3px; }
    .card:focus { outline: none; }
    @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
  `;

  let settings = null;
  let attempt = null;
  let overlay = null;
  let passedDomain = "";
  let hiddenAt = 0;

  storage.loadSettings().then((loaded) => {
    settings = loaded;
    evaluate();
  }, noop);
  storage.watchSettings((next) => {
    const previousDomain = listedDomain();
    settings = next;
    const domain = listedDomain();

    if (attempt && attempt.domain !== domain) {
      // The site was unlisted or the extension paused while waiting.
      abandon();
      teardown();
    }
    if (domain !== previousDomain) {
      // Adding a rule must cover an already-open page, without a reload.
      // Removing/re-enabling a rule starts fresh instead of retaining a pass.
      clearPass();
      passedDomain = "";
      evaluate();
    }
  });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      evaluate();
    }
  });
  window.addEventListener("wheel", blockWhileWaiting, { capture: true, passive: false });
  window.addEventListener("touchmove", blockWhileWaiting, { capture: true, passive: false });
  for (const type of ["keydown", "keypress", "keyup"]) {
    window.addEventListener(type, stopWhileWaiting, true);
  }

  function evaluate() {
    if (attempt) {
      return;
    }

    const domain = listedDomain();

    if (!domain) {
      return;
    }

    void send({ event: "load", domain });

    if (readPass() === domain) {
      passedDomain = domain;
      return;
    }

    beginWait(domain);
  }

  function listedDomain() {
    if (!settings || !settings.enabled) {
      return "";
    }

    if (
      settings.focusScheduleEnabled &&
      !shared.isWithinFocusWindow(settings.focusScheduleStart, settings.focusScheduleEnd)
    ) {
      return "";
    }

    return shared.matchVisitDomain(window.location.hostname, settings.visitDelayDomains);
  }

  function beginWait(domain) {
    attempt = {
      domain,
      step: 0,
      waitMs: 0,
      elapsedMs: 0,
      lastTick: 0,
      timer: 0,
      frame: 0,
      ready: false,
      reported: false
    };
    showOverlay();
    render();
    send({ event: "start", domain }).then((status) => {
      if (!attempt || attempt.domain !== domain || attempt.ready) {
        return;
      }

      if (!status) {
        // No worker answered. Let the page through rather than trap the tab.
        teardown();
        return;
      }

      attempt.step = status.step;
      attempt.waitMs = status.waitMs;
      attempt.ready = true;
      render();
      resume();
    });
  }

  function resume() {
    if (!attempt || !attempt.ready || attempt.timer || document.hidden) {
      return;
    }

    attempt.lastTick = Date.now();
    attempt.timer = window.setInterval(tick, TICK_MS);
    tick();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) animateProgress();
  }

  function pause() {
    if (!attempt || !attempt.timer) {
      return;
    }

    attempt.elapsedMs += Date.now() - attempt.lastTick;
    window.clearInterval(attempt.timer);
    window.cancelAnimationFrame(attempt.frame);
    attempt.timer = 0;
    attempt.frame = 0;
  }

  function animateProgress() {
    if (!attempt || !attempt.timer) return;
    renderProgress(attempt.elapsedMs + Date.now() - attempt.lastTick);
    attempt.frame = window.requestAnimationFrame(animateProgress);
  }

  function renderProgress(elapsedMs) {
    if (!overlay || !attempt) return;
    const fraction =
      attempt.ready && attempt.waitMs ? Math.min(1, Math.max(0, elapsedMs / attempt.waitMs)) : 0;
    overlay.fill.style.transform = `scaleX(${fraction})`;
  }

  function tick() {
    if (!attempt || !attempt.timer) {
      return;
    }

    const now = Date.now();

    attempt.elapsedMs += now - attempt.lastTick;
    attempt.lastTick = now;
    holdPage();
    render();

    if (attempt.elapsedMs >= attempt.waitMs) {
      complete();
    }
  }

  function complete() {
    const { domain, elapsedMs } = attempt;

    pause();
    attempt.reported = true;
    void send({ event: "finish", domain, waitedMs: elapsedMs });
    writePass(domain);
    passedDomain = domain;
    teardown();
  }

  function abandon() {
    if (!attempt || attempt.reported) {
      return;
    }

    pause();
    attempt.reported = true;
    void send({ event: "abandon", domain: attempt.domain, waitedMs: attempt.elapsedMs });
  }

  function onVisibilityChange() {
    if (document.hidden) {
      hiddenAt = Date.now();
      pause();
      render();
      return;
    }

    if (attempt) {
      render();
      resume();
      return;
    }

    if (passedDomain && hiddenAt && Date.now() - hiddenAt >= REVISIT_AFTER_MS) {
      clearPass();
      passedDomain = "";
      hiddenAt = 0;
      evaluate();
    }
  }

  function onPageHide() {
    if (!attempt) {
      return;
    }

    abandon();
    teardown();
  }

  function showOverlay() {
    if (overlay) {
      return;
    }

    const host = document.createElement("div");
    host.className = "smooth-surfer-visit-wait";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    const backdrop = element("div", "backdrop");
    const card = element("div", "card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "domain");
    card.tabIndex = -1;
    const domain = element("h1", "domain");
    domain.id = "domain";
    domain.dataset.domain = "";
    const meta = element("div", "meta");
    meta.dataset.meta = "";
    const time = element("div", "time");
    time.dataset.time = "";
    time.setAttribute("role", "timer");
    time.setAttribute("aria-live", "off");
    const bar = element("div", "bar");
    const fill = element("div", "fill");
    bar.append(fill);
    const note = element("p", "note");
    note.dataset.note = "";
    const actions = element("div", "actions");
    const reset = element("button", "link");
    reset.type = "button";
    reset.dataset.reset = "";
    reset.textContent = "Reset count";
    reset.addEventListener("click", onReset);
    const close = element("button", "");
    close.type = "button";
    close.dataset.close = "";
    close.textContent = "Close tab";
    close.addEventListener("click", onClose);
    actions.append(close, reset);
    card.append(
      element("div", "brand", "Smooth Surfer · loading delay"),
      domain,
      time,
      bar,
      meta,
      note,
      actions
    );
    backdrop.append(card);
    root.append(style, backdrop);
    document.documentElement.append(host);
    document.documentElement.classList.add(WAITING_CLASS);
    overlay = { host, card, domain, meta, time, fill, note, reset };
    holdPage();
    if (!document.body) {
      // At document_start the body arrives later; hold it as soon as it does.
      document.addEventListener("DOMContentLoaded", () => attempt && holdPage(), { once: true });
    }
    card.focus({ preventScroll: true });
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text) {
      node.textContent = text;
    }

    return node;
  }

  function render() {
    if (!overlay || !attempt) {
      return;
    }

    const remaining = Math.max(0, attempt.waitMs - attempt.elapsedMs);

    overlay.domain.textContent = attempt.domain;
    overlay.meta.textContent = attempt.ready
      ? `Visit ${attempt.step + 1} today · finishing makes the next wait ${shared.VISIT_DELAY_GROWTH}× longer · resets ${String(shared.VISIT_DELAY_RESET_HOUR).padStart(2, "0")}:00`
      : "Checking today's count…";
    overlay.time.textContent = attempt.ready ? formatTime(remaining) : "–:––";
    renderProgress(attempt.elapsedMs);
    overlay.reset.disabled = !attempt.ready || attempt.step === 0;
    overlay.note.textContent = document.hidden
      ? "Paused while this tab is hidden."
      : "Counts down only while this tab is visible. Close the tab now and this visit won’t count.";
  }

  function formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  // Keep the page inert and quiet behind the countdown.
  function holdPage() {
    if (document.body && !document.body.inert) {
      document.body.inert = true;
    }

    document.documentElement.classList.add(WAITING_CLASS);
    document.querySelectorAll("video, audio").forEach((media) => {
      if (!media.paused) {
        media.pause();
      }
    });
  }

  function teardown() {
    pause();
    attempt = null;
    document.documentElement.classList.remove(WAITING_CLASS);

    if (document.body) {
      document.body.inert = false;
    }

    if (overlay) {
      overlay.host.remove();
      overlay = null;
    }
  }

  function onReset() {
    if (!attempt || !attempt.ready) {
      return;
    }

    const { domain } = attempt;

    overlay.reset.disabled = true;
    send({ event: "reset", domain }).then((status) => {
      if (!attempt || attempt.domain !== domain || !status) {
        return;
      }

      attempt.step = status.step;
      attempt.waitMs = status.waitMs;
      render();
    });
  }

  function onClose() {
    abandon();
    send({ event: "close", domain: attempt ? attempt.domain : passedDomain }).then((status) => {
      if (!status) {
        window.close();
      }
    });
  }

  function blockWhileWaiting(event) {
    if (attempt) {
      event.preventDefault();
    }
  }

  function stopWhileWaiting(event) {
    // Page shortcuts stay off while the countdown owns the tab; the dialog's
    // own buttons still get their default click and focus behaviour.
    if (attempt) {
      event.stopPropagation();
    }
  }

  function send(payload) {
    return new Promise((resolve) => {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        try {
          chrome.runtime.sendMessage({ type: "visitDelayEvent", ...payload }, (response) => {
            const failed = chrome.runtime.lastError;

            resolve(!failed && response && response.ok ? response : null);
          });
        } catch {
          resolve(null);
        }

        return;
      }

      // Extension-less pages (checks and previews) apply the same rules locally.
      if (payload.event === "close") {
        window.close();
        resolve({ ok: true });
        return;
      }

      storage.applyVisitDelayEvent(payload).then(
        (status) => resolve({ ok: true, ...status }),
        () => resolve(null)
      );
    });
  }

  function readPass() {
    try {
      return window.sessionStorage.getItem(PASS_KEY) || "";
    } catch {
      return "";
    }
  }

  function writePass(domain) {
    try {
      window.sessionStorage.setItem(PASS_KEY, domain);
    } catch {
      // Storage may be blocked; the pass then lasts only for this document.
    }
  }

  function clearPass() {
    try {
      window.sessionStorage.removeItem(PASS_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  function noop() {}
})();
