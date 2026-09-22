// Exercise the real Chrome window/tab events in a disposable browser profile.
// The temporary manifest pregrants the optional permission to avoid a browser
// permission dialog in headless CI. Permission denial is covered by the unit test.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
for (const file of await readdir(root))
  if (file.endsWith(".html")) await cp(path.join(root, file), path.join(extension, file));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
manifest.permissions.push("tabs");
delete manifest.optional_permissions;
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
try {
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
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text
      );
    return result.result.value;
  }
  const snapshot = () => evaluate(`chrome.windows.getAll({populate:true,windowTypes:['normal']})`);
  diagnostic = () =>
    evaluate(
      `(async()=>({windows:await chrome.windows.getAll({populate:true}),events:self.__pinEvents,local:await chrome.storage.local.get("smoothSurferPinnedTabs"),session:await chrome.storage.session.get("smoothSurferPinnedTabBindings")}))()`
    );
  await evaluate(
    `(()=>{self.__pinEvents=[];chrome.tabs.onUpdated.addListener((id,c,t)=>{if('pinned' in c)self.__pinEvents.push({id,c,windowId:t.windowId})});chrome.tabs.onRemoved.addListener((id,info)=>self.__pinEvents.push({id,info}));chrome.windows.onRemoved.addListener(id=>self.__pinEvents.push({windowRemoved:id}));})()`
  );
  const initial = (await snapshot())[0];
  const first = await evaluate(
    `chrome.tabs.create({windowId:${initial.id},url:'https://pins-one.example.test/',pinned:true,active:false})`
  );
  const secondWindow = await evaluate(`chrome.windows.create({url:'about:blank',focused:false})`);
  await evaluate(
    `(async()=>{const settings=await SmoothSurferStorage.loadSettings();await SmoothSurferStorage.saveSettings({...settings,crossWindowPinsEnabled:true});})()`
  );
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
  await until(async () =>
    (await snapshot())
      .flatMap((window) => window.tabs)
      .find((tab) => tab.id === first.id)
      ?.url.endsWith("/message")
  );
  assert.ok(
    (await snapshot())
      .filter((window) => window.id !== initial.id)
      .every(
        (window) => window.tabs.find((tab) => tab.pinned).url === "https://pins-one.example.test/"
      )
  );

  await evaluate(`chrome.tabs.update(${first.id},{pinned:false})`);
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.every((tab) => !tab.pinned))
  );
  assert.equal(
    (await snapshot())
      .flatMap((window) => window.tabs)
      .filter((tab) => tab.url.startsWith("https://pins-one.example.test")).length,
    3,
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
  await evaluate(`chrome.tabs.remove(${copy.id})`);
  await until(async () =>
    (await snapshot()).every((window) => window.tabs.every((tab) => !tab.pinned))
  );
  assert.equal(
    (await evaluate(`chrome.storage.local.get('smoothSurferPinnedTabs')`)).smoothSurferPinnedTabs
      .length,
    0
  );
  console.log(
    "Pinned tabs Chrome passed (real extension, existing/new windows, navigation, unpin, close tab, close window)."
  );
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => chrome.once("exit", resolve)),
    delay(2000).then(() => chrome.kill("SIGKILL"))
  ]);
  await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
