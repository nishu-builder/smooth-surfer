(function installSmoothSurfer() {
  "use strict";

  const { loadSettings, watchSettings } = window.SmoothSurferStorage;
  const SCAN_DEBOUNCE_MS = 120;

  let settings = window.SmoothSurferSettings.normalizeSettings();
  let observer = null;
  let scanTimer = 0;
  const modelClassifications = new Map();

  const platform = getPlatform();

  start();

  function start() {
    loadSettings().then((loadedSettings) => {
      settings = loadedSettings;
      whenBodyReady(() => {
        applyEffects();
        startTwitterObserver();
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
  }

  function startTwitterObserver() {
    if (platform !== "twitter" || observer || !document.body) {
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
    container.classList.add("smooth-surfer-hidden");
    container.dataset.smoothSurferHidden = "true";
    container.dataset.smoothSurferReasons = reasons.join("; ");
  }

  function restoreTweet(container) {
    if (container.dataset.smoothSurferHidden !== "true") {
      return;
    }

    container.classList.remove("smooth-surfer-hidden");
    delete container.dataset.smoothSurferHidden;
    delete container.dataset.smoothSurferReasons;
  }

  function restoreHiddenTweets() {
    document.querySelectorAll('[data-smooth-surfer-hidden="true"]').forEach((element) => {
      restoreTweet(element);
    });
  }

  function normalizeInlineText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

})();
