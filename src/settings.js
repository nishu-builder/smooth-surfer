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
  // Modifier required alongside the video speed keys (] [ \). "none" keeps the
  // old bare-key behaviour; the others require that modifier and no other.
  const VIDEO_SPEED_MODIFIERS = ["none", "alt", "ctrl", "shift", "meta"];
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
    twitterHideReposts: false,
    twitterHideQuotes: false,
    twitterHideVideos: false,
    imageAnalysisEnabled: false,
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
    videoSpeedModifier: "alt",
    settingsHotkeyEnabled: true,
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
    const items = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);

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
    for (const key of [...FORMAT_KEYS, "imageAnalysisEnabled"]) next[key] = Boolean(next[key]);
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
    next.videoSpeedModifier = normalizeModifier(next.videoSpeedModifier);
    next.settingsHotkeyEnabled = Boolean(next.settingsHotkeyEnabled);
    next.focusScheduleEnabled = Boolean(next.focusScheduleEnabled);
    next.focusScheduleStart = normalizeTime(
      next.focusScheduleStart,
      DEFAULT_SETTINGS.focusScheduleStart
    );
    next.focusScheduleEnd = normalizeTime(next.focusScheduleEnd, DEFAULT_SETTINGS.focusScheduleEnd);
    delete next.twitterClassifierMode;
    delete next.twitterFilterCriteria;

    return next;
  }

  function normalizeModifier(value) {
    const modifier = String(value || "")
      .trim()
      .toLowerCase();

    return VIDEO_SPEED_MODIFIERS.includes(modifier)
      ? modifier
      : DEFAULT_SETTINGS.videoSpeedModifier;
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
    } catch {
      return getPlatformForHost(value);
    }
  }

  function getPlatformForHost(value) {
    const host = normalizeHost(value);

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      return "youtube";
    }

    if (
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com")
    ) {
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

  const FORMAT_KEYS = ["twitterHideReposts", "twitterHideQuotes", "twitterHideVideos"];
  const FORMAT_LABELS = {
    twitterHideReposts: "Reposts",
    twitterHideQuotes: "Quote posts",
    twitterHideVideos: "Video posts"
  };
  const FILTER_SETS_KEY = "smoothSurferFilterSets";
  const REVIEW_LIMIT = 2000;
  const REVIEW_BYTE_LIMIT = 6 * 1024 * 1024;

  function normalizeImageUrls(value) {
    return [
      ...new Set(
        (Array.isArray(value) ? value : []).flatMap((entry) => {
          if (typeof entry !== "string" || entry.length > 2000) return [];
          try {
            const url = new URL(entry);
            if (url.protocol !== "https:" || url.username || url.password || url.port) return [];
            const allowed =
              (url.hostname === "pbs.twimg.com" && url.pathname.startsWith("/media/")) ||
              [
                "i.redd.it",
                "preview.redd.it",
                "external-preview.redd.it",
                "substackcdn.com"
              ].includes(url.hostname);
            if (!allowed) return [];
            url.hash = "";
            if (url.hostname === "pbs.twimg.com") url.searchParams.set("name", "small");
            return [url.href];
          } catch {
            return [];
          }
        })
      )
    ].slice(0, 2);
  }

  function normalizeFilterSet(value) {
    if (
      !value ||
      value.schema !== "smooth-surfer-filter-set" ||
      value.version !== 1 ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      !Array.isArray(value.criteria) ||
      value.criteria.length > 50 ||
      value.criteria.some((rule) => typeof rule !== "string" || rule.length > 500)
    ) {
      throw new Error("Choose a valid Smooth Surfer filter set (version 1, up to 50 rules).");
    }
    const formats = {};
    FORMAT_KEYS.forEach((key) => {
      if (value.formats?.[key] === true) formats[key] = true;
    });
    return {
      schema: "smooth-surfer-filter-set",
      version: 1,
      name: value.name.trim().slice(0, 80),
      criteria: normalizeCriteria(value.criteria),
      formats
    };
  }

  function normalizeFilterSets(value) {
    const names = new Set();
    return (Array.isArray(value) ? value : [])
      .flatMap((entry) => {
        try {
          const pack = normalizeFilterSet(entry);
          const name = pack.name.toLowerCase();
          if (names.has(name)) return [];
          names.add(name);
          return [pack];
        } catch {
          return [];
        }
      })
      .slice(0, 20);
  }

  const BUILTIN_FILTER_SETS = [
    {
      schema: "smooth-surfer-filter-set",
      version: 1,
      name: "Quiet browsing",
      criteria: [
        "Posts that ask for likes, reposts, or follows to enter a giveaway.",
        "Posts that use outrage or personal attacks primarily to solicit engagement."
      ],
      formats: { twitterHideReposts: true }
    },
    {
      schema: "smooth-surfer-filter-set",
      version: 1,
      name: "Work",
      criteria: [
        "Celebrity gossip and entertainment rumors unrelated to professional work.",
        "Promotional posts that create urgency about speculative financial gains."
      ],
      formats: { twitterHideVideos: true }
    }
  ];

  const REVIEW_KEY = "smoothSurferReview";
  const DEFAULT_REVIEW = { items: [], restored: [] };

  function getReviewPostKey(source, text, images = []) {
    const normalized = `${source}|${String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000)}${images.length ? "|" + normalizeImageUrls(images).join("|") : ""}`;
    // Keep restore choices without retaining the post text after history expires.
    let first = 2166136261;
    let second = 5381;
    for (let i = 0; i < normalized.length; i += 1) {
      first = Math.imul(first ^ normalized.charCodeAt(i), 16777619);
      second = Math.imul(second, 33) ^ normalized.charCodeAt(i);
    }
    return `${source}:${(first >>> 0).toString(16)}${(second >>> 0).toString(16).padStart(8, "0")}`;
  }

  function normalizeReview(value) {
    const data = value || {};
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const seen = new Set();
    const items = (Array.isArray(data.items) ? data.items : [])
      .filter((item) => {
        if (
          !item ||
          typeof item.id !== "string" ||
          (!item.text && !normalizeImageUrls(item.images).length) ||
          !Number.isFinite(item.at) ||
          item.at < cutoff ||
          seen.has(item.id)
        )
          return false;
        seen.add(item.id);
        return true;
      })
      .slice(0, REVIEW_LIMIT)
      .map((item) => ({
        id: item.id.slice(0, 2050),
        text: String(item.text || "").slice(0, 2000),
        images: normalizeImageUrls(item.images),
        formats: FORMAT_KEYS.filter((key) => item.formats?.includes(key)),
        source: String(item.source || "other").slice(0, 40),
        url: safePostUrl(item.url),
        author: String(item.author || "").slice(0, 160),
        reasons: normalizeCriteria(item.reasons || [])
          .slice(0, 3)
          .map((reason) => reason.slice(0, 300)),
        criteria: normalizeCriteria(item.criteria || [])
          .slice(0, 20)
          .map((rule) => rule.slice(0, 500)),
        at: item.at
      }));
    const restored = [
      ...new Set(
        (Array.isArray(data.restored) ? data.restored : [])
          .filter((id) => typeof id === "string")
          .map((id) => id.slice(0, 2050))
      )
    ].slice(-4000);
    const encoder = new TextEncoder();
    let bytes = encoder.encode(JSON.stringify({ items: [], restored })).length;
    const boundedItems = [];
    for (const item of items) {
      bytes += encoder.encode(JSON.stringify(item)).length + 1;
      if (bytes > REVIEW_BYTE_LIMIT) break;
      boundedItems.push(item);
    }
    return { items: boundedItems, restored };
  }

  function safePostUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return /^https?:$/.test(url.protocol) && !url.username && !url.password
        ? url.href.slice(0, 2000)
        : "";
    } catch {
      return "";
    }
  }

  const api = {
    FORMAT_KEYS,
    FORMAT_LABELS,
    FILTER_SETS_KEY,
    BUILTIN_FILTER_SETS,
    REVIEW_LIMIT,
    normalizeFilterSet,
    normalizeFilterSets,
    normalizeImageUrls,
    REVIEW_KEY,
    DEFAULT_REVIEW,
    getReviewPostKey,
    normalizeReview,
    safePostUrl,
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
    VIDEO_SPEED_MODIFIERS,
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
