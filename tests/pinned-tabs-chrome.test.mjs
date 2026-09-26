// Exercise the real Chrome window/tab events in a disposable browser profile.
// The temporary manifest pregrants the optional permission to avoid a browser
// permission dialog in headless CI. Permission denial is covered by the unit test.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary =
  process.env.CHROME_BIN ||
  [
    path.join(root, ".cache/chrome-linux64/chrome"),
    path.join(
      root,
      ".cache/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    )
  ].find(existsSync);
if (!binary) {
  console.log("Skipping pinned tabs Chrome test: set CHROME_BIN to Chrome for Testing.");
  process.exit(0);
}
const tmp = await mkdtemp(path.join(os.tmpdir(), "smooth-surfer-pins-"));
const extension = path.join(tmp, "extension");
const profile = path.join(tmp, "profile");
await mkdir(extension);
for (const folder of ["src", "icons"])
  await cp(path.join(root, folder), path.join(extension, folder), { recursive: true });
// Capture the registered handler so it can run against real Chrome tabs in
// headless mode, where OS keyboard shortcut delivery is unavailable.
const backgroundPath = path.join(extension, "src/background.js");
await writeFile(
  backgroundPath,
  `const addCommandListener = chrome.commands.onCommand.addListener.bind(chrome.commands.onCommand);
chrome.commands.onCommand.addListener = handler => { self.__pinCommand = handler; addCommandListener(handler); };\n` +
    (await readFile(backgroundPath, "utf8"))
);
for (const file of await readdir(root))
  if (file.endsWith(".html")) await cp(path.join(root, file), path.join(extension, file));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
await writeFile(path.join(extension, "manifest.json"), JSON.stringify(manifest));
const chrome = spawn(
  binary,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    `--load-extension=${extension}`,
    `--disable-extensions-except=${extension}`,
    "about:blank"
  ],
  { stdio: "ignore" }
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let diagnostic = async () => ({});
async function until(operation) {
  const deadline = Date.now() + 15000;
  let last;
  while (Date.now() < deadline) {
    last = await operation();
    if (last) return last;
    await delay(100);
  }
  throw new Error(`Timed out waiting for pinned tabs: ${JSON.stringify(await diagnostic())}`);
}
let socket;
const pageSockets = [];
const fixture = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(
    '<!doctype html><title>Pin test</title><input id="draft"><a href="/linked">Follow link</a>'
  );
});
try {
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
  let port;
  await until(async () => {
    try {
      port = Number(
        (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]
      );
      return port;
    } catch {
      return false;
    }
  });
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const worker = await until(async () =>
    (await targets()).find(
      (target) => target.type === "service_worker" && target.url.endsWith("/src/background.js")
    )
  );
  socket = new WebSocket(worker.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const promise = pending.get(message.id);
    if (!promise) return;
    pending.delete(message.id);
    clearTimeout(promise.timer);
    if (message.error) promise.reject(new Error(message.error.message));
    else promise.resolve(message.result);
  };
  function send(method, params, channel = socket) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      channel.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression, channel = socket) {
    const result = await send(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true
      },
      channel
    );
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text
      );
    return result.result.value;
  }
  async function pageAt(url) {
    const target = await until(async () =>
      (await targets()).find((item) => item.type === "page" && item.url === url)
    );
    const channel = new WebSocket(target.webSocketDebuggerUrl);
    pageSockets.push(channel);
    channel.onmessage = socket.onmessage;
    await new Promise((resolve, reject) => {
      channel.onopen = resolve;
      channel.onerror = reject;
    });
    return channel;
  }
  // The worker target can appear before Chrome installs extension bindings
  // and the background script finishes loading. Wait for both before testing.
  await until(() =>
    evaluate(
      `typeof chrome !== 'undefined' && Boolean(chrome.tabs?.onUpdated) && typeof SmoothSurferStorage !== 'undefined'`
    )
  );
  const snapshot = () => evaluate(`chrome.windows.getAll({populate:true,windowTypes:['normal']})`);
  diagnostic = () =>
    evaluate(
      `(async()=>({windows:await chrome.windows.getAll({populate:true}),events:self.__pinEvents,local:await chrome.storage.local.get("smoothSurferPinnedTabs"),session:await chrome.storage.session.get("smoothSurferPinnedTabBindings")}))()`
    );
  await evaluate(
    `(()=>{self.__pinEvents=[];chrome.tabs.onUpdated.addListener((id,c,t)=>{if('pinned' in c)self.__pinEvents.push({id,c,windowId:t.windowId})});chrome.tabs.onRemoved.addListener((id,info)=>self.__pinEvents.push({id,info}));chrome.windows.onRemoved.addListener(id=>self.__pinEvents.push({windowRemoved:id}));})()`
  );
  const initial = (await snapshot())[0];
  const command = (await evaluate(`chrome.commands.getAll()`)).find(
    (item) => item.name === "toggle-pin-tab"
  );
  assert.ok(command?.shortcut, "Chrome registers the pin shortcut");
  const first = await evaluate(
    `chrome.tabs.create({windowId:${initial.id},url:'https://pins-one.example.test/',pinned:true,active:false})`
  );
  const secondWindow = await evaluate(`chrome.windows.create({url:'about:blank',focused:false})`);
  // Sharing is on by default; no settings change is needed.
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.filter((tab) => tab.pinned).length === 1)
  );
  let windows = await snapshot();
  assert.equal(windows.length, 2);
  assert.equal(
    windows.find((window) => window.id === secondWindow.id).tabs.find((tab) => tab.pinned).active,
    false
  );
  assert.equal(windows.flatMap((window) => window.tabs).filter((tab) => tab.pinned).length, 2);

  const thirdWindow = await evaluate(`chrome.windows.create({url:'about:blank',focused:false})`);
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.filter((tab) => tab.pinned).length === 1)
  );
  await evaluate(`chrome.tabs.update(${first.id},{url:'https://pins-one.example.test/message'})`);
  await until(async () => {
    const tabs = (await snapshot()).find((window) => window.id === initial.id).tabs;
    return (
      tabs.some((tab) => tab.id === first.id && !tab.pinned && tab.url.endsWith("/message")) &&
      tabs.some((tab) => tab.pinned && tab.url === "https://pins-one.example.test/")
    );
  });
  assert.ok(
    (await snapshot())
      .filter((window) => window.id !== initial.id)
      .every(
        (window) => window.tabs.find((tab) => tab.pinned).url === "https://pins-one.example.test/"
      )
  );

  const restored = (await snapshot())
    .find((window) => window.id === initial.id)
    .tabs.find((tab) => tab.pinned);
  assert.notEqual(restored.id, first.id);
  assert.equal(restored.index, first.index, "restore the pin in its previous position");
  assert.equal((await evaluate(`chrome.tabs.get(${first.id})`)).active, false);
  await evaluate(
    `(async()=>self.__pinCommand('toggle-pin-tab', await chrome.tabs.get(${restored.id})))()`
  );
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.every((tab) => !tab.pinned))
  );
  assert.equal(
    (await snapshot())
      .flatMap((window) => window.tabs)
      .filter((tab) => tab.url.startsWith("https://pins-one.example.test")).length,
    4,
    "unpin never closes another window's page"
  );

  // Pin a different site and close its source window. Its copies and saved URL survive.
  await evaluate(
    `chrome.tabs.create({windowId:${initial.id},url:'https://pins-two.example.test/',pinned:true,active:false})`
  );
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.filter((tab) => tab.pinned).length === 1)
  );
  await evaluate(`chrome.windows.remove(${initial.id})`);
  await until(async () => (await snapshot()).length === 2);
  const fourthWindow = await evaluate(`chrome.windows.create({url:'about:blank',focused:false})`);
  await until(async () =>
    (await snapshot())
      .find((window) => window.id === fourthWindow.id)
      ?.tabs.some((tab) => tab.pinned && tab.url === "https://pins-two.example.test/")
  );
  windows = await snapshot();
  const copy = windows
    .find((window) => window.id === thirdWindow.id)
    .tabs.find((tab) => tab.pinned);
  // Closing a pin closes only that copy. Its window restores it inactive.
  await evaluate(`chrome.tabs.remove(${copy.id})`);
  await until(async () =>
    (await snapshot()).every((window) =>
      window.tabs.some(
        (tab) =>
          tab.pinned &&
          tab.id !== copy.id &&
          !tab.active &&
          (tab.pendingUrl || tab.url) === "https://pins-two.example.test/"
      )
    )
  );
  assert.equal(
    (await evaluate(`chrome.storage.local.get('smoothSurferPinnedTabs')`)).smoothSurferPinnedTabs
      .length,
    1,
    "closing a pin keeps it saved"
  );
  // Pin changes this module didn't make stand in for Chrome's tab menu, and
  // are undone: the unpinned copy is pinned again, the new pin is removed.
  const restoredCopy = (await snapshot())
    .find((window) => window.id === thirdWindow.id)
    .tabs.find((tab) => tab.pinned);
  await evaluate(`chrome.tabs.update(${restoredCopy.id},{pinned:false})`);
  await until(async () => (await evaluate(`chrome.tabs.get(${restoredCopy.id})`)).pinned);
  const menuPin = await evaluate(
    `chrome.tabs.create({windowId:${thirdWindow.id},url:'about:blank',active:false})`
  );
  await evaluate(`chrome.tabs.update(${menuPin.id},{pinned:true})`);
  await until(async () => !(await evaluate(`chrome.tabs.get(${menuPin.id})`)).pinned);
  await evaluate(`chrome.tabs.remove(${menuPin.id})`);
  assert.ok(
    (await snapshot()).every((window) => window.tabs.filter((tab) => tab.pinned).length === 1),
    "menu changes leave every window's shared pins as they were"
  );
  // The shortcut unpins it everywhere without closing the pages.
  await evaluate(
    `(async()=>self.__pinCommand('toggle-pin-tab', await chrome.tabs.get(${restoredCopy.id})))()`
  );
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.every((tab) => !tab.pinned))
  );
  assert.equal(
    (await evaluate(`chrome.storage.local.get('smoothSurferPinnedTabs')`)).smoothSurferPinnedTabs
      .length,
    0
  );
  // Dragging a pinned tab changes the saved order for subsequently opened windows.
  const orderFirst = await evaluate(
    `chrome.tabs.create({windowId:${secondWindow.id},url:'https://order-first.example.test/',pinned:true,active:false})`
  );
  const orderSecond = await evaluate(
    `chrome.tabs.create({windowId:${secondWindow.id},url:'https://order-second.example.test/',pinned:true,active:false})`
  );
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.filter((tab) => tab.pinned).length === 2)
  );
  await evaluate(`chrome.tabs.move(${orderSecond.id},{index:0})`);
  await until(
    async () =>
      (await evaluate(`chrome.storage.local.get('smoothSurferPinnedTabs')`))
        .smoothSurferPinnedTabs[0] === "https://order-second.example.test/"
  );
  const orderedWindow = await evaluate(`chrome.windows.create({url:'about:blank',focused:false})`);
  await until(
    async () =>
      (await snapshot())
        .find((window) => window.id === orderedWindow.id)
        ?.tabs.filter((tab) => tab.pinned).length === 2
  );
  assert.deepEqual(
    (await snapshot())
      .find((window) => window.id === orderedWindow.id)
      .tabs.filter((tab) => tab.pinned)
      .map((tab) => tab.pendingUrl || tab.url),
    ["https://order-second.example.test/", "https://order-first.example.test/"]
  );
  assert.equal((await evaluate(`chrome.tabs.get(${orderFirst.id})`)).pinned, true);

  const shortcutTab = await evaluate(
    `chrome.tabs.create({windowId:${secondWindow.id},url:'https://shortcut.example.test/',active:true})`
  );
  await evaluate(
    `(async()=>self.__pinCommand('toggle-pin-tab', await chrome.tabs.get(${shortcutTab.id})))()`
  );
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.filter((tab) => tab.pinned).length === 3)
  );

  await evaluate(
    `chrome.tabs.update(${shortcutTab.id},{url:'https://shortcut.example.test/#next'})`
  );
  await until(async () => {
    const tabs = (await snapshot()).find((window) => window.id === secondWindow.id).tabs;
    return (
      tabs.some(
        (tab) => tab.id === shortcutTab.id && !tab.pinned && tab.active && tab.url.endsWith("#next")
      ) &&
      tabs.some(
        (tab) =>
          tab.id !== shortcutTab.id &&
          tab.pinned &&
          (tab.pendingUrl || tab.url) === "https://shortcut.example.test/"
      )
    );
  });
  await evaluate(`chrome.tabs.remove(${shortcutTab.id})`);
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.filter((tab) => tab.pinned).length === 3)
  );

  // Use real loaded documents to check link navigation, the back stack, and
  // SPA history changes without losing an in-progress form in the live page.
  const liveTab = await evaluate(
    `chrome.tabs.create({windowId:${secondWindow.id},url:${JSON.stringify(fixtureOrigin + "/start")},active:true})`
  );
  await until(async () => (await evaluate(`chrome.tabs.get(${liveTab.id})`)).status === "complete");
  const livePage = await pageAt(fixtureOrigin + "/start");
  await evaluate(
    `(async()=>self.__pinCommand('toggle-pin-tab', await chrome.tabs.get(${liveTab.id})))()`
  );
  await until(async () => (await evaluate(`chrome.tabs.get(${liveTab.id})`)).pinned);
  await evaluate(
    `document.getElementById('draft').value='unsent draft'; history.pushState({draft:true}, '', '/start?compose=1')`,
    livePage
  );
  await until(async () => !(await evaluate(`chrome.tabs.get(${liveTab.id})`)).pinned);
  assert.equal(
    await evaluate(`document.getElementById('draft').value`, livePage),
    "unsent draft",
    "splitting a SPA page keeps its form state"
  );
  assert.equal((await evaluate(`chrome.tabs.get(${liveTab.id})`)).active, true);
  await until(async () =>
    (await snapshot())
      .find((window) => window.id === secondWindow.id)
      .tabs.some((tab) => tab.pinned && tab.url === fixtureOrigin + "/start")
  );
  await evaluate(`document.querySelector('a').click()`, livePage);
  await until(
    async () => (await evaluate(`chrome.tabs.get(${liveTab.id})`)).url === fixtureOrigin + "/linked"
  );
  await evaluate(`history.back()`, livePage);
  await until(
    async () =>
      (await evaluate(`chrome.tabs.get(${liveTab.id})`)).url === fixtureOrigin + "/start?compose=1"
  );
  assert.equal(
    (await evaluate(`chrome.tabs.get(${liveTab.id})`)).pinned,
    false,
    "back navigation does not re-pin a departed tab"
  );

  const linkPin = await evaluate(
    `chrome.tabs.create({windowId:${secondWindow.id},url:${JSON.stringify(fixtureOrigin + "/link-start")},active:true})`
  );
  await until(async () => (await evaluate(`chrome.tabs.get(${linkPin.id})`)).status === "complete");
  const linkPage = await pageAt(fixtureOrigin + "/link-start");
  await evaluate(
    `(async()=>self.__pinCommand('toggle-pin-tab', await chrome.tabs.get(${linkPin.id})))()`
  );
  await until(async () => (await evaluate(`chrome.tabs.get(${linkPin.id})`)).pinned);
  await evaluate(`document.querySelector('a').click()`, linkPage);
  await until(async () => {
    const tab = await evaluate(`chrome.tabs.get(${linkPin.id})`);
    return !tab.pinned && tab.url === fixtureOrigin + "/linked";
  });
  await until(async () =>
    (await snapshot())
      .find((window) => window.id === secondWindow.id)
      .tabs.some((tab) => tab.pinned && tab.url === fixtureOrigin + "/link-start")
  );

  console.log(
    "Pinned tabs Chrome passed (registered shortcut and handler, windows, URL departures, links, SPA form state, history, unpin/close, saved ordering)."
  );
} finally {
  socket?.close();
  for (const channel of pageSockets) channel.close();
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => chrome.once("exit", resolve)),
    delay(2000).then(() => chrome.kill("SIGKILL"))
  ]);
  await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  await new Promise((resolve) => fixture.close(resolve));
}
