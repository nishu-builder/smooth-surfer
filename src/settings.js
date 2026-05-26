(function createFeedDockSettings(root) {
  "use strict";

  const STORAGE_KEY = "feedDockSettings";
  const SECRETS_KEY = "feedDockSecrets";
  const DEFAULT_FILTER_CRITERIA = [
    "AI hype that pressures the reader with FOMO, loss framing, or financial upside."
  ];
  const DEFAULT_SETTINGS = {
    enabled: true,
    youtubeGrayscaleThumbnails: true,
    youtubeHideRecommendations: true,
    twitterHideAds: true,
    twitterFilterContent: true,
    twitterClassifierMode: "local-rules",
    twitterFilterCriteria: [...DEFAULT_FILTER_CRITERIA]
  };
  const DEFAULT_SECRETS = {
    anthropicApiKey: ""
  };

  function normalizeCriteria(value) {
    const items = Array.isArray(value)
      ? value
      : String(value || "")
          .split(/[\n,]/);

    const seen = new Set();
    const normalized = [];

    items
      .map((item) => String(item).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .forEach((item) => {
        const key = item.toLowerCase();

        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(item);
        }
      });

    return normalized;
  }

  function normalizeSettings(value) {
    const source = value || {};
    const next = { ...DEFAULT_SETTINGS, ...source };

    next.enabled = Boolean(next.enabled);
    next.youtubeGrayscaleThumbnails = Boolean(next.youtubeGrayscaleThumbnails);
    next.youtubeHideRecommendations = Boolean(next.youtubeHideRecommendations);
    next.twitterHideAds = Boolean(next.twitterHideAds);
    next.twitterFilterContent = Boolean(next.twitterFilterContent);
    next.twitterClassifierMode =
      next.twitterClassifierMode === "anthropic-haiku" ? "anthropic-haiku" : "local-rules";
    next.twitterFilterCriteria = normalizeCriteria(source.twitterFilterCriteria || DEFAULT_FILTER_CRITERIA);

    return next;
  }

  function normalizeSecrets(value) {
    const source = value || {};

    return {
      ...DEFAULT_SECRETS,
      anthropicApiKey: String(source.anthropicApiKey || "").trim()
    };
  }

  const api = {
    DEFAULT_FILTER_CRITERIA,
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    SECRETS_KEY,
    STORAGE_KEY,
    normalizeSecrets,
    normalizeCriteria,
    normalizeSettings
  };

  root.FeedDockSettings = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
