#!/usr/bin/env node
// Renders the Chrome Web Store graphics (and the README images, which reuse
// them) into docs/store-assets/.
//
// It loads the real extension with sample data, captures the popup, the Hidden
// posts and Stats pages, a live loading-delay countdown, and tab search, then
// lays each image's captures side by side on a plain 1280x800 page (the size
// the store requires). The images carry no copy of their own. A 440x280 promo
// tile is rendered the same way. No ffmpeg or network access is needed.
//
// Usage: node scripts/capture-store-assets.mjs
//
// Requires a Chrome build that honors --load-extension (branded Chrome 137+
// does not): set CHROME_BIN to Chrome for Testing, keep one under .cache/, or on
// Linux let the script download it.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "store-assets");
const cacheDir = path.join(root, ".cache");
const workDir = await mkdtemp(path.join(os.tmpdir(), "smooth-surfer-assets-"));

const RULES = {
  fomo: "Content that aims primarily to evoke a sense of FOMO at missed upside, financial or otherwise.",
  bait: "Engagement bait that asks for replies, likes, reposts, follows, bookmarks, or quote tweets.",
  tags: "Promotional posts overloaded with hashtags or cashtags."
};

// Sample tabs for the tab search capture, served locally under *.example.
const SAMPLE_TABS = [
  {
    key: "reading",
    host: "read.example",
    path: "/weekend",
    title: "Weekend reading list",
    color: [0x5b, 0x8c, 0x5a]
  },
  {
    key: "inbox",
    host: "mail.example",
    path: "/inbox",
    title: "Inbox (3)",
    color: [0x26, 0x6d, 0xd3],
    pinned: true
  },
  {
    key: "roadmap",
    host: "plans.example",
    path: "/q3",
    title: "Q3 roadmap",
    color: [0x6e, 0x4b, 0xc9],
    pinned: true
  },
  {
    key: "review",
    host: "docs.example",
    path: "/design-review",
    title: "Design review notes",
    color: [0xe0, 0x8a, 0x1e]
  },
  {
    key: "pull",
    host: "code.example",
    path: "/smooth-surfer/pull/52",
    title: "Pull request #52 · smooth-surfer",
    color: [0x20, 0x22, 0x1e]
  },
  {
    key: "tunes",
    host: "tunes.example",
    path: "/lofi",
    title: "Lo-fi beats to focus to",
    color: [0xd9, 0x3a, 0x3a]
  }
];

// Images, in store order. Each lists the captures it shows, left to right, with
// the width each is drawn at. `bare` captures are popup sections that already
// carry their own border and shadow.
const CARDS = [
  {
    file: "01-attention.png",
    shots: [
      { name: "popup-overview", width: 360 },
      { name: "popup-youtube", width: 366, bare: true }
    ]
  },
  {
    file: "02-filter.png",
    shots: [
      { name: "popup-ai", width: 366, bare: true },
      { name: "review", width: 760 }
    ]
  },
  {
    file: "03-loading-delay.png",
    shots: [
      { name: "countdown", width: 760 },
      { name: "popup-delays", width: 366, bare: true }
    ]
  },
  {
    file: "04-browser-controls.png",
    shots: [
      { name: "popup-pins", width: 366, bare: true },
      { name: "popup-everywhere", width: 366, bare: true }
    ]
  },
  {
    file: "05-consumption-facts.png",
    shots: [
      { name: "facts", width: 420, bare: true },
      { name: "stats", width: 700 }
    ]
  },
  { file: "06-tab-search.png", shots: [{ name: "tab-search", width: 1060 }] }
];

// ---------------------------------------------------------------- Sample data

function seedExpression() {
  const at = Date.now();
  const post = (id, source, name, handle, text, criteria, reasons, minutesAgo) => ({
    id,
    source,
    text,
    author: name,
    url:
      source === "twitter"
        ? `https://x.com/${handle.slice(1)}/status/${id}`
        : `https://www.reddit.com/r/example/comments/${id}`,
    criteria,
    images: [],
    formats: [],
    reasons,
    at: at - minutesAgo * 60000,
    display: { name, handle, text }
  });
  const review = {
    items: [
      post(
        "1901",
        "twitter",
        "Giveaway Galaxy",
        "@giveawaygalaxy",
        "🚨 GIVEAWAY 🚨\n\nLike, repost, and follow to win a new laptop. Tag 3 friends who need one!",
        [RULES.bait],
        ["Asks for reposts and follows to enter a giveaway"],
        12
      ),
      post(
        "1902",
        "twitter",
        "Moonshot Daily",
        "@moonshotdaily",
        "If you’re not in this token by Friday, you’ll be watching everyone else retire early. Don’t say I didn’t warn you. #crypto #100x #wagmi #nfa",
        [RULES.fomo, RULES.tags],
        ["Frames missed gains as a looming loss", "Stacks promotional cashtags and hashtags"],
        48
      ),
      post(
        "1903",
        "reddit",
        "u/growthhacker42",
        "",
        "Comment “GUIDE” and I’ll DM you the exact playbook I used to 10x my following in 30 days.",
        [RULES.bait],
        ["Asks for comments in exchange for a reward"],
        95
      )
    ],
    restored: []
  };
  const hours = (...pairs) => {
    const list = Array(24).fill(0);
    for (const [hour, count] of pairs) list[hour] = count;
    return list;
  };
  return `(async () => {
    const S = SmoothSurferSettings, store = SmoothSurferStorage;
    await store.saveSettings({ ...S.DEFAULT_SETTINGS, visitDelaySeconds: 5 });
    await store.saveSecrets({ anthropicApiKey: "sk-ant-sample-key-for-screenshots" });
    const day = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
    await store.saveStats({ days: { [day]: {
      youtube: { Recommendations: 21, Shorts: 9 },
      twitter: { Ads: 7, "Engagement bait": 6, Trends: 3 },
      reddit: { Ads: 4, Recommendations: 5 }
    } } });
    const visitDay = S.getVisitDelayDayKey();
    const entry = (step, waitedMs, hourPairs) => ({ step, loads: step + 1, starts: step, completed: step, abandoned: 0, resets: 0, waitedMs, hours: (${hours.toString()})(...hourPairs) });
    await store.saveVisitDelay({ days: { [visitDay]: {
      "x.com": entry(2, 13000, [[9, 1], [13, 1]]),
      "youtube.com": entry(1, 5000, [[20, 1]])
    } } });
    await store.saveReview(${JSON.stringify(review)});
    await store.saveConsumption({ days: { [day]: { twitter: { posts: 184, tags: {
      "curiosity-beauty": 41, humor: 33, joy: 18, "outrage-political": 27, "outrage-callout": 12,
      "fear-societal": 9, "fear-existential": 6, poll: 4
    } } } } });
    return true;
  })()`;
}

// Opens the given section (or none) and returns the clip rectangle: the whole
// popup for the overview, otherwise just that section with its offset shadow.
function popupExpression(open) {
  return `(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const section = ${JSON.stringify(open[0] || "")} && document.querySelector(${JSON.stringify(open[0] || "body")});
    if (section) {
      const details = section.querySelector(":scope > details");
      details.removeAttribute("name");
      details.open = true;
      for (const other of document.querySelectorAll(".popup > *"))
        if (other !== section) other.style.visibility = "hidden";
      section.style.borderRadius = "8px";
      section.style.boxShadow = "4px 5px 0 var(--ss-stamp)";
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const box = (section || document.querySelector(".popup")).getBoundingClientRect();
    const pad = section ? 2 : 0;
    return { x: box.left - pad, y: box.top - pad + scrollY, width: box.width + pad + 6, height: box.height + pad + 7 };
  })()`;
}

// ------------------------------------------------------------------ Templates

function cardHtml(card) {
  return page(
    `
    .card { display: flex; gap: 40px; align-items: center; justify-content: center; height: 100%; }
    .shot { flex: none; border: 1px solid #20221e; border-radius: 10px; background: #fffef9; box-shadow: 6px 7px 0 #e7e7dc; overflow: hidden; }
    .shot img { display: block; max-height: 716px; }
    .shot.bare { border: 0; border-radius: 0; background: none; box-shadow: none; }
    `,
    `<div class="card">${card.shots.map(figure).join("")}</div>`
  );
}

function figure(shot) {
  const image = pathToFileURL(path.join(workDir, `${shot.name}.png`)).href;
  return `<div class="shot${shot.bare ? " bare" : ""}"><img src="${image}" alt="" style="max-width: ${shot.width}px"></div>`;
}

function tileHtml() {
  return page(
    `
    .tile { display: flex; align-items: center; justify-content: center; gap: 18px; height: 100%; }
    .tile img { width: 72px; height: 72px; border: 1px solid #20221e; border-radius: 16px; }
    h1 { margin: 0; font: 700 32px/1.1 var(--mono); letter-spacing: -1.5px; }
    `,
    `<div class="tile"><img src="${iconUrl()}" alt=""><h1>Smooth<br>Surfer</h1></div>`
  );
}

function page(css, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { --mono: "SFMono-Regular", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #fffdf4; color: #20221e; -webkit-font-smoothing: antialiased; }
    ${css}
  </style></head><body>${body}</body></html>`;
}

function iconUrl() {
  return pathToFileURL(path.join(root, "icons", "icon128.png")).href;
}

// --------------------------------------------------------------- Chrome glue

async function renderHtml(client, html, filePath) {
  const source = path.join(workDir, `${path.basename(filePath, ".png")}.html`);
  await writeFile(source, html);
  await navigate(client, pathToFileURL(source).href, 700);
  const shot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(filePath, Buffer.from(shot.data, "base64"));
  console.log("wrote", path.relative(root, filePath));
}

async function capture(client, name, clip) {
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: Boolean(clip),
    ...(clip ? { clip: { ...clip, scale: 1 } } : {})
  });
  await writeFile(path.join(workDir, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log("captured", name);
}

async function setViewport(client, width, height, deviceScaleFactor) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: false
  });
}

// A 32x32 rounded square in one color, as a stand-in site icon.
function solidPng([r, g, b]) {
  const size = 32;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const dx = Math.max(0, Math.abs(x - 15.5) - 9);
      const dy = Math.max(0, Math.abs(y - 15.5) - 9);
      row.push(r, g, b, Math.hypot(dx, dy) <= 6.5 ? 255 : 0);
    }
    rows.push(Buffer.from(row));
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([length, Buffer.from(type), data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// Opens the sample tabs in their own window, presses the tab search shortcut
// in the front one, and types a short query so matches are highlighted.
async function captureTabSearch(port, worker) {
  const workerClient = await CdpClient.connect(worker.webSocketDebuggerUrl);
  const [first, ...rest] = SAMPLE_TABS.map((tab) => ({
    ...tab,
    url: `http://${tab.host}:${site.port}${tab.path}`
  }));
  await evaluate(
    workerClient,
    `(async () => {
      const window = await chrome.windows.create({ url: ${JSON.stringify(first.url)}, focused: true });
      for (const tab of ${JSON.stringify(rest)})
        await chrome.tabs.create({ windowId: window.id, url: tab.url, pinned: Boolean(tab.pinned), active: false });
      return true;
    })()`
  );
  // Let every page load so Chrome caches its icon.
  await delay(3000);
  workerClient.close();
  const target = (await requestJson(port, "/json/list")).find((entry) => entry.url === first.url);
  const page = await CdpClient.connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }]
  });
  await page.send("Page.bringToFront");
  await setViewport(page, 900, 560, 2);
  const mac = await evaluate(page, `/Mac/.test(navigator.platform)`);
  for (const type of ["keyDown", "keyUp"])
    await page.send("Input.dispatchKeyEvent", {
      type,
      key: "k",
      code: "KeyK",
      windowsVirtualKeyCode: 75,
      modifiers: mac ? 4 : 2
    });
  await delay(600);
  await page.send("Input.insertText", { text: "re" });
  await delay(400);
  await capture(page, "tab-search");
  page.close();
}

// A stand-in page for the countdown capture; the overlay covers it entirely.
function startSiteServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const host = (request.headers.host || "").split(":")[0];
      const sample = SAMPLE_TABS.find((tab) => tab.host === host);
      if (sample && request.url === "/icon.png") {
        response.writeHead(200, { "content-type": "image/png" });
        response.end(solidPng(sample.color));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        sample
          ? `<!doctype html><title>${sample.title}</title><link rel="icon" href="/icon.png"><body style="margin:0;padding:48px 64px;font:17px/1.6 Georgia,serif;color:#333;background:#fff"><h1 style="font:600 30px system-ui">${sample.title}</h1>${"<p>Notes, links, and a few long reads saved for a slow Saturday morning.</p>".repeat(6)}</body>`
          : "<!doctype html><title>Home / X</title><body></body>"
      );
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ port: server.address().port, close: () => server.close() })
    );
  });
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
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const { result, exceptionDetails } = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (exceptionDetails)
    throw new Error(exceptionDetails.exception?.description || "Runtime.evaluate failed");
  return result.value;
}

async function navigate(client, url, settleMs) {
  await client.send("Page.navigate", { url });
  await delay(settleMs);
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    path.join(
      cacheDir,
      "chrome-mac-arm64",
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing"
    ),
    path.join(cacheDir, "chrome-linux64", "chrome")
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  if (process.platform !== "linux")
    throw new Error("Set CHROME_BIN to a Chrome for Testing binary.");

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
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--allow-file-access-from-files",
    "--force-color-profile=srgb",
    "--hide-scrollbars",
    "--window-size=1280,800",
    "--lang=en-US",
    ...extraArgs,
    "about:blank"
  ]);
  chrome.stderr.on("data", () => {});

  try {
    let target = null;
    for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
      try {
        target = (await requestJson(port, "/json/list")).find(
          (entry) => entry.type === "page" && entry.url === "about:blank"
        );
      } catch {
        // Chrome is still starting.
      }
      if (!target) await delay(200);
    }
    if (!target) throw new Error("Timed out waiting for Chrome page target");
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }]
    });
    await callback(client, port);
    client.close();
  } finally {
    chrome.kill("SIGTERM");
    await delay(800);
    chrome.kill("SIGKILL");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function waitForWorker(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const worker = (await requestJson(port, "/json")).find((target) =>
      (target.url || "").endsWith("/src/background.js")
    );
    if (worker) return worker;
    await delay(200);
  }
  throw new Error(
    "Extension did not load. Branded Chrome 137+ ignores --load-extension; use Chrome for Testing."
  );
}

function requestJson(port, pathName, raw = false) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: pathName }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            resolve(raw ? body : JSON.parse(body));
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

// Run after the class and helpers above are initialized. A stuck Chrome
// (for example, a port clash with a leftover instance) fails instead of hanging.
const watchdog = setTimeout(() => {
  console.error("Timed out after 120s. Close leftover Chrome for Testing windows and retry.");
  process.exit(1);
}, 120000);
await mkdir(outDir, { recursive: true });
const chromeBin = await findChrome();
console.log("using chrome:", chromeBin);

const site = await startSiteServer();
try {
  await withChrome(
    [
      `--load-extension=${root}`,
      `--host-resolver-rules=MAP x.com 127.0.0.1, MAP *.example 127.0.0.1`
    ],
    async (client, port) => {
      const worker = await waitForWorker(port);
      const extension = `chrome-extension://${new URL(worker.url).hostname}`;
      const workerClient = await CdpClient.connect(worker.webSocketDebuggerUrl);
      // The worker target appears before its scripts finish loading, and an
      // evaluation sent that early can stall. Poll until storage is ready.
      for (let attempt = 0; ; attempt += 1) {
        const ready = await Promise.race([
          evaluate(workerClient, `typeof SmoothSurferStorage === "object"`).catch(() => false),
          delay(1000).then(() => false)
        ]);
        if (ready) break;
        if (attempt > 30) throw new Error("The extension worker never finished loading.");
        await delay(250);
      }
      await evaluate(workerClient, seedExpression());
      workerClient.close();
      // Close the first-install welcome tab so the capture tab stays visible;
      // the countdown only runs in a visible tab.
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const welcome = (await requestJson(port, "/json/list")).find((target) =>
          target.url.endsWith("/welcome.html")
        );
        if (welcome) {
          await requestJson(port, `/json/close/${welcome.id}`, true);
          break;
        }
        await delay(100);
      }

      await client.send("Page.bringToFront");

      // Popup captures at the toolbar popup's natural width.
      await setViewport(client, 360, 1400, 2);
      for (const [name, open] of [
        ["popup-overview", []],
        ["popup-youtube", ['[data-site-section="youtube"]']],
        ["popup-ai", ["[data-filter-panel]"]],
        ["popup-delays", ["[data-visit-delay-panel]"]],
        ["popup-pins", ["[data-pinned-tabs-panel]"]],
        ["popup-everywhere", ["[data-everywhere-panel]"]]
      ]) {
        await navigate(client, `${extension}/popup.html`, 1200);
        const clip = await evaluate(client, popupExpression(open));
        await capture(client, name, clip);
      }

      await setViewport(client, 1060, 700, 2);
      await navigate(client, `${extension}/review.html`, 1500);
      await evaluate(
        client,
        `(() => { const view = document.getElementById("post-view"); view.value = "saved"; view.dispatchEvent(new Event("change")); })()`
      );
      await delay(500);
      await capture(client, "review");

      await navigate(client, `${extension}/popup.html?view=stats`, 1500);
      await capture(client, "stats");
      // The Consumption Facts label sits below the fold; capture it on its own.
      const facts = await evaluate(
        client,
        `(() => { const box = document.querySelector("[data-facts-label]").getBoundingClientRect(); return { x: box.left - 2, y: box.top - 2 + scrollY, width: box.width + 10, height: box.height + 11 }; })()`
      );
      await capture(client, "facts", facts);

      await setViewport(client, 760, 480, 2);
      await navigate(client, `http://x.com:${site.port}/home`, 2600);
      await capture(client, "countdown");
      await captureTabSearch(port, worker);

      for (const card of CARDS) {
        await setViewport(client, 1280, 800, 1);
        await renderHtml(client, cardHtml(card), path.join(outDir, card.file));
      }
      await setViewport(client, 440, 280, 1);
      await renderHtml(client, tileHtml(), path.join(outDir, "promo-tile-440x280.png"));
    }
  );
} finally {
  site.close();
  await rm(workDir, { recursive: true, force: true });
}
console.log("store assets written to", outDir);
clearTimeout(watchdog);
