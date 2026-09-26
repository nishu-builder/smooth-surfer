// Shared pinned web pages for normal windows in this browser profile.
(function installPinnedTabs(root) {
  "use strict";

  const PINS_KEY = "smoothSurferPinnedTabs";
  const BINDINGS_KEY = "smoothSurferPinnedTabBindings";
  const PAGES_KEY = "smoothSurferPinnedTabPages";

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
    let pages = {};
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
        api.storage.session.get([BINDINGS_KEY, PAGES_KEY])
      ]);
      urls = [...new Set((local[PINS_KEY] || []).map(webUrl).filter(Boolean))];
      bindings = session[BINDINGS_KEY] || {};
      pages = session[PAGES_KEY] || {};
      initialized = true;
    }

    async function save() {
      await api.storage.local.set({ [PINS_KEY]: urls });
      await api.storage.session.set({ [BINDINGS_KEY]: bindings, [PAGES_KEY]: pages });
    }

    async function reconcile() {
      await load();
      const settings = await storage.loadSettings();
      if (!settings.crossWindowPinsEnabled) {
        pendingChanges.length = 0;
        if (!urls.length && !Object.keys(bindings).length) return;
        urls = [];
        bindings = {};
        pages = {};
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
      // Like Arc, closing a pin only closes that copy. The window gets it back
      // at the saved URL; only an explicit unpin removes it everywhere.
      const closedPins = new Set();
      for (const event of changes) {
        const removedUrl = bindings[event.tabId];
        // Chrome can emit pinned:false just before removing a whole window.
        // Only treat it as a user's unpin if that tab still exists.
        const unpinned = event.unpinned && live.has(event.tabId) && !closingTabs.has(event.tabId);
        if (removedUrl && event.removed && !event.windowClosing)
          closedPins.add(`${event.windowId}:${removedUrl}`);
        if (removedUrl && unpinned) {
          urls = urls.filter((url) => url !== removedUrl);
          for (const [id, url] of Object.entries(bindings)) {
            if (url !== removedUrl) continue;
            const tab = live.get(Number(id));
            if (tab?.pinned) await updateIfPresent(tab.id, { pinned: false });
            if (tab) tab.pinned = false;
            delete bindings[id];
            delete pages[id];
          }
        }
        if (event.removed) {
          delete bindings[event.tabId];
          delete pages[event.tabId];
        }
      }
      // Bindings always retain the URL at pin time, across navigation and
      // worker restarts. Page state only tracks a copy's initial redirects.
      for (const [id, url] of Object.entries(bindings)) {
        // Retain missing-tab bindings until onRemoved is processed; it can
        // arrive while this asynchronous reconciliation is already running.
        if (!urls.includes(url)) {
          delete bindings[id];
          delete pages[id];
        }
      }
      for (const tab of tabs) {
        if (!tab.pinned || bindings[tab.id]) continue;
        const pinned = changes.findLast((event) => event.tabId === tab.id && event.pinnedUrl);
        const url = pinned?.pinnedUrl || webUrl(tab.pendingUrl || tab.url);
        if (!url) continue;
        if (!urls.includes(url)) urls.push(url);
        bindings[tab.id] = url;
        pages[tab.id] = { url };
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
      const replacementPositions = new Map();
      for (const tab of tabs) {
        const url = bindings[tab.id];
        if (!tab.pinned || !url) continue;
        const page = pages[tab.id];
        // A restored URL may redirect (for example to sign-in). Let its first
        // load settle before detecting later navigation, or restoring the pin
        // would repeatedly create tabs. The saved URL itself never changes.
        if (page?.loading) {
          if (tab.status === "complete" && !tab.pendingUrl) pages[tab.id] = { url: tab.url || url };
          continue;
        }
        if (!tab.url || tab.pendingUrl === url || tab.url === url || tab.url === page?.url)
          continue;
        // Keep the live document, history, and focus in the departing tab.
        // Remove its binding before unpinning so our own onUpdated event
        // cannot be mistaken for a user removing the pin everywhere.
        delete bindings[tab.id];
        delete pages[tab.id];
        await updateIfPresent(tab.id, { pinned: false });
        tab.pinned = false;
        replacementPositions.set(`${tab.windowId}:${url}`, tab.index);
      }
      // Persist the desired list before creating tabs so worker interruption
      // can be repaired by the next event without forgetting a shared pin.
      await save();
      for (const window of windows) {
        for (const url of urls) {
          if (window.tabs.some((tab) => tab.pinned && bindings[tab.id] === url)) continue;
          try {
            const key = `${window.id}:${url}`;
            // A closed pin returns to its slot in the shared order.
            const index = replacementPositions.has(key)
              ? replacementPositions.get(key)
              : closedPins.has(key)
                ? window.tabs.filter(
                    (tab) => tab.pinned && urls.indexOf(bindings[tab.id]) < urls.indexOf(url)
                  ).length
                : undefined;
            const tab = await api.tabs.create({
              windowId: window.id,
              url,
              pinned: true,
              active: false,
              ...(index === undefined ? {} : { index })
            });
            bindings[tab.id] = url;
            pages[tab.id] = { loading: true };
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
      if (
        event?.removed ||
        event?.unpinned ||
        event?.pinnedUrl ||
        event?.orderWindowId !== undefined
      )
        pendingChanges.push(event);
      void enqueue(() => reconcile());
    };
    api.tabs.onCreated.addListener((tab) => {
      if (tab.pinned && !tab.incognito)
        schedule({ tabId: tab.id, pinnedUrl: webUrl(tab.pendingUrl || tab.url) });
    });
    api.tabs.onUpdated.addListener((tabId, change, tab) => {
      if (
        !tab.incognito &&
        ("pinned" in change || (tab.pinned && (change.url || change.status === "complete")))
      )
        schedule({
          tabId,
          unpinned: change.pinned === false,
          pinnedUrl: change.pinned === true ? webUrl(tab.pendingUrl || tab.url) : ""
        });
    });
    api.tabs.onRemoved.addListener((tabId, info) =>
      schedule({
        tabId,
        removed: true,
        windowId: info.windowId,
        windowClosing: info.isWindowClosing
      })
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
    api.commands?.onCommand.addListener((command, tab) => {
      if (command !== "toggle-pin-tab") return;
      // Capture the target now, even if another reconciliation is in flight.
      const target = tab
        ? Promise.resolve([tab])
        : api.tabs.query({ active: true, lastFocusedWindow: true });
      void enqueue(async () => {
        const [selected] = await target;
        if (!selected || selected.incognito || !(await storage.loadSettings()).enabled) return;
        const windows = await api.windows.getAll({ populate: true, windowTypes: ["normal"] });
        const current = windows
          .filter((window) => !window.incognito)
          .flatMap((window) => window.tabs || [])
          .find((item) => item.id === selected.id);
        if (current) await updateIfPresent(current.id, { pinned: !current.pinned });
        await reconcile();
      });
    });
    storage.watchSettings(() => schedule());
    schedule();
    return { settle: () => queue };
  }

  root.SmoothSurferPinnedTabs = { create };
  if (typeof chrome !== "undefined" && chrome.windows?.onCreated && chrome.storage?.session)
    create(chrome, root.SmoothSurferStorage);
})(typeof self !== "undefined" ? self : globalThis);
