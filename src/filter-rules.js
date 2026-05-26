(function createFeedDockRules(root) {
  "use strict";

  const AI_PATTERN =
    /\b(ai|a\.i\.|artificial intelligence|agi|llm|llms|chatgpt|openai|anthropic|claude|gemini|copilot|nvidia|nvda|gpu|gpus|foundation model|agents?|automation)\b/i;
  const FOMO_PATTERN =
    /\b(don't miss|do not miss|miss(?:ed|ing)? out|before it'?s too late|last chance|once in a lifetime|everyone is|nobody is talking|no one is talking|wake up|get ahead|left behind|fall behind|only chance|next wave|gold rush|land grab|arms race|must act now|too late|you are early|still early)\b/i;
  const FINANCIAL_PATTERN =
    /\b(upside|alpha|10x|100x|money|wealth|millionaire|rich|retire|generational wealth|stock|stocks|equity|investment|investor|portfolio|market cap|valuation|bull run|moonshot|profit|profits|returns?|opportunity|opportunities|compounder|bagger)\b/i;
  const LOSS_PATTERN =
    /\b(losing|lost|missed gains|miss out|opportunity cost|(?:left|leaving) money on the table|not buying|not investing|regret|you'?ll regret|replace you|replaced by|obsolete|priced out)\b/i;

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

    if (hasAi && hasFomo && hasFinancialUpside) {
      reasons.push("AI financial-upside FOMO");
    } else if (hasAi && hasLossFrame && hasFinancialUpside) {
      reasons.push("AI financial loss framing");
    } else if (hasAi && hasFomo && hasLossFrame) {
      reasons.push("AI urgency/loss framing");
    }

    return {
      blocked: reasons.length > 0,
      reasons
    };
  }

  const api = {
    classifyTweetText,
    normalizeText
  };

  root.FeedDockRules = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
