"use strict";

const assert = require("node:assert/strict");
const settings = require("../src/settings");

assert.deepEqual(settings.normalizePatternList("one\ntwo, two"), ["one", "two"]);
assert.deepEqual(settings.normalizePatternList([" Alpha ", "alpha", "Beta phrase"]), [
  "Alpha",
  "Beta phrase"
]);

assert.equal(
  settings.normalizeSettings({ twitterFilterFomoAi: false }).twitterFilterContent,
  false
);
assert.deepEqual(settings.normalizeSettings({ twitterCustomPatterns: "one, two" }).twitterFilterCriteria, [
  "one",
  "two"
]);
assert.equal(settings.normalizeSettings({ twitterClassifierMode: "anthropic-haiku" }).twitterClassifierMode, "anthropic-haiku");
assert.equal(settings.normalizeSecrets({ anthropicApiKey: "  sk-ant-test  " }).anthropicApiKey, "sk-ant-test");
