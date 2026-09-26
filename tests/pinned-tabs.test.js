"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../src/pinned-tabs.js"), "utf8");

function event() {
  const listeners = [];
  return {
    addListener: (listener) => listeners.push(listener),
    emit: (...args) => listeners.forEach((listener) => listener(...args))
  };
}
function harness(saved = {}) {
  const local = saved.local || {};
  const session = saved.session || {};
  const windows = saved.windows || [
    {
      id: 1,
      type: "normal",
      incognito: false,
      tabs: [
        {
          id: 1,
          windowId: 1,
          url: "https://mail.google.com/mail/u/0/#inbox",
          pinned: true,
          active: true
        }
      ]
    },
    {
      id: 2,
      type: "normal",
      incognito: false,
      tabs: [{ id: 2, windowId: 2, url: "https://example.com/", pinned: false, active: true }]
    },
    {
      id: 3,
      type: "normal",
      incognito: true,
      tabs: [{ id: 3, windowId: 3, url: "https://private.example/", pinned: true }]
    },
    { id: 4, type: "popup", incognito: false, tabs: [] }
  ];
  let nextId = Math.max(100, ...windows.flatMap((w) => w.tabs.map((tab) => tab.id + 1)));
  let focusedWindowId = 1;
  const settings = { enabled: true, crossWindowPinsEnabled: true, ...saved.settings };
  let permitted = saved.permitted !== false;
  const settingsEvent = event();
  const creates = [];
  const errors = [];
  const area = (data) => ({
    get: async (keys) =>
      structuredClone(Object.fromEntries([keys].flat().map((key) => [key, data[key]]))),
    set: async (values) => Object.assign(data, structuredClone(values))
  });
  const find = (id) => windows.flatMap((w) => w.tabs).find((tab) => tab.id === id);
  const api = {
    storage: { local: area(local), session: area(session) },
    permissions: { contains: async () => permitted, onAdded: event() },
    runtime: { onStartup: event(), onInstalled: event() },
    commands: { onCommand: event() },
    windows: {
      onCreated: event(),
      getAll: async () => structuredClone(windows.filter((w) => w.type === "normal"))
    },
    tabs: {
      onCreated: event(),
      onUpdated: event(),
      onRemoved: event(),
      onAttached: event(),
      onMoved: event(),
      query: async (query) =>
        structuredClone(
          windows
            .filter((w) => !query.lastFocusedWindow || w.id === focusedWindowId)
            .flatMap((w) => w.tabs)
            .filter((tab) => !query.active || tab.active)
        ),
      create: async (options) => {
        const w = windows.find((item) => item.id === options.windowId);
        if (!w) throw new Error("Window closed");
        const tab = { id: nextId++, incognito: w.incognito, status: "complete", ...options };
        creates.push(options);
        w.tabs.push(tab);
        api.tabs.onCreated.emit(structuredClone(tab));
        return structuredClone(tab);
      },
      update: async (id, change) => {
        const tab = find(id);
        if (!tab) throw new Error("Tab closed");
        Object.assign(tab, change);
        api.tabs.onUpdated.emit(id, change, structuredClone(tab));
        return structuredClone(tab);
      }
    }
  };
  const context = { URL, console: { warn: (...args) => errors.push(args) } };
  vm.runInNewContext(source, context);
  const controller = context.SmoothSurferPinnedTabs.create(api, {
    loadSettings: async () => ({ ...settings }),
    watchSettings: settingsEvent.addListener
  });
  async function settle() {
    // Mutations can enqueue their own Chrome events after the current operation.
    for (let i = 0; i < 8; i++) await controller.settle();
    assert.deepEqual(errors, []);
  }
  return {
    api,
    windows,
    local,
    session,
    settings,
    creates,
    find,
    settle,
    focusWindow: (id) => (focusedWindowId = id),
    changeSettings: (patch) => {
      Object.assign(settings, patch);
      settingsEvent.emit();
    },
    grant: () => {
      permitted = true;
      api.permissions.onAdded.emit({ permissions: ["tabs"] });
    },
    closeTab: (id, isWindowClosing = false) => {
      const windowId = find(id)?.windowId;
      for (const w of windows) w.tabs = w.tabs.filter((tab) => tab.id !== id);
      api.tabs.onRemoved.emit(id, { windowId, isWindowClosing });
    }
  };
}
const pins = (h, id) => h.windows.find((w) => w.id === id).tabs.filter((tab) => tab.pinned);

(async () => {
  const off = harness({ settings: { crossWindowPinsEnabled: false } });
  await off.settle();
  assert.equal(off.creates.length, 0, "off by default does not change tabs");
  const denied = harness({ permitted: false });
  await denied.settle();
  assert.equal(denied.creates.length, 0, "no tab access means no tab changes");
  denied.grant();
  await denied.settle();
  assert.equal(denied.creates.length, 1);

  const h = harness();
  await h.settle();
  assert.equal(h.creates.length, 1, "seed the existing pin in the other regular window");
  assert.equal(h.creates[0].active, false, "never steal the active tab");
  assert.equal(pins(h, 3).length, 1, "private pins are neither imported nor changed");
  assert.equal(h.windows[3].tabs.length, 0, "popup windows are excluded");
  assert.equal(h.local.smoothSurferPinnedTabs.length, 1);
  assert.ok(!JSON.stringify(h.local).includes("private.example"));

  const gmailCopy = pins(h, 2)[0];
  await h.api.tabs.update(1, { url: "https://mail.google.com/mail/u/0/#inbox/message-id" });
  await h.settle();
  assert.equal(h.find(1).pinned, false, "the live document becomes a regular tab");
  assert.equal(h.find(1).active, true, "navigation keeps its active tab and history");
  const gmailReplacement = pins(h, 1)[0];
  assert.notEqual(gmailReplacement.id, 1, "the saved URL has a separate pinned tab");
  assert.equal(gmailReplacement.url, "https://mail.google.com/mail/u/0/#inbox");
  assert.equal(gmailReplacement.active, false);
  assert.equal(
    h.find(gmailCopy.id).url,
    "https://mail.google.com/mail/u/0/#inbox",
    "navigation is independent"
  );
  assert.equal(h.local.smoothSurferPinnedTabs[0], "https://mail.google.com/mail/u/0/#inbox");

  h.windows.push({ id: 5, type: "normal", incognito: false, tabs: [] });
  h.api.windows.onCreated.emit({ id: 5, type: "normal" });
  await h.settle();
  assert.equal(pins(h, 5).length, 1, "new windows receive saved pins");
  h.api.windows.onCreated.emit({ id: 5, type: "normal" });
  await h.settle();
  assert.equal(pins(h, 5).length, 1, "repeated events do not duplicate pins");

  // Two fast pin operations are serialized without losing either URL.
  await Promise.all([
    h.api.tabs.create({ windowId: 1, url: "https://one.example/", pinned: true }),
    h.api.tabs.create({ windowId: 2, url: "https://two.example/", pinned: true })
  ]);
  await h.settle();
  for (const id of [1, 2, 5]) assert.equal(pins(h, id).length, 3);

  await h.api.tabs.update(gmailReplacement.id, { pinned: false });
  await h.settle();
  for (const id of [1, 2, 5]) assert.equal(pins(h, id).length, 2);
  assert.ok(h.find(gmailCopy.id), "unpin keeps other copies open");
  assert.equal(h.find(gmailCopy.id).pinned, false);

  // Closing a pin closes only that copy; its window gets it back in place.
  const closing = pins(h, 1).find((tab) => tab.url === "https://one.example/");
  const otherCopy = pins(h, 2).find((tab) => tab.url === closing.url);
  const orderBefore = pins(h, 1).map((tab) => tab.url);
  h.closeTab(closing.id);
  await h.settle();
  assert.equal(h.find(otherCopy.id).pinned, true, "closing one pin leaves other copies");
  assert.equal(h.local.smoothSurferPinnedTabs.length, 2, "closing a pin keeps it saved");
  const restored = h.creates.at(-1);
  assert.equal(restored.windowId, 1);
  assert.equal(restored.url, closing.url);
  assert.equal(restored.active, false);
  assert.equal(restored.index, orderBefore.indexOf(closing.url), "restored in its slot");
  assert.equal(pins(h, 1).length, 2);

  // Unpinning is the explicit way to remove a pin everywhere.
  await h.api.tabs.update(otherCopy.id, { pinned: false });
  await h.settle();
  for (const id of [1, 2, 5]) assert.equal(pins(h, id).length, 1);
  assert.equal(h.local.smoothSurferPinnedTabs.length, 1);

  const closingWindow = h.windows.find((w) => w.id === 5);
  for (const tab of closingWindow.tabs.filter((tab) => tab.pinned)) {
    h.api.tabs.onUpdated.emit(tab.id, { pinned: false }, { ...tab, pinned: false });
  }
  h.windows.splice(h.windows.indexOf(closingWindow), 1);
  for (const tab of closingWindow.tabs)
    h.api.tabs.onRemoved.emit(tab.id, { isWindowClosing: true });
  await h.settle();
  assert.equal(h.local.smoothSurferPinnedTabs.length, 1, "closing a whole window retains pins");

  // Worker restart preserves bindings and the saved pins.
  const rest = harness({ local: h.local, session: h.session, windows: h.windows });
  await rest.settle();
  assert.equal(rest.creates.length, 0);
  rest.changeSettings({ crossWindowPinsEnabled: false });
  await rest.settle();
  assert.equal(rest.local.smoothSurferPinnedTabs.length, 0);
  assert.equal(pins(rest, 1).length, 1, "disable leaves existing tabs pinned");

  const race = harness();
  await race.settle();
  const countBeforeClose = race.creates.length;
  race.api.tabs.onUpdated.emit(1, { status: "complete" }, race.find(1));
  race.closeTab(1);
  await race.settle();
  assert.equal(
    race.creates.length,
    countBeforeClose + 1,
    "a queued load event and the close restore the pin exactly once"
  );
  assert.equal(race.local.smoothSurferPinnedTabs.length, 1);

  const ordering = harness();
  await ordering.settle();
  await ordering.api.tabs.create({ windowId: 1, url: "https://second.example/", pinned: true });
  await ordering.settle();
  const sourceWindow = ordering.windows.find((window) => window.id === 1);
  sourceWindow.tabs.reverse();
  sourceWindow.tabs.forEach((tab, index) => {
    tab.index = index;
  });
  ordering.api.tabs.onMoved.emit(sourceWindow.tabs[0].id, {
    windowId: 1,
    fromIndex: 1,
    toIndex: 0
  });
  await ordering.settle();
  assert.deepEqual(ordering.local.smoothSurferPinnedTabs, [
    "https://second.example/",
    "https://mail.google.com/mail/u/0/#inbox"
  ]);
  const remembered = harness({
    local: ordering.local,
    session: ordering.session,
    windows: ordering.windows
  });
  await remembered.settle();
  remembered.windows.push({ id: 8, type: "normal", incognito: false, tabs: [] });
  remembered.api.windows.onCreated.emit({ id: 8, type: "normal" });
  await remembered.settle();
  assert.deepEqual(
    pins(remembered, 8).map((tab) => tab.url),
    ordering.local.smoothSurferPinnedTabs,
    "new windows use the saved order after a worker restart"
  );
  remembered.api.tabs.onMoved.emit(2, { windowId: 2, fromIndex: 1, toIndex: 2 });
  remembered.api.tabs.onMoved.emit(3, { windowId: 3, fromIndex: 1, toIndex: 0 });
  await remembered.settle();
  assert.deepEqual(
    remembered.local.smoothSurferPinnedTabs,
    ordering.local.smoothSurferPinnedTabs,
    "regular and private tab moves cannot change the saved pin order"
  );

  const reboot = harness({
    local: { smoothSurferPinnedTabs: ["https://saved.example/"] },
    windows: [{ id: 9, type: "normal", tabs: [] }]
  });
  await reboot.settle();
  assert.equal(
    pins(reboot, 9)[0].url,
    "https://saved.example/",
    "browser restart restores saved pins without session bindings"
  );
  await reboot.api.tabs.create({ windowId: 9, url: "chrome://extensions/", pinned: true });
  await reboot.settle();
  assert.equal(reboot.local.smoothSurferPinnedTabs.length, 1, "do not persist internal pages");

  for (const destination of [
    "https://mail.google.com/mail/u/0/message",
    "https://mail.google.com/mail/u/0/?search=hello#inbox",
    "https://elsewhere.example/",
    "chrome://newtab/"
  ]) {
    const navigation = harness();
    await navigation.settle();
    await navigation.api.tabs.update(1, { url: destination });
    await navigation.settle();
    assert.equal(navigation.find(1).url, destination);
    assert.equal(navigation.find(1).pinned, false);
    assert.equal(pins(navigation, 1).length, 1);
    assert.equal(pins(navigation, 2).length, 1);
    navigation.closeTab(1);
    await navigation.settle();
    assert.equal(
      navigation.local.smoothSurferPinnedTabs.length,
      1,
      "closing a departure keeps the pin"
    );
  }

  const reload = harness();
  await reload.settle();
  const reloadCount = reload.creates.length;
  await reload.api.tabs.update(1, { status: "loading" });
  await reload.api.tabs.update(1, { status: "complete" });
  await reload.settle();
  assert.equal(reload.creates.length, reloadCount, "reloading the same URL keeps its pin");
  const background = pins(reload, 2)[0];
  await reload.api.tabs.update(background.id, { url: "https://example.com/background" });
  await reload.settle();
  assert.equal(reload.find(background.id).active, false, "background navigation never takes focus");
  assert.equal(reload.find(background.id).pinned, false);

  // A newly created pin can redirect before finishing its initial load.
  const redirects = harness({
    local: { smoothSurferPinnedTabs: ["https://redirect.example/"] },
    session: {
      smoothSurferPinnedTabBindings: { 1: "https://redirect.example/" },
      smoothSurferPinnedTabPages: { 1: { loading: true } }
    },
    windows: [
      {
        id: 1,
        type: "normal",
        tabs: [
          {
            id: 1,
            windowId: 1,
            pinned: true,
            status: "loading",
            url: "https://redirect.example/login"
          }
        ]
      }
    ]
  });
  await redirects.settle();
  await redirects.api.tabs.update(1, { status: "complete" });
  await redirects.settle();
  assert.equal(redirects.creates.length, 0, "initial redirects must not create a restore loop");
  const redirectedRestart = harness({
    local: redirects.local,
    session: redirects.session,
    windows: redirects.windows
  });
  await redirectedRestart.settle();
  assert.equal(redirectedRestart.creates.length, 0, "redirect baseline survives worker restarts");
  await redirectedRestart.api.tabs.update(1, { url: "https://redirect.example/another-page" });
  await redirectedRestart.settle();
  assert.equal(redirectedRestart.find(1).pinned, false);
  assert.equal(
    pins(redirectedRestart, 1)[0].url,
    "https://redirect.example/",
    "restore the saved URL, not its redirect"
  );

  const stale = harness({
    local: { smoothSurferPinnedTabs: ["https://original.example/"] },
    session: { smoothSurferPinnedTabBindings: { 1: "https://original.example/" } }
  });
  await stale.settle();
  assert.equal(stale.find(1).pinned, false, "a worker restart repairs a departed pin");
  assert.equal(pins(stale, 1)[0].url, "https://original.example/");

  const quick = harness();
  await quick.settle();
  await quick.api.tabs.update(2, { pinned: true });
  await quick.api.tabs.update(2, { url: "https://example.com/next" });
  await quick.settle();
  assert.ok(
    quick.local.smoothSurferPinnedTabs.includes("https://example.com/"),
    "capture the URL when pinned even if it immediately navigates"
  );
  assert.equal(quick.find(2).pinned, false);

  const inFlight = harness();
  await inFlight.settle();
  inFlight.find(2).pendingUrl = "https://example.com/loading";
  await inFlight.api.tabs.update(2, { pinned: true });
  await inFlight.settle();
  assert.equal(inFlight.find(2).pinned, true, "pinning a pending URL waits for it to commit");
  delete inFlight.find(2).pendingUrl;
  await inFlight.api.tabs.update(2, { url: "https://example.com/loading", status: "complete" });
  await inFlight.settle();
  assert.equal(inFlight.find(2).pinned, true);

  const shortcut = harness();
  await shortcut.settle();
  shortcut.focusWindow(2);
  shortcut.api.commands.onCommand.emit("toggle-pin-tab");
  await shortcut.settle();
  assert.equal(shortcut.find(2).pinned, true, "the shortcut pins the focused window's active tab");
  assert.ok(shortcut.local.smoothSurferPinnedTabs.includes("https://example.com/"));
  shortcut.api.commands.onCommand.emit("toggle-pin-tab", shortcut.find(2));
  await shortcut.settle();
  assert.equal(shortcut.find(2).pinned, false, "pressing again unpins");
  assert.ok(!shortcut.local.smoothSurferPinnedTabs.includes("https://example.com/"));
  shortcut.api.commands.onCommand.emit("unknown", shortcut.find(2));
  shortcut.api.commands.onCommand.emit("toggle-pin-tab", shortcut.find(3));
  await shortcut.settle();
  assert.equal(shortcut.find(3).pinned, true, "the shortcut does not modify private tabs");
  assert.equal(shortcut.find(2).pinned, false);
  shortcut.api.commands.onCommand.emit("toggle-pin-tab", shortcut.find(2));
  shortcut.api.commands.onCommand.emit("toggle-pin-tab", shortcut.find(2));
  await shortcut.settle();
  assert.equal(shortcut.find(2).pinned, false, "rapid presses toggle the current state");
  shortcut.changeSettings({ enabled: false });
  await shortcut.settle();
  shortcut.api.commands.onCommand.emit("toggle-pin-tab", shortcut.find(2));
  await shortcut.settle();
  assert.equal(shortcut.find(2).pinned, false, "the master switch disables the shortcut");
  off.api.commands.onCommand.emit("toggle-pin-tab", off.find(2));
  await off.settle();
  assert.equal(off.find(2).pinned, true, "the shortcut also works for ordinary Chrome pins");
  assert.equal(off.local.smoothSurferPinnedTabs, undefined);
  console.log(
    "Pinned tabs passed (shortcut, URL departures, redirects, reload, permissions, windows, unpin/close, concurrency, restart, privacy)."
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
