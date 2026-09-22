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
    crossWindowPinsEnabled: false,
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
    aiProvider: "anthropic",
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
    pauseDeepScrolling: true,
    softenDistractingElements: true,
    videoSpeedHotkeys: true,
    videoSpeedModifier: "alt",
    settingsHotkeyEnabled: true,
    focusScheduleEnabled: false,
    focusScheduleStart: "09:00",
    focusScheduleEnd: "17:00",
    visitDelaySeconds: 1,
    visitDelayDomains: []
  };
  // Visit delay: listed sites open behind a countdown. Each finished wait makes
  // the next one 1.5× longer; leaving early adds nothing. Steps and stats live
  // under a day key that rolls over at 03:00 local time.
  const VISIT_DELAY_KEY = "smoothSurferVisitDelay";
  const VISIT_DELAY_GROWTH = 1.5;
  const VISIT_DELAY_RESET_HOUR = 3;
  const VISIT_DELAY_MIN_SECONDS = 1;
  const VISIT_DELAY_MAX_SECONDS = 300;
  const VISIT_DELAY_CAP_SECONDS = 20 * 60;
  const VISIT_DELAY_DOMAIN_LIMIT = 50;
  const VISIT_DELAY_RETENTION_DAYS = 30;
  const VISIT_DELAY_EVENTS = ["load", "start", "finish", "abandon", "reset"];
  const DEFAULT_VISIT_DELAY = { days: {} };
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
    next.aiProvider = ["local", "anthropic"].includes(source.aiProvider)
      ? source.aiProvider
      : DEFAULT_SETTINGS.aiProvider;
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
    // Retired: floating iframe detection also hid ordinary forms and dialogs.
    delete next.hideStickyVideoPlayers;
    next.pauseDeepScrolling = Boolean(next.pauseDeepScrolling);
    next.softenDistractingElements = Boolean(next.softenDistractingElements);
    next.videoSpeedHotkeys = Boolean(next.videoSpeedHotkeys);
    next.videoSpeedModifier = normalizeModifier(next.videoSpeedModifier);
    next.settingsHotkeyEnabled = Boolean(next.settingsHotkeyEnabled);
    next.crossWindowPinsEnabled = Boolean(next.crossWindowPinsEnabled);
    next.focusScheduleEnabled = Boolean(next.focusScheduleEnabled);
    next.focusScheduleStart = normalizeTime(
      next.focusScheduleStart,
      DEFAULT_SETTINGS.focusScheduleStart
    );
    next.focusScheduleEnd = normalizeTime(next.focusScheduleEnd, DEFAULT_SETTINGS.focusScheduleEnd);
    next.visitDelaySeconds = normalizeVisitDelaySeconds(next.visitDelaySeconds);
    next.visitDelayDomains = normalizeVisitDomains(next.visitDelayDomains);
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

  function normalizeVisitDelaySeconds(value) {
    const seconds = Math.round(Number(value));

    if (!Number.isFinite(seconds)) {
      return DEFAULT_SETTINGS.visitDelaySeconds;
    }

    return Math.min(VISIT_DELAY_MAX_SECONDS, Math.max(VISIT_DELAY_MIN_SECONDS, seconds));
  }

  // Accepts a bare host, a URL, or a *.host pattern and returns the registrable
  // host it covers (subdomains included), or "" when it is not a usable domain.
  function normalizeVisitDomain(value) {
    let text = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^\*\./, "");

    if (!text) {
      return "";
    }

    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) {
      text = `https://${text}`;
    }

    let host;

    try {
      host = new URL(text).hostname.replace(/^www\./, "").replace(/\.$/, "");
    } catch {
      return "";
    }

    return host.length <= 253 &&
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(host)
      ? host
      : "";
  }

  function normalizeVisitDomains(value) {
    const items = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
    const seen = new Set();
    const domains = [];

    items.forEach((item) => {
      const domain = normalizeVisitDomain(item);

      if (domain && !seen.has(domain) && domains.length < VISIT_DELAY_DOMAIN_LIMIT) {
        seen.add(domain);
        domains.push(domain);
      }
    });

    return domains;
  }

  // The most specific listed domain covering this host, or "".
  function matchVisitDomain(hostname, domains) {
    const host = normalizeHost(hostname).replace(/\.$/, "");
    const listed = (Array.isArray(domains) ? [...domains] : []).sort((a, b) => b.length - a.length);
    const direct = listed.find((domain) => host === domain || host.endsWith(`.${domain}`));
    if (direct) return direct;
    // Twitter redirects to X. Keep the listed name as the statistics/pass key,
    // while covering both domains without changing the user's saved settings.
    if (host === "x.com" || host.endsWith(".x.com"))
      return listed.includes("twitter.com") ? "twitter.com" : "";
    if (host === "twitter.com" || host.endsWith(".twitter.com"))
      return listed.includes("x.com") ? "x.com" : "";
    return "";
  }

  function getLocalDayKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${day}`;
  }

  // Days roll over at 03:00 local time, so a late night stays with its evening.
  function getVisitDelayDayKey(value) {
    const at = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());

    at.setHours(at.getHours() - VISIT_DELAY_RESET_HOUR);

    return getLocalDayKey(at);
  }

  function getVisitDelayMs(step, baseSeconds) {
    const base = normalizeVisitDelaySeconds(baseSeconds);
    const count = Math.max(0, Math.floor(Number(step)) || 0);
    const seconds = Math.min(VISIT_DELAY_CAP_SECONDS, base * VISIT_DELAY_GROWTH ** count);

    return Math.round(seconds) * 1000;
  }

  function emptyVisitEntry() {
    return {
      step: 0,
      loads: 0,
      starts: 0,
      completed: 0,
      abandoned: 0,
      resets: 0,
      waitedMs: 0,
      hours: Array(24).fill(0)
    };
  }

  function toCount(value) {
    return Math.max(0, Math.floor(Number(value)) || 0);
  }

  function normalizeVisitDelay(value) {
    const source = value && typeof value === "object" ? value : {};
    const sourceDays = source.days && typeof source.days === "object" ? source.days : {};
    const days = {};

    Object.keys(sourceDays)
      .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
      .sort()
      .slice(-VISIT_DELAY_RETENTION_DAYS)
      .forEach((day) => {
        const sourceDomains = sourceDays[day];

        if (!sourceDomains || typeof sourceDomains !== "object") {
          return;
        }

        const domains = {};

        Object.keys(sourceDomains).forEach((name) => {
          const domain = normalizeVisitDomain(name);
          const raw = sourceDomains[name];

          if (!domain || !raw || typeof raw !== "object" || domains[domain]) {
            return;
          }

          const entry = emptyVisitEntry();

          for (const key of ["step", "loads", "starts", "completed", "abandoned", "resets"]) {
            entry[key] = toCount(raw[key]);
          }

          entry.waitedMs = toCount(raw.waitedMs);
          entry.hours = entry.hours.map((_, hour) =>
            Array.isArray(raw.hours) ? toCount(raw.hours[hour]) : 0
          );

          const used =
            entry.step ||
            entry.loads ||
            entry.starts ||
            entry.completed ||
            entry.abandoned ||
            entry.resets ||
            entry.waitedMs;

          if (used) {
            domains[domain] = entry;
          }
        });

        if (Object.keys(domains).length > 0) {
          days[day] = domains;
        }
      });

    return { days };
  }

  // Applies one visit event and returns the next state. "finish" is the only
  // event that advances the step, so leaving early never lengthens the next wait.
  function recordVisitDelayEvent(state, event) {
    const domain = normalizeVisitDomain(event && event.domain);
    const kind = event && event.event;

    if (!domain || !VISIT_DELAY_EVENTS.includes(kind)) {
      throw new Error("Unknown visit event.");
    }

    const at = Number.isFinite(event.at) ? new Date(event.at) : new Date();
    const next = normalizeVisitDelay(state);
    const dayKey = getVisitDelayDayKey(at);
    const day = next.days[dayKey] || (next.days[dayKey] = {});
    const entry = day[domain] || (day[domain] = emptyVisitEntry());
    const waited = Math.min(toCount(event.waitedMs), 24 * 60 * 60 * 1000);

    if (kind === "load") {
      entry.loads += 1;
    } else if (kind === "start") {
      entry.starts += 1;
      entry.hours[at.getHours()] += 1;
    } else if (kind === "finish") {
      entry.completed += 1;
      entry.step += 1;
      entry.waitedMs += waited;
    } else if (kind === "abandon") {
      entry.abandoned += 1;
      entry.waitedMs += waited;
    } else {
      entry.step = 0;
      entry.resets += 1;
    }

    return normalizeVisitDelay(next);
  }

  function getVisitDelayStatus(state, domain, baseSeconds, at) {
    const dayKey = getVisitDelayDayKey(at);
    const entry =
      (state && state.days && state.days[dayKey] && state.days[dayKey][domain]) ||
      emptyVisitEntry();

    return {
      domain,
      dayKey,
      step: entry.step,
      waitMs: getVisitDelayMs(entry.step, baseSeconds),
      completed: entry.completed,
      waitedMs: entry.waitedMs
    };
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

  const CALIBRATION_KEY = "smoothSurferCalibration";
  function normalizeCalibration(value) {
    const data = value || {};
    const seen = new Set();
    let bytes = 0;
    const feedback = [];
    const newestFeedback = (Array.isArray(data.feedback) ? [...data.feedback] : []).sort(
      (a, b) => (Number(b?.at) || 0) - (Number(a?.at) || 0)
    );
    for (const item of newestFeedback) {
      if (
        !item ||
        typeof item.rule !== "string" ||
        !item.rule.trim() ||
        typeof item.postKey !== "string" ||
        !["good", "bad"].includes(item.judgment)
      )
        continue;
      const entry = {
        rule: item.rule.slice(0, 500),
        postKey:
          canonicalReviewId(item.source || "twitter", item.url) || item.postKey.slice(0, 128),
        judgment: item.judgment,
        explanation: String(item.explanation || "").slice(0, 800),
        text: String(item.text || "").slice(0, 2000),
        images: normalizeImageUrls(item.images),
        source: String(item.source || "twitter").slice(0, 40),
        url: safePostUrl(item.url),
        author: String(item.author || "").slice(0, 160),
        display: normalizePostDisplay(item.display),
        reasons: normalizeCriteria(item.reasons || []).slice(0, 3),
        postAt: Number.isFinite(item.postAt) ? item.postAt : item.at,
        at: Number.isFinite(item.at) ? item.at : Date.now()
      };
      const key = JSON.stringify([entry.rule, entry.postKey]);
      if (seen.has(key) || (!entry.text && !entry.images.length)) continue;
      seen.add(key);
      bytes += new TextEncoder().encode(JSON.stringify(entry)).length;
      if (bytes > 2 * 1024 * 1024 || feedback.length >= 2000) break;
      feedback.push(entry);
    }
    const revisions = (Array.isArray(data.revisions) ? data.revisions : [])
      .filter(
        (r) =>
          r &&
          typeof r.before === "string" &&
          typeof r.after === "string" &&
          r.before &&
          r.after &&
          Number.isFinite(r.at)
      )
      .slice(0, 30)
      .map((r) => ({
        id: String(r.id || r.at).slice(0, 80),
        before: r.before.slice(0, 500),
        after: r.after.slice(0, 500),
        at: r.at,
        examples: Math.max(0, Number(r.examples) || 0),
        fixed: Math.max(0, Number(r.fixed) || 0),
        remaining: Math.max(0, Number(r.remaining) || 0),
        undone: Boolean(r.undone)
      }));
    const attempts = (Array.isArray(data.attempts) ? data.attempts : [])
      .filter((item) => item && typeof item.rule === "string" && Number.isFinite(item.at))
      .slice(0, 100)
      .map((item) => ({ rule: item.rule.slice(0, 500), at: item.at }));
    // Undo receipts share the same write as their judgment, so worker restarts
    // cannot lose them or expose an undo for a vote that did not save.
    const undo = [];
    let undoBytes = 0;
    for (const item of Array.isArray(data.undo) ? data.undo : []) {
      if (!item || typeof item.token !== "string") continue;
      const recorded = normalizeCalibration({ feedback: [item.recorded] }).feedback[0];
      if (!recorded) continue;
      const entry = {
        token: item.token.slice(0, 128),
        recorded,
        previous: normalizeCalibration({ feedback: item.previous }).feedback.filter(
          (vote) => vote.postKey === recorded.postKey
        )
      };
      undoBytes += new TextEncoder().encode(JSON.stringify(entry)).length;
      if (undoBytes > 512 * 1024 || undo.length >= 50) break;
      undo.push(entry);
    }
    const suggestions = [];
    let suggestionBytes = 0;
    for (const item of Array.isArray(data.suggestions) ? data.suggestions : []) {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.rule !== "string" ||
        !item.rule.trim()
      )
        continue;
      const entry = {
        id: item.id.slice(0, 100),
        rule: item.rule.trim().slice(0, 500),
        instruction: String(item.instruction || "").slice(0, 800),
        sourceRule: String(item.sourceRule || "").slice(0, 500),
        status: ["pending", "added", "dismissed"].includes(item.status) ? item.status : "pending",
        created: Boolean(item.created),
        at: Number.isFinite(item.at) ? item.at : Date.now()
      };
      suggestionBytes += new TextEncoder().encode(JSON.stringify(entry)).length;
      if (suggestionBytes > 100 * 1024 || suggestions.length >= 50) break;
      if (!suggestions.some((saved) => saved.id === entry.id)) suggestions.push(entry);
    }
    return { feedback, revisions, attempts, undo, suggestions };
  }
  function resolveCalibratedRule(rule, revisions) {
    let current = rule;
    for (const revision of [...revisions].reverse()) {
      if (!revision.undone && revision.before === current) current = revision.after;
    }
    return current;
  }
  function normalizePostDisplay(value) {
    const data = value || {};
    const profile = (entry) => {
      try {
        const url = new URL(entry);
        return url.protocol === "https:" &&
          url.hostname === "pbs.twimg.com" &&
          url.pathname.startsWith("/profile_images/") &&
          !url.username &&
          !url.password
          ? url.href.slice(0, 1500)
          : "";
      } catch {
        return "";
      }
    };
    return {
      text: String(data.text || "").slice(0, 4000),
      name: String(data.name || "").slice(0, 100),
      handle: String(data.handle || "").slice(0, 80),
      avatar: profile(data.avatar),
      postedAt:
        typeof data.postedAt === "string" && Number.isFinite(Date.parse(data.postedAt))
          ? new Date(data.postedAt).toISOString()
          : "",
      quoted:
        data.quoted && typeof data.quoted === "object"
          ? {
              text: String(data.quoted.text || "").slice(0, 2000),
              name: String(data.quoted.name || "").slice(0, 100),
              handle: String(data.quoted.handle || "").slice(0, 80)
            }
          : null
    };
  }

  const REVIEW_KEY = "smoothSurferReview";
  const DEFAULT_REVIEW = { items: [], restored: [], archived: [] };

  function canonicalReviewId(source, value) {
    if (source !== "twitter") return "";
    try {
      const url = new URL(safePostUrl(value));
      if (!/^(?:www\.|mobile\.)?(?:twitter\.com|x\.com)$/.test(url.hostname)) return "";
      const id = url.pathname.match(/^\/(?:[^/]+|i\/web)\/status\/(\d+)(?:\/|$)/)?.[1];
      return id ? `twitter:status:${id}` : "";
    } catch {
      return "";
    }
  }

  function getReviewPostKey(source, text, images = [], url = "") {
    const canonical = canonicalReviewId(source, url);
    if (canonical) return canonical;
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
    const archivedIds = new Set(Array.isArray(data.archived) ? data.archived : []);
    const remappedIds = new Map();
    const merged = new Map();
    const candidates = (Array.isArray(data.items) ? [...data.items] : []).sort(
      (a, b) => (Number(b?.at) || 0) - (Number(a?.at) || 0)
    );
    for (const item of candidates) {
      if (
        !item ||
        typeof item.id !== "string" ||
        (!item.text && !normalizeImageUrls(item.images).length) ||
        !Number.isFinite(item.at)
      )
        continue;
      const id = canonicalReviewId(item.source, item.url) || item.id.slice(0, 2050);
      if (
        Math.max(item.at, Number(item.queuedAt) || 0) < cutoff &&
        !archivedIds.has(item.id) &&
        !archivedIds.has(id)
      )
        continue;
      remappedIds.set(item.id, id);
      const previous = merged.get(id);
      if (previous) {
        previous.criteria = normalizeCriteria([
          ...previous.criteria,
          ...(Array.isArray(item.criteria) ? item.criteria : [])
        ]).slice(0, 20);
        previous.formats = FORMAT_KEYS.filter(
          (key) => previous.formats.includes(key) || item.formats?.includes(key)
        );
        continue;
      }
      if (merged.size >= REVIEW_LIMIT) continue;
      merged.set(id, {
        id,
        text: String(item.text || "").slice(0, 2000),
        images: normalizeImageUrls(item.images),
        display: normalizePostDisplay(item.display),
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
        at: item.at,
        ...(Number.isFinite(item.queuedAt) ? { queuedAt: item.queuedAt } : {})
      });
    }
    const items = [...merged.values()];
    const restored = [
      ...new Set(
        (Array.isArray(data.restored) ? data.restored : [])
          .filter((id) => typeof id === "string")
          .map((id) => remappedIds.get(id) || id.slice(0, 2050))
      )
    ].slice(-4000);
    const encoder = new TextEncoder();
    const archiveCandidates = [
      ...new Set([...archivedIds].map((id) => remappedIds.get(id) || id))
    ].filter((id) => merged.has(id));
    let bytes = encoder.encode(
      JSON.stringify({ items: [], restored, archived: archiveCandidates })
    ).length;
    const boundedItems = [];
    for (const item of items) {
      bytes += encoder.encode(JSON.stringify(item)).length + 1;
      if (bytes > REVIEW_BYTE_LIMIT) break;
      boundedItems.push(item);
    }
    const retainedIds = new Set(boundedItems.map((item) => item.id));
    const archived = archiveCandidates.filter((id) => retainedIds.has(id));
    return { items: boundedItems, restored, archived };
  }

  // Reviewed examples outlive the rolling feed history. Keep both judgments
  // visible, and merge their original rules without duplicating recent posts.
  function reviewItemsWithFeedback(review, calibration) {
    const items = new Map(
      review.items.map((item) => [
        item.id,
        { ...item, criteria: [...item.criteria], formats: [...item.formats] }
      ])
    );
    for (const vote of calibration.feedback) {
      let item = items.get(vote.postKey);
      if (!item) {
        item = {
          id: vote.postKey,
          text: vote.text,
          images: vote.images,
          source: vote.source,
          url: vote.url || "",
          author: vote.author || "",
          display: vote.display || {},
          reasons: vote.reasons || [],
          criteria: [],
          formats: [],
          at: vote.postAt || vote.at,
          savedExample: true
        };
        items.set(item.id, item);
      }
      if (vote.rule.startsWith("format:")) {
        const format = vote.rule.slice(7);
        if (FORMAT_KEYS.includes(format) && !item.formats.includes(format))
          item.formats.push(format);
      } else if (
        !item.criteria.some(
          (rule) =>
            resolveCalibratedRule(rule, calibration.revisions) ===
            resolveCalibratedRule(vote.rule, calibration.revisions)
        )
      ) {
        item.criteria.push(vote.rule);
      }
    }
    return [...items.values()].sort((a, b) => b.at - a.at);
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
    CALIBRATION_KEY,
    normalizeCalibration,
    resolveCalibratedRule,
    normalizePostDisplay,
    FORMAT_KEYS,
    FORMAT_LABELS,
    FILTER_SETS_KEY,
    BUILTIN_FILTER_SETS,
    REVIEW_LIMIT,
    reviewItemsWithFeedback,
    normalizeFilterSet,
    normalizeFilterSets,
    normalizeImageUrls,
    REVIEW_KEY,
    DEFAULT_REVIEW,
    getReviewPostKey,
    canonicalReviewId,
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
    VISIT_DELAY_KEY,
    VISIT_DELAY_EVENTS,
    VISIT_DELAY_GROWTH,
    VISIT_DELAY_RESET_HOUR,
    VISIT_DELAY_CAP_SECONDS,
    DEFAULT_VISIT_DELAY,
    normalizeVisitDomain,
    normalizeVisitDomains,
    matchVisitDomain,
    normalizeVisitDelay,
    recordVisitDelayEvent,
    getVisitDelayStatus,
    getVisitDelayMs,
    getVisitDelayDayKey,
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
