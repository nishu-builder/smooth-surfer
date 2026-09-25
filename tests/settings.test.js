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
assert.equal(settings.DEFAULT_SETTINGS.aiProvider, "anthropic");
assert.equal(settings.DEFAULT_SETTINGS.crossWindowPinsEnabled, true);
assert.equal(settings.normalizeSettings({}).crossWindowPinsEnabled, true);
assert.equal(defaults.aiProvider, "anthropic");
assert.equal(
  settings.normalizeSettings({ enabled: true }).aiProvider,
  "anthropic",
  "Legacy settings without a provider use Claude"
);
assert.equal(
  settings.normalizeSettings({ aiProvider: "anthropic" }).aiProvider,
  "anthropic",
  "Preserve an explicit cloud choice"
);
assert.equal(settings.normalizeSettings({ aiProvider: "local" }).aiProvider, "local");
assert.equal(
  settings.normalizeSettings({ aiProvider: "unknown" }).aiProvider,
  "anthropic",
  "Invalid settings use the default provider"
);
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
assert.equal(Object.hasOwn(defaults, "hideStickyVideoPlayers"), false);
assert.equal(
  Object.hasOwn(
    settings.normalizeSettings({ hideStickyVideoPlayers: true }),
    "hideStickyVideoPlayers"
  ),
  false,
  "saved or imported legacy settings cannot re-enable floating-container hiding"
);
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

// Tweet identity survives text, media and URL changes, including legacy history.
{
  const S = require("../src/settings.js");
  const now = Date.now();
  const base = {
    source: "twitter",
    text: "Poll: 10 votes",
    url: "https://x.com/person/status/123",
    at: now,
    criteria: ["Polls"]
  };
  const other = { ...base, id: "different-tweet", url: "https://x.com/person/status/456" };
  const history = S.normalizeReview({
    items: [
      { ...base, id: "legacy-new", at: now + 1, text: "Poll: 11 votes", criteria: ["FOMO"] },
      { ...base, id: "legacy-old", url: "https://mobile.twitter.com/person/status/123?s=20" },
      other
    ],
    restored: ["legacy-old"]
  });
  assert.equal(history.items.length, 2);
  assert.equal(history.items[0].id, "twitter:status:123");
  assert.deepEqual(history.items[0].criteria, ["FOMO", "Polls"]);
  assert.equal(history.items[0].text, "Poll: 11 votes");
  assert.deepEqual(history.restored, ["twitter:status:123"]);
  assert.equal(
    S.getReviewPostKey("twitter", "changed", [], "https://x.com/i/web/status/123/photo/1"),
    history.items[0].id
  );
  assert.notEqual(S.getReviewPostKey("twitter", base.text, [], other.url), history.items[0].id);
  assert.equal(S.canonicalReviewId("twitter", "https://x.com.evil.test/a/status/123"), "");
  assert.equal(S.canonicalReviewId("twitter", "https://x.com/person/status/123abc"), "");
  const calibration = S.normalizeCalibration({
    feedback: [
      { ...base, rule: "Polls", postKey: "legacy-old", judgment: "good", at: now },
      {
        ...base,
        rule: "Polls",
        postKey: "legacy-new",
        judgment: "bad",
        explanation: "An ordinary poll is fine.",
        at: now + 2
      },
      { ...base, rule: "FOMO", postKey: "legacy-new", judgment: "good", at: now + 1 }
    ]
  });
  assert.equal(calibration.feedback.length, 2, "one latest judgment per tweet and rule");
  assert.equal(calibration.feedback[0].judgment, "bad");
  assert.equal(calibration.feedback[0].explanation, "An ordinary poll is fine.");
  assert.equal(
    S.reviewItemsWithFeedback(history, calibration).length,
    2,
    "archived feedback merges with its tweet"
  );
}

// Archived posts have no time cutoff, and old archives can reenter the queue.
{
  const S = require("../src/settings.js");
  const at = Date.now() - 60 * 86400000;
  const post = {
    id: "old",
    source: "twitter",
    url: "https://x.com/a/status/123",
    text: "Kept for later",
    at
  };
  const archived = S.normalizeReview({ items: [post], archived: ["old"] });
  assert.equal(archived.items.length, 1);
  assert.deepEqual(archived.archived, ["twitter:status:123"]);
  assert.equal(
    S.normalizeReview(archived).items.length,
    1,
    "archives persist through normalization"
  );
  assert.equal(
    S.normalizeReview({ items: [post] }).items.length,
    0,
    "ordinary history still expires"
  );
  assert.equal(
    S.normalizeReview({ items: [{ ...post, queuedAt: Date.now() }], archived: [] }).items.length,
    1,
    "returned archives remain in the queue without changing original filter time"
  );
}

// Visit delay: domains, growth, the 03:00 day boundary, and event accounting.
{
  const S = require("../src/settings.js");
  assert.equal(defaults.visitDelaySeconds, 1);
  assert.deepEqual(defaults.visitDelayDomains, []);
  assert.equal(S.normalizeSettings({ visitDelaySeconds: "0" }).visitDelaySeconds, 1);
  assert.equal(S.normalizeSettings({ visitDelaySeconds: 900 }).visitDelaySeconds, 300);
  assert.equal(S.normalizeSettings({ visitDelaySeconds: "abc" }).visitDelaySeconds, 1);
  assert.equal(S.normalizeVisitDomain("https://www.X.com/home?x=1"), "x.com");
  assert.equal(S.normalizeVisitDomain("*.reddit.com"), "reddit.com");
  assert.equal(S.normalizeVisitDomain("x.com:443"), "x.com");
  assert.equal(S.normalizeVisitDomain("localhost"), "", "a bare label is not a site");
  assert.equal(S.normalizeVisitDomain("bad host"), "");
  assert.equal(S.normalizeVisitDomain(""), "");
  assert.deepEqual(
    S.normalizeSettings({ visitDelayDomains: "x.com, https://reddit.com/r/a x.com" })
      .visitDelayDomains,
    ["x.com", "reddit.com"]
  );
  assert.equal(
    S.normalizeSettings({ visitDelayDomains: Array.from({ length: 60 }, (_, i) => `s${i}.com`) })
      .visitDelayDomains.length,
    50
  );
  assert.equal(S.matchVisitDomain("old.reddit.com", ["reddit.com"]), "reddit.com");
  assert.equal(S.matchVisitDomain("www.x.com", ["x.com"]), "x.com");
  assert.equal(S.matchVisitDomain("x.com", ["twitter.com"]), "twitter.com");
  assert.equal(S.matchVisitDomain("mobile.x.com", ["twitter.com"]), "twitter.com");
  assert.equal(S.matchVisitDomain("twitter.com", ["x.com"]), "x.com");
  assert.equal(S.matchVisitDomain("mobile.twitter.com", ["x.com"]), "x.com");
  assert.equal(S.matchVisitDomain("x.com", ["twitter.com", "x.com"]), "x.com");
  assert.equal(S.matchVisitDomain("notx.com", ["twitter.com"]), "");
  assert.equal(S.matchVisitDomain("x.com.evil.test", ["twitter.com"]), "");
  assert.equal(S.matchVisitDomain("notreddit.com", ["reddit.com"]), "", "no suffix matches");
  assert.equal(
    S.matchVisitDomain("old.reddit.com", ["reddit.com", "old.reddit.com"]),
    "old.reddit.com",
    "the most specific listed domain wins"
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((step) => S.getVisitDelayMs(step, 10)),
    [10000, 15000, 23000, 34000],
    "waits grow by 1.5× and round to whole seconds"
  );
  assert.equal(S.getVisitDelayMs(40, 10), S.VISIT_DELAY_CAP_SECONDS * 1000, "waits are capped");
  assert.equal(S.getVisitDelayMs(-1, "bogus"), 1000);
  assert.equal(S.getVisitDelayDayKey(new Date(2026, 5, 10, 2, 59)), "2026-06-09");
  assert.equal(S.getVisitDelayDayKey(new Date(2026, 5, 10, 3, 0)), "2026-06-10");
  assert.equal(S.getVisitDelayDayKey(new Date(2026, 5, 10, 23, 30)), "2026-06-10");

  const at = new Date(2026, 5, 10, 14, 5).getTime();
  let state = S.normalizeVisitDelay(null);
  assert.deepEqual(state, { days: {} });
  state = S.recordVisitDelayEvent(state, { domain: "x.com", event: "load", at });
  state = S.recordVisitDelayEvent(state, { domain: "x.com", event: "start", at });
  assert.equal(S.getVisitDelayStatus(state, "x.com", 10, at).step, 0, "starting adds no step");
  state = S.recordVisitDelayEvent(state, { domain: "x.com", event: "abandon", waitedMs: 4000, at });
  assert.equal(S.getVisitDelayStatus(state, "x.com", 10, at).step, 0, "leaving adds no step");
  state = S.recordVisitDelayEvent(state, { domain: "x.com", event: "start", at });
  state = S.recordVisitDelayEvent(state, { domain: "x.com", event: "finish", waitedMs: 10000, at });
  let status = S.getVisitDelayStatus(state, "x.com", 10, at);
  assert.equal(status.step, 1);
  assert.equal(status.waitMs, 15000, "a finished wait lengthens the next one");
  assert.equal(status.waitedMs, 14000);
  const entry = state.days["2026-06-10"]["x.com"];
  assert.equal(entry.loads, 1);
  assert.equal(entry.starts, 2);
  assert.equal(entry.completed, 1);
  assert.equal(entry.abandoned, 1);
  assert.equal(entry.hours[14], 2, "visits are bucketed by local hour");
  state = S.recordVisitDelayEvent(state, { domain: "x.com", event: "reset", at });
  status = S.getVisitDelayStatus(state, "x.com", 10, at);
  assert.equal(status.step, 0, "reset returns to the first wait");
  assert.equal(status.waitMs, 10000);
  assert.equal(state.days["2026-06-10"]["x.com"].resets, 1);
  assert.equal(state.days["2026-06-10"]["x.com"].completed, 1, "reset keeps the visit history");
  const nextDay = new Date(2026, 5, 11, 3, 0).getTime();
  state = S.recordVisitDelayEvent(state, { domain: "x.com", event: "finish", waitedMs: 1, at });
  assert.equal(S.getVisitDelayStatus(state, "x.com", 10, at).step, 1);
  assert.equal(
    S.getVisitDelayStatus(state, "x.com", 10, nextDay).step,
    0,
    "counts reset at 03:00 the next day"
  );
  assert.equal(
    S.getVisitDelayStatus(state, "x.com", 10, new Date(2026, 5, 11, 2, 0)).step,
    1,
    "02:00 still belongs to the previous day"
  );
  assert.throws(() => S.recordVisitDelayEvent(state, { domain: "x.com", event: "bogus" }));
  assert.throws(() => S.recordVisitDelayEvent(state, { domain: "", event: "load" }));
  assert.deepEqual(
    S.normalizeVisitDelay({
      days: {
        "2026-06-10": {
          "X.com": { step: "2", loads: -1, hours: [1, "3"], waitedMs: 5 },
          "bad host": { step: 1 },
          empty: { step: 0 }
        },
        nonsense: { "x.com": { step: 1 } }
      }
    }).days,
    {
      "2026-06-10": {
        "x.com": {
          step: 2,
          loads: 0,
          starts: 0,
          completed: 0,
          abandoned: 0,
          resets: 0,
          waitedMs: 5,
          hours: [1, 3, ...Array(22).fill(0)]
        }
      }
    }
  );
  const old = {};
  for (let offset = 0; offset < 40; offset += 1) {
    const day = new Date(2026, 5, 10 - offset);
    old[
      `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
    ] = { "x.com": { loads: 1 } };
  }
  assert.equal(
    Object.keys(S.normalizeVisitDelay({ days: old }).days).length,
    30,
    "30-day retention"
  );
  console.log("visit delay settings tests passed");
}
