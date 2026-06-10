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
assert.equal(defaults.youtubeHideComments, false);
assert.equal(defaults.redditHideComments, false);
assert.equal(defaults.videoSpeedHotkeys, true);
assert.equal(defaults.focusScheduleEnabled, false);
assert.equal(defaults.focusScheduleStart, "09:00");
assert.equal(defaults.focusScheduleEnd, "17:00");

assert.equal(settings.normalizeSettings({ focusScheduleStart: "7:05" }).focusScheduleStart, "07:05");
assert.equal(settings.normalizeSettings({ focusScheduleStart: "25:00" }).focusScheduleStart, "09:00");
assert.equal(settings.normalizeSettings({ focusScheduleEnd: "not a time" }).focusScheduleEnd, "17:00");

const at = (hours, minutes) => new Date(2026, 5, 10, hours, minutes);
assert.equal(settings.isWithinFocusWindow("09:00", "17:00", at(12, 0)), true);
assert.equal(settings.isWithinFocusWindow("09:00", "17:00", at(9, 0)), true);
assert.equal(settings.isWithinFocusWindow("09:00", "17:00", at(8, 59)), false);
assert.equal(settings.isWithinFocusWindow("09:00", "17:00", at(17, 0)), false);
assert.equal(settings.isWithinFocusWindow("22:00", "06:00", at(23, 0)), true);
assert.equal(settings.isWithinFocusWindow("22:00", "06:00", at(5, 59)), true);
assert.equal(settings.isWithinFocusWindow("22:00", "06:00", at(12, 0)), false);
assert.equal(settings.isWithinFocusWindow("09:00", "09:00", at(3, 0)), true);

assert.deepEqual(settings.normalizeStats(null), { days: {} });
assert.deepEqual(
  settings.normalizeStats({
    days: {
      "2026-06-10": { youtube: { ad: "3", junk: 0 }, broken: null },
      "not-a-date": { youtube: { ad: 2 } }
    }
  }),
  { days: { "2026-06-10": { youtube: { ad: 3 } } } }
);
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
