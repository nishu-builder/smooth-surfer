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
  let nextId = 100;
  const settings = { enabled: true, crossWindowPinsEnabled: true, ...saved.settings };
  let permitted = saved.permitted !== false;
  const settingsEvent = event();
  const creates = [];
  const errors = [];
  const area = (data) => ({
    get: async (key) => structuredClone({ [key]: data[key] }),
    set: async (values) => Object.assign(data, structuredClone(values))
  });
  const find = (id) => windows.flatMap((w) => w.tabs).find((tab) => tab.id === id);
  const api = {
    storage: { local: area(local), session: area(session) },
    permissions: { contains: async () => permitted, onAdded: event() },
    runtime: { onStartup: event(), onInstalled: event() },
    windows: {
      onCreated: event(),
      getAll: async () => structuredClone(windows.filter((w) => w.type === "normal"))
    },
    tabs: {
      onCreated: event(),
      onUpdated: event(),
      onRemoved: event(),
      onAttached: event(),
      query: async () => structuredClone(windows.flatMap((w) => w.tabs)),
      create: async (options) => {
        const w = windows.find((item) => item.id === options.windowId);
        if (!w) throw new Error("Window closed");
        const tab = { id: nextId++, incognito: w.incognito, ...options };
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
    changeSettings: (patch) => {
      Object.assign(settings, patch);
      settingsEvent.emit();
    },
    grant: () => {
      permitted = true;
      api.permissions.onAdded.emit({ permissions: ["tabs"] });
    },
    closeTab: (id, isWindowClosing = false) => {
      for (const w of windows) w.tabs = w.tabs.filter((tab) => tab.id !== id);
      api.tabs.onRemoved.emit(id, { isWindowClosing });
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

  await h.api.tabs.update(1, { pinned: false });
  await h.settle();
  for (const id of [1, 2, 5]) assert.equal(pins(h, id).length, 2);
  assert.ok(h.find(gmailCopy.id), "unpin keeps other copies open");
  assert.equal(h.find(gmailCopy.id).pinned, false);

  const closing = pins(h, 1).find((tab) => tab.url === "https://one.example/");
  const otherCopy = pins(h, 2).find((tab) => tab.url === closing.url);
  h.closeTab(closing.id);
  await h.settle();
  assert.equal(h.find(otherCopy.id).pinned, false, "closing one pin unpins other copies");
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

  // Worker restart preserves bindings even if the pinned tab navigated away.
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
    countBeforeClose,
    "a queued load event must not recreate a just-closed pin"
  );
  assert.equal(race.local.smoothSurferPinnedTabs.length, 0);

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
  console.log(
    "Pinned tabs passed (permissions, existing/new windows, independent navigation, unpin/close, concurrency, restart, privacy)."
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
