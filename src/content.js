(function installSmoothSurfer() {
  "use strict";

  const { loadSettings, watchSettings } = window.SmoothSurferStorage;
  const SCAN_DEBOUNCE_MS = 120;
  const WORK_SITE_HOSTS = [
    "app.asana.com",
    "atlassian.net",
    "bitbucket.org",
    "calendar.google.com",
    "docs.google.com",
    "drive.google.com",
    "figma.com",
    "github.com",
    "github.dev",
    "gitlab.com",
    "graphite.dev",
    "linear.app",
    "mail.google.com",
    "notion.so",
    "slack.com"
  ];

  let settings = window.SmoothSurferSettings.normalizeSettings();
  let observer = null;
  let scanTimer = 0;
  let scrollPause = null;
  let scrollLimit = 0;
  const modelClassifications = new Map();

  const platform = getPlatform();

  start();

  function start() {
    loadSettings().then((loadedSettings) => {
      settings = loadedSettings;
      whenBodyReady(() => {
        applyEffects();
        startPageObserver();
      });
    });

    watchSettings((nextSettings) => {
      settings = nextSettings;
      applyEffects();
    });
  }

  function getPlatform() {
    const host = window.location.hostname.toLowerCase();

    if (host.includes("youtube.com")) {
      return "youtube";
    }

    if (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter.com")) {
      return "twitter";
    }

    return "unknown";
  }

  function whenBodyReady(callback) {
    if (document.body) {
      callback();
      return;
    }

    document.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  function applyEffects() {
    maybeBlockYouTubeShorts();
    applyRootClasses();
    scheduleScan();
  }

  function applyRootClasses() {
    const root = document.documentElement;

    root.classList.toggle(
      "smooth-surfer-youtube-gray",
      settings.enabled && platform === "youtube" && settings.youtubeGrayscaleThumbnails
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-recs",
      settings.enabled && platform === "youtube" && settings.youtubeHideRecommendations
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-shorts",
      settings.enabled && platform === "youtube" && settings.youtubeHideShorts
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-live-chat",
      settings.enabled && platform === "youtube" && settings.youtubeHideLiveChat
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-end-screens",
      settings.enabled && platform === "youtube" && settings.youtubeHideEndScreens
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-engagement",
      settings.enabled && platform === "youtube" && settings.youtubeHideEngagementStats
    );
    root.classList.toggle(
      "smooth-surfer-twitter-hide-trends",
      settings.enabled && platform === "twitter" && settings.twitterHideTrends
    );
    root.classList.toggle(
      "smooth-surfer-soften-distracting",
      settings.enabled && settings.softenDistractingElements && !isWorkSite()
    );
  }

  function startPageObserver() {
    if (observer || !document.body) {
      return;
    }

    observer = new MutationObserver(() => {
      scheduleScan();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.setInterval(scheduleScan, 2000);
    window.addEventListener("scroll", scheduleScan, { passive: true });
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanPage, SCAN_DEBOUNCE_MS);
  }

  function scanPage() {
    scanCommonPage();

    if (platform === "youtube") {
      maybeBlockYouTubeShorts();
      scanYouTubePage();
      return;
    }

    if (platform === "twitter") {
      scanTwitterPage();
    }
  }

  function scanCommonPage() {
    if (!settings.enabled || isWorkSite()) {
      restoreHiddenElementsByKind("sticky-video");
      removeScrollPause();
      return;
    }

    if (settings.hideStickyVideoPlayers) {
      hideStickyVideoPlayers();
    } else {
      restoreHiddenElementsByKind("sticky-video");
    }

    if (settings.pauseDeepScrolling) {
      checkDeepScroll();
    } else {
      removeScrollPause();
    }
  }

  function scanYouTubePage() {
    hideYouTubeShelves();
    disableYouTubeAutoplay();
  }

  function maybeBlockYouTubeShorts() {
    if (
      settings.enabled &&
      platform === "youtube" &&
      settings.youtubeBlockShorts &&
      window.location.pathname.startsWith("/shorts/")
    ) {
      window.location.replace("/");
    }
  }

  function hideYouTubeShelves() {
    document
      .querySelectorAll("ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer")
      .forEach((section) => {
        const title = getYouTubeShelfTitle(section);
        const isShorts = settings.enabled && settings.youtubeHideShorts && title.includes("shorts");
        const isGames =
          settings.enabled &&
          settings.youtubeHideGames &&
          (title.includes("playables") || title.includes("games") || title.includes("gaming"));

        section.classList.toggle("smooth-surfer-hidden", isShorts || isGames);
      });
  }

  function getYouTubeShelfTitle(section) {
    const heading = section.querySelector("#title, h2, h3, [role='heading']");
    const source = heading || section;

    return normalizeInlineText(source.textContent).toLowerCase();
  }

  function disableYouTubeAutoplay() {
    if (!settings.enabled || !settings.youtubeDisableAutoplay) {
      return;
    }

    Array.from(document.querySelectorAll("button, tp-yt-paper-toggle-button")).some((button) => {
      const label = normalizeInlineText(
        `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`
      ).toLowerCase();
      const isOn =
        button.getAttribute("aria-checked") === "true" ||
        button.getAttribute("aria-pressed") === "true" ||
        label.includes("autoplay is on");

      if (label.includes("autoplay") && isOn) {
        button.click();
        return true;
      }

      return false;
    });
  }

  function scanTwitterPage() {
    enforceTwitterFollowing();

    if (!settings.enabled || (!settings.twitterHideAds && !settings.twitterFilterContent)) {
      restoreHiddenTweets();
      return;
    }

    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      const container = getTweetContainer(article);
      const reasons = [];

      if (settings.twitterHideAds && isPromotedTweet(article)) {
        reasons.push("ad");
      }

      if (reasons.length > 0) {
        hideTweet(container, reasons);
        return;
      }

      if (settings.twitterFilterContent && settings.twitterClassifierMode === "local-rules") {
        const classification = window.SmoothSurferRules.classifyTweetText(
          getTweetText(article),
          settings.twitterFilterCriteria
        );

        if (classification.blocked) {
          reasons.push(...classification.reasons);
        }
      }

      if (reasons.length > 0) {
        hideTweet(container, reasons);
      } else if (settings.twitterFilterContent && settings.twitterClassifierMode === "anthropic-haiku") {
        requestModelClassification(container, getTweetText(article));
      } else {
        restoreTweet(container);
      }
    });
  }

  function enforceTwitterFollowing() {
    if (!settings.enabled || !settings.twitterEnforceFollowing || !isTwitterHome()) {
      return;
    }

    const followingTab = findTwitterTab("Following");
    const forYouTab = findTwitterTab("For you");
    const forYouSelected = forYouTab && forYouTab.getAttribute("aria-selected") === "true";

    if (followingTab && forYouSelected) {
      followingTab.click();
    }
  }

  function isTwitterHome() {
    return window.location.pathname === "/home" || window.location.pathname === "/";
  }

  function findTwitterTab(label) {
    return Array.from(document.querySelectorAll('[role="tab"]')).find(
      (tab) => normalizeInlineText(tab.textContent) === label
    );
  }

  function hideStickyVideoPlayers() {
    document.querySelectorAll("video, iframe").forEach((media) => {
      const container = findStickyMediaContainer(media);

      if (container) {
        hideElement(container, ["sticky video"], "sticky-video");
      }
    });
  }

  function findStickyMediaContainer(media) {
    let current = media;

    for (let depth = 0; current && depth < 5; depth += 1) {
      const style = window.getComputedStyle(current);
      const rect = current.getBoundingClientRect();
      const isFloating = style.position === "fixed" || style.position === "sticky";
      const isLargeEnough = rect.width >= 160 && rect.height >= 90;

      if (isFloating && isLargeEnough) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function checkDeepScroll() {
    if (!scrollLimit) {
      scrollLimit = window.innerHeight * 8;
    }

    if (window.scrollY > scrollLimit) {
      showScrollPause();
    }
  }

  function showScrollPause() {
    if (scrollPause) {
      document.documentElement.classList.add("smooth-surfer-scroll-paused");
      return;
    }

    document.documentElement.classList.add("smooth-surfer-scroll-paused");
    scrollPause = document.createElement("div");
    scrollPause.className = "smooth-surfer-scroll-pause";
    scrollPause.innerHTML = `
      <strong>Surf break</strong>
      <span>You have been scrolling for a while.</span>
      <button type="button">Keep going</button>
    `;
    scrollPause.querySelector("button").addEventListener("click", () => {
      scrollLimit = window.scrollY + window.innerHeight * 8;
      removeScrollPause();
    });
    document.documentElement.append(scrollPause);
  }

  function removeScrollPause() {
    document.documentElement.classList.remove("smooth-surfer-scroll-paused");

    if (!scrollPause) {
      return;
    }

    scrollPause.remove();
    scrollPause = null;
  }

  function requestModelClassification(container, text) {
    const key = getClassificationKey(text);
    const cached = modelClassifications.get(key);

    if (cached) {
      applyModelClassification(container, cached);
      return;
    }

    if (container.dataset.smoothSurferPendingKey === key) {
      return;
    }

    container.dataset.smoothSurferPendingKey = key;

    if (!hasChromeRuntime()) {
      const fallback = {
        blocked: false,
        reasons: []
      };
      modelClassifications.set(key, fallback);
      applyModelClassification(container, fallback);
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "classifyTweetContent",
        text
      },
      (response) => {
        delete container.dataset.smoothSurferPendingKey;

        if (chrome.runtime.lastError) {
          return;
        }

        const result = response || { blocked: false, reasons: [] };
        modelClassifications.set(key, result);
        applyModelClassification(container, result);
      }
    );
  }

  function applyModelClassification(container, classification) {
    if (classification.blocked) {
      hideTweet(container, classification.reasons);
    } else {
      restoreTweet(container);
    }
  }

  function getClassificationKey(text) {
    return JSON.stringify({
      mode: settings.twitterClassifierMode,
      criteria: settings.twitterFilterCriteria,
      text: window.SmoothSurferRules.normalizeText(text)
    });
  }

  function hasChromeRuntime() {
    return (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    );
  }

  function isPromotedTweet(article) {
    if (article.querySelector('a[href*="/i/adsct"], a[href*="ads.twitter.com"]')) {
      return true;
    }

    return Array.from(article.querySelectorAll("span, div")).some((element) => {
      const text = normalizeInlineText(element.textContent);
      return text === "Promoted" || text === "Ad";
    });
  }

  function getTweetText(article) {
    const tweetTextNodes = Array.from(article.querySelectorAll('[data-testid="tweetText"]'));

    if (tweetTextNodes.length > 0) {
      return tweetTextNodes.map((node) => node.innerText || node.textContent || "").join(" ");
    }

    return article.innerText || article.textContent || "";
  }

  function getTweetContainer(article) {
    return article.closest('[data-testid="cellInnerDiv"]') || article;
  }

  function hideTweet(container, reasons) {
    hideElement(container, reasons, "tweet");
  }

  function hideElement(element, reasons, kind) {
    element.classList.add("smooth-surfer-hidden");
    element.dataset.smoothSurferHidden = "true";
    element.dataset.smoothSurferReasons = reasons.join("; ");

    if (kind) {
      element.dataset.smoothSurferHiddenKind = kind;
    }
  }

  function restoreTweet(container) {
    if (container.dataset.smoothSurferHidden !== "true") {
      return;
    }

    container.classList.remove("smooth-surfer-hidden");
    delete container.dataset.smoothSurferHidden;
    delete container.dataset.smoothSurferHiddenKind;
    delete container.dataset.smoothSurferReasons;
  }

  function restoreHiddenTweets() {
    document.querySelectorAll('[data-smooth-surfer-hidden-kind="tweet"]').forEach((element) => {
      restoreTweet(element);
    });
  }

  function restoreHiddenElementsByKind(kind) {
    document
      .querySelectorAll(`[data-smooth-surfer-hidden-kind="${kind}"]`)
      .forEach((element) => {
        restoreTweet(element);
      });
  }

  function normalizeInlineText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isWorkSite() {
    const host = window.location.hostname.toLowerCase().replace(/\.test$/, "");

    return WORK_SITE_HOSTS.some((workHost) => host === workHost || host.endsWith("." + workHost));
  }

})();
