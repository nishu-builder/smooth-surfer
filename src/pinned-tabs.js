// Shared pinned web pages for normal windows in this browser profile.
(function installPinnedTabs(root) {
  "use strict";

  const PINS_KEY = "smoothSurferPinnedTabs";
  const BINDINGS_KEY = "smoothSurferPinnedTabBindings";

  function webUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function create(api, storage) {
    let queue = Promise.resolve();
    let initialized = false;
    let urls = [];
    let bindings = {};
    const pendingChanges = [];

    const enqueue = (operation) => {
      const result = queue.then(operation);
      queue = result.catch((error) => console.warn("Pinned tabs:", error.message));
      return result;
    };

    async function load() {
      if (initialized) return;
      const [local, session] = await Promise.all([
        api.storage.local.get(PINS_KEY),
        api.storage.session.get(BINDINGS_KEY)
      ]);
      urls = [...new Set((local[PINS_KEY] || []).map(webUrl).filter(Boolean))];
      bindings = session[BINDINGS_KEY] || {};
      initialized = true;
    }

    async function save() {
      await api.storage.local.set({ [PINS_KEY]: urls });
      await api.storage.session.set({ [BINDINGS_KEY]: bindings });
    }

    async function reconcile() {
      await load();
      const settings = await storage.loadSettings();
      if (!settings.crossWindowPinsEnabled) {
        pendingChanges.length = 0;
        if (!urls.length && !Object.keys(bindings).length) return;
        urls = [];
        bindings = {};
        await save();
        return;
      }
      if (!settings.enabled || !(await api.permissions.contains({ permissions: ["tabs"] }))) return;
      const windows = (
        await api.windows.getAll({ populate: true, windowTypes: ["normal"] })
      ).filter((window) => !window.incognito);
      const tabs = windows.flatMap((window) => window.tabs || []);
      const live = new Map(tabs.map((tab) => [tab.id, tab]));
      // Drain user changes before repairing windows. An earlier queued load
      // event must not recreate a pin that the user has just closed/unpinned.
      const changes = pendingChanges.splice(0);
      const closingTabs = new Set(
        changes.filter((event) => event.windowClosing).map((event) => event.tabId)
      );
      for (const event of changes) {
        const removedUrl = bindings[event.tabId];
        // Chrome can emit pinned:false just before removing a whole window.
        // Only treat it as a user's unpin if that tab still exists.
        const unpinned = event.unpinned && live.has(event.tabId) && !closingTabs.has(event.tabId);
        if (removedUrl && (unpinned || (event.removed && !event.windowClosing))) {
          urls = urls.filter((url) => url !== removedUrl);
          for (const [id, url] of Object.entries(bindings)) {
            if (url !== removedUrl) continue;
            const tab = live.get(Number(id));
            if (tab?.pinned) await updateIfPresent(tab.id, { pinned: false });
            if (tab) tab.pinned = false;
            delete bindings[id];
          }
        }
        if (event.removed) delete bindings[event.tabId];
      }
      // Existing bindings retain the URL at pin time: following a link in a
      // pinned Gmail tab must not navigate every other window to that email.
      for (const [id, url] of Object.entries(bindings)) {
        // Retain missing-tab bindings until onRemoved is processed; it can
        // arrive while this asynchronous reconciliation is already running.
        if (!urls.includes(url)) delete bindings[id];
      }
      for (const tab of tabs) {
        if (!tab.pinned || bindings[tab.id]) continue;
        const url = webUrl(tab.pendingUrl || tab.url);
        if (!url) continue;
        if (!urls.includes(url)) urls.push(url);
        bindings[tab.id] = url;
      }
      // Remember the last user-arranged pinned order for future windows.
      // Ignore ordinary-tab moves, private windows, and shutdown unpins.
      const reorder = changes
        .slice()
        .reverse()
        .find(
          (event) =>
            event.orderWindowId !== undefined &&
            live.get(event.tabId)?.pinned &&
            windows.some((window) => window.id === event.orderWindowId)
        );
      if (reorder) {
        const source = windows.find((window) => window.id === reorder.orderWindowId);
        const ordered = [
          ...new Set(
            source.tabs
              .filter((tab) => tab.pinned)
              .sort((a, b) => a.index - b.index)
              .map((tab) => bindings[tab.id])
              .filter(Boolean)
          )
        ];
        urls = [...ordered, ...urls.filter((url) => !ordered.includes(url))];
      }
      // Persist the desired list before creating tabs so worker interruption
      // can be repaired by the next event without forgetting a shared pin.
      await save();
      for (const window of windows) {
        for (const url of urls) {
          if (window.tabs.some((tab) => tab.pinned && bindings[tab.id] === url)) continue;
          try {
            const tab = await api.tabs.create({
              windowId: window.id,
              url,
              pinned: true,
              active: false
            });
            bindings[tab.id] = url;
            window.tabs.push(tab);
          } catch (error) {
            // A user can close a window while its pins are being populated.
            if (
              (await api.windows.getAll({ windowTypes: ["normal"] })).some(
                (item) => item.id === window.id
              )
            )
              throw error;
          }
        }
      }
      await save();
    }

    async function updateIfPresent(id, patch) {
      try {
        await api.tabs.update(id, patch);
      } catch (error) {
        if ((await api.tabs.query({})).some((tab) => tab.id === id)) throw error;
      }
    }

    const schedule = (event) => {
      if (event?.removed || event?.unpinned || event?.orderWindowId !== undefined)
        pendingChanges.push(event);
      void enqueue(() => reconcile());
    };
    api.tabs.onCreated.addListener((tab) => {
      if (tab.pinned && !tab.incognito) schedule();
    });
    api.tabs.onUpdated.addListener((tabId, change, tab) => {
      if (
        !tab.incognito &&
        ("pinned" in change || (tab.pinned && (change.url || change.status === "complete")))
      )
        schedule({ tabId, unpinned: change.pinned === false });
    });
    api.tabs.onRemoved.addListener((tabId, info) =>
      schedule({ tabId, removed: true, windowClosing: info.isWindowClosing })
    );
    api.tabs.onMoved.addListener((tabId, info) =>
      schedule({ tabId, orderWindowId: info.windowId })
    );
    api.tabs.onAttached.addListener(() => schedule());
    api.windows.onCreated.addListener((window) => {
      if (window.type === "normal" && !window.incognito) schedule();
    });
    api.runtime.onStartup.addListener(() => schedule());
    api.runtime.onInstalled.addListener(() => schedule());
    api.permissions.onAdded.addListener(() => schedule());
    storage.watchSettings(() => schedule());
    schedule();
    return { settle: () => queue };
  }

  root.SmoothSurferPinnedTabs = { create };
  if (typeof chrome !== "undefined" && chrome.windows?.onCreated && chrome.storage?.session)
    create(chrome, root.SmoothSurferStorage);
})(typeof self !== "undefined" ? self : globalThis);
