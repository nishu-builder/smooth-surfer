(function createSmoothSurferRules(root) {
  "use strict";

  const AI_PATTERN =
    /\b(ai|a\.i\.|artificial intelligence|agi|llm|llms|chatgpt|openai|anthropic|claude|gemini|copilot|nvidia|nvda|gpu|gpus|foundation model|agents?|automation)\b/i;
  const FOMO_PATTERN =
    /\b(don't miss|do not miss|miss(?:ed|ing)? out|before it'?s too late|last chance|once in a lifetime|everyone is|nobody is talking|no one is talking|wake up|get ahead|left behind|fall behind|only chance|next wave|gold rush|land grab|arms race|must act now|too late|you are early|still early)\b/i;
  const FINANCIAL_PATTERN =
    /\b(upside|alpha|10x|100x|money|wealth|millionaire|rich|retire|generational wealth|stock|stocks|equity|investment|investor|portfolio|market cap|valuation|bull run|moonshot|profit|profits|returns?|opportunity|opportunities|compounder|bagger)\b/i;
  const LOSS_PATTERN =
    /\b(losing|lost|missed gains|miss out|opportunity cost|(?:left|leaving) money on the table|not buying|not investing|regret|you'?ll regret|replace you|replaced by|obsolete|priced out)\b/i;
  const ENGAGEMENT_BAIT_PATTERN =
    /\b(reply|comment|drop|like|repost|retweet|quote tweet|bookmark|follow|tag)\b.{0,40}\b(if|for|to|below|this|your|you|someone|friend)\b|\b(agree\?|thoughts\?|what would you do|which one are you|am i wrong|change my mind)\b/i;
  const TAG_PATTERN = /(^|\s)[#$][\p{L}\p{N}_]+/gu;
  const SENTENCE_END_PATTERN = /[.!?]["')\]]?$/;

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeCriteria(value) {
    if (Array.isArray(value)) {
      return value.map(String).map((item) => item.trim()).filter(Boolean);
    }

    return String(value || "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function findCriterionMatches(text, criteria) {
    const normalized = normalizeText(text).toLowerCase();

    return normalizeCriteria(criteria).filter((criterion) =>
      normalized.includes(criterion.toLowerCase())
    );
  }

  function classifyTweetText(text, criteria) {
    const normalized = normalizeText(text);
    const reasons = [];
    const criterionMatches = findCriterionMatches(normalized, criteria);

    if (criterionMatches.length > 0) {
      reasons.push("criterion: " + criterionMatches.join(", "));
    }

    const hasAi = AI_PATTERN.test(normalized);
    const hasFomo = FOMO_PATTERN.test(normalized);
    const hasFinancialUpside = FINANCIAL_PATTERN.test(normalized);
    const hasLossFrame = LOSS_PATTERN.test(normalized);
    const tagCount = countTags(normalized);

    if (hasAi && hasFomo && hasFinancialUpside) {
      reasons.push("AI financial-upside FOMO");
    } else if (hasFomo && hasFinancialUpside) {
      reasons.push("missed-upside FOMO");
    } else if (hasAi && hasLossFrame && hasFinancialUpside) {
      reasons.push("AI financial loss framing");
    } else if (hasFomo && hasLossFrame) {
      reasons.push("urgency/loss framing");
    }

    if (ENGAGEMENT_BAIT_PATTERN.test(normalized)) {
      reasons.push("engagement bait");
    }

    if (tagCount >= 5) {
      reasons.push("hashtag/cashtag overload");
    }

    if (isLinkedInStylePost(text)) {
      reasons.push("LinkedIn-style one-sentence paragraphs");
    }

    return {
      blocked: reasons.length > 0,
      reasons
    };
  }

  function countTags(text) {
    return (text.match(TAG_PATTERN) || []).length;
  }

  function isLinkedInStylePost(text) {
    const paragraphs = String(text || "")
      .split(/\n+/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (paragraphs.length < 5) {
      return false;
    }

    const shortParagraphs = paragraphs.filter((paragraph) => countWords(paragraph) <= 16);
    const sentenceParagraphs = paragraphs.filter(
      (paragraph) => SENTENCE_END_PATTERN.test(paragraph) && countWords(paragraph) <= 18
    );
    const totalWords = paragraphs.reduce((sum, paragraph) => sum + countWords(paragraph), 0);

    return (
      totalWords >= 24 &&
      shortParagraphs.length / paragraphs.length >= 0.75 &&
      sentenceParagraphs.length >= 4
    );
  }

  function countWords(text) {
    return normalizeText(text).split(/\s+/).filter(Boolean).length;
  }

  const api = {
    classifyTweetText,
    normalizeText
  };

  root.SmoothSurferRules = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
