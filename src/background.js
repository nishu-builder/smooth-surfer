importScripts("settings.js", "storage.js");

(function installSmoothSurferBackground() {
  "use strict";

  const {
    loadSecrets,
    loadSettings,
    loadStats,
    saveStats
  } = self.SmoothSurferStorage;
  const MODEL = "claude-haiku-4-5";
  const ANTHROPIC_VERSION = "2023-06-01";
  const MAX_CACHE_ENTRIES = 400;
  const BATCH_DELAY_MS = 250;
  const MAX_BATCH_SIZE = 20;
  const STATS_RETENTION_DAYS = 30;
  const STATS_WRITE_DELAY_MS = 1000;
  const FILTER_SETTING_BY_SOURCE = {
    twitter: "twitterFilterContent",
    reddit: "redditFilterContent",
    substack: "substackFilterContent",
    "hacker-news": "hackerNewsFilterContent"
  };
  const SOURCE_LABELS = {
    twitter: "X/Twitter post",
    reddit: "Reddit post",
    substack: "Substack post or note",
    "hacker-news": "Hacker News story or comment"
  };
  const resultCache = new Map();
  let batchQueue = [];
  let batchTimer = 0;
  let statsPromise = null;
  let statsWriteTimer = 0;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) {
      return false;
    }

    if (message.type === "recordHide") {
      recordHide(message.source, message.reasons);
      return false;
    }

    if (message.type !== "classifyContent" && message.type !== "classifyTweetContent") {
      return false;
    }

    classifyContent(message.text, message.source || "twitter")
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          blocked: false,
          reasons: [],
          classifier: "error",
          error: error.message
        });
      });

    return true;
  });

  async function recordHide(source, reasons) {
    if (!statsPromise) {
      statsPromise = loadStats();
    }

    const stats = await statsPromise;
    const day = getLocalDayKey();
    const platform = String(source || "other") || "other";
    const reason = Array.isArray(reasons) && reasons[0] ? String(reasons[0]) : "other";
    const platforms = stats.days[day] || (stats.days[day] = {});
    const reasonCounts = platforms[platform] || (platforms[platform] = {});

    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    pruneStats(stats.days);
    scheduleStatsWrite();
  }

  function pruneStats(days) {
    const keys = Object.keys(days).sort();

    while (keys.length > STATS_RETENTION_DAYS) {
      delete days[keys.shift()];
    }
  }

  function scheduleStatsWrite() {
    if (statsWriteTimer) {
      return;
    }

    statsWriteTimer = setTimeout(async () => {
      statsWriteTimer = 0;
      saveStats(await statsPromise);
    }, STATS_WRITE_DELAY_MS);
  }

  function getLocalDayKey(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${day}`;
  }

  async function classifyContent(text, source) {
    const settings = await loadSettings();
    const secrets = await loadSecrets();
    const normalizedSource = normalizeSource(source);
    const filterSetting = FILTER_SETTING_BY_SOURCE[normalizedSource];
    const normalizedText = normalizeText(text).slice(0, 2000);

    if (!filterSetting || !settings[filterSetting] || !secrets.anthropicApiKey) {
      return {
        blocked: false,
        reasons: [],
        classifier: "disabled"
      };
    }

    const cacheKey = JSON.stringify({
      classifier: "claude-haiku",
      criteria: settings.filterCriteria,
      source: normalizedSource,
      text: normalizedText
    });

    if (resultCache.has(cacheKey)) {
      return resultCache.get(cacheKey);
    }

    return new Promise((resolve) => {
      batchQueue.push({
        text: normalizedText,
        source: normalizedSource,
        cacheKey,
        resolve
      });

      if (batchQueue.length >= MAX_BATCH_SIZE) {
        flushBatch();
      } else if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, BATCH_DELAY_MS);
      }
    });
  }

  async function flushBatch() {
    clearTimeout(batchTimer);
    batchTimer = 0;

    const queued = batchQueue.splice(0, MAX_BATCH_SIZE);

    if (batchQueue.length > 0) {
      batchTimer = setTimeout(flushBatch, BATCH_DELAY_MS);
    }

    const entries = new Map();

    queued.forEach((item) => {
      const cached = resultCache.get(item.cacheKey);

      if (cached) {
        item.resolve(cached);
        return;
      }

      const entry = entries.get(item.cacheKey) || {
        text: item.text,
        source: item.source,
        resolvers: []
      };

      entry.resolvers.push(item.resolve);
      entries.set(item.cacheKey, entry);
    });

    if (entries.size === 0) {
      return;
    }

    const items = Array.from(entries.values());

    try {
      const settings = await loadSettings();
      const secrets = await loadSecrets();
      const results = await classifyBatchWithHaiku(
        items,
        settings.filterCriteria,
        secrets.anthropicApiKey
      );

      Array.from(entries.keys()).forEach((cacheKey, index) => {
        const result = results[index];

        setCached(cacheKey, result);
        entries.get(cacheKey).resolvers.forEach((resolve) => resolve(result));
      });
    } catch (error) {
      const failure = {
        blocked: false,
        reasons: [],
        classifier: "error",
        error: error.message
      };

      items.forEach((entry) => {
        entry.resolvers.forEach((resolve) => resolve(failure));
      });
    }
  }

  async function classifyBatchWithHaiku(items, criteria, apiKey) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(80 * items.length + 100, 4000),
        temperature: 0,
        system:
          "You classify social-media posts for a personal feed filter. Return only compact JSON. Do not include prose.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildClassifierPrompt(items, criteria)
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API ${response.status}`);
    }

    const data = await response.json();

    // A truncated answer parses as "blocked: false" for every missing item,
    // which would get cached and silently disable filtering for the batch.
    if (data.stop_reason === "max_tokens") {
      throw new Error("Anthropic API response truncated");
    }

    const content = Array.isArray(data.content) ? data.content : [];
    const answer = content
      .filter((block) => block && block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return parseBatchAnswer(answer, items.length);
  }

  function buildClassifierPrompt(items, criteria) {
    const criteriaLines = (criteria.length
      ? criteria
      : self.SmoothSurferSettings.DEFAULT_FILTER_CRITERIA
    )
      .map((criterion, index) => `${index + 1}. ${criterion}`)
      .join("\n");
    const itemLines = items
      .map(
        (item, index) =>
          `${index + 1}. [${SOURCE_LABELS[item.source] || "feed item"}] ${item.text}`
      )
      .join("\n\n");

    return `Decide for each numbered feed item whether it should be hidden.

Hide an item only when it semantically matches at least one filter criterion. A match can be paraphrased or implied; it does not need exact words. Do not hide neutral technical AI discussion, ordinary news, jokes, or criticism unless it clearly matches a criterion.

Filter criteria:
${criteriaLines}

Return JSON in exactly this shape, with one entry per item in the same order:
{"results": [{"i": 1, "blocked": boolean, "reasons": ["short reason"]}]}

Items:
${itemLines}`;
  }

  function parseBatchAnswer(answer, itemCount) {
    const parsed = parseJsonAnswer(answer);
    const list = Array.isArray(parsed.results)
      ? parsed.results
      : Array.isArray(parsed)
        ? parsed
        : [];
    const results = Array.from({ length: itemCount }, () => ({
      blocked: false,
      reasons: [],
      classifier: "claude-haiku"
    }));

    list.forEach((entry, position) => {
      if (!entry || typeof entry !== "object") {
        return;
      }

      const index = Number.isInteger(entry.i) ? entry.i - 1 : position;

      if (index < 0 || index >= results.length) {
        return;
      }

      results[index] = {
        blocked: Boolean(entry.blocked),
        reasons: Array.isArray(entry.reasons)
          ? entry.reasons.map(String).filter(Boolean).slice(0, 3)
          : [],
        classifier: "claude-haiku"
      };
    });

    return results;
  }

  function parseJsonAnswer(answer) {
    try {
      return JSON.parse(answer);
    } catch (error) {
      const match = answer.match(/\{[\s\S]*\}/);

      if (!match) {
        return { blocked: false, reasons: [] };
      }

      try {
        return JSON.parse(match[0]);
      } catch (nestedError) {
        return { blocked: false, reasons: [] };
      }
    }
  }

  function setCached(key, value) {
    resultCache.set(key, value);

    if (resultCache.size <= MAX_CACHE_ENTRIES) {
      return;
    }

    const oldestKey = resultCache.keys().next().value;
    resultCache.delete(oldestKey);
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeSource(source) {
    const normalized = String(source || "").toLowerCase();

    return Object.hasOwn(FILTER_SETTING_BY_SOURCE, normalized) ? normalized : "twitter";
  }
})();
