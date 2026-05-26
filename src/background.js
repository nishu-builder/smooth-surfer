importScripts("settings.js", "storage.js", "filter-rules.js");

(function installSmoothSurferBackground() {
  "use strict";

  const {
    loadSecrets,
    loadSettings
  } = self.SmoothSurferStorage;
  const MODEL = "claude-3-5-haiku-20241022";
  const ANTHROPIC_VERSION = "2023-06-01";
  const MAX_CACHE_ENTRIES = 400;
  const resultCache = new Map();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "classifyTweetContent") {
      return false;
    }

    classifyTweetContent(message.text)
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

  async function classifyTweetContent(text) {
    const settings = await loadSettings();
    const secrets = await loadSecrets();
    const normalizedText = self.SmoothSurferRules.normalizeText(text).slice(0, 2000);
    const cacheKey = JSON.stringify({
      mode: settings.twitterClassifierMode,
      criteria: settings.twitterFilterCriteria,
      text: normalizedText
    });

    if (resultCache.has(cacheKey)) {
      return resultCache.get(cacheKey);
    }

    const result =
      settings.twitterClassifierMode === "anthropic-haiku" && secrets.anthropicApiKey
        ? await classifyWithHaiku(normalizedText, settings.twitterFilterCriteria, secrets.anthropicApiKey)
        : classifyWithRules(normalizedText, settings.twitterFilterCriteria);

    setCached(cacheKey, result);
    return result;
  }

  function classifyWithRules(text, criteria) {
    const result = self.SmoothSurferRules.classifyTweetText(text, criteria);
    return {
      ...result,
      classifier: "local-rules"
    };
  }

  async function classifyWithHaiku(text, criteria, apiKey) {
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
                text: buildClassifierPrompt(text, criteria)
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

  function buildClassifierPrompt(text, criteria) {
    const criteriaLines = criteria.length
      ? criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n")
      : self.SmoothSurferSettings.DEFAULT_FILTER_CRITERIA.map(
          (criterion, index) => `${index + 1}. ${criterion}`
        ).join("\n");

    return `Decide whether this X/Twitter post should be hidden.

Hide the post only when it semantically matches at least one filter criterion. A match can be paraphrased or implied; it does not need exact words. Do not hide neutral technical AI discussion, ordinary news, jokes, or criticism unless it clearly matches a criterion.

Filter criteria:
${criteriaLines}

Return JSON in exactly this shape:
{"blocked": boolean, "reasons": ["short reason"]}

Post:
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
})();
