importScripts("settings.js", "storage.js");

(function installSmoothSurferBackground() {
  "use strict";

  const {
    loadSecrets,
    loadSettings
  } = self.SmoothSurferStorage;
  const MODEL = "claude-haiku-4-5";
  const ANTHROPIC_VERSION = "2023-06-01";
  const MAX_CACHE_ENTRIES = 400;
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !message ||
      (message.type !== "classifyContent" && message.type !== "classifyTweetContent")
    ) {
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

    const result = await classifyWithHaiku(
      normalizedText,
      settings.filterCriteria,
      normalizedSource,
      secrets.anthropicApiKey
    );

    setCached(cacheKey, result);
    return result;
  }

  async function classifyWithHaiku(text, criteria, source, apiKey) {
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
        max_tokens: 120,
        temperature: 0,
        system:
          "You classify social-media posts for a personal feed filter. Return only compact JSON. Do not include prose.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildClassifierPrompt(text, criteria, source)
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
    const content = Array.isArray(data.content) ? data.content : [];
    const answer = content
      .filter((block) => block && block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    const parsed = parseJsonAnswer(answer);

    return {
      blocked: Boolean(parsed.blocked),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map(String).filter(Boolean).slice(0, 3)
        : [],
      classifier: "claude-haiku"
    };
  }

  function buildClassifierPrompt(text, criteria, source) {
    const criteriaLines = criteria.length
      ? criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n")
      : self.SmoothSurferSettings.DEFAULT_FILTER_CRITERIA.map(
          (criterion, index) => `${index + 1}. ${criterion}`
        ).join("\n");
    const sourceLabel = SOURCE_LABELS[source] || "feed item";

    return `Decide whether this ${sourceLabel} should be hidden.

Hide the item only when it semantically matches at least one filter criterion. A match can be paraphrased or implied; it does not need exact words. Do not hide neutral technical AI discussion, ordinary news, jokes, or criticism unless it clearly matches a criterion.

Filter criteria:
${criteriaLines}

Return JSON in exactly this shape:
{"blocked": boolean, "reasons": ["short reason"]}

Content:
${text}`;
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
