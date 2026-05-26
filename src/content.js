(function installFeedDock() {
  "use strict";

  const STORAGE_KEY = "feedDockSettings";
  const DOCK_ID = "feed-dock-root";
  const SCAN_DEBOUNCE_MS = 120;
  const DEFAULT_SETTINGS = {
    enabled: true,
    dockCollapsed: false,
    dockPosition: "right",
    youtubeGrayscaleThumbnails: true,
    youtubeHideRecommendations: true,
    twitterHideAds: true,
    twitterFilterFomoAi: true,
    twitterCustomPatterns: ""
  };

  let settings = { ...DEFAULT_SETTINGS };
  let observer = null;
  let scanTimer = 0;
  let dockElements = null;

  const platform = getPlatform();

  start();

  function start() {
    loadSettings().then((loadedSettings) => {
      settings = normalizeSettings(loadedSettings);
      whenBodyReady(() => {
        createDock();
        renderDock();
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
        renderDock();
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

  function normalizeSettings(value) {
    const next = { ...DEFAULT_SETTINGS, ...(value || {}) };

    if (next.dockPosition !== "left" && next.dockPosition !== "right") {
      next.dockPosition = DEFAULT_SETTINGS.dockPosition;
    }

    next.twitterCustomPatterns = String(next.twitterCustomPatterns || "");

    return next;
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

  function saveSettings(partial) {
    settings = normalizeSettings({ ...settings, ...partial });
    renderDock();
    applyEffects();

    if (hasChromeStorage()) {
      chrome.storage.sync.set({ [STORAGE_KEY]: settings });
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      // Ignore storage failures. The current page still receives the setting.
    }
  }

  function whenBodyReady(callback) {
    if (document.body) {
      callback();
      return;
    }

    document.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  function createDock() {
    if (document.getElementById(DOCK_ID)) {
      return;
    }

    const host = document.createElement("div");
    host.id = DOCK_ID;
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = getDockMarkup();

    dockElements = {
      host,
      shadow,
      panel: shadow.querySelector("[data-feed-dock-panel]"),
      status: shadow.querySelector("[data-platform-status]"),
      collapseButton: shadow.querySelector("[data-action='collapse']"),
      sideButton: shadow.querySelector("[data-action='side']"),
      inputs: Array.from(shadow.querySelectorAll("[data-setting]"))
    };

    shadow.addEventListener("change", (event) => {
      const target = event.target;

      if (!target.matches("[data-setting]")) {
        return;
      }

      const setting = target.getAttribute("data-setting");
      const value = target.type === "checkbox" ? target.checked : target.value;
      saveSettings({ [setting]: value });
    });

    shadow.addEventListener("input", debounceTextInput((event) => {
      const target = event.target;

      if (!target.matches("textarea[data-setting]")) {
        return;
      }

      saveSettings({ [target.getAttribute("data-setting")]: target.value });
    }, 250));

    shadow.querySelector("[data-action='collapse']").addEventListener("click", () => {
      saveSettings({ dockCollapsed: !settings.dockCollapsed });
    });

    shadow.querySelector("[data-action='side']").addEventListener("click", () => {
      saveSettings({ dockPosition: settings.dockPosition === "right" ? "left" : "right" });
    });
  }

  function getDockMarkup() {
    return `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          position: fixed;
          z-index: 2147483647;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        .panel {
          position: fixed;
          top: 96px;
          width: 268px;
          max-width: calc(100vw - 24px);
          overflow: hidden;
          border: 1px solid rgba(23, 31, 42, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 14px 40px rgba(12, 18, 28, 0.18);
          color: #17202e;
          font-size: 13px;
          line-height: 1.35;
          backdrop-filter: blur(12px);
        }

        .panel.right {
          right: 16px;
        }

        .panel.left {
          left: 16px;
        }

        .panel.collapsed {
          width: auto;
        }

        header {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          padding: 8px 10px;
          border-bottom: 1px solid rgba(23, 31, 42, 0.12);
          background: #f7f8fa;
        }

        .title {
          flex: 1;
          min-width: 0;
          font-weight: 700;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .status {
          color: #5b6677;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        button {
          appearance: none;
          min-width: 32px;
          min-height: 28px;
          border: 1px solid rgba(23, 31, 42, 0.18);
          border-radius: 6px;
          background: #ffffff;
          color: #17202e;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }

        button:hover {
          background: #eef2f7;
        }

        .body {
          display: grid;
          gap: 10px;
          padding: 10px;
        }

        .panel.collapsed .body,
        .panel.collapsed .status,
        .panel.collapsed [data-action="side"] {
          display: none;
        }

        .group {
          display: grid;
          gap: 7px;
        }

        .group-title {
          color: #5b6677;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 30px;
          color: #17202e;
        }

        label span {
          min-width: 0;
        }

        input[type="checkbox"] {
          width: 36px;
          height: 20px;
          flex: 0 0 auto;
          accent-color: #176b5d;
          cursor: pointer;
        }

        textarea {
          width: 100%;
          min-height: 66px;
          resize: vertical;
          border: 1px solid rgba(23, 31, 42, 0.18);
          border-radius: 6px;
          padding: 8px;
          color: #17202e;
          background: #ffffff;
          font: inherit;
          line-height: 1.35;
        }

        textarea:disabled,
        input:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .hint {
          color: #5b6677;
          font-size: 11px;
        }

        @media (max-width: 520px) {
          .panel {
            top: 72px;
            right: 8px;
            left: 8px;
            width: auto;
          }

          .panel.left,
          .panel.right {
            right: 8px;
            left: 8px;
          }
        }
      </style>
      <aside class="panel" data-feed-dock-panel aria-label="Feed Dock">
        <header>
          <div class="title">Feed Dock</div>
          <div class="status" data-platform-status></div>
          <button type="button" data-action="side" title="Move dock">Side</button>
          <button type="button" data-action="collapse" title="Collapse dock">_</button>
        </header>
        <div class="body">
          <div class="group">
            <label>
              <span>Enabled</span>
              <input type="checkbox" data-setting="enabled">
            </label>
          </div>
          <div class="group">
            <div class="group-title">YouTube</div>
            <label>
              <span>Gray thumbnails</span>
              <input type="checkbox" data-setting="youtubeGrayscaleThumbnails">
            </label>
            <label>
              <span>Hide recommendations</span>
              <input type="checkbox" data-setting="youtubeHideRecommendations">
            </label>
          </div>
          <div class="group">
            <div class="group-title">X / Twitter</div>
            <label>
              <span>Remove feed ads</span>
              <input type="checkbox" data-setting="twitterHideAds">
            </label>
            <label>
              <span>Filter AI-upside FOMO</span>
              <input type="checkbox" data-setting="twitterFilterFomoAi">
            </label>
            <textarea data-setting="twitterCustomPatterns" spellcheck="false" placeholder="Custom tweet phrases, one per line"></textarea>
            <div class="hint">Custom phrases always hide matching tweets when filtering is on.</div>
          </div>
        </div>
      </aside>
    `;
  }

  function renderDock() {
    if (!dockElements) {
      return;
    }

    dockElements.panel.classList.toggle("left", settings.dockPosition === "left");
    dockElements.panel.classList.toggle("right", settings.dockPosition === "right");
    dockElements.panel.classList.toggle("collapsed", settings.dockCollapsed);
    dockElements.status.textContent = platform === "twitter" ? "X" : platform;
    dockElements.collapseButton.textContent = settings.dockCollapsed ? "Open" : "_";
    dockElements.collapseButton.title = settings.dockCollapsed ? "Open dock" : "Collapse dock";

    dockElements.inputs.forEach((input) => {
      const setting = input.getAttribute("data-setting");

      if (input.type === "checkbox") {
        input.checked = Boolean(settings[setting]);
        input.disabled = setting !== "enabled" && !settings.enabled;
      } else {
        input.value = settings[setting] || "";
        input.disabled = !settings.enabled || !settings.twitterFilterFomoAi;
      }
    });
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

    if (!settings.enabled || (!settings.twitterHideAds && !settings.twitterFilterFomoAi)) {
      restoreHiddenTweets();
      return;
    }

    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      const container = getTweetContainer(article);
      const reasons = [];

      if (settings.twitterHideAds && isPromotedTweet(article)) {
        reasons.push("ad");
      }

      if (settings.twitterFilterFomoAi) {
        const classification = window.FeedDockRules.classifyTweetText(
          getTweetText(article),
          settings.twitterCustomPatterns
        );

        if (classification.blocked) {
          reasons.push(...classification.reasons);
        }
      }

      if (reasons.length > 0) {
        hideTweet(container, reasons);
      } else {
        restoreTweet(container);
      }
    });
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

  function debounceTextInput(callback, delay) {
    let timeout = 0;

    return (event) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => callback(event), delay);
    };
  }
})();
