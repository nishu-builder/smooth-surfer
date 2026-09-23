// Real extension/offscreen routing test. Uses a deterministic model stub after
// reporting actual device availability; it does not download a model.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary =
  process.env.CHROME_BIN ||
  [
    path.join(root, ".cache/chrome-linux64/chrome"),
    path.join(
      root,
      ".cache/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    )
  ].find((candidate) => existsSync(candidate));
if (!binary) {
  console.log("Skipping local model Chrome test: set CHROME_BIN to Chrome for Testing.");
  process.exit(0);
}
const profile = await mkdtemp(path.join(os.tmpdir(), "smooth-surfer-local-model-test-"));
const child = spawn(
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
    `--load-extension=${root}`,
    `--disable-extensions-except=${root}`,
    "about:blank"
  ],
  { stdio: "ignore" }
);
const clients = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function retry(operation) {
  let error;
  for (let i = 0; i < 100; i++) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (caught) {
      error = caught;
    }
    await wait(100);
  }
  throw error || new Error("Chrome target timed out");
}
async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const result = JSON.parse(data);
    const promise = pending.get(result.id);
    if (!promise) return;
    pending.delete(result.id);
    if (result.error) promise.reject(new Error(result.error.message));
    else promise.resolve(result.result);
  };
  const client = {
    socket,
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`CDP command timed out: ${method}`)),
          20000
        );
        pending.set(id, {
          resolve: (result) => {
            clearTimeout(timer);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          }
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
  clients.push(client);
  return client;
}
async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails)
    throw new Error(response.exceptionDetails.text + " " + response.result.description);
  return response.result.value;
}
try {
  const port = await retry(
    async () => (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]
  );
  const targets = async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const worker = await retry(async () =>
    (await targets()).find(
      (target) => target.type === "service_worker" && target.url.endsWith("/src/background.js")
    )
  );
  const extension = worker.url.replace("/src/background.js", "");
  const page = await connect((await targets()).find((target) => target.type === "page"));
  await page.send("Page.navigate", { url: `${extension}/popup.html?view=settings` });
  await retry(() => evaluate(page, 'Boolean(document.querySelector("[data-local-model-setup]"))'));
  await retry(() => evaluate(page, 'document.querySelector("[data-setting=enabled]").checked'));
  assert.equal(
    await evaluate(page, 'document.querySelector("[data-setting=aiProvider]").value'),
    "anthropic",
    "Fresh installs choose Claude"
  );
  assert.equal(await evaluate(page, 'document.querySelector("[data-model-notice]").hidden'), true);
  await evaluate(
    page,
    `(() => { const select = document.querySelector('[data-setting="aiProvider"]'); select.value = 'local'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`
  );
  await retry(() => evaluate(page, 'document.querySelector("[data-api-key-row]").hidden'));
  const real = await evaluate(page, 'chrome.runtime.sendMessage({type:"getLocalModelStatus"})');
  assert.equal(real.ok, true);
  console.log(
    "Model status in isolated profile with component downloads disabled (not a hardware eligibility test):",
    JSON.stringify(real)
  );
  const frameTarget = await retry(async () =>
    (await targets()).find((target) => target.url.endsWith("/src/local-model-offscreen.html"))
  );
  const offscreen = await connect(frameTarget);
  const modelStub = `({availability: async()=>"available",create:async()=>({contextWindow:20000,contextUsage:0,measureContextUsage:async()=>200,addEventListener(){},destroy(){},prompt:async()=>JSON.stringify({results:[{i:1,blocked:true,matches:[1],reasons:["On-device test"]}]})})})`;
  await evaluate(
    offscreen,
    `document.querySelector("iframe").contentWindow.LanguageModel=${modelStub}`
  );
  await evaluate(
    offscreen,
    `document.querySelector("iframe").contentWindow.LanguageModel.availability=async()=>{await new Promise(resolve=>setTimeout(resolve,200));return "downloadable"}`
  );
  await retry(() =>
    evaluate(page, '!document.querySelector("[data-local-model-refresh]").disabled')
  );
  await evaluate(page, 'document.querySelector("[data-local-model-refresh]").click()');
  assert.equal(
    await evaluate(page, 'document.querySelector("[data-local-model-refresh]").textContent'),
    "Checking…"
  );
  assert.match(
    await evaluate(page, 'document.querySelector("[data-filter-key-status]").textContent'),
    /Checking/
  );
  await retry(() =>
    evaluate(
      page,
      'document.querySelector("[data-model-notice-text]").textContent.includes("Download Gemini Nano")'
    )
  );
  assert.equal(await evaluate(page, 'document.querySelector("[data-model-notice]").hidden'), false);
  assert.match(
    await evaluate(page, 'document.querySelector("[data-model-notice-action]").href'),
    /local-model-setup.html$/
  );
  await page.send("Page.navigate", { url: `${extension}/review.html` });
  await retry(() =>
    evaluate(
      page,
      'document.querySelector("[data-model-notice-text]")?.textContent.includes("Download Gemini Nano")'
    )
  );
  assert.equal(
    await evaluate(page, 'document.querySelector("[data-model-notice]").hidden'),
    false,
    "empty review advertises required setup"
  );
  await evaluate(
    offscreen,
    'document.querySelector("iframe").contentWindow.LanguageModel.availability=async()=>"downloading"'
  );
  await retry(() =>
    evaluate(
      page,
      'document.querySelector("[data-model-notice-action]").textContent === "View download"'
    )
  );
  await evaluate(
    offscreen,
    'document.querySelector("iframe").contentWindow.LanguageModel.availability=async()=>"available"'
  );
  await retry(() => evaluate(page, 'document.querySelector("[data-model-notice]").hidden'));
  await page.send("Page.navigate", { url: `${extension}/popup.html?view=settings` });
  await retry(() =>
    evaluate(
      page,
      'document.querySelector("[data-filter-key-status]")?.textContent.includes("Model ready")'
    )
  );
  const background = await connect(worker);
  await evaluate(
    background,
    'self.fetch=()=>{throw new Error("Cloud request forbidden in local test")};'
  );
  await evaluate(
    page,
    'window.SmoothSurferStorage.saveSettings({...window.SmoothSurferSettings.DEFAULT_SETTINGS, aiProvider:"local"})'
  );
  const result = await evaluate(
    page,
    'chrome.runtime.sendMessage({type:"classifyContent",source:"twitter",text:"Test local post"})'
  );
  assert.equal(result.classifier, "chrome-nano");
  assert.equal(result.blocked, true);
  await retry(() =>
    evaluate(
      page,
      'document.querySelector("[data-filter-key-status]").textContent.includes("1 checked · 1 filtered")'
    )
  );
  await evaluate(
    offscreen,
    'document.querySelector("iframe").contentWindow.LanguageModel.availability=async()=>"unavailable"'
  );
  const unavailable = await evaluate(
    page,
    'chrome.runtime.sendMessage({type:"classifyContent",source:"twitter",text:"Another local post"})'
  );
  assert.equal(unavailable.classifier, "error");
  assert.match(unavailable.error, /not ready/);
  await retry(() =>
    evaluate(
      page,
      'document.querySelector("[data-filter-key-status]").textContent.includes("1 failed")'
    )
  );
  assert.match(
    await evaluate(page, 'document.querySelector("[data-filter-key-status]").textContent'),
    /not ready/
  );
  await evaluate(page, 'document.querySelector("[data-local-model-setup]").click()');
  const setupTarget = await retry(async () =>
    (await targets()).find((target) => target.url.endsWith("/src/local-model-setup.html"))
  );
  const setup = await connect(setupTarget);
  await retry(() => evaluate(setup, 'Boolean(document.querySelector("[data-model-download]"))'));
  await retry(() => evaluate(setup, '!document.querySelector("[data-model-check]").disabled'));
  await evaluate(
    setup,
    `self.LanguageModel={availability:async()=>"downloadable",create:async()=>{self.setupHadActivation=navigator.userActivation.isActive;return {destroy(){}}}};document.querySelector("[data-model-check]").click()`
  );
  await retry(() => evaluate(setup, '!document.querySelector("[data-model-download]").disabled'));
  const button = await evaluate(
    setup,
    '(()=>{const button=document.querySelector("[data-model-download]");button.scrollIntoView({block:"center"});const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()'
  );
  await setup.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...button
  });
  await setup.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...button
  });
  await retry(() => evaluate(setup, 'typeof self.setupHadActivation === "boolean"'));
  assert.equal(
    await evaluate(setup, "self.setupHadActivation"),
    true,
    "model setup receives real user activation"
  );
  assert.equal(
    await evaluate(setup, "document.documentElement.scrollWidth <= innerWidth"),
    true,
    "setup page fits viewport"
  );
  console.log(
    "Local model Chrome routing passed (offscreen iframe, no cloud fallback, setup activation). Inference uses a test stub."
  );
} finally {
  for (const client of clients) client.socket.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
  await rm(profile, { recursive: true, force: true });
}
