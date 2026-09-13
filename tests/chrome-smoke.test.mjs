// Headless browser smoke test driven over the DevTools Protocol.
//
// Chrome resolution order: CHROME_BIN, macOS Google Chrome, a cached
// .cache/chrome-linux64 build, then (on Linux) an automatic Chrome for Testing
// download. Branded Chrome 137+ ignores --load-extension, so the extension-mode
// check needs Chrome for Testing. Set SKIP_CHROME_SMOKE=1 to skip entirely; the
// test also skips quietly when no browser can be resolved (e.g. offline macOS).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { verifyTwitterFeed, twitterFilterFixture } from "./twitter-feed.test.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache");

const chromePath = await resolveChrome();

if (!chromePath) {
  console.log("Skipping Chrome smoke test: no Chrome for Testing binary available.");
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
const port = Number(process.env.CHROME_DEBUG_PORT) || (await getFreePort());
const fixturePort = Number(process.env.FIXTURE_PORT) || (await getFreePort());
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
  "--no-sandbox",
  // /dev/shm is tiny on CI runners/containers; without this Chrome's tab can
  // hang on startup and never expose a debugging target.
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-component-update",
  "--allow-file-access-from-files",
  "--host-resolver-rules=MAP youtube.com.test 127.0.0.1,MAP twitter.com.test 127.0.0.1,MAP github.com.test 127.0.0.1,MAP reddit.com.test 127.0.0.1,MAP substack.com.test 127.0.0.1,MAP news.ycombinator.com.test 127.0.0.1",
  "about:blank"
]);

try {
  const target = await waitForPageTarget(port);
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  await navigate(client, pathToFileURL(fixturePath).href);
  const youtubeStyles = await evaluate(
    client,
    `(() => {
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
  })()`
  );

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
  const popupScript = await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.chrome = {
      runtime: {},
      tabs: {
        query(queryInfo, callback) {
          callback([{ id: 1, url: "https://www.reddit.com/r/news" }]);
        },
        sendMessage() {}
      }
    };`
  });
  await navigate(client, pathToFileURL(path.join(root, "popup.html")).href);
  await waitForExpression(client, `Boolean(document.querySelector("[data-phrase-input]"))`);
  const popupState = await evaluate(
    client,
    `(async () => {
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
      firstSection: document.querySelector("header + section h2").textContent,
      firstSectionActive: document.querySelector("header + section").dataset.activeSite,
      hasFilterLabel: Boolean(filterLabel),
      hasOldFilterLabel: document.body.textContent.includes("Filter AI-upside FOMO"),
      hasLegacyClassifierSelect: Boolean(document.querySelector("[data-setting='twitterClassifierMode']")),
      keyStatus: document.querySelector("[data-filter-key-status]").textContent,
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
  })()`
  );
  await client.send("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: popupScript.identifier
  });

  assert.equal(popupState.firstSection, "Reddit");
  assert.equal(popupState.firstSectionActive, "true");
  assert.equal(popupState.hasFilterLabel, true);
  assert.equal(popupState.hasOldFilterLabel, false);
  assert.equal(popupState.hasLegacyClassifierSelect, false);
  assert.match(popupState.keyStatus, /off until an Anthropic key is saved/);
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
  assert.ok(popupState.stored.filterCriteria.includes("high-pressure AI investing hype"));

  // Video speed keys (default Alt modifier) and the settings double-tap. The
  // fixture stubs chrome.runtime so requestOpenSettings has a sink to record.
  await navigate(client, `http://youtube.com.test:${fixturePort}/video-content.html`);
  await waitForExpression(client, `Boolean(window.SmoothSurferSettings)`);
  const speedState = await evaluate(
    client,
    `(() => {
    const video = document.querySelector("#speed-video");
    const press = (code, modifiers = {}) =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", Object.assign({ code, bubbles: true, cancelable: true }, modifiers))
      );

    video.playbackRate = 1;
    press("BracketRight", { altKey: true });
    const afterFaster = video.playbackRate;
    press("BracketLeft", { altKey: true });
    const afterSlower = video.playbackRate;
    press("BracketRight", { altKey: true });
    press("Backslash", { altKey: true });
    const afterReset = video.playbackRate;

    video.playbackRate = 1;
    press("BracketRight");
    const afterBareKey = video.playbackRate;

    window.__smoothSurferMessages.length = 0;
    press("KeyS", { ctrlKey: true, shiftKey: true });
    const afterSingleTap = window.__smoothSurferMessages.length;
    press("KeyS", { ctrlKey: true, shiftKey: true });

    return {
      afterFaster,
      afterSlower,
      afterReset,
      afterBareKey,
      afterSingleTap,
      messages: window.__smoothSurferMessages.slice()
    };
  })()`
  );

  assert.equal(speedState.afterFaster, 1.25);
  assert.equal(speedState.afterSlower, 1);
  assert.equal(speedState.afterReset, 1);
  assert.equal(speedState.afterBareKey, 1);
  assert.equal(speedState.afterSingleTap, 0);
  assert.deepEqual(speedState.messages, [{ type: "openSmoothSurferSettings" }]);

  await navigate(client, `http://youtube.com.test:${fixturePort}/youtube-content.html`);
  await waitForExpression(
    client,
    `document.querySelector("#shorts-section").classList.contains("smooth-surfer-hidden")`
  );
  const youtubeContentState = await evaluate(
    client,
    `(() => ({
    shortsHidden: document.querySelector("#shorts-section").classList.contains("smooth-surfer-hidden"),
    gamesHidden: document.querySelector("#games-section").classList.contains("smooth-surfer-hidden"),
    autoplayClicked: document.querySelector("#autoplay").dataset.clicked === "true",
    stickyHidden: document.querySelector("#sticky-player").dataset.smoothSurferHiddenKind === "sticky-video"
  }))()`
  );

  assert.equal(youtubeContentState.shortsHidden, true);
  assert.equal(youtubeContentState.gamesHidden, true);
  assert.equal(youtubeContentState.autoplayClicked, true);
  assert.equal(youtubeContentState.stickyHidden, true);

  await evaluate(
    client,
    `window.scrollTo(0, window.innerHeight * 9); window.dispatchEvent(new Event("scroll"))`
  );
  await evaluate(client, `new Promise((resolve) => setTimeout(resolve, 300))`);
  assert.equal(
    await evaluate(
      client,
      `document.documentElement.classList.contains("smooth-surfer-scroll-paused")`
    ),
    false,
    "scrolling past the old eight-screen threshold no longer interrupts the feed"
  );
  await evaluate(
    client,
    `window.scrollTo(0, window.innerHeight * 17); window.dispatchEvent(new Event("scroll"))`
  );
  await waitForExpression(
    client,
    `document.documentElement.classList.contains("smooth-surfer-scroll-paused")`
  );
  const scrollPauseState = await evaluate(
    client,
    `(() => {
    const pause = document.querySelector(".smooth-surfer-scroll-pause");
    const beforeClickY = window.scrollY;
    pause.querySelector("button").click();
    return {
      wasVisible: Boolean(pause),
      isPaused: document.documentElement.classList.contains("smooth-surfer-scroll-paused"),
      beforeClickY,
      afterClickY: window.scrollY
    };
  })()`
  );

  assert.equal(scrollPauseState.wasVisible, true);
  assert.equal(scrollPauseState.isPaused, false);
  assert.ok(scrollPauseState.beforeClickY > 0);
  assert.equal(scrollPauseState.afterClickY, scrollPauseState.beforeClickY);

  await evaluate(
    client,
    `window.scrollBy(0, window.innerHeight * 9); window.dispatchEvent(new Event("scroll"));
     new Promise((resolve) => setTimeout(resolve, 300))`
  );
  assert.equal(
    await evaluate(
      client,
      `document.documentElement.classList.contains("smooth-surfer-scroll-paused")`
    ),
    false,
    "Keep going grants the longer scrolling interval too"
  );
  await evaluate(
    client,
    `window.scrollBy(0, window.innerHeight * 8); window.dispatchEvent(new Event("scroll"))`
  );
  await waitForExpression(
    client,
    `document.documentElement.classList.contains("smooth-surfer-scroll-paused")`
  );

  await navigate(client, `http://github.com.test:${fixturePort}/work-content.html`);
  await evaluate(
    client,
    `window.scrollTo(0, window.innerHeight * 17); window.dispatchEvent(new Event("scroll"))`
  );
  await evaluate(client, `new Promise((resolve) => setTimeout(resolve, 400))`);
  const workSiteState = await evaluate(
    client,
    `(() => ({
    isPaused: document.documentElement.classList.contains("smooth-surfer-scroll-paused"),
    hasPausePrompt: Boolean(document.querySelector(".smooth-surfer-scroll-pause")),
    stickyHidden: document.querySelector("#sticky-player").dataset.smoothSurferHiddenKind === "sticky-video",
    thumbFilter: getComputedStyle(document.querySelector("#work-image")).filter
  }))()`
  );

  assert.equal(workSiteState.isPaused, false);
  assert.equal(workSiteState.hasPausePrompt, false);
  assert.equal(workSiteState.stickyHidden, false);
  assert.equal(workSiteState.thumbFilter, "none");

  await navigate(client, `http://twitter.com.test:${fixturePort}/home`);
  await waitForExpression(
    client,
    `document.querySelector("#following-tab").dataset.clicked === "true"`
  );
  const twitterContentState = await evaluate(
    client,
    `(async () => {
    const followingTab = document.querySelector("#following-tab");
    const forYouTab = document.querySelector("#for-you-tab");
    const followingClicksBeforeForYou = Number(followingTab.dataset.clicks || 0);
    forYouTab.click();
    document.body.append(document.createElement("div"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      followingClicked: followingTab.dataset.clicked === "true",
      followingClicksBeforeForYou,
      followingClicksAfterForYou: Number(followingTab.dataset.clicks || 0),
      forYouSelected: forYouTab.getAttribute("aria-selected") === "true",
      promotedHidden: document.querySelector("#promoted-cell").dataset.smoothSurferHiddenKind === "tweet",
      adTextHidden: document.querySelector("#ad-text-cell").dataset.smoothSurferHiddenKind === "tweet",
      baitHidden: document.querySelector("#bait-cell").dataset.smoothSurferHiddenKind === "tweet",
      tagSpamHidden: document.querySelector("#tag-spam-cell").dataset.smoothSurferHiddenKind === "tweet",
      linkedinHidden: document.querySelector("#linkedin-cell").dataset.smoothSurferHiddenKind === "tweet",
      trendDisplay: getComputedStyle(document.querySelector("#trend-module")).display
    };
  })()`
  );

  assert.equal(twitterContentState.followingClicked, true);
  assert.equal(
    twitterContentState.followingClicksAfterForYou,
    twitterContentState.followingClicksBeforeForYou
  );
  assert.equal(twitterContentState.forYouSelected, true);
  assert.equal(twitterContentState.promotedHidden, true);
  // The badge marks a promotion; a post that merely says "Ad" is not one.
  assert.equal(twitterContentState.adTextHidden, false);
  assert.equal(twitterContentState.baitHidden, false);
  assert.equal(twitterContentState.tagSpamHidden, false);
  assert.equal(twitterContentState.linkedinHidden, false);
  assert.equal(twitterContentState.trendDisplay, "none");

  await verifyTwitterFeed({
    client,
    navigate,
    evaluate,
    waitForExpression,
    baseUrl: `http://twitter.com.test:${fixturePort}`
  });

  // The tab labels are matched case-insensitively, so a timeline that renders
  // them differently still starts on Following.
  await navigate(client, `http://twitter.com.test:${fixturePort}/home?labels=mixed`);
  await waitForExpression(
    client,
    `document.querySelector("#following-tab").dataset.clicked === "true"`
  );

  // Content filtering with a saved key. The fixture answers classification
  // messages itself, so verdicts land one at a time. It seeds a key into this
  // origin's localStorage, so it has to run after the unfiltered checks above.
  await navigate(client, `http://twitter.com.test:${fixturePort}/twitter-filtered.html`);
  await waitForExpression(client, `window.__smoothSurferRequests.length >= 5`);
  const pendingState = await evaluate(
    client,
    `(() => {
    const pending = (id) => document.querySelector(id).dataset.smoothSurferPending === "true";

    return {
      requestTexts: window.__smoothSurferRequestTexts(),
      cleanPending: pending("#clean-cell"),
      baitPending: pending("#bait-cell"),
      mediaPending: pending("#media-cell"),
      threadCellPending: pending("#thread-cell"),
      threadRootPending: pending("#thread-root"),
      threadReplyPending: pending("#thread-reply")
    };
  })()`
  );

  // A media-only post is classified on its stable parts. Sending the whole
  // article would fold in the view count and the relative timestamp, so every
  // tick would look like a new post: another Haiku call, and a post already on
  // screen blinking out while it waits for the answer.
  assert.ok(pendingState.requestTexts.includes("Sunrise over the pier"));
  assert.equal(
    pendingState.requestTexts.some((text) => text.includes("views")),
    false
  );
  assert.equal(pendingState.cleanPending, true);
  assert.equal(pendingState.baitPending, true);
  assert.equal(pendingState.mediaPending, true);
  // Each tweet in a conversation cell is held on its own, so one filtered
  // reply cannot take the whole thread with it.
  assert.equal(pendingState.threadCellPending, false);
  assert.equal(pendingState.threadRootPending, true);
  assert.equal(pendingState.threadReplyPending, true);

  const verdictState = await evaluate(
    client,
    `(async () => {
    const respond = window.__smoothSurferRespond;
    const blocked = { blocked: true, reasons: ["engagement bait"], classifier: "claude-haiku", tags: [] };
    const clear = { blocked: false, reasons: [], classifier: "claude-haiku", tags: [] };
    const answered =
      respond("Reply below", blocked) +
      respond("Repost this", blocked) +
      respond("Ferry timetable", clear) +
      respond("Notes from the harbour", clear) +
      respond("Sunrise over the pier", clear);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const hiddenKind = (id) => document.querySelector(id).dataset.smoothSurferHiddenKind || "";

    return {
      answered,
      cleanHidden: hiddenKind("#clean-cell"),
      baitHidden: hiddenKind("#bait-cell"),
      baitReasons: document.querySelector("#bait-cell").dataset.smoothSurferReasons,
      mediaHidden: hiddenKind("#media-cell"),
      threadCellHidden: hiddenKind("#thread-cell"),
      threadRootHidden: hiddenKind("#thread-root"),
      threadReplyHidden: hiddenKind("#thread-reply"),
      stuckPending: document.querySelector("#stuck-cell").dataset.smoothSurferPending === "true"
    };
  })()`
  );

  assert.equal(verdictState.answered, 5);
  assert.equal(verdictState.cleanHidden, "");
  assert.equal(verdictState.baitHidden, "tweet");
  assert.equal(verdictState.baitReasons, "engagement bait");
  assert.equal(verdictState.mediaHidden, "");
  assert.equal(verdictState.threadCellHidden, "");
  assert.equal(verdictState.threadRootHidden, "");
  assert.equal(verdictState.threadReplyHidden, "tweet");
  assert.equal(verdictState.stuckPending, true);

  const churnState = await evaluate(
    client,
    `(async () => {
    const requestsBeforeChurn = window.__smoothSurferRequests.length;
    // The fixture shortens the lost-reply deadline. Continuous page churn
    // must not prevent it releasing the review, or trigger immediate retries.
    document.querySelector("#media-views").textContent = "5,102 views";

    const churn = setInterval(() => {
      const filler = document.createElement("div");
      document.body.append(filler);
      filler.remove();
      window.dispatchEvent(new Event("scroll"));
    }, 25);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    clearInterval(churn);

    return {
      requestsBeforeChurn,
      requestTexts: window.__smoothSurferRequestTexts(),
      stuckHidden: document.querySelector("#stuck-cell").dataset.smoothSurferHiddenKind || "",
      mediaHidden: document.querySelector("#media-cell").dataset.smoothSurferHiddenKind || ""
    };
  })()`
  );

  assert.equal(churnState.stuckHidden, "");
  // A released review stays visible through its retry cooldown.
  assert.equal(
    churnState.requestTexts.filter((text) => text.includes("verdict that never lands")).length,
    1
  );
  // ...while a changed view count leaves the media post alone.
  assert.equal(churnState.mediaHidden, "");
  assert.equal(
    churnState.requestTexts.filter((text) => text.includes("Sunrise over the pier")).length,
    1
  );

  await navigate(client, `http://reddit.com.test:${fixturePort}/reddit-content.html`);
  await waitForExpression(
    client,
    `document.querySelector("#reddit-ad").dataset.smoothSurferHiddenKind === "reddit-post"`
  );
  const redditContentState = await evaluate(
    client,
    `(() => ({
    promotedHidden: document.querySelector("#reddit-ad").dataset.smoothSurferHiddenKind === "reddit-post",
    recommendationHidden: document.querySelector("#reddit-recommendation").dataset.smoothSurferHiddenKind === "reddit-post",
    moduleHidden: document.querySelector("#reddit-module").dataset.smoothSurferHiddenKind === "reddit-module",
    normalHidden: document.querySelector("#reddit-normal").dataset.smoothSurferHiddenKind === "reddit-post"
  }))()`
  );

  assert.equal(redditContentState.promotedHidden, true);
  assert.equal(redditContentState.recommendationHidden, true);
  assert.equal(redditContentState.moduleHidden, true);
  assert.equal(redditContentState.normalHidden, false);

  // Reddit posts are classified on the post's own words. The score, comment
  // count and age sit in the chrome around them and change on their own, and
  // each change would otherwise read as a new post: another Haiku call.
  await navigate(client, `http://reddit.com.test:${fixturePort}/reddit-filtered.html`);
  await waitForExpression(client, `window.__smoothSurferRequests.length >= 1`);
  const redditFilteredState = await evaluate(
    client,
    `(async () => {
    const before = window.__smoothSurferRequestTexts();

    document.querySelector("#reddit-score").textContent = "4.8k points";
    document.querySelector("#reddit-age").textContent = "5 hr. ago";
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 900));

    return { before, after: window.__smoothSurferRequestTexts() };
  })()`
  );

  assert.deepEqual(redditFilteredState.before, [
    "Harbour renovation timeline The works start in March and run for six weeks."
  ]);
  assert.deepEqual(redditFilteredState.after, redditFilteredState.before);

  await navigate(client, `http://substack.com.test:${fixturePort}/substack-content.html`);
  await waitForExpression(
    client,
    `document.querySelector("#substack-recommendation").dataset.smoothSurferHiddenKind === "substack-module"`
  );
  const substackContentState = await evaluate(
    client,
    `(() => ({
    recommendationHidden: document.querySelector("#substack-recommendation").dataset.smoothSurferHiddenKind === "substack-module",
    normalHidden: document.querySelector("#substack-post").dataset.smoothSurferHiddenKind === "substack-post"
  }))()`
  );

  assert.equal(substackContentState.recommendationHidden, true);
  assert.equal(substackContentState.normalHidden, false);

  await navigate(
    client,
    `http://news.ycombinator.com.test:${fixturePort}/hacker-news-content.html`
  );
  await waitForExpression(
    client,
    `getComputedStyle(document.querySelector("#hn-score")).display === "none"`
  );
  const hackerNewsContentState = await evaluate(
    client,
    `(() => ({
    scoreDisplay: getComputedStyle(document.querySelector("#hn-score")).display,
    storyHidden: document.querySelector("#hn-story").dataset.smoothSurferHiddenKind === "hacker-news-story",
    commentHidden: document.querySelector("#hn-comment").dataset.smoothSurferHiddenKind === "hacker-news-comment"
  }))()`
  );

  assert.equal(hackerNewsContentState.scoreDisplay, "none");
  assert.equal(hackerNewsContentState.storyHidden, false);
  assert.equal(hackerNewsContentState.commentHidden, false);

  // Hacker News comments are classified on the comment body: the head above it
  // carries an age that reads "3 hours ago" until it reads "4 hours ago".
  await navigate(
    client,
    `http://news.ycombinator.com.test:${fixturePort}/hacker-news-filtered.html`
  );
  await waitForExpression(client, `window.__smoothSurferRequests.length >= 2`);
  const hackerNewsFilteredState = await evaluate(
    client,
    `(async () => {
    const before = window.__smoothSurferRequestTexts();

    document.querySelector("#hn-age").textContent = "4 hours ago";
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 900));

    return { before, after: window.__smoothSurferRequestTexts() };
  })()`
  );

  assert.deepEqual(hackerNewsFilteredState.before.slice().sort(), [
    "A useful systems paper example.com",
    "Ferries are the most underrated infrastructure."
  ]);
  assert.deepEqual(hackerNewsFilteredState.after, hackerNewsFilteredState.before);

  client.close();
} finally {
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => chrome.once("exit", resolve)),
    delay(2000).then(() => chrome.kill("SIGKILL"))
  ]);
  await closeServer(fixtureServer);
  await removeTempDir(tmpDir);
}

// End-to-end check of the real unpacked extension: a Cmd/Ctrl+Shift+S
// double-tap on a page should reach the background and open the popup via
// chrome.action.openPopup().
await verifyExtensionPopupOpens();

async function verifyExtensionPopupOpens() {
  const extProfileDir = await mkdtemp(path.join(os.tmpdir(), "smooth-surfer-ext-"));
  const debugPort = Number(process.env.CHROME_DEBUG_PORT) || (await getFreePort());
  const barePort = Number(process.env.FIXTURE_PORT) || (await getFreePort());
  const bareServer = http.createServer((request, response) => {
    sendHtml(
      response,
      `<!doctype html><html><head><meta charset="utf-8"></head>
       <body><video id="speed-video" style="width:320px;height:240px"></video></body></html>`
    );
  });

  await listen(bareServer, barePort);

  const extensionChrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${extProfileDir}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
    `--load-extension=${root}`,
    `--disable-extensions-except=${root}`,
    "about:blank"
  ]);

  extensionChrome.stderr.on("data", () => {});

  try {
    let worker = null;
    const workerDeadline = Date.now() + 15000;

    while (Date.now() < workerDeadline && !worker) {
      try {
        const targets = await requestJson(debugPort, "/json");
        worker = targets.find((target) => (target.url || "").includes("/src/background.js"));
      } catch {
        // Extension service worker not registered yet.
      }

      if (!worker) {
        await delay(200);
      }
    }

    // Hosting an unpacked MV3 extension under headless --load-extension is
    // environment-sensitive (the service worker doesn't always register on some
    // CI runners). Treat a no-show as an environment limitation and skip rather
    // than failing the suite; the content-script -> message path is already
    // covered deterministically above. When the extension does load, still
    // hard-assert that the popup opens, so a real regression fails.
    if (!worker) {
      console.log(
        "Skipping extension popup check: unpacked extension did not load in this headless environment."
      );
      return;
    }

    const page = await waitForPageTarget(debugPort);
    const client = await CdpClient.connect(page.webSocketDebuggerUrl);

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await navigate(client, `http://127.0.0.1:${barePort}/bare-video.html`);
    await evaluate(
      client,
      `(() => {
        const press = () =>
          document.body.dispatchEvent(
            new KeyboardEvent("keydown", {
              code: "KeyS",
              ctrlKey: true,
              shiftKey: true,
              bubbles: true,
              cancelable: true
            })
          );
        press();
        press();
        return true;
      })()`
    );

    let popup = null;
    const popupDeadline = Date.now() + 5000;

    while (Date.now() < popupDeadline && !popup) {
      const targets = await requestJson(debugPort, "/json");
      popup = targets.find((target) => (target.url || "").endsWith("popup.html"));

      if (!popup) {
        await delay(150);
      }
    }

    assert.ok(popup, "Ctrl+Shift+S double-tap opened the extension popup");
    const popupClient = await CdpClient.connect(popup.webSocketDebuggerUrl);
    await waitForExpression(
      popupClient,
      `document.querySelector('[data-review-link]')?.textContent === 'Recently filtered (0)'`
    );
    const popupLayout = await evaluate(
      popupClient,
      `({
      width: document.body.getBoundingClientRect().width,
      height: document.body.getBoundingClientRect().height,
      visibility: getComputedStyle(document.body).visibility,
      inputs: document.querySelectorAll('[data-setting]').length,
      title: document.querySelector('h1')?.textContent,
      bodyOverflow: getComputedStyle(document.body).overflowY
    })`
    );
    assert.equal(popupLayout.title, "Smooth Surfer");
    assert.equal(popupLayout.bodyOverflow, "visible", "only the popup viewport scrolls");
    assert.equal(popupLayout.width, 320);
    assert.ok(popupLayout.height >= 300, "the popup has a usable rendered height");
    assert.equal(popupLayout.visibility, "visible");
    assert.ok(popupLayout.inputs > 10, "the popup renders its settings controls");
    await mkdir(cacheDir, { recursive: true });
    const popupScreenshot = await popupClient.send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(cacheDir, "extension-popup.png"),
      Buffer.from(popupScreenshot.data, "base64")
    );
    popupClient.close();
    const extensionOrigin = worker.url.replace("/src/background.js", "");
    const workerClient = await CdpClient.connect(worker.webSocketDebuggerUrl);
    await evaluate(
      workerClient,
      `(async () => {
      await SmoothSurferStorage.saveSettings(SmoothSurferSettings.normalizeSettings({filterCriteria: ['Engagement bait', 'Unsubstantiated predictions']}));
      const posts = [
        {source:'twitter',author:'River Chen · @river',text:'Repost this thread and follow for a chance to win a new setup. Winners announced tomorrow.',reasons:['Asks for reposts in exchange for a prize'],criteria:['Engagement bait'],url:'https://x.com/river/status/123'},
        {source:'reddit',author:'',text:'This changes everything. One chart proves the next big market move is guaranteed.',reasons:['Presents an uncertain prediction as a guarantee'],criteria:['Unsubstantiated predictions'],url:'https://www.reddit.com/r/example/comments/123/example/'},
        {source:'twitter',author:'Casey Park · @casey',text:'Only a few people will understand this. Like and share if you are one of them.',reasons:['Solicits engagement through an exclusivity claim'],criteria:['Engagement bait'],url:'https://x.com/casey/status/456'}
      ];
      await SmoothSurferStorage.saveReview({items:posts.map((post,index)=>({...post,id:SmoothSurferSettings.getReviewPostKey(post.source,post.text),at:Date.now()-index*3600000})),restored:[]});
    })()`
    );
    await navigate(client, extensionOrigin + "/popup.html");
    await waitForExpression(
      client,
      `document.querySelector('[data-review-link]')?.textContent === 'Recently filtered (3)'`
    );
    assert.equal(
      await evaluate(client, `document.querySelector('[data-review-link]').target`),
      "_blank",
      "popup opens review in a full tab"
    );
    await navigate(client, extensionOrigin + "/review.html");
    await waitForExpression(client, `document.querySelectorAll('.post').length === 3`);
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1100,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
    await mkdir(cacheDir, { recursive: true });
    const desktop = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(cacheDir, "review-desktop.png"), Buffer.from(desktop.data, "base64"));
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true
    });
    const mobile = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(cacheDir, "review-mobile.png"), Buffer.from(mobile.data, "base64"));
    assert.equal(
      await evaluate(client, `document.documentElement.scrollWidth <= innerWidth`),
      true,
      "review fits narrow screens"
    );
    await evaluate(client, `document.querySelector('.post .primary').click()`);
    await waitForExpression(client, `document.querySelector('.badge')?.textContent === 'Restored'`);
    await navigate(client, extensionOrigin + "/review.html");
    await waitForExpression(client, `document.querySelector('.badge')?.textContent === 'Restored'`);
    await evaluate(
      client,
      `document.getElementById('search').value='guarantee';document.getElementById('search').dispatchEvent(new Event('input'))`
    );
    assert.equal(await evaluate(client, `document.querySelectorAll('.post').length`), 1);
    await evaluate(
      client,
      `[...document.querySelectorAll('.post button')].find(button=>button.textContent==='Edit rule').click()`
    );
    await waitForExpression(client, `document.getElementById('rule-dialog').open`);
    assert.equal(
      await evaluate(client, `document.getElementById('rule-text').value`),
      "Unsubstantiated predictions"
    );
    await evaluate(
      client,
      `document.getElementById('rule-text').value='Predictions presented as guarantees';document.getElementById('rule-form').requestSubmit()`
    );
    await waitForExpression(client, `!document.getElementById('rule-dialog').open`);
    assert.equal(
      await evaluate(
        workerClient,
        `(async()=> (await SmoothSurferStorage.loadSettings()).filterCriteria.includes('Predictions presented as guarantees'))()`
      ),
      true
    );
    await evaluate(client, `document.getElementById('clear').click()`);
    await waitForExpression(client, `document.querySelectorAll('.post').length === 0`);
    assert.equal(
      await evaluate(
        workerClient,
        `(async()=> (await SmoothSurferStorage.loadReview()).restored.length)()`
      ),
      1
    );
    // Filter sets are previewed before applying; unchecked rules never import.
    await navigate(client, extensionOrigin + "/filters.html");
    await waitForExpression(client, `document.querySelectorAll('#presets button').length === 2`);
    await evaluate(
      client,
      `document.querySelector('#presets button').click(); document.querySelector('[data-rule="1"]').checked=false; document.querySelector('#apply-set').click()`
    );
    await waitForExpression(
      client,
      `document.getElementById('set-status').textContent === 'Selected rules added.'`
    );
    const applied = await evaluate(
      workerClient,
      `(async()=>await SmoothSurferStorage.loadSettings())()`
    );
    assert.ok(applied.filterCriteria.includes("Predictions presented as guarantees"));
    assert.ok(
      applied.filterCriteria.includes(
        "Posts that ask for likes, reposts, or follows to enter a giveaway."
      )
    );
    assert.equal(
      applied.filterCriteria.includes(
        "Posts that use outrage or personal attacks primarily to solicit engagement."
      ),
      false
    );
    assert.equal(applied.twitterHideReposts, true);
    assert.equal(applied.imageAnalysisEnabled, false);
    await evaluate(
      client,
      `document.getElementById('set-name').value='Personal'; document.getElementById('save-set').requestSubmit()`
    );
    await waitForExpression(
      client,
      `document.querySelector('#saved-sets button')?.textContent === 'Personal'`
    );
    const savedPack = await evaluate(
      workerClient,
      `(async()=> (await SmoothSurferStorage.loadFilterSets())[0])()`
    );
    assert.deepEqual(savedPack.criteria, applied.filterCriteria);
    assert.equal(savedPack.anthropicApiKey, undefined);
    // Use Chrome's real file input to exercise import and its preview boundary.
    const importedPath = path.join(cacheDir, "fixture-filter-set.json");
    await writeFile(
      importedPath,
      JSON.stringify({
        schema: "smooth-surfer-filter-set",
        version: 1,
        name: "Imported",
        criteria: ["Imported rule A", "Imported rule B"],
        formats: { twitterHideVideos: true },
        anthropicApiKey: "must-not-import",
        imageAnalysisEnabled: true
      })
    );
    await client.send("DOM.enable");
    const documentNode = await client.send("DOM.getDocument");
    const inputNode = await client.send("DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector: "#import-file"
    });
    await client.send("DOM.setFileInputFiles", { nodeId: inputNode.nodeId, files: [importedPath] });
    await waitForExpression(
      client,
      `document.getElementById('preview-name').textContent === 'Imported'`
    );
    assert.deepEqual(
      await evaluate(
        workerClient,
        `(async()=> (await SmoothSurferStorage.loadSettings()).filterCriteria)()`
      ),
      applied.filterCriteria,
      "opening an import does not apply it"
    );
    await evaluate(
      client,
      `document.querySelector('[data-rule="1"]').checked=false;document.querySelector('[data-format]').checked=false;document.querySelector('#apply-set').click()`
    );
    await waitForExpression(
      client,
      `document.getElementById('set-status').textContent === 'Selected rules added.'`
    );
    const imported = await evaluate(
      workerClient,
      `(async()=>await SmoothSurferStorage.loadSettings())()`
    );
    assert.ok(imported.filterCriteria.includes("Imported rule A"));
    assert.equal(imported.filterCriteria.includes("Imported rule B"), false);
    assert.equal(imported.twitterHideVideos, false);
    assert.equal(imported.imageAnalysisEnabled, false);
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1100,
      height: 850,
      deviceScaleFactor: 1,
      mobile: false
    });
    const filtersDesktop = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(cacheDir, "filters-desktop.png"),
      Buffer.from(filtersDesktop.data, "base64")
    );
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true
    });
    assert.equal(
      await evaluate(client, `document.documentElement.scrollWidth <= innerWidth`),
      true,
      "filter sets fit narrow screens"
    );
    const filtersMobile = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(cacheDir, "filters-mobile.png"),
      Buffer.from(filtersMobile.data, "base64")
    );
    await writeFile(importedPath, '{"invalid":true}');
    await client.send("DOM.setFileInputFiles", { nodeId: inputNode.nodeId, files: [importedPath] });
    await waitForExpression(
      client,
      `document.getElementById('set-status').textContent.includes('valid Smooth Surfer filter set')`
    );
    assert.deepEqual(
      await evaluate(workerClient, `(async()=>await SmoothSurferStorage.loadSettings())()`),
      imported
    );
    console.log(
      "Filter sets passed (save, preview, selective import, validation, responsive layout)."
    );
    workerClient.close();
    client.close();
    console.log(
      "Review page passed (real extension storage, restore persistence, search, rule edits, clear history, responsive layout)."
    );
  } finally {
    extensionChrome.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => extensionChrome.once("exit", resolve)),
      delay(2000).then(() => extensionChrome.kill("SIGKILL"))
    ]);
    await closeServer(bareServer);
    await removeTempDir(extProfileDir);
  }
}

// Chrome's child processes keep flushing into the profile dir briefly after
// the parent is killed, so cleanup can hit ENOTEMPTY. Retry, and never let a
// temp-dir cleanup failure fail (or mask the real result of) the test.
async function removeTempDir(dir) {
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    console.log(`Warning: could not remove temp dir ${dir}: ${error.code || error.message}`);
  }
}

async function resolveChrome() {
  if (process.env.SKIP_CHROME_SMOKE) {
    return null;
  }

  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    path.join(cacheDir, "chrome-linux64", "chrome")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Only auto-download on Linux, where Chrome for Testing ships a portable
  // build and the extension can be loaded with --load-extension.
  if (process.platform !== "linux") {
    return null;
  }

  try {
    return await downloadChromeForTesting();
  } catch (error) {
    console.log("Chrome for Testing download failed:", error.message);
    return null;
  }
}

async function downloadChromeForTesting() {
  console.log("Downloading Chrome for Testing (linux64)...");
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

  const diagnostic = await evaluate(
    client,
    `({
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText.slice(0, 300) : ""
  })`
  );
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
  // Cold Chrome startup right after a fresh download can be slow on CI runners.
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    try {
      const targets = await requestJson(port, "/json/list");
      const page = targets.find((target) => target.type === "page");

      if (page) {
        return page;
      }
    } catch {
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

      if (requestUrl.pathname === "/twitter-filter-test") {
        sendHtml(response, twitterFilterFixture());
        return;
      }

      if (requestUrl.pathname === "/youtube-content.html") {
        sendHtml(response, youtubeContentFixture());
        return;
      }

      if (requestUrl.pathname === "/video-content.html") {
        sendHtml(response, videoContentFixture());
        return;
      }

      if (requestUrl.pathname === "/twitter-content.html" || requestUrl.pathname === "/home") {
        sendHtml(response, twitterContentFixture(requestUrl.searchParams.get("labels")));
        return;
      }

      if (requestUrl.pathname === "/twitter-filtered.html") {
        sendHtml(response, twitterFilteredFixture());
        return;
      }

      if (requestUrl.pathname === "/work-content.html") {
        sendHtml(response, workContentFixture());
        return;
      }

      if (requestUrl.pathname === "/reddit-content.html") {
        sendHtml(response, redditContentFixture());
        return;
      }

      if (requestUrl.pathname === "/reddit-filtered.html") {
        sendHtml(response, redditFilteredFixture());
        return;
      }

      if (requestUrl.pathname === "/substack-content.html") {
        sendHtml(response, substackContentFixture());
        return;
      }

      if (requestUrl.pathname === "/hacker-news-content.html") {
        sendHtml(response, hackerNewsContentFixture());
        return;
      }

      if (requestUrl.pathname === "/hacker-news-filtered.html") {
        sendHtml(response, hackerNewsFilteredFixture());
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

function videoContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
    </head>
    <body>
      <video id="speed-video" style="width: 320px; height: 240px"></video>
      <script>
        // Stand in for the extension messaging channel so the settings-open
        // shortcut has somewhere to deliver its message.
        window.__smoothSurferMessages = [];
        window.chrome = {
          runtime: {
            lastError: null,
            sendMessage(message, callback) {
              window.__smoothSurferMessages.push(message);
              if (callback) callback();
            },
            onMessage: { addListener() {} }
          }
        };
      </script>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function youtubeContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
      <style>
        body { min-height: 40000px; margin: 0; }
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
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function twitterContentFixture(labels) {
  // X has shipped both "For you" and "For You"; the mixed variant stands in
  // for a timeline that cases its tab labels differently.
  const forYouLabel = labels === "mixed" ? "For You" : "For you";
  const followingLabel = labels === "mixed" ? "FOLLOWING" : "Following";

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
    </head>
    <body>
      <main>
        <button id="for-you-tab" role="tab" aria-selected="true">${forYouLabel}</button>
        <button
          id="following-tab"
          role="tab"
          aria-selected="false"
          onclick="this.dataset.clicked = 'true'; this.dataset.clicks = String(Number(this.dataset.clicks || 0) + 1); this.setAttribute('aria-selected', 'true'); document.querySelector('#for-you-tab').setAttribute('aria-selected', 'false');"
        >
          ${followingLabel}
        </button>
        <script>
          document.querySelector("#for-you-tab").addEventListener("click", function () {
            this.dataset.clicked = "true";
            this.setAttribute("aria-selected", "true");
            document.querySelector("#following-tab").setAttribute("aria-selected", "false");
          });
        </script>
        <aside data-testid="trend" id="trend-module">Trending topic</aside>
        <div data-testid="cellInnerDiv" id="promoted-cell">
          <article data-testid="tweet">
            <span>Promoted</span>
            <div data-testid="tweetText">Sponsored post</div>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="ad-text-cell">
          <article data-testid="tweet">
            <div data-testid="tweetText">Ad</div>
          </article>
        </div>
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
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function classificationStubScript() {
  // Filtering only runs with a saved key, and the page stands in for the
  // service worker so verdicts can be released one at a time.
  return `      <script>
        if (location.pathname === "/twitter-filtered.html") {
          const nativeTimeout = window.setTimeout.bind(window);
          window.setTimeout = (fn, ms, ...args) => nativeTimeout(fn, ms === 12000 ? 1000 : ms, ...args);
        }
        localStorage.setItem(
          "smoothSurferSecrets",
          JSON.stringify({ anthropicApiKey: "test-key" })
        );
        window.__smoothSurferRequests = [];
        window.__smoothSurferRespond = function (match, response) {
          const waiting = window.__smoothSurferRequests.filter(
            (entry) => !entry.answered && entry.message.text.includes(match)
          );

          waiting.forEach((entry) => {
            entry.answered = true;
            entry.callback(response);
          });

          return waiting.length;
        };
        window.__smoothSurferRequestTexts = function () {
          return window.__smoothSurferRequests.map((entry) => entry.message.text);
        };
        window.chrome = {
          runtime: {
            sendMessage(message, callback) {
              if (typeof callback !== "function") {
                return;
              }

              if (message.type !== "classifyContent") { callback({ok:true}); return; }
              window.__smoothSurferRequests.push({ message, callback, answered: false });
            }
          }
        };
      </script>`;
}

function twitterFilteredFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
      ${classificationStubScript()}
    </head>
    <body>
      <main>
        <div data-testid="cellInnerDiv" id="clean-cell">
          <article data-testid="tweet">
            <div data-testid="tweetText">Ferry timetable changes next week.</div>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="bait-cell">
          <article data-testid="tweet">
            <div data-testid="tweetText">Reply below if you agree.</div>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="thread-cell">
          <article data-testid="tweet" id="thread-root">
            <div data-testid="tweetText">Notes from the harbour walk.</div>
          </article>
          <article data-testid="tweet" id="thread-reply">
            <div data-testid="tweetText">Repost this if you want part two.</div>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="media-cell">
          <article data-testid="tweet">
            <div data-testid="tweetPhoto"><img alt="Sunrise over the pier"></div>
            <span id="media-views">312 views</span>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="stuck-cell">
          <article data-testid="tweet" id="stuck-tweet">
            <div data-testid="tweetText">Waiting on a verdict that never lands.</div>
          </article>
        </div>
      </main>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function redditContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
    </head>
    <body>
      <main>
        <article id="reddit-ad">
          <span>Promoted</span>
          <h3>Sponsored post</h3>
        </article>
        <article id="reddit-recommendation">
          <span>Because you've shown interest in technology</span>
          <h3>Suggested community post</h3>
        </article>
        <article id="reddit-normal">
          <h3>Local transit expansion opens this week</h3>
          <p>Ordinary post text.</p>
        </article>
      </main>
      <aside id="reddit-module">
        <h2>Communities you might like</h2>
        <p>Recommended communities</p>
      </aside>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function redditFilteredFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
      ${classificationStubScript()}
    </head>
    <body>
      <main>
        <shreddit-post id="reddit-post" post-title="Harbour renovation timeline">
          <span slot="title">Harbour renovation timeline</span>
          <div slot="text-body">The works start in March and run for six weeks.</div>
          <span id="reddit-score">1.2k points</span>
          <span id="reddit-comments">342 comments</span>
          <span id="reddit-age">3 hr. ago</span>
        </shreddit-post>
      </main>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function hackerNewsFilteredFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
      ${classificationStubScript()}
    </head>
    <body>
      <table class="itemlist">
        <tbody>
          <tr class="athing" id="hn-story">
            <td class="title">
              <span class="titleline"><a href="https://example.com">A useful systems paper</a></span>
              <span class="sitestr">example.com</span>
            </td>
          </tr>
          <tr>
            <td class="subtext"><span class="score" id="hn-score">42 points</span> <a href="item?id=1">12 comments</a></td>
          </tr>
          <tr class="comtr" id="hn-comment">
            <td>
              <div class="comhead"><a class="hnuser">someone</a> <span class="age" id="hn-age">3 hours ago</span></div>
              <div class="comment"><div class="commtext">Ferries are the most underrated infrastructure.</div></div>
            </td>
          </tr>
        </tbody>
      </table>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function substackContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
    </head>
    <body>
      <main>
        <article id="substack-post">
          <h1>Notes from a city council meeting</h1>
          <p>Ordinary newsletter preview.</p>
        </article>
      </main>
      <aside id="substack-recommendation">
        <h2>Recommended reads</h2>
        <p>Discover more writers on Substack.</p>
      </aside>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function hackerNewsContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
    </head>
    <body>
      <table class="itemlist">
        <tbody>
          <tr class="athing" id="hn-story">
            <td class="title"><span class="titleline"><a href="https://example.com">A useful systems paper</a></span></td>
          </tr>
          <tr>
            <td class="subtext"><span class="score" id="hn-score">42 points</span> <a href="item?id=1">12 comments</a></td>
          </tr>
          <tr class="comtr" id="hn-comment">
            <td class="comment">A regular comment.</td>
          </tr>
        </tbody>
      </table>
      <script src="/src/settings.js"></script>
      <script src="/src/storage.js"></script>
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function workContentFixture() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
      <style>
        body { min-height: 40000px; margin: 0; }
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
      <script src="/src/content.js"></script>
    </body>
  </html>`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
