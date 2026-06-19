#!/usr/bin/env node
// Captures the Chrome Web Store screenshots (1280x800) into docs/store-assets/.
// The shots walk through the toolbar popup itself: the full menu is rendered
// with the extension loaded, then sliced at section boundaries into a handful
// of readable panels centered on a brand-colored canvas.
//
// Usage: node scripts/capture-store-assets.mjs
//
// Requirements:
// - ffmpeg on PATH (composition); unzip on PATH (Chrome download)
// - A Chrome build that supports --load-extension. Branded Google Chrome 137+
//   ignores that flag, so this script uses Chrome for Testing: set CHROME_BIN,
//   or let the script download linux64 Chrome for Testing into .cache/.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "store-assets");
const cacheDir = path.join(root, ".cache");
const canvas = { width: 1280, height: 800, background: "0x176b5d" };
// Popup body is 320px wide; at deviceScaleFactor 2 the column is 640px.
const popupColumnWidth = 640;
// Curated section groups, one store screenshot each. Labels match a section's
// data-site-section or its lowercased <h2>; "header" is the title row. Stats
// and Backup are left out of the store set as utility sections.
const groups = [
  ["header", "youtube"],
  ["twitter", "reddit", "substack", "hacker-news"],
  ["content filter", "everywhere", "focus schedule"],
  ["consumption facts"]
];

await mkdir(outDir, { recursive: true });

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

const chromeBin = await findChrome();
console.log("using chrome:", chromeBin);

await withChrome([`--load-extension=${root}`], async (client, port) => {
  const worker = await waitForWorker(port);
  const extensionId = new URL(worker.url).hostname;

  // Narrow viewport so the popup renders at its natural 320px width; the body
  // cap is lifted in setup so the whole menu lays out for a full-page capture.
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });
  await navigate(client, `chrome-extension://${extensionId}/popup.html`, 1200);
  await evaluate(client, popupSetupExpression());
  await delay(700);

  const menuPng = await shootFull(client, "menu");
  const blocks = await evaluate(client, blocksExpression());

  composeMenuShots(menuPng, blocks);
});

console.log("store assets written to", outDir);

function composeMenuShots(menuPng, blocks) {
  const byLabel = new Map(blocks.map((block) => [block.label, block]));
  let written = 0;

  groups.forEach((labels, index) => {
    const members = labels.map((label) => byLabel.get(label)).filter(Boolean);

    if (members.length === 0) {
      console.warn(`no sections found for group ${labels.join(", ")}; skipped`);
      return;
    }

    const top = Math.min(...members.map((member) => member.top));
    const bottom = Math.max(...members.map((member) => member.bottom));
    const y = Math.max(0, Math.round(top * 2 - 8));
    const h = Math.round((bottom - top) * 2 + 16);

    compose(
      ["-i", menuPng],
      `crop=${popupColumnWidth}:${h}:0:${y},` +
        `scale=520:764:force_original_aspect_ratio=decrease,` +
        `pad=${canvas.width}:${canvas.height}:(${canvas.width}-iw)/2:(${canvas.height}-ih)/2:color=${canvas.background}`,
      `shot-${index + 1}-menu.png`
    );
    written += 1;
  });

  console.log(`composed ${written} menu shots`);
}

function compose(inputs, filter, name) {
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", filter,
    path.join(outDir, name)
  ]);
  console.log("composed", name);
}

function popupSetupExpression() {
  return `(() => {
    document.body.style.maxHeight = "none";
    document.body.style.overflow = "visible";
    const d = new Date();
    const key =
      d.getFullYear() +
      "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
    const data = { days: { [key]: { twitter: { posts: 86, tags: {
      "outrage-political": 14, "outrage-callout": 6, "outrage-other": 4,
      "joy": 11, "humor": 17,
      "fear-existential": 5, "fear-safety": 3, "fear-societal": 4, "fear-political": 7,
      "curiosity-beauty": 13, "poll": 4, "meme": 9
    } } } } };
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ smoothSurferConsumption: data }, () => resolve(true));
      } else {
        resolve(false);
      }
    });
  })()`;
}

function blocksExpression() {
  return `(() => {
    const blocks = Array.from(document.querySelectorAll(".popup > header, .popup > section"));
    return blocks.map((el) => {
      let label = "header";
      if (el.tagName.toLowerCase() === "section") {
        const h2 = el.querySelector("h2");
        label = el.getAttribute("data-site-section") || (h2 ? h2.textContent.trim().toLowerCase() : "");
      }
      const r = el.getBoundingClientRect();
      return { label, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    });
  })()`;
}

async function evaluate(client, expression) {
  const { result, exceptionDetails } = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (exceptionDetails) {
    throw new Error(
      (exceptionDetails.exception && exceptionDetails.exception.description) || "Runtime.evaluate failed"
    );
  }

  return result.value;
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    path.join(cacheDir, "chrome-linux64", "chrome")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform !== "linux") {
    throw new Error("Set CHROME_BIN to a Chrome for Testing binary.");
  }

  console.log("downloading Chrome for Testing...");
  await mkdir(cacheDir, { recursive: true });

  const versions = await (
    await fetch(
      "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
    )
  ).json();
  const download = versions.channels.Stable.downloads.chrome.find(
    (entry) => entry.platform === "linux64"
  );
  const zipPath = path.join(cacheDir, "chrome-linux64.zip");

  await writeFile(zipPath, Buffer.from(await (await fetch(download.url)).arrayBuffer()));
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", cacheDir]);

  return path.join(cacheDir, "chrome-linux64", "chrome");
}

async function withChrome(extraArgs, callback) {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "store-assets-profile-"));
  const port = 9500 + Math.floor(Math.random() * 400);
  const chrome = spawn(chromeBin, [
    "--headless=new",
    // Cloud sandboxes often sit behind a TLS-intercepting proxy whose CA
    // Chrome does not trust; this only affects screenshot capture.
    "--ignore-certificate-errors",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    "--disable-sync",
    "--window-size=1280,800",
    "--lang=en-US",
    ...extraArgs,
    "about:blank"
  ]);

  chrome.stderr.on("data", () => {});

  try {
    let page = null;

    for (let attempt = 0; attempt < 100 && !page; attempt += 1) {
      try {
        const targets = await requestJson(port, "/json/list");
        page = targets.find((target) => target.type === "page");
      } catch {
        // Chrome is still starting.
      }

      if (!page) {
        await delay(200);
      }
    }

    if (!page) {
      throw new Error("Timed out waiting for Chrome page target");
    }

    const client = await CdpClient.connect(page.webSocketDebuggerUrl);

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });
    await callback(client, port);
    client.close();
  } finally {
    chrome.kill("SIGTERM");
    await delay(800);
    chrome.kill("SIGKILL");
  }
}

async function waitForWorker(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const targets = await requestJson(port, "/json");
    const worker = targets.find((target) => (target.url || "").includes("/src/background.js"));

    if (worker) {
      return worker;
    }

    await delay(200);
  }

  throw new Error(
    "Extension did not load. Branded Chrome 137+ ignores --load-extension; use Chrome for Testing."
  );
}

async function navigate(client, url, settleMs) {
  await client.send("Page.navigate", { url });
  await delay(settleMs);
}

async function shootFull(client, name) {
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true
  });
  const filePath = path.join(os.tmpdir(), `store-assets-${name}.png`);

  await writeFile(filePath, Buffer.from(shot.data, "base64"));
  console.log("captured", name);
  return filePath;
}

function requestJson(port, pathName) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: pathName }, (response) => {
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
      })
      .on("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
