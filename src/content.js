(function installSmoothSurfer() {
  "use strict";

  const {
    loadSecrets,
    loadSettings,
    watchSecrets,
    watchSettings
  } = window.SmoothSurferStorage;
  const { getPlatformForUrl } = window.SmoothSurferSettings;
  const SCAN_DEBOUNCE_MS = 120;
  const CONTENT_FILTER_SETTING_BY_PLATFORM = {
    twitter: "twitterFilterContent",
    reddit: "redditFilterContent",
    substack: "substackFilterContent",
    "hacker-news": "hackerNewsFilterContent"
  };
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
  let secrets = window.SmoothSurferSettings.normalizeSecrets();
  let observer = null;
  let scanTimer = 0;
  let scrollPause = null;
  let scrollLimit = 0;
  const modelClassifications = new Map();

  const platform = getPlatform();
  installMessageListener();

  start();

  function start() {
    Promise.all([loadSettings(), loadSecrets()]).then(([loadedSettings, loadedSecrets]) => {
      settings = loadedSettings;
      secrets = loadedSecrets;
      whenBodyReady(() => {
        applyEffects();
        startPageObserver();
      });
    });

    watchSettings((nextSettings) => {
      settings = nextSettings;
      modelClassifications.clear();
      applyEffects();
    });

    watchSecrets((nextSecrets) => {
      secrets = nextSecrets;
      modelClassifications.clear();
      applyEffects();
    });
  }

  function getPlatform() {
    return getPlatformForUrl(window.location.href);
  }

  function installMessageListener() {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      !chrome.runtime.onMessage ||
      typeof chrome.runtime.onMessage.addListener !== "function"
    ) {
      return;
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== "getSmoothSurferPlatform") {
        return false;
      }

      sendResponse({ platform });
      return false;
    });
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
      "smooth-surfer-hacker-news-hide-scores",
      settings.enabled && platform === "hacker-news" && settings.hackerNewsHideScores
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
      return;
    }

    if (platform === "reddit") {
      scanRedditPage();
      return;
    }

    if (platform === "substack") {
      scanSubstackPage();
      return;
    }

    if (platform === "hacker-news") {
      scanHackerNewsPage();
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

    const canFilterContent = canFilterPlatformContent("twitter");

    if (!settings.enabled || (!settings.twitterHideAds && !canFilterContent)) {
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

      if (canFilterContent) {
        requestModelClassification(container, getTweetText(article), "tweet");
      } else {
        restoreElement(container);
      }
    });
  }

  function scanRedditPage() {
    const canFilterContent = canFilterPlatformContent("reddit");

    if (
      !settings.enabled ||
      (!settings.redditHideAds && !settings.redditHideRecommendations && !canFilterContent)
    ) {
      restoreHiddenElementsByKind("reddit-post");
      restoreHiddenElementsByKind("reddit-module");
      return;
    }

    scanRedditRecommendationModules();

    getRedditPostContainers().forEach((container) => {
      const reasons = [];

      if (settings.redditHideAds && isRedditPromoted(container)) {
        reasons.push("ad");
      }

      if (settings.redditHideRecommendations && isRedditRecommendation(container)) {
        reasons.push("recommendation");
      }

      if (reasons.length > 0) {
        hideElement(container, reasons, "reddit-post");
        return;
      }

      if (canFilterContent) {
        requestModelClassification(container, getElementText(container), "reddit-post");
      } else {
        restoreElement(container);
      }
    });
  }

  function scanRedditRecommendationModules() {
    if (!settings.enabled || !settings.redditHideRecommendations) {
      restoreHiddenElementsByKind("reddit-module");
      return;
    }

    document
      .querySelectorAll("aside, section, [data-testid*='recommend'], [class*='recommend']")
      .forEach((module) => {
        const text = normalizeInlineText(module.innerText || module.textContent).toLowerCase();
        const shouldHide =
          hasRecommendationText(text) ||
          text.includes("communities you might like") ||
          text.includes("popular communities");

        if (shouldHide) {
          hideElement(module, ["recommendation"], "reddit-module");
        } else if (module.dataset.smoothSurferHiddenKind === "reddit-module") {
          restoreElement(module);
        }
      });
  }

  function scanSubstackPage() {
    const canFilterContent = canFilterPlatformContent("substack");

    if (!settings.enabled || (!settings.substackHideRecommendations && !canFilterContent)) {
      restoreHiddenElementsByKind("substack-post");
      restoreHiddenElementsByKind("substack-module");
      return;
    }

    scanSubstackRecommendationModules();

    if (!canFilterContent) {
      restoreHiddenElementsByKind("substack-post");
      return;
    }

    getSubstackPostContainers().forEach((container) => {
      if (container.dataset.smoothSurferHiddenKind === "substack-module") {
        return;
      }

      requestModelClassification(container, getElementText(container), "substack-post");
    });
  }

  function scanSubstackRecommendationModules() {
    if (!settings.enabled || !settings.substackHideRecommendations) {
      restoreHiddenElementsByKind("substack-module");
      return;
    }

    document
      .querySelectorAll("aside, section, [data-testid*='recommend'], [class*='recommend']")
      .forEach((module) => {
        const text = normalizeInlineText(module.innerText || module.textContent).toLowerCase();
        const shouldHide =
          hasRecommendationText(text) ||
          text.includes("recommended reads") ||
          text.includes("more from substack") ||
          text.includes("discover more");

        if (shouldHide) {
          hideElement(module, ["recommendation"], "substack-module");
        } else if (module.dataset.smoothSurferHiddenKind === "substack-module") {
          restoreElement(module);
        }
      });
  }

  function scanHackerNewsPage() {
    const canFilterContent = canFilterPlatformContent("hacker-news");

    if (!settings.enabled || !canFilterContent) {
      restoreHiddenElementsByKind("hacker-news-story");
      restoreHiddenElementsByKind("hacker-news-story-meta");
      restoreHiddenElementsByKind("hacker-news-comment");
      return;
    }

    document.querySelectorAll("tr.athing").forEach((row) => {
      requestModelClassification(row, getHackerNewsStoryText(row), "hacker-news-story");
    });
    document.querySelectorAll("tr.comtr").forEach((row) => {
      requestModelClassification(row, getElementText(row), "hacker-news-comment");
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

  function requestModelClassification(container, text, kind) {
    const normalizedText = normalizeInlineText(text);

    if (!normalizedText) {
      restoreContentElement(container, kind);
      return;
    }

    const key = getClassificationKey(normalizedText);
    const cached = modelClassifications.get(key);

    if (cached) {
      applyModelClassification(container, cached, kind);
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
      applyModelClassification(container, fallback, kind);
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "classifyContent",
        source: platform,
        text: normalizedText
      },
      (response) => {
        delete container.dataset.smoothSurferPendingKey;

        if (chrome.runtime.lastError) {
          return;
        }

        const result = response || { blocked: false, reasons: [] };
        modelClassifications.set(key, result);
        applyModelClassification(container, result, kind);
      }
    );
  }

  function applyModelClassification(container, classification, kind) {
    if (classification.blocked) {
      hideContentElement(container, classification.reasons, kind);
    } else {
      restoreContentElement(container, kind);
    }
  }

  function getClassificationKey(text) {
    return JSON.stringify({
      classifier: "claude-haiku",
      criteria: settings.filterCriteria,
      source: platform,
      text
    });
  }

  function canFilterPlatformContent(targetPlatform) {
    const settingName = CONTENT_FILTER_SETTING_BY_PLATFORM[targetPlatform];

    return Boolean(
      settings.enabled &&
        settingName &&
        settings[settingName] &&
        secrets.anthropicApiKey
    );
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

  function getRedditPostContainers() {
    return uniqueElements(
      Array.from(
        document.querySelectorAll(
          "shreddit-post, article, [data-testid='post-container'], [data-testid='post'], [slot='post-container']"
        )
      )
        .map((element) => element.closest("shreddit-post, article, [data-testid='post-container']") || element)
        .filter((element) => element && document.body.contains(element))
    );
  }

  function isRedditPromoted(container) {
    if (
      container.matches("[promoted], [data-promoted='true'], [data-testid*='promoted']") ||
      container.querySelector("[promoted], [data-promoted='true'], [data-testid*='promoted']")
    ) {
      return true;
    }

    return Array.from(container.querySelectorAll("span, div, faceplate-tracker")).some((element) => {
      const text = normalizeInlineText(element.textContent).toLowerCase();

      return text === "promoted" || text === "sponsored";
    });
  }

  function isRedditRecommendation(container) {
    const text = getElementText(container).toLowerCase();

    return (
      hasRecommendationText(text) ||
      text.includes("because you've shown interest") ||
      text.includes("because you visited") ||
      text.includes("similar communities") ||
      text.includes("popular near you")
    );
  }

  function getSubstackPostContainers() {
    return uniqueElements(
      Array.from(
        document.querySelectorAll(
          "article, [data-testid*='post'], [class*='post-preview'], [class*='feed-item'], [class*='note']"
        )
      )
        .map((element) => element.closest("article, [data-testid*='post'], [class*='post-preview']") || element)
        .filter((element) => element && document.body.contains(element))
    );
  }

  function getHackerNewsStoryText(row) {
    const title = row.querySelector(".titleline, .storylink, .title a");
    const site = row.querySelector(".sitestr");

    return normalizeInlineText(`${title ? title.textContent : row.textContent} ${site ? site.textContent : ""}`);
  }

  function hasRecommendationText(text) {
    return (
      text.includes("recommended") ||
      text.includes("recommendations") ||
      text.includes("suggested for you") ||
      text.includes("you might like") ||
      text.includes("because you")
    );
  }

  function getElementText(element) {
    return normalizeInlineText(element.innerText || element.textContent || "");
  }

  function uniqueElements(elements) {
    const seen = new Set();

    return elements.filter((element) => {
      if (seen.has(element)) {
        return false;
      }

      seen.add(element);
      return true;
    });
  }

  function hideTweet(container, reasons) {
    hideElement(container, reasons, "tweet");
  }

  function hideContentElement(container, reasons, kind) {
    hideElement(container, reasons, kind);

    if (kind === "hacker-news-story") {
      const metaRow = getHackerNewsMetaRow(container);

      if (metaRow) {
        hideElement(metaRow, reasons, "hacker-news-story-meta");
      }
    }
  }

  function restoreContentElement(container, kind) {
    restoreElement(container);

    if (kind === "hacker-news-story") {
      const metaRow = getHackerNewsMetaRow(container);

      if (metaRow) {
        restoreElement(metaRow);
      }
    }
  }

  function getHackerNewsMetaRow(row) {
    const nextRow = row.nextElementSibling;

    return nextRow && nextRow.querySelector(".subtext") ? nextRow : null;
  }

  function hideElement(element, reasons, kind) {
    element.classList.add("smooth-surfer-hidden");
    element.dataset.smoothSurferHidden = "true";
    element.dataset.smoothSurferReasons = reasons.join("; ");

    if (kind) {
      element.dataset.smoothSurferHiddenKind = kind;
    }
  }

  function restoreElement(element) {
    if (element.dataset.smoothSurferHidden !== "true") {
      return;
    }

    element.classList.remove("smooth-surfer-hidden");
    delete element.dataset.smoothSurferHidden;
    delete element.dataset.smoothSurferHiddenKind;
    delete element.dataset.smoothSurferReasons;
    delete element.dataset.smoothSurferPendingKey;
  }

  function restoreTweet(container) {
    restoreElement(container);
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
        restoreElement(element);
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
