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
assert.deepEqual(
  settings.normalizeSettings({ twitterFilterCriteria: "legacy, criteria" }).filterCriteria,
  ["legacy", "criteria"]
);
assert.equal(
  settings.normalizeSecrets({ anthropicApiKey: "  sk-ant-test  " }).anthropicApiKey,
  "sk-ant-test"
);

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
assert.equal(defaults.consumptionFactsEnabled, true);
assert.equal(defaults.hideStickyVideoPlayers, true);
assert.equal(defaults.pauseDeepScrolling, true);
assert.equal(defaults.softenDistractingElements, true);
assert.equal(defaults.youtubeHideComments, false);
assert.equal(defaults.redditHideComments, false);
assert.equal(defaults.videoSpeedHotkeys, true);
assert.equal(defaults.videoSpeedModifier, "alt");
assert.equal(defaults.settingsHotkeyEnabled, true);
assert.equal(defaults.focusScheduleEnabled, false);
assert.equal(defaults.focusScheduleStart, "09:00");
assert.equal(defaults.focusScheduleEnd, "17:00");

assert.equal(settings.normalizeSettings({ videoSpeedModifier: "CTRL" }).videoSpeedModifier, "ctrl");
assert.equal(settings.normalizeSettings({ videoSpeedModifier: "none" }).videoSpeedModifier, "none");
assert.equal(settings.normalizeSettings({ videoSpeedModifier: "bogus" }).videoSpeedModifier, "alt");
assert.equal(settings.normalizeSettings({ settingsHotkeyEnabled: 0 }).settingsHotkeyEnabled, false);
assert.deepEqual(settings.VIDEO_SPEED_MODIFIERS, ["none", "alt", "ctrl", "shift", "meta"]);

assert.equal(
  settings.normalizeSettings({ focusScheduleStart: "7:05" }).focusScheduleStart,
  "07:05"
);
assert.equal(
  settings.normalizeSettings({ focusScheduleStart: "25:00" }).focusScheduleStart,
  "09:00"
);
assert.equal(
  settings.normalizeSettings({ focusScheduleEnd: "not a time" }).focusScheduleEnd,
  "17:00"
);

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
assert.ok(settings.CONSUMPTION_TAGS.includes("outrage-political"));
assert.ok(settings.CONSUMPTION_TAGS.includes("curiosity-beauty"));
assert.deepEqual(settings.normalizeConsumption(null), { days: {} });
assert.deepEqual(
  settings.normalizeConsumption({
    days: {
      "2026-06-10": {
        twitter: { posts: "3", tags: { joy: 2, "not-a-tag": 5, humor: 0 } },
        reddit: { posts: 0, tags: { joy: 1 } },
        broken: null
      },
      "not-a-date": { twitter: { posts: 1, tags: {} } }
    }
  }),
  { days: { "2026-06-10": { twitter: { posts: 3, tags: { joy: 2 } } } } }
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

// Review retention is bounded; persisted restore choices contain no post text.
{
  const { normalizeReview, getReviewPostKey, safePostUrl } = require("../src/settings.js");
  const now = Date.now();
  const item = (id, at = now) => ({
    id,
    at,
    source: "twitter",
    text: "A post",
    url: "javascript:alert(1)"
  });
  const review = normalizeReview({
    items: [
      item("old", now - 8 * 86400000),
      item("a"),
      item("a"),
      ...Array.from({ length: 2200 }, (_, i) => item(String(i)))
    ],
    restored: ["a", "a", "b"]
  });
  assert.equal(review.items.length, 2000);
  assert.equal(review.items[0].id, "a");
  assert.equal(review.items[0].url, "");
  assert.deepEqual(review.restored, ["a", "b"]);
  assert.equal(
    getReviewPostKey("twitter", "hello  world"),
    getReviewPostKey("twitter", " hello world ")
  );
  assert.notEqual(
    getReviewPostKey("reddit", "hello world"),
    getReviewPostKey("twitter", "hello world")
  );
  assert.equal(getReviewPostKey("twitter", "hello world").includes("hello"), false);
  assert.equal(safePostUrl("https://user:password@example.com"), "");
  assert.equal(safePostUrl("https://x.com/a/status/123"), "https://x.com/a/status/123");
}

// Large previews stay within local storage, while ordinary history retains 2,000 posts.
const bulky = settings.normalizeReview({
  items: Array.from({ length: 2000 }, (_, i) => ({
    id: String(i),
    at: Date.now(),
    text: "a".repeat(2000),
    criteria: Array(20)
      .fill(0)
      .map((_, j) => String(j) + "b".repeat(499))
  }))
});
assert.ok(bulky.items.length > 200);
assert.ok(bulky.items.length < 2000);
assert.ok(Buffer.byteLength(JSON.stringify(bulky)) <= 6 * 1024 * 1024);
assert.equal(defaults.imageAnalysisEnabled, false);
settings.FORMAT_KEYS.forEach((key) => assert.equal(defaults[key], false));
const media = "https://pbs.twimg.com/media/example.jpg?name=large";
assert.deepEqual(
  settings.normalizeImageUrls([
    media,
    media,
    "https://pbs.twimg.com/profile_images/avatar.png",
    "http://i.redd.it/a.png",
    "https://localhost/a.png",
    "https://user@i.redd.it/a.png"
  ]),
  ["https://pbs.twimg.com/media/example.jpg?name=small"]
);
assert.notEqual(
  settings.getReviewPostKey("twitter", "", [media]),
  settings.getReviewPostKey("twitter", "", ["https://i.redd.it/other.png"])
);
assert.equal(
  settings.normalizeReview({ items: [{ id: "image", text: "", images: [media], at: Date.now() }] })
    .items.length,
  1
);
const pack = settings.normalizeFilterSet({
  ...settings.BUILTIN_FILTER_SETS[0],
  anthropicApiKey: "must-not-export",
  imageAnalysisEnabled: true,
  formats: { twitterHideReposts: true, enabled: false, imageAnalysisEnabled: true }
});
assert.deepEqual(Object.keys(pack).sort(), ["criteria", "formats", "name", "schema", "version"]);
assert.deepEqual(pack.formats, { twitterHideReposts: true });
assert.throws(() => settings.normalizeFilterSet({ ...pack, version: 2 }));
assert.throws(() => settings.normalizeFilterSet({ ...pack, criteria: [{}] }));
assert.throws(() => settings.normalizeFilterSet({ ...pack, criteria: Array(51).fill("rule") }));
assert.equal(
  settings.normalizeFilterSets([pack, { ...pack, name: pack.name.toUpperCase() }]).length,
  1
);
console.log("settings tests passed");

assert.equal(
  settings.normalizePostDisplay({ avatar: "https://evil.example/avatar.png" }).avatar,
  ""
);
assert.equal(settings.normalizePostDisplay({ postedAt: "not a date" }).postedAt, "");
assert.equal(
  settings.normalizePostDisplay({ text: "Line one\nLine two" }).text,
  "Line one\nLine two"
);
