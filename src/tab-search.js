// Tab search: Cmd+K (Ctrl+K elsewhere) lists this window's tabs. The page gets
// the key first, so sites with their own Cmd+K keep it; the search opens only
// when nothing on the page handled the key.
(function installSmoothSurferTabSearch() {
  "use strict";

  const storage = window.SmoothSurferStorage;

  if (!storage || window !== window.top || typeof chrome === "undefined" || !chrome.runtime?.id)
    return;

  const isMac = /Mac|iPhone|iPad/.test(window.navigator.platform || window.navigator.userAgent);
  const STYLES = `
    :host { all: initial; }
    .backdrop {
      position: fixed; inset: 0; display: flex; justify-content: center; align-items: flex-start;
      padding: min(14vh, 120px) 16px 16px; background: rgb(32 34 30 / 28%);
      font: 14px/1.45 var(--ss-sans, Arial, Helvetica, sans-serif); color: var(--ss-ink, #20221e);
    }
    .panel {
      display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(560px, 100%); max-height: min(520px, 70vh);
      border: 1px solid var(--ss-ink, #20221e); border-radius: 8px; overflow: hidden;
      background: var(--ss-paper, #fffef9); box-shadow: 5px 6px 0 var(--ss-stamp, #e7e7dc);
    }
    .search { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--ss-line, #d7d7c9); }
    .search svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; color: var(--ss-muted, #64655b); }
    input {
      flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: inherit;
      font: 15px/1.4 var(--ss-sans, Arial, Helvetica, sans-serif);
    }
    input::placeholder { color: var(--ss-muted, #64655b); }
    ul { margin: 0; padding: 6px; overflow: auto; list-style: none; }
    li {
      display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: center; gap: 10px;
      padding: 7px 8px; border: 1px solid transparent; border-radius: 6px; cursor: pointer;
    }
    li[aria-selected="true"] { border-color: var(--ss-ink, #20221e); background: var(--ss-action-soft, #f3f9d8); }
    .tile {
      display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid var(--ss-control-line, #a7aa99);
      border-radius: 5px; background: var(--ss-canvas, #fffdf4);
      font: 700 11px var(--ss-mono, "SFMono-Regular", Consolas, monospace); text-transform: uppercase;
    }
    .tile.icon { background: var(--ss-paper, #fffef9); border-color: var(--ss-line, #d7d7c9); }
    .tile canvas { width: 16px; height: 16px; }
    .text { display: grid; min-width: 0; }
    .title, .url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .title { font-weight: 700; }
    .url { color: var(--ss-muted, #64655b); font-size: 12px; }
    mark { background: var(--ss-accent, #e3ff73); color: inherit; border-radius: 2px; }
    .badge {
      padding: 0 7px; border: 1px solid var(--ss-line, #d7d7c9); border-radius: 999px; color: var(--ss-muted, #64655b);
      font: 10.5px/1.6 var(--ss-mono, "SFMono-Regular", Consolas, monospace);
    }
    li.empty { display: block; padding: 18px 12px; color: var(--ss-muted, #64655b); text-align: center; cursor: default; }
    .foot {
      display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 8px 14px; border-top: 1px solid var(--ss-line, #d7d7c9);
      color: var(--ss-muted, #64655b); font: 11px/1.5 var(--ss-mono, "SFMono-Regular", Consolas, monospace);
    }
    .foot span:last-child { margin-left: auto; }
    kbd {
      padding: 0 5px; border: 1px solid var(--ss-control-line, #a7aa99); border-bottom-width: 2px; border-radius: 4px;
      background: var(--ss-paper, #fffef9); color: var(--ss-ink, #20221e); font: inherit;
    }
  `;
  // Keys typed into the search must never reach the page's own shortcuts.
  const ISOLATED_EVENTS = ["keydown", "keypress", "keyup", "beforeinput", "input"];

  let enabled = false;
  let open = null;
  let pending = null;

  storage.loadSettings().then(apply, () => {});
  storage.watchSettings(apply);

  function apply(settings) {
    enabled = Boolean(settings?.enabled && settings.tabSearchEnabled);
    if (!enabled) close();
  }

  // Capture runs before the page's listeners. A matching key adds a one-time
  // listener that runs after them, in the event's final phase at window.
  window.addEventListener(
    "keydown",
    (event) => {
      if (open && event.composedPath().includes(open.host)) {
        handleSearchKey(event);
        return;
      }
      if (!enabled || !isShortcut(event)) return;
      // Re-adding moves the listener after every page listener on window.
      pending = event;
      window.removeEventListener("keydown", decide);
      window.addEventListener("keydown", decide);
    },
    true
  );
  for (const type of ISOLATED_EVENTS.slice(1)) {
    window.addEventListener(
      type,
      (event) => {
        if (!open || !event.composedPath().includes(open.host)) return;
        event.stopImmediatePropagation();
        if (type === "input") render();
      },
      true
    );
  }

  function decide(event) {
    if (event !== pending) return;
    pending = null;
    window.removeEventListener("keydown", decide);
    // The page (or another extension) already used the key.
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (open) close();
    else void show();
  }

  function isShortcut(event) {
    const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    return (
      modifier &&
      !event.altKey &&
      !event.shiftKey &&
      !event.repeat &&
      (event.key === "k" || event.key === "K")
    );
  }

  function handleSearchKey(event) {
    event.stopImmediatePropagation();
    const { key } = event;
    if (key === "Escape" || isShortcut(event)) {
      event.preventDefault();
      close();
    } else if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      move(key === "ArrowDown" ? 1 : -1);
    } else if (key === "Enter" && !event.isComposing) {
      event.preventDefault();
      choose(open.results[open.selected]);
    } else if (key === "Tab") {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
    } else {
      // Text changes arrive after the default action; refilter then.
      window.setTimeout(render, 0);
    }
  }

  async function show() {
    const response = await send({ type: "listWindowTabs" });
    if (!response || open || !enabled) return;
    await Promise.all(response.tabs.map(decodeIcon));
    if (open || !enabled) return;
    const host = document.createElement("div");
    host.className = "smooth-surfer-tab-search";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    // Closed, so page scripts cannot read other tabs' titles from the overlay.
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    const backdrop = element("div", "backdrop");
    const panel = element("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Search tabs in this window");
    const search = element("label", "search");
    search.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    const input = element("input");
    input.type = "text";
    input.placeholder = "Search this window’s tabs";
    input.setAttribute("aria-label", "Search this window’s tabs");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-controls", "results");
    input.setAttribute("aria-expanded", "true");
    input.autocomplete = "off";
    input.spellcheck = false;
    search.append(input);
    const list = element("ul");
    list.id = "results";
    list.setAttribute("role", "listbox");
    const foot = element("div", "foot");
    foot.innerHTML =
      "<span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> switch</span><span><kbd>esc</kbd> close</span><span></span>";
    panel.append(search, list, foot);
    backdrop.append(panel);
    root.append(style, backdrop);
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) close();
    });
    list.addEventListener("click", (event) => {
      const row = event.target.closest("li");
      if (row) choose(open.results[Number(row.dataset.index)]);
    });
    list.addEventListener("mousemove", (event) => {
      const row = event.target.closest("li");
      if (row && Number(row.dataset.index) !== open.selected) select(Number(row.dataset.index));
    });
    open = {
      host,
      input,
      list,
      count: foot.lastElementChild,
      tabs: response.tabs,
      results: [],
      selected: 0,
      query: null,
      previousFocus: document.activeElement
    };
    document.documentElement.append(host);
    render();
    input.focus({ preventScroll: true });
  }

  function close() {
    if (!open) return;
    const { host, previousFocus } = open;
    open = null;
    host.remove();
    if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
  }

  async function choose(tab) {
    if (!tab) return;
    close();
    if (!tab.active) await send({ type: "activateWindowTab", tabId: tab.id });
  }

  function render() {
    if (!open) return;
    const query = open.input.value.trim().toLowerCase();
    if (query === open.query) return;
    open.query = query;
    const words = query.split(/\s+/).filter(Boolean);
    open.results = open.tabs
      .map((tab, order) => ({ tab, order, score: score(tab, words) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map((entry) => entry.tab);
    // With no query, start on the most useful tab: anything but this one.
    const firstOther = open.results.findIndex((tab) => !tab.active);
    open.selected = !words.length && firstOther > 0 ? firstOther : 0;
    open.list.replaceChildren();
    if (!open.results.length) {
      const empty = element("li", "empty", "No tabs in this window match.");
      empty.setAttribute("role", "presentation");
      open.list.append(empty);
    }
    open.results.forEach((tab, index) => {
      const row = element("li");
      row.id = `tab-${index}`;
      row.dataset.index = String(index);
      row.setAttribute("role", "option");
      const tile = element("span", "tile", tab.bitmap ? "" : initial(tab));
      tile.setAttribute("aria-hidden", "true");
      if (tab.bitmap) {
        const canvas = element("canvas");
        canvas.width = 32;
        canvas.height = 32;
        canvas.getContext("2d").drawImage(tab.bitmap, 0, 0, 32, 32);
        tile.classList.add("icon");
        tile.append(canvas);
      }
      const text = element("span", "text");
      text.append(
        highlighted("span", "title", tab.title || displayUrl(tab.url), words),
        highlighted("span", "url", displayUrl(tab.url), words)
      );
      row.append(tile, text);
      const badge = tab.active ? "this tab" : tab.pinned ? "pinned" : tab.audible ? "playing" : "";
      if (badge) row.append(element("span", "badge", badge));
      open.list.append(row);
    });
    open.count.textContent = `${open.results.length} of ${open.tabs.length} tabs`;
    select(open.selected);
  }

  function score(tab, words) {
    if (!words.length) return 0;
    const title = (tab.title || "").toLowerCase();
    const url = (tab.url || "").toLowerCase();
    let total = 0;
    for (const word of words) {
      if (title.startsWith(word)) total += 4;
      else if (title.includes(` ${word}`)) total += 3;
      else if (title.includes(word)) total += 2;
      else if (url.includes(word)) total += 1;
      else return -1;
    }
    return total;
  }

  function move(step) {
    if (!open.results.length) return;
    select((open.selected + step + open.results.length) % open.results.length);
  }

  function select(index) {
    open.selected = index;
    const rows = [...open.list.querySelectorAll("li[role=option]")];
    rows.forEach((row, rowIndex) => row.setAttribute("aria-selected", String(rowIndex === index)));
    if (rows[index]) {
      open.input.setAttribute("aria-activedescendant", rows[index].id);
      rows[index].scrollIntoView({ block: "nearest" });
    }
  }

  function highlighted(tag, className, text, words) {
    const node = element(tag, className);
    const lower = text.toLowerCase();
    const ranges = [];
    for (const word of words) {
      const at = lower.indexOf(word);
      if (at >= 0) ranges.push([at, at + word.length]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start < cursor) continue;
      node.append(text.slice(cursor, start), element("mark", "", text.slice(start, end)));
      cursor = end;
    }
    node.append(text.slice(cursor));
    return node;
  }

  function displayUrl(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return value;
      return url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
    } catch {
      return value || "";
    }
  }

  // Icons arrive as bytes from Chrome's cache and are drawn on a canvas, so no
  // image request is made from this page.
  async function decodeIcon(tab) {
    if (!tab.icon) return;
    try {
      const bytes = Uint8Array.from(window.atob(tab.icon), (char) => char.charCodeAt(0));
      tab.bitmap = await window.createImageBitmap(new Blob([bytes], { type: "image/png" }));
    } catch {
      tab.bitmap = null;
    }
  }

  // The site's main name (mail.google.com → G), or the title's first letter.
  function initial(tab) {
    let source = tab.title || "?";
    try {
      const parts = new URL(tab.url).hostname.split(".").filter((part) => part !== "www");
      if (parts.length) source = parts.length > 1 ? parts.at(-2) : parts[0];
    } catch {
      // Not a URL; use the title.
    }
    return source.replace(/^[^a-z0-9]+/i, "").slice(0, 1) || "?";
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          resolve(!chrome.runtime.lastError && response?.ok ? response : null);
        });
      } catch {
        resolve(null);
      }
    });
  }
})();
