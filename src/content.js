(function installSmoothSurfer() {
  "use strict";

  const { loadReview, watchReview, loadSecrets, loadSettings, watchSecrets, watchSettings } =
    window.SmoothSurferStorage;
  const { getPlatformForUrl, isWithinFocusWindow, normalizeImageUrls, FORMAT_KEYS, FORMAT_LABELS } =
    window.SmoothSurferSettings;
  const SCAN_DEBOUNCE_MS = 120;
  const SCROLL_BREAK_SCREENFULS = 16;
  const CLASSIFICATION_TIMEOUT_MS = 12000;
  const CLASSIFICATION_RETRY_MS = 30000;
  const CLASSIFICATION_CACHE_LIMIT = 500;
  const TWEET_FADE_MS = 160;
  const SPEED_MIN = 0.25;
  const SPEED_MAX = 4;
  const SPEED_STEP = 0.25;
  const SETTINGS_HOTKEY_DOUBLE_TAP_MS = 500;
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
  const REDDIT_TEXT_SELECTORS = [
    '[slot="title"]',
    '[slot="text-body"]',
    '[data-testid="post-title"]',
    '[data-click-id="text"]',
    "a.title",
    ".usertext-body"
  ];
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
  let restoredPosts = new Set();
  const recordedReviewKeys = new Set();
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
  let lastSettingsHotkeyTime = 0;
  const modelClassifications = new Map();
  const inFlightClassifications = new Map();
  const pendingClassifications = new WeakMap();
  const tweetIdentities = new WeakMap();
  const tweetFadeTimers = new WeakMap();
  let classificationEpoch = 0;
  const recordedStatKeys = new Set();
  const recordedConsumptionKeys = new Set();

  const platform = getPlatform();
  installMessageListener();
  installVideoSpeedHotkeys();
  installSettingsHotkey();

  start();

  function start() {
    Promise.all([loadSettings(), loadSecrets(), loadReview ? loadReview() : null]).then(
      ([loadedSettings, loadedSecrets, review]) => {
        restoredPosts = new Set(review?.restored || []);
        settings = loadedSettings;
        secrets = loadedSecrets;
        whenBodyReady(() => {
          applyEffects();
          scanPage();
          startPageObserver();
        });
      }
    );

    if (watchReview)
      watchReview((review) => {
        const next = new Set(review.restored);
        if (next.size === restoredPosts.size && [...next].every((key) => restoredPosts.has(key)))
          return;
        restoredPosts = next;
        resetClassifications(false);
        scanPage();
      });

    watchSettings((nextSettings) => {
      const contentSettings = [
        "enabled",
        "filterCriteria",
        "imageAnalysisEnabled",
        "aiProvider",
        ...FORMAT_KEYS,
        "consumptionFactsEnabled",
        "focusScheduleEnabled",
        "focusScheduleStart",
        "focusScheduleEnd",
        ...Object.values(CONTENT_FILTER_SETTING_BY_PLATFORM)
      ];
      if (
        contentSettings.some(
          (key) => JSON.stringify(nextSettings[key]) !== JSON.stringify(settings[key])
        )
      ) {
        const verdictsChanged =
          nextSettings.aiProvider !== settings.aiProvider ||
          nextSettings.imageAnalysisEnabled !== settings.imageAnalysisEnabled ||
          nextSettings.consumptionFactsEnabled !== settings.consumptionFactsEnabled ||
          JSON.stringify(nextSettings.filterCriteria) !== JSON.stringify(settings.filterCriteria);
        resetClassifications(verdictsChanged);
      }
      settings = nextSettings;

      applyEffects();
    });

    watchSecrets((nextSecrets) => {
      resetClassifications();
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
      // React can replace a tweet or mutate its text in an existing cell.
      // Reconcile those cells before paint, including cached blocked posts.
      fastProcessAddedNodes(mutations);
      scheduleScan();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: platform === "twitter",
      attributes: platform === "twitter",
      attributeFilter:
        platform === "twitter" ? ["href", "data-testid", "alt", "src", "srcset"] : undefined
    });

    window.setInterval(scheduleScan, 2000);
    window.addEventListener("scroll", scheduleScan, { passive: true });
  }

  function scheduleScan() {
    // A trailing debounce never runs during continuous scrolling/mutations.
    if (!scanTimer) {
      scanTimer = window.setTimeout(scanPage, SCAN_DEBOUNCE_MS);
    }
  }

  function scanPage() {
    window.clearTimeout(scanTimer);
    scanTimer = 0;
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
      removeScrollPause();
      return;
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
      .querySelectorAll(
        "ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer"
      )
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

    if (
      !effectsEnabled() ||
      (!settings.twitterHideAds && !canFilterContent && !hasFormatFilters())
    ) {
      restoreHiddenTweets();
      return;
    }

    Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
      .sort((a, b) => classificationPriority(a) - classificationPriority(b))
      .forEach((article) => {
        processTweetArticle(article, canFilterContent);
      });
  }

  function processTweetArticle(article, canFilterContent) {
    const container = getTweetContainer(article);
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    // A conversation may gain or lose replies in place. Move filtering to
    // individual articles while they share a cell, so a blocked reply cannot
    // hide the whole thread or overwrite another article's pending request.
    if (cell && cell !== container && cell.dataset.smoothSurferHiddenKind === "tweet") {
      restoreElement(cell);
    }
    if (article !== container && article.dataset.smoothSurferHiddenKind === "tweet") {
      restoreElement(article);
    }
    const identity = getTweetIdentity(article);
    if (tweetIdentities.get(container) !== identity) {
      restoreElement(container);
      tweetIdentities.set(container, identity);
    }
    const reasons = [];

    if (settings.twitterHideAds && isPromotedTweet(article)) {
      reasons.push("ad");
    }

    if (reasons.length > 0) {
      hideTweet(container, reasons, true);
      return;
    }

    if (window.SmoothSurferFeedback)
      window.SmoothSurferFeedback.install(article, () => getTweetText(article));
    const images = getPostImages(article);
    const text = getTweetText(article);
    if (isReviewPostRestored(container, text, images)) {
      restoreElement(container);
      return;
    }
    const formats = getTweetFormats(article).filter((key) => settings[key]);
    if (formats.length) {
      const classification = {
        blocked: true,
        reasons: formats.map((key) => FORMAT_LABELS[key]),
        formats
      };
      recordReviewPost(container, text, classification, images);
      hideTweet(container, classification.reasons, true);
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

    if (!settings.twitterHideAds && !canFilterContent && !hasFormatFilters()) {
      return;
    }

    const articles = new Set();
    const collect = (node, descendants = false) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!element || !element.isConnected) return;
      const article = element.closest('article[data-testid="tweet"]');
      if (article) articles.add(article);
      if (descendants || element.matches('[data-testid="cellInnerDiv"]')) {
        element
          .querySelectorAll('article[data-testid="tweet"]')
          .forEach((tweet) => articles.add(tweet));
      }
      const cell = element.closest('[data-testid="cellInnerDiv"]');
      if (
        cell &&
        !cell.querySelector('article[data-testid="tweet"]') &&
        cell.dataset.smoothSurferHiddenKind === "tweet"
      ) {
        restoreElement(cell);
      }
    };
    mutations.forEach((mutation) => {
      collect(mutation.target);
      mutation.addedNodes.forEach((node) => collect(node, true));
    });
    [...articles]
      .sort((a, b) => classificationPriority(a) - classificationPriority(b))
      .forEach((article) => processTweetArticle(article, canFilterContent));
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
        requestModelClassification(container, getRedditPostText(container), "reddit-post");
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
      requestModelClassification(row, getHackerNewsCommentText(row), "hacker-news-comment");
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

        const label = normalizeInlineText(tab.textContent).toLowerCase();

        if (label === "for you" || label === "following") {
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
    const wanted = label.toLowerCase();

    return Array.from(document.querySelectorAll('[role="tab"]')).find(
      (tab) => normalizeInlineText(tab.textContent).toLowerCase() === wanted
    );
  }

  function checkDeepScroll() {
    if (!scrollLimit) {
      scrollLimit = window.innerHeight * SCROLL_BREAK_SCREENFULS;
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
      <span>Scrolling paused.</span>
      <button type="button">Keep going</button>
    `;
    scrollPause.querySelector("button").addEventListener("click", () => {
      scrollLimit = window.scrollY + window.innerHeight * SCROLL_BREAK_SCREENFULS;
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
      (element.isContentEditable || /^(input|select|textarea)$/i.test(element.tagName || ""))
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

        if (!speedModifierMatches(event) || isEditableElement(event.target)) {
          return;
        }

        // Match on physical key position rather than event.key: holding
        // Alt/Option remaps event.key on macOS (Option+] becomes "‘"), but
        // event.code stays "BracketRight".
        let delta = 0;

        if (event.code === "BracketRight") {
          delta = SPEED_STEP;
        } else if (event.code === "BracketLeft") {
          delta = -SPEED_STEP;
        } else if (event.code !== "Backslash") {
          return;
        }

        const video = findActiveVideo();

        if (!video) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const rate =
          delta === 0 ? 1 : clampSpeed(Math.round((video.playbackRate + delta) * 100) / 100);

        video.playbackRate = rate;
        showSpeedToast(rate);
      },
      true
    );
  }

  function speedModifierMatches(event) {
    const required = settings.videoSpeedModifier || "alt";
    const held = {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      meta: event.metaKey
    };

    if (required === "none") {
      return !held.alt && !held.ctrl && !held.shift && !held.meta;
    }

    // The chosen modifier must be down and no other modifier may be, so the
    // shortcut doesn't collide with combos like Ctrl+Alt+].
    return Object.keys(held).every((key) => (key === required ? held[key] : !held[key]));
  }

  function installSettingsHotkey() {
    document.addEventListener(
      "keydown",
      (event) => {
        if (!settings.enabled || !settings.settingsHotkeyEnabled || event.repeat) {
          return;
        }

        // Cmd+Shift+S on macOS, Ctrl+Shift+S elsewhere. Two taps within the
        // window open the popup.
        if (
          !(event.metaKey || event.ctrlKey) ||
          !event.shiftKey ||
          event.altKey ||
          event.code !== "KeyS"
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const now = Date.now();

        if (now - lastSettingsHotkeyTime <= SETTINGS_HOTKEY_DOUBLE_TAP_MS) {
          lastSettingsHotkeyTime = 0;
          requestOpenSettings();
        } else {
          lastSettingsHotkeyTime = now;
        }
      },
      true
    );
  }

  function requestOpenSettings() {
    if (!hasChromeRuntime()) {
      return;
    }

    chrome.runtime.sendMessage({ type: "openSmoothSurferSettings" }, () => {
      // The popup may not be openable (e.g. older Chrome); swallow the error.
      void chrome.runtime.lastError;
    });
  }

  function clampSpeed(rate) {
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, rate));
  }

  function findActiveVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    const playing = videos.find((video) => !video.paused && !video.ended && video.readyState > 1);

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

  function resetClassifications(clearCache = true) {
    classificationEpoch += 1;
    inFlightClassifications.clear();
    if (clearCache) {
      modelClassifications.clear();
    } else {
      // An on/off toggle invalidates callbacks, not already known verdicts.
      // Retry transient failures immediately when filtering is re-enabled.
      for (const [key, result] of modelClassifications) {
        if (result.retryAt) modelClassifications.delete(key);
      }
    }
  }

  function cacheClassification(key, result) {
    modelClassifications.delete(key);
    modelClassifications.set(key, result);
    if (modelClassifications.size > CLASSIFICATION_CACHE_LIMIT) {
      modelClassifications.delete(modelClassifications.keys().next().value);
    }
  }

  function requestModelClassification(container, text, kind) {
    const normalizedText = normalizeInlineText(text).slice(0, 2000);
    const reviewImages = getPostImages(container);
    const images = settings.imageAnalysisEnabled ? reviewImages : [];
    if (!normalizedText && !images.length) {
      restoreContentElement(container, kind);
      return;
    }

    if (isReviewPostRestored(container, normalizedText, reviewImages)) {
      pendingClassifications.delete(container);
      delete container.dataset.smoothSurferPendingKey;
      restoreContentElement(container, kind);
      return;
    }
    const key = getClassificationKey(normalizedText, images);
    const cached = modelClassifications.get(key);
    if (cached && (!cached.retryAt || cached.retryAt > Date.now())) {
      pendingClassifications.delete(container);
      delete container.dataset.smoothSurferPendingKey;
      applyModelClassification(container, cached, kind, normalizedText, reviewImages, true);
      recordConsumptionStat(key, cached, container);
      return;
    }

    // Classify the visible feed and the next two screens before distant posts.
    if (kind === "tweet") {
      const rect = container.getBoundingClientRect();
      if (rect.top > window.innerHeight * 3 || rect.bottom < -window.innerHeight) return;
    }
    const existing = pendingClassifications.get(container);
    if (existing && existing.key === key && existing.epoch === classificationEpoch) return;

    const request = {
      key,
      epoch: classificationEpoch,
      identity: kind === "tweet" ? getTweetIdentity(getTweetArticle(container)) : null,
      review: captureReviewPost(container, normalizedText, reviewImages)
    };
    pendingClassifications.set(container, request);
    container.dataset.smoothSurferPendingKey = key;
    if (kind === "tweet" || container.dataset.smoothSurferCleared !== "true") {
      markPendingContent(container, kind);
    }

    let promise = inFlightClassifications.get(key);
    if (!promise) {
      promise = new Promise((resolve) => {
        let finished = false;
        const finish = (response) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timeout);
          const result =
            response && typeof response.blocked === "boolean"
              ? response
              : {
                  blocked: false,
                  reasons: [],
                  classifier: "error"
                };
          if (result.classifier === "error" || result.classifier === "disabled") {
            result.retryAt = Date.now() + CLASSIFICATION_RETRY_MS;
          }
          if (request.epoch === classificationEpoch) cacheClassification(key, result);
          resolve(result);
        };
        const timeout = window.setTimeout(
          () => finish(null),
          settings.aiProvider === "local" ? 180000 : CLASSIFICATION_TIMEOUT_MS
        );
        try {
          if (!hasChromeRuntime()) {
            finish(null);
          } else {
            chrome.runtime.sendMessage(
              {
                type: "classifyContent",
                source: platform,
                text: normalizedText,
                images,
                priority: classificationPriority(container)
              },
              (response) => finish(chrome.runtime.lastError ? null : response)
            );
          }
        } catch {
          // Extension reloads can invalidate the runtime while a tab stays open.
          finish(null);
        }
      });
      inFlightClassifications.set(key, promise);
      promise.then(() => {
        if (inFlightClassifications.get(key) === promise) inFlightClassifications.delete(key);
      });
    }

    promise.then((result) => {
      // X recycles rows while Nano is working. Preserve a completed ruling from
      // the original snapshot even after its row disappears or changes identity.
      // Settings changes and explicit restores still invalidate late results.
      if (request.epoch !== classificationEpoch || !canFilterPlatformContent(platform)) return;
      if (result.blocked && request.review && !isReviewSnapshotRestored(request.review))
        recordReviewSnapshot(request.review, result);
      if (
        !container.isConnected ||
        pendingClassifications.get(container) !== request ||
        request.epoch !== classificationEpoch ||
        !canFilterPlatformContent(platform)
      )
        return;
      if (kind === "tweet") {
        const article = getTweetArticle(container);
        if (
          !article ||
          getTweetContainer(article) !== container ||
          request.identity !== getTweetIdentity(article)
        )
          return;
      }
      pendingClassifications.delete(container);
      delete container.dataset.smoothSurferPendingKey;
      applyModelClassification(container, result, kind, normalizedText, reviewImages);
      recordConsumptionStat(key, result, container);
    });
  }

  function applyModelClassification(
    container,
    classification,
    kind,
    text,
    images,
    immediate = false
  ) {
    if (classification.blocked && !isReviewPostRestored(container, text, images)) {
      recordReviewPost(container, text, classification, images);
      hideContentElement(container, classification.reasons || [], kind, immediate);
    } else {
      container.dataset.smoothSurferCleared = "true";
      restoreContentElement(container, kind);
    }
  }

  function reviewKey(text, images = [], url = "") {
    return window.SmoothSurferSettings.getReviewPostKey(platform, text, images, url);
  }

  function isReviewPostRestored(container, text, images = []) {
    if (restoredPosts.has(reviewKey(text, images))) return true;
    const article = platform === "twitter" ? getTweetArticle(container) : container;
    const url = article?.querySelector('a[href*="/status/"] time')?.closest("a")?.href;
    return Boolean(url && restoredPosts.has(reviewKey(text, images, url)));
  }

  function classificationPriority(container) {
    const rect = container.getBoundingClientRect();
    if (rect.bottom < 0) return 100000 + Math.abs(rect.bottom);
    if (rect.top < window.innerHeight) return 0;
    return rect.top - window.innerHeight;
  }

  function recordReviewPost(container, text, classification, images = []) {
    const post = captureReviewPost(container, text, images);
    if (post) recordReviewSnapshot(post, classification);
  }

  function isReviewSnapshotRestored(post) {
    return (
      restoredPosts.has(reviewKey(post.text, post.images, post.url)) ||
      restoredPosts.has(reviewKey(post.text, post.images))
    );
  }

  function captureReviewPost(container, text, images = []) {
    const article = platform === "twitter" ? getTweetArticle(container) : container;
    if (!article) return;
    let link = article.querySelector("time")?.closest("a");
    if (!link && platform === "reddit") link = article.querySelector('a[href*="/comments/"]');
    if (!link && platform === "hacker-news") link = article.querySelector('a[href^="item?id="]');
    if (!link && platform === "substack") link = article.querySelector('a[href*="/p/"]');
    return {
      source: platform,
      text,
      author: article.querySelector('[data-testid="User-Name"]')?.textContent || "",
      images,
      display: platform === "twitter" ? getTweetDisplay(article) : { text },
      url: link?.href || ""
    };
  }

  function recordReviewSnapshot(post, classification) {
    const id = reviewKey(post.text, post.images, post.url);
    const recordKey = JSON.stringify([
      id,
      classification.matchedCriteria || [],
      classification.formats || []
    ]);
    if (recordedReviewKeys.has(recordKey) || !hasChromeRuntime()) return;
    recordedReviewKeys.add(recordKey);
    try {
      chrome.runtime.sendMessage(
        {
          type: "recordFilteredPost",
          post: {
            ...post,
            formats: classification.formats || [],
            reasons: classification.reasons || [],
            criteria: classification.matchedCriteria || []
          }
        },
        (response) => {
          if (chrome.runtime.lastError || !response?.ok) recordedReviewKeys.delete(recordKey);
        }
      );
    } catch {
      recordedReviewKeys.delete(recordKey);
    }
  }

  function recordConsumptionStat(key, result, container) {
    // Count approved posts only when they intersect the viewport. Pending,
    // blocked, disabled and failed classifications do not count as consumed.
    if (
      !settings.consumptionFactsEnabled ||
      result.blocked ||
      !["claude-haiku", "chrome-nano"].includes(result.classifier) ||
      recordedConsumptionKeys.has(key) ||
      !hasChromeRuntime()
    ) {
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.height === 0) return;
    recordedConsumptionKeys.add(key);
    chrome.runtime.sendMessage({
      type: "recordConsumption",
      key,
      source: platform === "unknown" ? "other" : platform,
      tags: Array.isArray(result.tags) ? result.tags : []
    });
  }

  function getClassificationKey(text, images = []) {
    return JSON.stringify({
      classifier: settings.aiProvider === "local" ? "chrome-nano" : "claude-haiku",
      consumption: Boolean(settings.consumptionFactsEnabled),
      criteria: settings.filterCriteria,
      imageAnalysis: settings.imageAnalysisEnabled,
      images,
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
      (settings.aiProvider === "local" || secrets.anthropicApiKey)
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
      // A tweet or quoted post saying "Ad" is not an advertising label.
      if (element.closest('[data-testid="tweetText"], [data-testid="card.wrapper"], [role="link"]'))
        return false;
      const text = normalizeInlineText(element.textContent);
      return element.children.length === 0 && (text === "Promoted" || text === "Ad");
    });
  }

  function getTweetArticle(container) {
    return container.matches('article[data-testid="tweet"]')
      ? container
      : container.querySelector('article[data-testid="tweet"]');
  }

  function getTweetDisplay(article) {
    const quote =
      article.querySelector('[data-testid="quoteTweet"], [data-testid="quote-tweet"]') ||
      article.querySelector('[role="link"] [data-testid="tweetText"]')?.closest('[role="link"]');
    const author = (node) => {
      const names = node.querySelector('[data-testid="User-Name"]');
      const lines = (names?.innerText || "")
        .split("\n")
        .map((text) => text.trim())
        .filter(Boolean);
      return {
        name:
          names?.querySelector("a")?.innerText?.trim() ||
          (lines.find((text) => !text.startsWith("@") && text !== "·") || "").split("@")[0].trim(),
        handle: names?.textContent?.match(/@[A-Za-z0-9_]{1,15}/)?.[0] || ""
      };
    };
    const primaryText = [...article.querySelectorAll('[data-testid="tweetText"]')].find(
      (node) => !quote?.contains(node)
    );
    return {
      ...author(article),
      text: primaryText?.innerText || "",
      avatar: article.querySelector('[data-testid^="UserAvatar"] img')?.src || "",
      postedAt: article.querySelector("time")?.dateTime || "",
      quoted: quote
        ? {
            ...author(quote),
            text: quote.querySelector('[data-testid="tweetText"]')?.innerText || quote.innerText
          }
        : null
    };
  }

  function getTweetIdentity(article) {
    if (!article) return "";
    const permalink = article.querySelector('a[href*="/status/"] time')?.closest("a");
    return `${permalink?.getAttribute("href") || ""}|${getTweetText(article)}|${getPostImages(article).join("|")}|${getTweetFormats(article).join("|")}`;
  }

  function getTweetText(article) {
    if (!article) return "";
    // Only stable content participates in classification: live counts, relative
    // timestamps and action labels otherwise cause repeated requests on media posts.
    const parts = Array.from(
      article.querySelectorAll('[data-testid="tweetText"], [data-testid="card.wrapper"]')
    ).map((node) => node.textContent || "");
    article.querySelectorAll('[data-testid="tweetPhoto"] img[alt]').forEach((image) => {
      const alt = image.getAttribute("alt");
      if (alt && alt !== "Image") parts.push(alt);
    });
    const text = normalizeInlineText(parts.join(" "));
    if (!text && !getPostImages(article).length && getTweetFormats(article).length) {
      const link = article.querySelector('a[href*="/status/"] time')?.closest("a");
      if (link) return `Media post: ${link.href}`;
    }
    return text;
  }

  function hasFormatFilters() {
    return FORMAT_KEYS.some((key) => settings[key]);
  }

  function getTweetFormats(article) {
    if (!article) return [];
    const formats = [];
    const context = article.querySelector('[data-testid="socialContext"]');
    if (
      context &&
      (/\b(reposted|retweeted)\b/i.test(context.textContent) ||
        context.querySelector('[data-testid="retweet"]'))
    )
      formats.push("twitterHideReposts");
    if (
      article.querySelector(
        '[data-testid="quoteTweet"], [data-testid="quote-tweet"], [role="link"] [data-testid="tweetText"]'
      )
    )
      formats.push("twitterHideQuotes");
    if (article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'))
      formats.push("twitterHideVideos");
    return formats;
  }

  function getPostImages(container) {
    return normalizeImageUrls(
      [...container.querySelectorAll("img")].map((image) => image.currentSrc || image.src)
    );
  }

  function getTweetContainer(article) {
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    return cell && cell.querySelectorAll('article[data-testid="tweet"]').length === 1
      ? cell
      : article;
  }

  function getRedditPostContainers() {
    return uniqueElements(
      Array.from(
        document.querySelectorAll(
          "shreddit-post, article, [data-testid='post-container'], [data-testid='post'], [slot='post-container']"
        )
      )
        .map(
          (element) =>
            element.closest("shreddit-post, article, [data-testid='post-container']") || element
        )
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

    return Array.from(container.querySelectorAll("span, div, faceplate-tracker")).some(
      (element) => {
        const text = normalizeInlineText(element.textContent).toLowerCase();

        return text === "promoted" || text === "sponsored";
      }
    );
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
        .map(
          (element) =>
            element.closest("article, [data-testid*='post'], [class*='post-preview']") || element
        )
        .filter((element) => element && document.body.contains(element))
    );
  }

  function getRedditPostText(container) {
    const parts = [];

    REDDIT_TEXT_SELECTORS.forEach((selector) => {
      container.querySelectorAll(selector).forEach((node) => {
        parts.push(node.textContent || "");
      });
    });

    if (parts.length > 0) {
      return parts.join(" ");
    }

    const postTitle = container.getAttribute && container.getAttribute("post-title");

    // Nothing named the post's own words, so take the whole card and accept
    // that its counters make the classification key less stable.
    return postTitle || getElementText(container);
  }

  function getHackerNewsCommentText(row) {
    const comment = row.querySelector(".commtext");

    // The comment head carries the author and an age that reads "3 hours ago"
    // until it reads "4 hours ago"; only the body itself stays put.
    return comment ? comment.textContent || "" : getElementText(row);
  }

  function getHackerNewsStoryText(row) {
    const title = row.querySelector(".titleline, .storylink, .title a");
    const site = row.querySelector(".sitestr");

    return normalizeInlineText(
      `${title ? title.textContent : row.textContent} ${site ? site.textContent : ""}`
    );
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

  function hideTweet(container, reasons, immediate = false) {
    hideElement(container, reasons, "tweet", immediate);
  }

  function markPendingContent(container, kind) {
    // Local inference can be slower. Keep posts readable while it works.
    if (settings.aiProvider === "local") return;
    if (kind === "tweet") {
      // Keep X's measured cell height intact while waiting. Collapsing every
      // unknown post makes its virtual timeline repeatedly shrink and expand.
      container.dataset.smoothSurferPending = "true";
      container.dataset.smoothSurferHiddenKind = kind;
    } else {
      markPendingElement(container, kind);
    }

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

  function hideContentElement(container, reasons, kind, immediate = false) {
    hideElement(container, reasons, kind, immediate);

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

  function hideElement(element, reasons, kind, immediate = false) {
    // A pending review only becomes a hide once a blocked verdict arrives.
    if (
      element.dataset.smoothSurferHidden !== "true" ||
      element.dataset.smoothSurferPending === "true"
    ) {
      recordHideStat(element, reasons, kind);
    }

    pendingClassifications.delete(element);
    delete element.dataset.smoothSurferPendingKey;
    delete element.dataset.smoothSurferPending;
    if (kind === "tweet") {
      hideTweetWithoutScrollJump(element, immediate);
    } else {
      element.classList.add("smooth-surfer-hidden");
    }
    element.dataset.smoothSurferHidden = "true";
    element.dataset.smoothSurferReasons = reasons.join("; ");

    if (kind) {
      element.dataset.smoothSurferHiddenKind = kind;
    }
  }

  function hideTweetWithoutScrollJump(element, immediate) {
    if (element.classList.contains("smooth-surfer-hidden") || tweetFadeTimers.has(element)) return;
    const rect = element.getBoundingClientRect();
    const deferred = element.classList.contains("smooth-surfer-tweet-deferred");
    // Keep measured space above the reading position. Collapse only when the
    // user returns far enough for this row to be below that position again.
    if (rect.bottom <= 0 || (deferred && rect.top < 100 && window.scrollY > 0)) {
      element.classList.add("smooth-surfer-tweet-deferred");
      return;
    }
    element.classList.remove("smooth-surfer-tweet-deferred");
    if (
      immediate ||
      deferred ||
      rect.top >= window.innerHeight ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      element.classList.add("smooth-surfer-hidden");
      return;
    }
    const identity = getTweetIdentity(getTweetArticle(element));
    const epoch = classificationEpoch;
    element.classList.add("smooth-surfer-tweet-fading");
    tweetFadeTimers.set(
      element,
      window.setTimeout(() => {
        tweetFadeTimers.delete(element);
        element.classList.remove("smooth-surfer-tweet-fading");
        if (
          !element.isConnected ||
          epoch !== classificationEpoch ||
          identity !== getTweetIdentity(getTweetArticle(element))
        )
          return;
        hideTweetWithoutScrollJump(element, true);
      }, TWEET_FADE_MS)
    );
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
    pendingClassifications.delete(element);
    window.clearTimeout(tweetFadeTimers.get(element));
    tweetFadeTimers.delete(element);
    element.classList.remove(
      "smooth-surfer-hidden",
      "smooth-surfer-tweet-fading",
      "smooth-surfer-tweet-deferred"
    );
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
    document.querySelectorAll(`[data-smooth-surfer-hidden-kind="${kind}"]`).forEach((element) => {
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
