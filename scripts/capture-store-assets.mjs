#!/usr/bin/env node
// Renders the Chrome Web Store graphics (and the README images, which reuse
// them) into docs/store-assets/.
//
// It loads the real extension with realistic sample data, captures the popup,
// the Hidden posts page, and a live loading-delay countdown, then composes each
// capture into a 1280x800 card from an HTML template. A 440x280 promo tile is
// rendered the same way. No ffmpeg or network access is needed.
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

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "store-assets");
const cacheDir = path.join(root, ".cache");
const workDir = await mkdtemp(path.join(os.tmpdir(), "smooth-surfer-assets-"));

const RULES = {
  fomo: "Content that aims primarily to evoke a sense of FOMO at missed upside, financial or otherwise.",
  bait: "Engagement bait that asks for replies, likes, reposts, follows, bookmarks, or quote tweets.",
  tags: "Promotional posts overloaded with hashtags or cashtags."
};

// Composed cards, in store order. `shot` names a capture below.
const CARDS = [
  {
    file: "01-overview.png",
    shot: "popup-overview",
    eyebrow: "YouTube · X · Reddit · Substack · Hacker News",
    title: "Calmer feeds,<br>already working.",
    body: "No Shorts, feed ads, or recommendation rabbit holes. Every switch says what it does, and every section says what’s on."
  },
  {
    file: "02-ai-filter.png",
    shot: "popup-ai",
    bare: true,
    eyebrow: "AI filter",
    title: "Hide posts you’d<br>rather not see.",
    body: "Describe them in plain words. Use Claude with your own key, or Chrome’s on-device model."
  },
  {
    file: "03-hidden-posts.png",
    shot: "review",
    wide: true,
    eyebrow: "Hidden posts",
    title: "Check every call.",
    body: "Mark each hidden post a right or wrong call, then improve your rules from your answers."
  },
  {
    file: "04-loading-delay.png",
    shot: "countdown",
    wide: true,
    eyebrow: "Loading delays",
    title: "A pause before<br>habit sites.",
    body: "A short countdown that grows each time you visit the same site that day. Leaving early doesn’t count."
  },
  {
    file: "05-pinned-tabs.png",
    shot: "popup-pins",
    bare: true,
    eyebrow: "Pinned tabs",
    title: "Pins in every<br>window.",
    body: "Press ⌘⇧P (Alt+P on Windows) to pin a tab. It shows up in every Chrome window, always at the page you pinned."
  }
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
  const image = pathToFileURL(path.join(workDir, `${card.shot}.png`)).href;
  return page(
    `
    .card { position: relative; display: grid; grid-template-columns: ${card.wide ? "360px 1fr" : "1fr 420px"}; gap: ${card.wide ? 48 : 64}px; align-items: center; height: 100%; padding: 0 72px; }
    .dots { position: absolute; inset: 40px 0 60px ${card.wide ? 380 : 620}px; background-image: radial-gradient(#cecfbb 1px, transparent 1px); background-size: 14px 14px; mask-image: radial-gradient(ellipse, #000 25%, transparent 70%); }
    .copy { position: relative; display: grid; gap: 20px; }
    .eyebrow { display: flex; align-items: center; gap: 10px; color: #64655b; font: 13px/1.5 var(--mono); }
    .eyebrow::before { content: ""; width: 9px; height: 9px; border: 1px solid #20221e; border-radius: 50%; background: #e3ff73; }
    h1 { margin: 0; font: 700 ${card.wide ? 46 : 58}px/1.05 var(--mono); letter-spacing: -3px; }
    p { margin: 0; max-width: 460px; color: #53564c; font: 20px/1.55 Arial, Helvetica, sans-serif; }
    .shot { position: relative; justify-self: center; max-height: 660px; max-width: 100%; border: 1px solid #20221e; border-radius: 10px; background: #fffef9; box-shadow: 6px 7px 0 #e7e7dc; overflow: hidden; }
    .shot img { display: block; max-height: 658px; max-width: ${card.wide ? 740 : 420}px; }
    .shot.bare { border: 0; border-radius: 0; background: none; box-shadow: none; }
    .brand { position: absolute; left: 72px; bottom: 34px; display: flex; align-items: center; gap: 10px; font: 700 15px var(--mono); letter-spacing: -0.5px; }
    .brand img { width: 26px; height: 26px; border-radius: 6px; }
    .url { position: absolute; right: 72px; bottom: 38px; color: #64655b; font: 12px var(--mono); }
    `,
    `<div class="card">
      <div class="dots"></div>
      ${copy(card)}${figure(image, card.bare)}
      <div class="brand"><img src="${iconUrl()}" alt="">Smooth Surfer</div>
      <div class="url">github.com/nishu-builder/smooth-surfer</div>
    </div>`
  );
}

function copy(card) {
  return `<div class="copy"><div class="eyebrow">${card.eyebrow}</div><h1>${card.title}</h1><p>${card.body}</p></div>`;
}

function figure(image, bare) {
  return `<div class="shot${bare ? " bare" : ""}"><img src="${image}" alt=""></div>`;
}

function tileHtml() {
  return page(
    `
    .tile { position: relative; display: grid; align-content: center; gap: 14px; height: 100%; padding: 0 34px; background-image: radial-gradient(#cecfbb 1px, transparent 1px); background-size: 12px 12px; }
    .row { display: flex; align-items: center; gap: 14px; }
    .row img { width: 64px; height: 64px; border: 1px solid #20221e; border-radius: 14px; box-shadow: 3px 4px 0 #e7e7dc; transform: rotate(-3deg); }
    h1 { margin: 0; padding: 0 6px; background: #fffdf4; font: 700 30px/1.1 var(--mono); letter-spacing: -1.5px; }
    p { justify-self: start; margin: 0; padding: 6px 12px; border: 1px solid #20221e; border-radius: 5px; background: #e3ff73; box-shadow: 2px 3px 0 #dfdfd1; font: 14px/1.4 var(--mono); }
    `,
    `<div class="tile"><div class="row"><img src="${iconUrl()}" alt=""><h1>Smooth<br>Surfer</h1></div><p>Calmer feeds, already working.</p></div>`
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

// A stand-in page for the countdown capture; the overlay covers it entirely.
function startSiteServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Home / X</title><body></body>");
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

// Run after the class and helpers above are initialized.
await mkdir(outDir, { recursive: true });
const chromeBin = await findChrome();
console.log("using chrome:", chromeBin);

const site = await startSiteServer();
try {
  await withChrome(
    [`--load-extension=${root}`, `--host-resolver-rules=MAP x.com 127.0.0.1`],
    async (client, port) => {
      const worker = await waitForWorker(port);
      const extension = `chrome-extension://${new URL(worker.url).hostname}`;
      const workerClient = await CdpClient.connect(worker.webSocketDebuggerUrl);
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
        ["popup-ai", ["[data-filter-panel]"]],
        ["popup-pins", ["[data-pinned-tabs-panel]"]]
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

      await setViewport(client, 760, 480, 2);
      await navigate(client, `http://x.com:${site.port}/home`, 2600);
      await capture(client, "countdown");

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
