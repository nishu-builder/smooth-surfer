(function installSmoothSurfer() {
  "use strict";

  const {
    loadSecrets,
    loadSettings,
    watchSecrets,
    watchSettings
  } = window.SmoothSurferStorage;
  const { getPlatformForUrl, isWithinFocusWindow } = window.SmoothSurferSettings;
  const SCAN_DEBOUNCE_MS = 120;
  const SPEED_MIN = 0.25;
  const SPEED_MAX = 4;
  const SPEED_STEP = 0.25;
  const CONTENT_FILTER_SETTING_BY_PLATFORM = {
    twitter: "twitterFilterContent",
    reddit: "redditFilterContent",
    substack: "substackFilterContent",
    "hacker-news": "hackerNewsFilterContent"
  };
  const SCROLL_PAUSE_KEYS = new Set([
    " ",
    "ArrowDown",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp"
  ]);
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
  let scrollPauseInputBlockersInstalled = false;
  let twitterFollowingPreferenceResolved = false;
  let twitterTabPreferenceListenerInstalled = false;
  let lastEffectsActive = null;
  let speedToast = null;
  let speedToastTimer = 0;
  const modelClassifications = new Map();
  const recordedStatKeys = new Set();

  const platform = getPlatform();
  installMessageListener();
  installVideoSpeedHotkeys();

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
      // Keys embed the criteria, so stale entries self-invalidate; only a
      // criteria change needs a flush. Clearing on every toggle would send
      // all visible posts back through pending-hidden review.
      const criteriaChanged =
        JSON.stringify(nextSettings.filterCriteria) !== JSON.stringify(settings.filterCriteria);

      settings = nextSettings;

      if (criteriaChanged) {
        modelClassifications.clear();
      }

      applyEffects();
    });

    watchSecrets((nextSecrets) => {
      secrets = nextSecrets;
      applyEffects();
    });
  }

  function getPlatform() {
    return getPlatformForUrl(window.location.href);
  }

  function effectsEnabled() {
    if (!settings.enabled) {
      return false;
    }

    if (!settings.focusScheduleEnabled) {
      return true;
    }

    return isWithinFocusWindow(settings.focusScheduleStart, settings.focusScheduleEnd);
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
    const active = effectsEnabled();

    lastEffectsActive = active;
    root.classList.toggle(
      "smooth-surfer-youtube-gray",
      active && platform === "youtube" && settings.youtubeGrayscaleThumbnails
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-recs",
      active && platform === "youtube" && settings.youtubeHideRecommendations
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-shorts",
      active && platform === "youtube" && settings.youtubeHideShorts
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-live-chat",
      active && platform === "youtube" && settings.youtubeHideLiveChat
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-end-screens",
      active && platform === "youtube" && settings.youtubeHideEndScreens
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-engagement",
      active && platform === "youtube" && settings.youtubeHideEngagementStats
    );
    root.classList.toggle(
      "smooth-surfer-youtube-hide-comments",
      active && platform === "youtube" && settings.youtubeHideComments
    );
    root.classList.toggle(
      "smooth-surfer-twitter-hide-trends",
      active && platform === "twitter" && settings.twitterHideTrends
    );
    root.classList.toggle(
      "smooth-surfer-reddit-hide-comments",
      active && platform === "reddit" && settings.redditHideComments
    );
    root.classList.toggle(
      "smooth-surfer-hacker-news-hide-scores",
      active && platform === "hacker-news" && settings.hackerNewsHideScores
    );
    root.classList.toggle(
      "smooth-surfer-soften-distracting",
      active && settings.softenDistractingElements && !isWorkSite()
    );
  }

  function startPageObserver() {
    if (observer || !document.body) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      // Process new feed items synchronously, before the next paint: cached
      // verdicts apply with no flash, and unknown items start hidden instead
      // of rendering and vanishing once their classification arrives.
      fastProcessAddedNodes(mutations);
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
    if (effectsEnabled() !== lastEffectsActive) {
      applyRootClasses();
    }

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
    if (!effectsEnabled() || isWorkSite()) {
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
      effectsEnabled() &&
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
        const isShorts = effectsEnabled() && settings.youtubeHideShorts && title.includes("shorts");
        const isGames =
          effectsEnabled() &&
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
    if (!effectsEnabled() || !settings.youtubeDisableAutoplay) {
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
    installTwitterTabPreferenceListener();
    enforceTwitterFollowing();

    const canFilterContent = canFilterPlatformContent("twitter");

    if (!effectsEnabled() || (!settings.twitterHideAds && !canFilterContent)) {
      restoreHiddenTweets();
      return;
    }

    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      processTweetArticle(article, canFilterContent);
    });
  }

  function processTweetArticle(article, canFilterContent) {
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
  }

  function fastProcessAddedNodes(mutations) {
    if (platform !== "twitter" || !effectsEnabled()) {
      return;
    }

    const canFilterContent = canFilterPlatformContent("twitter");

    if (!settings.twitterHideAds && !canFilterContent) {
      return;
    }

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        if (node.matches('article[data-testid="tweet"]')) {
          processTweetArticle(node, canFilterContent);
          return;
        }

        node.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
          processTweetArticle(article, canFilterContent);
        });
      });
    });
  }

  function scanRedditPage() {
    const canFilterContent = canFilterPlatformContent("reddit");

    if (
      !effectsEnabled() ||
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
    if (!effectsEnabled() || !settings.redditHideRecommendations) {
      restoreHiddenElementsByKind("reddit-module");
      return;
    }

    document
      .querySelectorAll("aside, section, [data-testid*='recommend'], [class*='recommend']")
      .forEach((module) => {
        const text = getElementText(module).toLowerCase();
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

    if (!effectsEnabled() || (!settings.substackHideRecommendations && !canFilterContent)) {
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
    if (!effectsEnabled() || !settings.substackHideRecommendations) {
      restoreHiddenElementsByKind("substack-module");
      return;
    }

    document
      .querySelectorAll("aside, section, [data-testid*='recommend'], [class*='recommend']")
      .forEach((module) => {
        const text = getElementText(module).toLowerCase();
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

    if (!effectsEnabled() || !canFilterContent) {
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
    if (
      !effectsEnabled() ||
      !settings.twitterEnforceFollowing ||
      !isTwitterHome() ||
      twitterFollowingPreferenceResolved
    ) {
      return;
    }

    const followingTab = findTwitterTab("Following");
    const forYouTab = findTwitterTab("For you");
    const forYouSelected = forYouTab && forYouTab.getAttribute("aria-selected") === "true";
    const followingSelected = followingTab && followingTab.getAttribute("aria-selected") === "true";

    if (followingSelected) {
      twitterFollowingPreferenceResolved = true;
      return;
    }

    if (followingTab && forYouSelected) {
      twitterFollowingPreferenceResolved = true;
      followingTab.click();
    }
  }

  function installTwitterTabPreferenceListener() {
    if (twitterTabPreferenceListenerInstalled) {
      return;
    }

    twitterTabPreferenceListenerInstalled = true;
    document.addEventListener(
      "click",
      (event) => {
        const tab = event.target.closest && event.target.closest('[role="tab"]');

        if (!tab) {
          return;
        }

        const label = normalizeInlineText(tab.textContent);

        if (label === "For you" || label === "Following") {
          twitterFollowingPreferenceResolved = true;
        }
      },
      true
    );
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
      installScrollPauseInputBlockers();
      return;
    }

    document.documentElement.classList.add("smooth-surfer-scroll-paused");
    installScrollPauseInputBlockers();
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

  function installScrollPauseInputBlockers() {
    if (scrollPauseInputBlockersInstalled) {
      return;
    }

    scrollPauseInputBlockersInstalled = true;
    window.addEventListener("wheel", blockPausedScroll, { capture: true, passive: false });
    window.addEventListener("touchmove", blockPausedScroll, { capture: true, passive: false });
    window.addEventListener("keydown", blockPausedScrollKey, true);
  }

  function blockPausedScroll(event) {
    if (!document.documentElement.classList.contains("smooth-surfer-scroll-paused")) {
      return;
    }

    event.preventDefault();
  }

  function blockPausedScrollKey(event) {
    if (
      !document.documentElement.classList.contains("smooth-surfer-scroll-paused") ||
      !SCROLL_PAUSE_KEYS.has(event.key) ||
      isEditableElement(event.target)
    ) {
      return;
    }

    event.preventDefault();
  }

  function isEditableElement(element) {
    return Boolean(
      element &&
        (element.isContentEditable ||
          /^(input|select|textarea)$/i.test(element.tagName || ""))
    );
  }

  function removeScrollPause() {
    document.documentElement.classList.remove("smooth-surfer-scroll-paused");

    if (!scrollPause) {
      return;
    }

    scrollPause.remove();
    scrollPause = null;
  }

  function installVideoSpeedHotkeys() {
    document.addEventListener(
      "keydown",
      (event) => {
        if (!settings.enabled || !settings.videoSpeedHotkeys) {
          return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey || isEditableElement(event.target)) {
          return;
        }

        let delta = 0;

        if (event.key === "]") {
          delta = SPEED_STEP;
        } else if (event.key === "[") {
          delta = -SPEED_STEP;
        } else if (event.key !== "\\") {
          return;
        }

        const video = findActiveVideo();

        if (!video) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const rate =
          delta === 0
            ? 1
            : clampSpeed(Math.round((video.playbackRate + delta) * 100) / 100);

        video.playbackRate = rate;
        showSpeedToast(rate);
      },
      true
    );
  }

  function clampSpeed(rate) {
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, rate));
  }

  function findActiveVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    const playing = videos.find(
      (video) => !video.paused && !video.ended && video.readyState > 1
    );

    if (playing) {
      return playing;
    }

    let best = null;
    let bestArea = 0;

    videos.forEach((video) => {
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;

      if (area > bestArea) {
        bestArea = area;
        best = video;
      }
    });

    return best;
  }

  function showSpeedToast(rate) {
    if (!speedToast) {
      speedToast = document.createElement("div");
      speedToast.className = "smooth-surfer-speed-toast";
      document.documentElement.append(speedToast);
    }

    speedToast.textContent = `${rate}×`;
    speedToast.classList.add("smooth-surfer-speed-toast-visible");
    window.clearTimeout(speedToastTimer);
    speedToastTimer = window.setTimeout(() => {
      speedToast.classList.remove("smooth-surfer-speed-toast-visible");
    }, 900);
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

    // Hold the item hidden until the verdict arrives. Revealing late beats
    // rendering content and yanking it out of the feed once Haiku answers.
    markPendingContent(container, kind);

    chrome.runtime.sendMessage(
      {
        type: "classifyContent",
        source: platform,
        text: normalizedText
      },
      (response) => {
        delete container.dataset.smoothSurferPendingKey;

        if (chrome.runtime.lastError) {
          restoreContentElement(container, kind);
          return;
        }

        const result = response || { blocked: false, reasons: [] };

        // Error fallbacks are transient; caching them would permanently mark
        // the post clean. Leave them uncached so a later scan retries.
        if (result.classifier !== "error") {
          modelClassifications.set(key, result);
        }

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
      effectsEnabled() &&
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

    // textContent, not innerText: innerText changes once the element is
    // display:none, which would give hidden tweets a new classification key
    // and make them oscillate between hidden and restored.
    if (tweetTextNodes.length > 0) {
      return tweetTextNodes.map((node) => node.textContent || "").join(" ");
    }

    return article.textContent || "";
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
    // textContent, not innerText: must be identical whether the element is
    // hidden or visible so classification keys stay stable after hiding.
    return normalizeInlineText(element.textContent || "");
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

  function markPendingContent(container, kind) {
    markPendingElement(container, kind);

    if (kind === "hacker-news-story") {
      const metaRow = getHackerNewsMetaRow(container);

      if (metaRow) {
        markPendingElement(metaRow, "hacker-news-story-meta");
      }
    }
  }

  function markPendingElement(element, kind) {
    if (element.dataset.smoothSurferHidden === "true") {
      return;
    }

    element.classList.add("smooth-surfer-hidden");
    element.dataset.smoothSurferHidden = "true";
    element.dataset.smoothSurferPending = "true";
    element.dataset.smoothSurferReasons = "pending classification";

    if (kind) {
      element.dataset.smoothSurferHiddenKind = kind;
    }
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
    // Pending items are display:none but not yet "hidden" for stats: a
    // blocked verdict on one still counts as a fresh hide.
    if (
      element.dataset.smoothSurferHidden !== "true" ||
      element.dataset.smoothSurferPending === "true"
    ) {
      recordHideStat(element, reasons, kind);
    }

    delete element.dataset.smoothSurferPending;
    element.classList.add("smooth-surfer-hidden");
    element.dataset.smoothSurferHidden = "true";
    element.dataset.smoothSurferReasons = reasons.join("; ");

    if (kind) {
      element.dataset.smoothSurferHiddenKind = kind;
    }
  }

  function recordHideStat(element, reasons, kind) {
    if (kind === "hacker-news-story-meta") {
      return;
    }

    const key = `${kind}|${reasons.join(";")}|${normalizeInlineText(element.textContent).slice(0, 80)}`;

    if (recordedStatKeys.has(key) || !hasChromeRuntime()) {
      return;
    }

    recordedStatKeys.add(key);
    chrome.runtime.sendMessage({
      type: "recordHide",
      source: platform === "unknown" ? "other" : platform,
      reasons
    });
  }

  function restoreElement(element) {
    if (element.dataset.smoothSurferHidden !== "true") {
      return;
    }

    element.classList.remove("smooth-surfer-hidden");
    delete element.dataset.smoothSurferHidden;
    delete element.dataset.smoothSurferHiddenKind;
    delete element.dataset.smoothSurferPending;
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
