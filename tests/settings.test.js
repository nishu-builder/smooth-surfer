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
