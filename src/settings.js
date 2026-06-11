(function createSmoothSurferSettings(root) {
  "use strict";

  const STORAGE_KEY = "smoothSurferSettings";
  const SECRETS_KEY = "smoothSurferSecrets";
  const STATS_KEY = "smoothSurferStats";
  const CONSUMPTION_KEY = "smoothSurferConsumption";
  // Emotional-ingredient taxonomy for the Consumption Facts label. The
  // outrage-* and fear-* families roll up into label totals, so the model is
  // told to pick at most one tag per family to keep the totals exact.
  const CONSUMPTION_TAGS = [
    "outrage-political",
    "outrage-callout",
    "outrage-other",
    "joy",
    "humor",
    "fear-existential",
    "fear-safety",
    "fear-societal",
    "fear-political",
    "fear-other",
    "curiosity-beauty",
    "poll",
    "meme"
  ];
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
    youtubeHideComments: false,
    twitterHideAds: true,
    twitterFilterContent: true,
    twitterHideTrends: true,
    twitterEnforceFollowing: true,
    redditHideAds: true,
    redditHideRecommendations: true,
    redditFilterContent: true,
    redditHideComments: false,
    substackHideRecommendations: true,
    substackFilterContent: true,
    hackerNewsFilterContent: true,
    hackerNewsHideScores: true,
    consumptionFactsEnabled: true,
    hideStickyVideoPlayers: true,
    pauseDeepScrolling: true,
    softenDistractingElements: true,
    videoSpeedHotkeys: true,
    focusScheduleEnabled: false,
    focusScheduleStart: "09:00",
    focusScheduleEnd: "17:00"
  };
  const DEFAULT_SECRETS = {
    anthropicApiKey: ""
  };
  const DEFAULT_STATS = {
    days: {}
  };
  const DEFAULT_CONSUMPTION = {
    days: {}
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
    next.youtubeHideComments = Boolean(next.youtubeHideComments);
    next.twitterHideAds = Boolean(next.twitterHideAds);
    next.twitterFilterContent = Boolean(next.twitterFilterContent);
    next.twitterHideTrends = Boolean(next.twitterHideTrends);
    next.twitterEnforceFollowing = Boolean(next.twitterEnforceFollowing);
    next.redditHideAds = Boolean(next.redditHideAds);
    next.redditHideRecommendations = Boolean(next.redditHideRecommendations);
    next.redditFilterContent = Boolean(next.redditFilterContent);
    next.redditHideComments = Boolean(next.redditHideComments);
    next.substackHideRecommendations = Boolean(next.substackHideRecommendations);
    next.substackFilterContent = Boolean(next.substackFilterContent);
    next.hackerNewsFilterContent = Boolean(next.hackerNewsFilterContent);
    next.hackerNewsHideScores = Boolean(next.hackerNewsHideScores);
    next.consumptionFactsEnabled = Boolean(next.consumptionFactsEnabled);
    next.hideStickyVideoPlayers = Boolean(next.hideStickyVideoPlayers);
    next.pauseDeepScrolling = Boolean(next.pauseDeepScrolling);
    next.softenDistractingElements = Boolean(next.softenDistractingElements);
    next.videoSpeedHotkeys = Boolean(next.videoSpeedHotkeys);
    next.focusScheduleEnabled = Boolean(next.focusScheduleEnabled);
    next.focusScheduleStart = normalizeTime(next.focusScheduleStart, DEFAULT_SETTINGS.focusScheduleStart);
    next.focusScheduleEnd = normalizeTime(next.focusScheduleEnd, DEFAULT_SETTINGS.focusScheduleEnd);
    delete next.twitterClassifierMode;
    delete next.twitterFilterCriteria;

    return next;
  }

  function normalizeTime(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());

    if (!match) {
      return fallback;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours > 23 || minutes > 59) {
      return fallback;
    }

    return `${String(hours).padStart(2, "0")}:${match[2]}`;
  }

  function toMinutes(time) {
    const [hours, minutes] = String(time).split(":").map(Number);

    return hours * 60 + minutes;
  }

  function isWithinFocusWindow(start, end, date) {
    const startMinutes = toMinutes(normalizeTime(start, "00:00"));
    const endMinutes = toMinutes(normalizeTime(end, "00:00"));
    const now = date instanceof Date ? date : new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (startMinutes === endMinutes) {
      return true;
    }

    if (startMinutes < endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }

    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }

  function normalizeStats(value) {
    const source = value && typeof value === "object" ? value : {};
    const sourceDays = source.days && typeof source.days === "object" ? source.days : {};
    const days = {};

    Object.keys(sourceDays).forEach((day) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return;
      }

      const sourcePlatforms = sourceDays[day];

      if (!sourcePlatforms || typeof sourcePlatforms !== "object") {
        return;
      }

      const platforms = {};

      Object.keys(sourcePlatforms).forEach((platformName) => {
        const sourceReasons = sourcePlatforms[platformName];

        if (!sourceReasons || typeof sourceReasons !== "object") {
          return;
        }

        const reasons = {};

        Object.keys(sourceReasons).forEach((reason) => {
          const count = Math.floor(Number(sourceReasons[reason]));

          if (count > 0) {
            reasons[reason] = count;
          }
        });

        if (Object.keys(reasons).length > 0) {
          platforms[platformName] = reasons;
        }
      });

      if (Object.keys(platforms).length > 0) {
        days[day] = platforms;
      }
    });

    return { days };
  }

  function normalizeConsumption(value) {
    const source = value && typeof value === "object" ? value : {};
    const sourceDays = source.days && typeof source.days === "object" ? source.days : {};
    const days = {};

    Object.keys(sourceDays).forEach((day) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return;
      }

      const sourcePlatforms = sourceDays[day];

      if (!sourcePlatforms || typeof sourcePlatforms !== "object") {
        return;
      }

      const platforms = {};

      Object.keys(sourcePlatforms).forEach((platformName) => {
        const entry = sourcePlatforms[platformName];

        if (!entry || typeof entry !== "object") {
          return;
        }

        const posts = Math.floor(Number(entry.posts));

        if (!(posts > 0)) {
          return;
        }

        const sourceTags = entry.tags && typeof entry.tags === "object" ? entry.tags : {};
        const tags = {};

        CONSUMPTION_TAGS.forEach((tag) => {
          const count = Math.floor(Number(sourceTags[tag]));

          if (count > 0) {
            tags[tag] = count;
          }
        });

        platforms[platformName] = { posts, tags };
      });

      if (Object.keys(platforms).length > 0) {
        days[day] = platforms;
      }
    });

    return { days };
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
    CONSUMPTION_KEY,
    CONSUMPTION_TAGS,
    DEFAULT_CONSUMPTION,
    DEFAULT_FILTER_CRITERIA,
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    DEFAULT_STATS,
    SECRETS_KEY,
    SITE_RULES,
    STATS_KEY,
    STORAGE_KEY,
    getPlatformForHost,
    getPlatformForUrl,
    isWithinFocusWindow,
    normalizeConsumption,
    normalizeSecrets,
    normalizeCriteria,
    normalizeSettings,
    normalizeStats
  };

  root.SmoothSurferSettings = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
