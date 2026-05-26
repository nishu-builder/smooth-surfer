(function createSmoothSurferSettings(root) {
  "use strict";

  const STORAGE_KEY = "smoothSurferSettings";
  const SECRETS_KEY = "smoothSurferSecrets";
  const DEFAULT_FILTER_CRITERIA = [
    "AI hype that pressures the reader with FOMO, loss framing, or financial upside.",
    "Engagement bait that asks for replies, likes, reposts, follows, bookmarks, or quote tweets.",
    "Promotional posts overloaded with hashtags or cashtags."
  ];
  const DEFAULT_SETTINGS = {
    enabled: true,
    youtubeGrayscaleThumbnails: true,
    youtubeHideRecommendations: true,
    youtubeHideShorts: true,
    youtubeBlockShorts: true,
    youtubeHideGames: true,
    youtubeHideLiveChat: true,
    youtubeDisableAutoplay: true,
    youtubeHideEndScreens: true,
    youtubeHideEngagementStats: true,
    twitterHideAds: true,
    twitterFilterContent: true,
    twitterClassifierMode: "local-rules",
    twitterFilterCriteria: [...DEFAULT_FILTER_CRITERIA],
    twitterHideTrends: true,
    twitterEnforceFollowing: true,
    hideStickyVideoPlayers: true,
    pauseDeepScrolling: true,
    softenDistractingElements: true
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
    next.youtubeHideShorts = Boolean(next.youtubeHideShorts);
    next.youtubeBlockShorts = Boolean(next.youtubeBlockShorts);
    next.youtubeHideGames = Boolean(next.youtubeHideGames);
    next.youtubeHideLiveChat = Boolean(next.youtubeHideLiveChat);
    next.youtubeDisableAutoplay = Boolean(next.youtubeDisableAutoplay);
    next.youtubeHideEndScreens = Boolean(next.youtubeHideEndScreens);
    next.youtubeHideEngagementStats = Boolean(next.youtubeHideEngagementStats);
    next.twitterHideAds = Boolean(next.twitterHideAds);
    next.twitterFilterContent = Boolean(next.twitterFilterContent);
    next.twitterClassifierMode =
      next.twitterClassifierMode === "anthropic-haiku" ? "anthropic-haiku" : "local-rules";
    next.twitterFilterCriteria = normalizeCriteria(source.twitterFilterCriteria || DEFAULT_FILTER_CRITERIA);
    next.twitterHideTrends = Boolean(next.twitterHideTrends);
    next.twitterEnforceFollowing = Boolean(next.twitterEnforceFollowing);
    next.hideStickyVideoPlayers = Boolean(next.hideStickyVideoPlayers);
    next.pauseDeepScrolling = Boolean(next.pauseDeepScrolling);
    next.softenDistractingElements = Boolean(next.softenDistractingElements);

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

  root.SmoothSurferSettings = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
