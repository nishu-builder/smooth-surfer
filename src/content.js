(function installFeedDock() {
  "use strict";

  const { DEFAULT_SETTINGS, STORAGE_KEY, normalizeSettings } = window.FeedDockSettings;
  const SCAN_DEBOUNCE_MS = 120;

  let settings = { ...DEFAULT_SETTINGS };
  let observer = null;
  let scanTimer = 0;
  const modelClassifications = new Map();

  const platform = getPlatform();

  start();

  function start() {
    loadSettings().then((loadedSettings) => {
      settings = normalizeSettings(loadedSettings);
      whenBodyReady(() => {
        applyEffects();
        startObserver();
      });
    });

    if (hasChromeStorage()) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync" || !changes[STORAGE_KEY]) {
          return;
        }

        settings = normalizeSettings(changes[STORAGE_KEY].newValue);
        applyEffects();
      });
    }
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

  function hasChromeStorage() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync &&
      typeof chrome.storage.sync.get === "function"
    );
  }

  function loadSettings() {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
          resolve(result[STORAGE_KEY]);
        });
      });
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return Promise.resolve(stored ? JSON.parse(stored) : DEFAULT_SETTINGS);
    } catch (error) {
      return Promise.resolve(DEFAULT_SETTINGS);
    }
  }

  function whenBodyReady(callback) {
    if (document.body) {
      callback();
      return;
    }

    document.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  function applyEffects() {
    applyRootClasses();
    scheduleScan();
  }

  function applyRootClasses() {
    const root = document.documentElement;

    root.classList.toggle(
      "feed-dock-youtube-gray",
      settings.enabled && platform === "youtube" && settings.youtubeGrayscaleThumbnails
    );
    root.classList.toggle(
      "feed-dock-youtube-hide-recs",
      settings.enabled && platform === "youtube" && settings.youtubeHideRecommendations
    );
  }

  function startObserver() {
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
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanPage, SCAN_DEBOUNCE_MS);
  }

  function scanPage() {
    if (platform !== "twitter") {
      return;
    }

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
        const classification = window.FeedDockRules.classifyTweetText(
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
        requestModelClassification(container, getTweetText(article), reasons);
      } else {
        restoreTweet(container);
      }
    });
  }

  function requestModelClassification(container, text, immediateReasons) {
    const key = getClassificationKey(text);
    const cached = modelClassifications.get(key);

    if (immediateReasons.length > 0) {
      hideTweet(container, immediateReasons);
    }

    if (cached) {
      applyModelClassification(container, cached, immediateReasons);
      return;
    }

    if (container.dataset.feedDockPendingKey === key) {
      return;
    }

    container.dataset.feedDockPendingKey = key;

    if (!hasChromeRuntime()) {
      const fallback = {
        blocked: false,
        reasons: []
      };
      modelClassifications.set(key, fallback);
      applyModelClassification(container, fallback, immediateReasons);
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "classifyTweetContent",
        text
      },
      (response) => {
        delete container.dataset.feedDockPendingKey;

        if (chrome.runtime.lastError) {
          return;
        }

        const result = response || { blocked: false, reasons: [] };
        modelClassifications.set(key, result);
        applyModelClassification(container, result, immediateReasons);
      }
    );
  }

  function applyModelClassification(container, classification, immediateReasons) {
    const reasons = [...immediateReasons];

    if (classification.blocked) {
      reasons.push(...classification.reasons);
    }

    if (reasons.length > 0) {
      hideTweet(container, reasons);
    } else {
      restoreTweet(container);
    }
  }

  function getClassificationKey(text) {
    return JSON.stringify({
      mode: settings.twitterClassifierMode,
      criteria: settings.twitterFilterCriteria,
      text: window.FeedDockRules.normalizeText(text)
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
    container.classList.add("feed-dock-hidden");
    container.dataset.feedDockHidden = "true";
    container.dataset.feedDockReasons = reasons.join("; ");
  }

  function restoreTweet(container) {
    if (container.dataset.feedDockHidden !== "true") {
      return;
    }

    container.classList.remove("feed-dock-hidden");
    delete container.dataset.feedDockHidden;
    delete container.dataset.feedDockReasons;
  }

  function restoreHiddenTweets() {
    document.querySelectorAll('[data-feed-dock-hidden="true"]').forEach((element) => {
      restoreTweet(element);
    });
  }

  function normalizeInlineText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

})();
