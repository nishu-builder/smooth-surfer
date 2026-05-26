import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const fixturePort = await getFreePort();
const fixtureServer = createFixtureServer();

await listen(fixtureServer, fixturePort);

await writeFile(
  fixturePath,
  `<!doctype html>
  <html class="smooth-surfer-youtube-hide-recs smooth-surfer-youtube-gray smooth-surfer-youtube-hide-shorts smooth-surfer-youtube-hide-live-chat smooth-surfer-youtube-hide-end-screens smooth-surfer-youtube-hide-engagement smooth-surfer-twitter-hide-trends smooth-surfer-soften-distracting">
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
      <a id="shorts-link" href="/shorts/abc">Shorts</a>
      <div id="chat">Live chat should be hidden</div>
      <div id="end-screen" class="ytp-ce-element">End screen</div>
      <div id="owner-sub-count">1M subscribers</div>
      <div data-testid="trend" id="trend">Trending topic</div>
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
  "--host-resolver-rules=MAP youtube.com.test 127.0.0.1,MAP twitter.com.test 127.0.0.1,MAP github.com.test 127.0.0.1",
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
      shortsLink: display("#shorts-link"),
      chat: display("#chat"),
      endScreen: display("#end-screen"),
      subscriberCount: display("#owner-sub-count"),
      trend: display("#trend"),
      thumbFilter: getComputedStyle(document.querySelector("#thumb")).filter,
      coreWatchThumbFilter: getComputedStyle(document.querySelector("#core-watch-thumb")).filter,
      viewModelThumbFilter: getComputedStyle(document.querySelector("#view-model-thumb")).filter
    };
  })()`);

  assert.notEqual(youtubeStyles.homeGrid, "none");
  assert.notEqual(youtubeStyles.homeSection, "none");
  assert.equal(youtubeStyles.secondary, "none");
  assert.equal(youtubeStyles.related, "none");
  assert.equal(youtubeStyles.shortsLink, "none");
  assert.equal(youtubeStyles.chat, "none");
  assert.equal(youtubeStyles.endScreen, "none");
  assert.equal(youtubeStyles.subscriberCount, "none");
  assert.equal(youtubeStyles.trend, "none");
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
    const criterion = document.querySelector("[data-criterion]");
    const criterionLabel = document.querySelector("[data-criterion-label]");
    const closedWhiteSpace = getComputedStyle(criterionLabel).whiteSpace;
    criterion.open = true;
    const toggleCount = document.querySelectorAll(".switch-row input[type='checkbox']").length;
    const describedToggleCount = document.querySelectorAll(".switch-row[data-description] input[type='checkbox']").length;
    return {
      hasFilterLabel: Boolean(filterLabel),
      hasOldFilterLabel: document.body.textContent.includes("Filter AI-upside FOMO"),
      hasEvaluator: Boolean(document.querySelector("[data-setting='twitterClassifierMode']")),
      hasCriteriaDisclosure: criterion.tagName === "DETAILS",
      toggleCount,
      describedToggleCount,
      closedWhiteSpace,
      openWhiteSpace: getComputedStyle(criterionLabel).whiteSpace,
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
  assert.equal(popupState.hasCriteriaDisclosure, true);
  assert.equal(popupState.describedToggleCount, popupState.toggleCount);
  assert.equal(popupState.closedWhiteSpace, "nowrap");
  assert.equal(popupState.openWhiteSpace, "normal");
  assert.equal(popupState.noHorizontalOverflow, true);
  assert.ok(popupState.checkboxWidth <= 22);
  assert.ok(popupState.bodyWidth >= 300);
  assert.ok(popupState.popupWidth >= 300);
  assert.ok(popupState.popupWidth <= 340);
  assert.match(popupState.pillText, /high-pressure AI investing hype/);
  assert.match(popupState.pillText, /missed upside/);
  assert.match(popupState.pillText, /one short sentence/);
  assert.ok(
    popupState.stored.twitterFilterCriteria.includes("high-pressure AI investing hype")
  );

  await navigate(client, `http://youtube.com.test:${fixturePort}/youtube-content.html`);
  await waitForExpression(
    client,
    `document.querySelector("#shorts-section").classList.contains("smooth-surfer-hidden")`
  );
  const youtubeContentState = await evaluate(client, `(() => ({
    shortsHidden: document.querySelector("#shorts-section").classList.contains("smooth-surfer-hidden"),
    gamesHidden: document.querySelector("#games-section").classList.contains("smooth-surfer-hidden"),
    autoplayClicked: document.querySelector("#autoplay").dataset.clicked === "true",
    stickyHidden: document.querySelector("#sticky-player").dataset.smoothSurferHiddenKind === "sticky-video"
  }))()`);

  assert.equal(youtubeContentState.shortsHidden, true);
  assert.equal(youtubeContentState.gamesHidden, true);
  assert.equal(youtubeContentState.autoplayClicked, true);
  assert.equal(youtubeContentState.stickyHidden, true);

  await evaluate(client, `window.scrollTo(0, window.innerHeight * 9); window.dispatchEvent(new Event("scroll"))`);
  await waitForExpression(client, `document.documentElement.classList.contains("smooth-surfer-scroll-paused")`);
  const scrollPauseState = await evaluate(client, `(() => {
    const pause = document.querySelector(".smooth-surfer-scroll-pause");
    pause.querySelector("button").click();
    return {
      wasVisible: Boolean(pause),
      isPaused: document.documentElement.classList.contains("smooth-surfer-scroll-paused")
    };
  })()`);

  assert.equal(scrollPauseState.wasVisible, true);
  assert.equal(scrollPauseState.isPaused, false);

  await navigate(client, `http://github.com.test:${fixturePort}/work-content.html`);
  await evaluate(client, `window.scrollTo(0, window.innerHeight * 9); window.dispatchEvent(new Event("scroll"))`);
  await evaluate(client, `new Promise((resolve) => setTimeout(resolve, 400))`);
  const workSiteState = await evaluate(client, `(() => ({
    isPaused: document.documentElement.classList.contains("smooth-surfer-scroll-paused"),
    hasPausePrompt: Boolean(document.querySelector(".smooth-surfer-scroll-pause")),
    stickyHidden: document.querySelector("#sticky-player").dataset.smoothSurferHiddenKind === "sticky-video",
    thumbFilter: getComputedStyle(document.querySelector("#work-image")).filter
  }))()`);

  assert.equal(workSiteState.isPaused, false);
  assert.equal(workSiteState.hasPausePrompt, false);
  assert.equal(workSiteState.stickyHidden, false);
  assert.equal(workSiteState.thumbFilter, "none");

  await navigate(client, `http://twitter.com.test:${fixturePort}/home`);
  await waitForExpression(
    client,
    `document.querySelector("#bait-cell").dataset.smoothSurferHiddenKind === "tweet"`
  );
  const twitterContentState = await evaluate(client, `(() => ({
    followingClicked: document.querySelector("#following-tab").dataset.clicked === "true",
    baitHidden: document.querySelector("#bait-cell").dataset.smoothSurferHiddenKind === "tweet",
    tagSpamHidden: document.querySelector("#tag-spam-cell").dataset.smoothSurferHiddenKind === "tweet",
    linkedinHidden: document.querySelector("#linkedin-cell").dataset.smoothSurferHiddenKind === "tweet",
    trendDisplay: getComputedStyle(document.querySelector("#trend-module")).display
  }))()`);

  assert.equal(twitterContentState.followingClicked, true);
  assert.equal(twitterContentState.baitHidden, true);
  assert.equal(twitterContentState.tagSpamHidden, true);
  assert.equal(twitterContentState.linkedinHidden, true);
  assert.equal(twitterContentState.trendDisplay, "none");

  client.close();
} finally {
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => chrome.once("exit", resolve)),
    delay(2000).then(() => chrome.kill("SIGKILL"))
  ]);
  await closeServer(fixtureServer);
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

function listen(server, listenPort) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      error ? reject(error) : resolve();
    });
  });
}

function createFixtureServer() {
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://localhost");

      if (requestUrl.pathname === "/youtube-content.html") {
        sendHtml(response, youtubeContentFixture());
        return;
      }

      if (requestUrl.pathname === "/twitter-content.html" || requestUrl.pathname === "/home") {
        sendHtml(response, twitterContentFixture());
        return;
      }

      if (requestUrl.pathname === "/work-content.html") {
        sendHtml(response, workContentFixture());
        return;
      }

      if (requestUrl.pathname.startsWith("/src/")) {
        await sendRepoFile(response, requestUrl.pathname.slice(1));
        return;
      }

      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
}

async function sendRepoFile(response, relativePath) {
  const filePath = path.join(root, relativePath);
  const body = await readFile(filePath, "utf8");
  const contentType = relativePath.endsWith(".css") ? "text/css" : "text/javascript";

  response.writeHead(200, { "content-type": contentType });
  response.end(body);
}

function sendHtml(response, body) {
  response.writeHead(200, { "content-type": "text/html" });
  response.end(body);
}

function youtubeContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/styles.css">
      <style>
        body { min-height: 7200px; margin: 0; }
        #sticky-player { position: fixed; right: 20px; bottom: 20px; width: 220px; height: 140px; }
        #sticky-player video { width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      <ytd-rich-section-renderer id="shorts-section">Shorts</ytd-rich-section-renderer>
      <ytd-rich-section-renderer id="games-section">Playables</ytd-rich-section-renderer>
      <button
        id="autoplay"
        aria-label="Autoplay is on"
        aria-pressed="true"
        onclick="this.dataset.clicked = 'true'; this.setAttribute('aria-pressed', 'false');"
      >
        Autoplay
      </button>
      <div id="sticky-player"><video></video></div>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/filter-rules.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function twitterContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/styles.css">
    </head>
    <body>
      <main>
        <button id="for-you-tab" role="tab" aria-selected="true">For you</button>
        <button
          id="following-tab"
          role="tab"
          aria-selected="false"
          onclick="this.dataset.clicked = 'true'; this.setAttribute('aria-selected', 'true'); document.querySelector('#for-you-tab').setAttribute('aria-selected', 'false');"
        >
          Following
        </button>
        <aside data-testid="trend" id="trend-module">Trending topic</aside>
        <div data-testid="cellInnerDiv" id="bait-cell">
          <article data-testid="tweet">
            <div data-testid="tweetText">Reply below if you agree.</div>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="tag-spam-cell">
          <article data-testid="tweet">
            <div data-testid="tweetText">#AI #NVDA #BTC #stocks #money this is the move</div>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="linkedin-cell">
          <article data-testid="tweet">
            <div data-testid="tweetText">After years of trying, I almost gave up.<br>
Then I learned one simple thing.<br>
Consistency beats intensity when nobody is watching.<br>
Trust compounds slowly before results appear.<br>
That changed everything for my work.</div>
          </article>
        </div>
      </main>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/filter-rules.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function workContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/styles.css">
      <style>
        body { min-height: 7200px; margin: 0; }
        article { margin: 20px; }
        #sticky-player { position: fixed; right: 20px; bottom: 20px; width: 220px; height: 140px; }
        #sticky-player video { width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      <article>
        <img id="work-image" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
      </article>
      <div id="sticky-player"><video></video></div>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/filter-rules.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
