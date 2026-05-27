"use strict";

const assert = require("node:assert/strict");
const settings = require("../src/settings");

assert.deepEqual(settings.normalizeCriteria("one\ntwo, two"), ["one", "two"]);
assert.deepEqual(settings.normalizeCriteria([" Alpha ", "alpha", "Beta phrase"]), [
  "Alpha",
  "Beta phrase"
]);

assert.deepEqual(settings.normalizeSettings({ filterCriteria: "one, two" }).filterCriteria, [
  "one",
  "two"
]);
assert.deepEqual(settings.normalizeSettings({ twitterFilterCriteria: "legacy, criteria" }).filterCriteria, [
  "legacy",
  "criteria"
]);
assert.equal(settings.normalizeSecrets({ anthropicApiKey: "  sk-ant-test  " }).anthropicApiKey, "sk-ant-test");

const defaults = settings.normalizeSettings();
assert.equal(Object.hasOwn(defaults, "twitterClassifierMode"), false);
assert.equal(Object.hasOwn(defaults, "twitterFilterCriteria"), false);
assert.equal(defaults.youtubeHideShorts, true);
assert.equal(defaults.youtubeBlockShorts, true);
assert.equal(defaults.youtubeHideGames, true);
assert.equal(defaults.youtubeDisableAutoplay, true);
assert.equal(defaults.twitterHideTrends, true);
assert.equal(defaults.twitterEnforceFollowing, true);
assert.equal(defaults.redditHideAds, true);
assert.equal(defaults.redditHideRecommendations, true);
assert.equal(defaults.redditFilterContent, true);
assert.equal(defaults.substackHideRecommendations, true);
assert.equal(defaults.substackFilterContent, true);
assert.equal(defaults.hackerNewsFilterContent, true);
assert.equal(defaults.hackerNewsHideScores, true);
assert.equal(defaults.hideStickyVideoPlayers, true);
assert.equal(defaults.pauseDeepScrolling, true);
assert.equal(defaults.softenDistractingElements, true);
assert.ok(defaults.filterCriteria.some((criterion) => criterion.includes("Engagement bait")));
assert.ok(defaults.filterCriteria.some((criterion) => criterion.includes("missed upside")));
assert.ok(defaults.filterCriteria.some((criterion) => criterion.includes("one short sentence")));

const migrated = settings.normalizeSettings({
  twitterFilterCriteria: [
    "AI hype that pressures the reader with FOMO, loss framing, or financial upside.",
    "Custom criterion"
  ]
});
assert.ok(migrated.filterCriteria.some((criterion) => criterion.includes("missed upside")));
assert.ok(migrated.filterCriteria.some((criterion) => criterion.includes("one short sentence")));
assert.equal(
  migrated.filterCriteria.includes(
    "AI hype that pressures the reader with FOMO, loss framing, or financial upside."
  ),
  false
);

const removedPreset = settings.normalizeSettings({
  filterCriteria: settings.DEFAULT_FILTER_CRITERIA.filter(
    (criterion) => !criterion.includes("one short sentence")
  )
});
assert.equal(
  removedPreset.filterCriteria.some((criterion) => criterion.includes("one short sentence")),
  false
);

assert.equal(settings.getPlatformForUrl("https://www.reddit.com/r/news"), "reddit");
assert.equal(settings.getPlatformForUrl("https://nishad.substack.com/p/post"), "substack");
assert.equal(settings.getPlatformForUrl("https://news.ycombinator.com/item?id=1"), "hacker-news");
assert.equal(settings.getPlatformForUrl("http://twitter.com.test:123/home"), "twitter");
assert.equal(settings.getPlatformForHost("old.reddit.com.test"), "reddit");
