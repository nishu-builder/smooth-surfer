"use strict";

const assert = require("node:assert/strict");
const settings = require("../src/settings");

assert.deepEqual(settings.normalizeCriteria("one\ntwo, two"), ["one", "two"]);
assert.deepEqual(settings.normalizeCriteria([" Alpha ", "alpha", "Beta phrase"]), [
  "Alpha",
  "Beta phrase"
]);

assert.deepEqual(settings.normalizeSettings({ twitterFilterCriteria: "one, two" }).twitterFilterCriteria, [
  "one",
  "two"
]);
assert.equal(settings.normalizeSettings({ twitterClassifierMode: "anthropic-haiku" }).twitterClassifierMode, "anthropic-haiku");
assert.equal(settings.normalizeSecrets({ anthropicApiKey: "  sk-ant-test  " }).anthropicApiKey, "sk-ant-test");

const defaults = settings.normalizeSettings();
assert.equal(defaults.youtubeHideShorts, true);
assert.equal(defaults.youtubeBlockShorts, true);
assert.equal(defaults.youtubeHideGames, true);
assert.equal(defaults.youtubeDisableAutoplay, true);
assert.equal(defaults.twitterHideTrends, true);
assert.equal(defaults.twitterEnforceFollowing, true);
assert.equal(defaults.hideStickyVideoPlayers, true);
assert.equal(defaults.pauseDeepScrolling, true);
assert.equal(defaults.softenDistractingElements, true);
assert.ok(defaults.twitterFilterCriteria.some((criterion) => criterion.includes("Engagement bait")));
assert.ok(defaults.twitterFilterCriteria.some((criterion) => criterion.includes("missed upside")));
assert.ok(defaults.twitterFilterCriteria.some((criterion) => criterion.includes("one short sentence")));

const migrated = settings.normalizeSettings({
  twitterFilterCriteria: [
    "AI hype that pressures the reader with FOMO, loss framing, or financial upside.",
    "Custom criterion"
  ]
});
assert.ok(migrated.twitterFilterCriteria.some((criterion) => criterion.includes("missed upside")));
assert.ok(migrated.twitterFilterCriteria.some((criterion) => criterion.includes("one short sentence")));
assert.equal(
  migrated.twitterFilterCriteria.includes(
    "AI hype that pressures the reader with FOMO, loss framing, or financial upside."
  ),
  false
);

const removedPreset = settings.normalizeSettings({
  twitterFilterCriteria: settings.DEFAULT_FILTER_CRITERIA.filter(
    (criterion) => !criterion.includes("one short sentence")
  )
});
assert.equal(
  removedPreset.twitterFilterCriteria.some((criterion) => criterion.includes("one short sentence")),
  false
);
