#!/usr/bin/env node
// Captures the Chrome Web Store screenshots (1280x800) into docs/store-assets/
// with the extension loaded against live sites.
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
const searchUrl = "https://www.youtube.com/results?search_query=surfing";
const fontCandidates = [
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
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

const raw = {};

await withChrome([`--load-extension=${root}`], async (client, port) => {
  const targets = await requestJson(port, "/json");
  const worker = targets.find((target) => (target.url || "").includes("/src/background.js"));

  if (!worker) {
    throw new Error(
      "Extension did not load. Branded Chrome 137+ ignores --load-extension; use Chrome for Testing."
    );
  }

  const extensionId = new URL(worker.url).hostname;

  await navigate(client, searchUrl, 10000);
  raw.youtubeClean = await shoot(client, "youtube-clean");

  await navigate(client, "https://news.ycombinator.com/", 5000);
  raw.hackerNews = await shoot(client, "hn-clean");

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 340,
    height: 1500,
    deviceScaleFactor: 2,
    mobile: false
  });
  await navigate(client, `chrome-extension://${extensionId}/popup.html`, 1500);
  raw.popup = await shoot(client, "popup");
});

await withChrome([], async (client) => {
  await navigate(client, searchUrl, 10000);
  raw.youtubeRaw = await shoot(client, "youtube-raw");
});

const font = fontCandidates.find((candidate) => existsSync(candidate));
const label = (text, color) =>
  font
    ? `,drawtext=fontfile=${font}:text='${text}':x=24:y=24:fontsize=40:fontcolor=white:box=1:boxcolor=${color}:boxborderw=14`
    : "";

compose(
  ["-i", raw.youtubeRaw, "-i", raw.youtubeClean],
  `[0]crop=928:1160:300:140,scale=640:800${label("Before", "black@0.65")}[l];` +
    `[1]crop=928:1160:300:440,scale=640:800${label("After", "0x176b5d@0.85")}[r];` +
    "[l][r]hstack",
  "shot-1-before-after.png"
);
compose(
  ["-i", raw.youtubeClean, "-i", raw.popup],
  "[1]crop=680:1180:0:0[p];[0][p]overlay=1800:210,scale=1280:800",
  "shot-2-popup.png"
);
compose(["-i", raw.hackerNews], "scale=1280:800", "shot-3-hn.png");

console.log("store assets written to", outDir);

function compose(inputs, filter, name) {
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", filter,
    path.join(outDir, name)
  ]);
  console.log("composed", name);
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

async function navigate(client, url, settleMs) {
  await client.send("Page.navigate", { url });
  await delay(settleMs);
}

async function shoot(client, name) {
  const shot = await client.send("Page.captureScreenshot", { format: "png" });
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

