import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!existsSync(chromePath)) {
  console.log("Skipping Chrome smoke test: Google Chrome is not installed.");
  process.exit(0);
}

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    const client = new CdpClient(socket);

    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    socket.addEventListener("message", (event) => client.handleMessage(event));
    return client;
  }

  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);

    if (!message.id || !this.pending.has(message.id)) {
      return;
    }

    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }

  close() {
    this.socket.close();
  }
}

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "smooth-surfer-chrome-"));
const profileDir = path.join(tmpDir, "profile");
const fixturePath = path.join(tmpDir, "youtube-fixture.html");
const port = await getFreePort();

await writeFile(
  fixturePath,
  `<!doctype html>
  <html class="smooth-surfer-youtube-hide-recs smooth-surfer-youtube-gray">
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="${pathToFileURL(path.join(root, "src/styles.css")).href}">
    </head>
    <body>
      <ytd-browse page-subtype="home">
        <ytd-rich-grid-renderer id="home-grid">Home grid should stay visible</ytd-rich-grid-renderer>
        <ytd-rich-section-renderer id="home-section">Home section should stay visible</ytd-rich-section-renderer>
      </ytd-browse>
      <ytd-watch-flexy>
        <div id="secondary">Watch recommendations should be hidden</div>
        <div id="related">Related videos should be hidden</div>
      </ytd-watch-flexy>
      <ytd-thumbnail><img id="thumb" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></ytd-thumbnail>
      <a id="watch-thumb" href="/watch?v=abc"><img id="core-watch-thumb" class="yt-core-image" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></a>
      <yt-thumbnail-view-model><img id="view-model-thumb" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></yt-thumbnail-view-model>
    </body>
  </html>`,
  "utf8"
);

const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-component-update",
  "--allow-file-access-from-files",
  "about:blank"
]);

try {
  const target = await waitForPageTarget(port);
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  await navigate(client, pathToFileURL(fixturePath).href);
  const youtubeStyles = await evaluate(client, `(() => {
    const display = (selector) => getComputedStyle(document.querySelector(selector)).display;
    return {
      homeGrid: display("#home-grid"),
      homeSection: display("#home-section"),
      secondary: display("#secondary"),
      related: display("#related"),
      thumbFilter: getComputedStyle(document.querySelector("#thumb")).filter,
      coreWatchThumbFilter: getComputedStyle(document.querySelector("#core-watch-thumb")).filter,
      viewModelThumbFilter: getComputedStyle(document.querySelector("#view-model-thumb")).filter
    };
  })()`);

  assert.notEqual(youtubeStyles.homeGrid, "none");
  assert.notEqual(youtubeStyles.homeSection, "none");
  assert.equal(youtubeStyles.secondary, "none");
  assert.equal(youtubeStyles.related, "none");
  assert.match(youtubeStyles.thumbFilter, /grayscale/);
  assert.match(youtubeStyles.coreWatchThumbFilter, /grayscale/);
  assert.match(youtubeStyles.viewModelThumbFilter, /grayscale/);

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false
  });
  await navigate(client, pathToFileURL(path.join(root, "popup.html")).href);
  await waitForExpression(client, `Boolean(document.querySelector("[data-phrase-input]"))`);
  const popupState = await evaluate(client, `(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const filterLabel = [...document.querySelectorAll("label")].find((label) =>
      label.textContent.includes("Filter out content")
    );
    const input = document.querySelector("[data-phrase-input]");
    input.value = "high-pressure AI investing hype";
    document.querySelector("[data-phrase-form]").requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      hasFilterLabel: Boolean(filterLabel),
      hasOldFilterLabel: document.body.textContent.includes("Filter AI-upside FOMO"),
      hasEvaluator: Boolean(document.querySelector("[data-setting='twitterClassifierMode']")),
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
        document.body.scrollWidth <= document.body.clientWidth,
      checkboxWidth: Math.round(document.querySelector("input[type='checkbox']").getBoundingClientRect().width),
      popupWidth: Math.round(document.querySelector(".popup").getBoundingClientRect().width),
      bodyWidth: Math.round(document.body.getBoundingClientRect().width),
      pillText: document.querySelector("[data-phrase-list]").textContent,
      stored: JSON.parse(localStorage.getItem("smoothSurferSettings"))
    };
  })()`);

  assert.equal(popupState.hasFilterLabel, true);
  assert.equal(popupState.hasOldFilterLabel, false);
  assert.equal(popupState.hasEvaluator, true);
  assert.equal(popupState.noHorizontalOverflow, true);
  assert.ok(popupState.checkboxWidth <= 22);
  assert.ok(popupState.bodyWidth >= 300);
  assert.ok(popupState.popupWidth >= 300);
  assert.ok(popupState.popupWidth <= 340);
  assert.match(popupState.pillText, /high-pressure AI investing hype/);
  assert.ok(
    popupState.stored.twitterFilterCriteria.includes("high-pressure AI investing hype")
  );

  client.close();
} finally {
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => chrome.once("exit", resolve)),
    delay(2000).then(() => chrome.kill("SIGKILL"))
  ]);
  await rm(tmpDir, { recursive: true, force: true });
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await waitForExpression(client, "document.readyState === 'complete'");
}

async function waitForExpression(client, expression) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    const result = await evaluate(client, expression);

    if (result) {
      return;
    }

    await delay(100);
  }

  const diagnostic = await evaluate(client, `({
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText.slice(0, 300) : ""
  })`);
  throw new Error(`Timed out waiting for ${expression}: ${JSON.stringify(diagnostic)}`);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }

  return result.result.value;
}

async function waitForPageTarget(port) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    try {
      const targets = await requestJson(port, "/json/list");
      const page = targets.find((target) => target.type === "page");

      if (page) {
        return page;
      }
    } catch (error) {
      // Chrome is still starting.
    }

    await delay(100);
  }

  throw new Error("Timed out waiting for Chrome remote debugging target");
}

function requestJson(port, pathName) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: pathName }, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
