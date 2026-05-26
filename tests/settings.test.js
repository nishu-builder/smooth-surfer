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
