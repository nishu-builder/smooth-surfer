(function createSmoothSurferSettings(root) {
  "use strict";

  const STORAGE_KEY = "smoothSurferSettings";
  const SECRETS_KEY = "smoothSurferSecrets";
  const LEGACY_UPSIDE_FOMO_CRITERION =
    "AI hype that pressures the reader with FOMO, loss framing, or financial upside.";
  const UPSIDE_FOMO_CRITERION =
    "Content that aims primarily to evoke a sense of FOMO at missed upside, financial or otherwise.";
  const ENGAGEMENT_BAIT_CRITERION =
    "Engagement bait that asks for replies, likes, reposts, follows, bookmarks, or quote tweets.";
  const TAG_OVERLOAD_CRITERION = "Promotional posts overloaded with hashtags or cashtags.";
  const LINKEDIN_STYLE_CRITERION = "LinkedIn-style posts with one short sentence per paragraph.";
  const DEFAULT_FILTER_CRITERIA = [
    UPSIDE_FOMO_CRITERION,
    ENGAGEMENT_BAIT_CRITERION,
    TAG_OVERLOAD_CRITERION,
    LINKEDIN_STYLE_CRITERION
  ];
  const SITE_RULES = [
    { id: "youtube", label: "YouTube" },
    { id: "twitter", label: "X / Twitter" },
    { id: "reddit", label: "Reddit" },
    { id: "substack", label: "Substack" },
    { id: "hacker-news", label: "Hacker News" }
  ];
  const DEFAULT_SETTINGS = {
    enabled: true,
    filterCriteria: [...DEFAULT_FILTER_CRITERIA],
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
    twitterHideTrends: true,
    twitterEnforceFollowing: true,
    redditHideAds: true,
    redditHideRecommendations: true,
    redditFilterContent: true,
    substackHideRecommendations: true,
    substackFilterContent: true,
    hackerNewsFilterContent: true,
    hackerNewsHideScores: true,
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
    next.filterCriteria = normalizeFilterCriteria(
      source.filterCriteria || source.twitterFilterCriteria || DEFAULT_FILTER_CRITERIA
    );
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
    next.twitterHideTrends = Boolean(next.twitterHideTrends);
    next.twitterEnforceFollowing = Boolean(next.twitterEnforceFollowing);
    next.redditHideAds = Boolean(next.redditHideAds);
    next.redditHideRecommendations = Boolean(next.redditHideRecommendations);
    next.redditFilterContent = Boolean(next.redditFilterContent);
    next.substackHideRecommendations = Boolean(next.substackHideRecommendations);
    next.substackFilterContent = Boolean(next.substackFilterContent);
    next.hackerNewsFilterContent = Boolean(next.hackerNewsFilterContent);
    next.hackerNewsHideScores = Boolean(next.hackerNewsHideScores);
    next.hideStickyVideoPlayers = Boolean(next.hideStickyVideoPlayers);
    next.pauseDeepScrolling = Boolean(next.pauseDeepScrolling);
    next.softenDistractingElements = Boolean(next.softenDistractingElements);
    delete next.twitterClassifierMode;
    delete next.twitterFilterCriteria;

    return next;
  }

  function normalizeFilterCriteria(value) {
    const normalizedCriteria = normalizeCriteria(value);
    const hadLegacyCriterion = normalizedCriteria.includes(LEGACY_UPSIDE_FOMO_CRITERION);
    const criteria = normalizedCriteria.map((criterion) =>
      criterion === LEGACY_UPSIDE_FOMO_CRITERION ? UPSIDE_FOMO_CRITERION : criterion
    );

    if (hadLegacyCriterion && !criteria.includes(LINKEDIN_STYLE_CRITERION)) {
      criteria.push(LINKEDIN_STYLE_CRITERION);
    }

    return normalizeCriteria(criteria);
  }

  function normalizeSecrets(value) {
    const source = value || {};

    return {
      ...DEFAULT_SECRETS,
      anthropicApiKey: String(source.anthropicApiKey || "").trim()
    };
  }

  function getPlatformForUrl(value) {
    try {
      return getPlatformForHost(new URL(String(value || "")).hostname);
    } catch (error) {
      return getPlatformForHost(value);
    }
  }

  function getPlatformForHost(value) {
    const host = normalizeHost(value);

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      return "youtube";
    }

    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
      return "twitter";
    }

    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      return "reddit";
    }

    if (host === "substack.com" || host.endsWith(".substack.com")) {
      return "substack";
    }

    if (host === "news.ycombinator.com") {
      return "hacker-news";
    }

    return "unknown";
  }

  function normalizeHost(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/:\d+$/, "")
      .replace(/\.test$/, "")
      .replace(/^www\./, "");
  }

  const api = {
    DEFAULT_FILTER_CRITERIA,
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    SECRETS_KEY,
    SITE_RULES,
    STORAGE_KEY,
    getPlatformForHost,
    getPlatformForUrl,
    normalizeSecrets,
    normalizeCriteria,
    normalizeSettings
  };

  root.SmoothSurferSettings = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
