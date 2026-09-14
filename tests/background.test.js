"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const src = path.join(__dirname, "..", "src");

global.self = global;

let messageListener = null;
global.chrome = {
  alarms: { onAlarm: { addListener() {} }, create: async () => {}, clear: async () => {} },
  runtime: {
    onStartup: { addListener() {} },
    onInstalled: { addListener() {} },
    onMessage: {
      addListener(listener) {
        messageListener = listener;
      }
    }
  }
};

let reviewState = { items: [], restored: [] };
let settingsState = null;
let filterSetsState = [];
let activeQueueCalls = 0;
let peakQueueCalls = 0;
const fetchCalls = [];
global.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  fetchCalls.push(body);

  const prompt = body.messages[0].content[0].text;

  if (prompt.includes("QUEUEPOST")) {
    activeQueueCalls += 1;
    peakQueueCalls = Math.max(peakQueueCalls, activeQueueCalls);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    activeQueueCalls -= 1;
  }
  if (body.system.startsWith("Suggest three"))
    return {
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              suggestions: [
                "Giveaway engagement bait",
                "Giveaway engagement bait",
                "Posts asking for reposts",
                "Promotional contests",
                "Extra suggestion"
              ]
            })
          }
        ]
      })
    };

  if (prompt.includes("INCOMPLETE"))
    return {
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify({ results: [] }) }] })
    };
  if (prompt.includes("TRUNCATE")) {
    return {
      ok: true,
      json: async () => ({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: '{"results": [{"i": 1, "blo' }]
      })
    };
  }

  const itemCount = (prompt.match(/^\d+\. \[/gm) || []).length;
  const results = [];

  for (let i = 1; i <= itemCount; i += 1) {
    const itemText = prompt.split(`${i}. [`)[1].split("\n")[0];
    const blocked = itemText.includes("BLOCKME");
    const tags = itemText.includes("OUTRAGE") ? ["outrage-political", "bogus-tag"] : [];

    results.push({
      i,
      blocked,
      matches: blocked ? [1, 999, "2"] : [],
      reasons: blocked ? ["engagement bait"] : [],
      tags
    });
  }

  return {
    ok: true,
    json: async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ results }) }]
    })
  };
};

global.importScripts = (...files) => {
  for (const file of files) {
    if (file === "settings.js") {
      require(path.join(src, "settings.js"));
    } else if (file === "calibration.js") {
      require(path.join(src, "calibration.js"));
    } else if (file === "storage.js") {
      self.SmoothSurferStorage = {
        loadSettings: async () =>
          structuredClone(
            settingsState ||
              self.SmoothSurferSettings.normalizeSettings({ aiProvider: "anthropic" })
          ),
        saveSettings: async (next) => {
          settingsState = structuredClone(next);
        },
        loadFilterSets: async () => structuredClone(filterSetsState),
        saveFilterSets: async (next) => {
          filterSetsState = self.SmoothSurferSettings.normalizeFilterSets(next);
        },
        loadReview: async () => structuredClone(reviewState),
        loadCalibrationJob: async () => null,
        loadCalibration: async () => self.SmoothSurferSettings.normalizeCalibration(),
        saveReview: async (next) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          reviewState = self.SmoothSurferSettings.normalizeReview(next);
        },
        loadSecrets: async () => ({ anthropicApiKey: "sk-ant-test" }),
        loadStats: async () => ({ days: {} }),
        saveStats: async (stats) => {
          self.savedStats = stats;
        },
        loadConsumption: async () => ({ days: {} }),
        saveConsumption: async (consumption) => {
          self.savedConsumption = consumption;
        }
      };
    }
  }
};

require(path.join(src, "background.js"));

function classify(text, source, priority = 0) {
  return new Promise((resolve) => {
    const isAsync = messageListener(
      { type: "classifyContent", text, source, priority },
      {},
      resolve
    );

    assert.equal(isAsync, true);
  });
}

(async () => {
  // Concurrent requests (including one duplicate) batch into a single API call.
  const [a, b, c, d, e, duplicate] = await Promise.all([
    classify("ordinary technical post about compilers", "twitter"),
    classify("BLOCKME like and retweet for more", "twitter"),
    classify("a normal reddit thread", "reddit"),
    classify("BLOCKME smash that follow button", "hacker-news"),
    classify("OUTRAGE at this partisan scandal", "twitter"),
    classify("ordinary technical post about compilers", "twitter")
  ]);

  assert.equal(fetchCalls.length, 1, "all requests batched into one API call");
  assert.equal(a.blocked, false);
  assert.deepEqual(a.tags, []);
  assert.equal(b.blocked, true);
  assert.deepEqual(b.reasons, ["engagement bait"]);
  assert.equal(c.blocked, false);
  assert.equal(d.blocked, true);
  assert.equal(e.blocked, false);
  assert.deepEqual(e.tags, ["outrage-political"], "tags parsed and unknown tags dropped");
  assert.equal(duplicate.blocked, false);

  const prompt = fetchCalls[0].messages[0].content[0].text;

  assert.match(prompt, /1\. \[X\/Twitter post\]/);
  assert.match(prompt, /\[Reddit post\]/);
  assert.match(prompt, /\[Hacker News story or comment\]/);
  assert.match(prompt, /emotional ingredients/, "prompt requests consumption tags by default");
  assert.match(prompt, /outrage-callout/);
  assert.equal((prompt.match(/^\d+\. \[/gm) || []).length, 5, "duplicate deduped in prompt");

  // Cached results skip the API entirely.
  const cached = await classify("BLOCKME like and retweet for more", "twitter");

  assert.equal(cached.blocked, true);
  assert.equal(fetchCalls.length, 1, "cache hit avoids new API call");

  // Truncated responses surface as errors and are never cached as clean.
  const truncated = await classify("TRUNCATE this very long batch", "twitter");

  assert.equal(truncated.classifier, "error");
  assert.equal(truncated.blocked, false);
  assert.equal(fetchCalls.length, 2);

  const retried = await classify("TRUNCATE this very long batch", "twitter");

  assert.equal(retried.classifier, "error");
  assert.equal(fetchCalls.length, 3, "truncated result not cached, retried");

  const incomplete = await classify("INCOMPLETE reply", "twitter");
  assert.equal(incomplete.classifier, "error", "missing decisions cannot become cached approvals");

  // recordHide aggregates into daily stats and persists.
  messageListener({ type: "recordHide", source: "twitter", reasons: ["ad"] }, {}, () => {});
  messageListener({ type: "recordHide", source: "twitter", reasons: ["ad"] }, {}, () => {});
  messageListener({ type: "recordHide", source: "youtube", reasons: [] }, {}, () => {});

  // recordConsumption aggregates seen posts and their valid tags per day.
  messageListener(
    { type: "recordConsumption", source: "twitter", tags: ["joy", "outrage-political", "bogus"] },
    {},
    () => {}
  );
  messageListener({ type: "recordConsumption", source: "twitter", tags: ["joy"] }, {}, () => {});
  messageListener({ type: "recordConsumption", source: "reddit", tags: [] }, {}, () => {});

  // The same post seen in two tabs arrives twice and counts once; a different
  // post still counts, and a message with no key counts as it always did.
  messageListener(
    { type: "recordConsumption", source: "reddit", tags: ["humor"], key: "post-a" },
    {},
    () => {}
  );
  messageListener(
    { type: "recordConsumption", source: "reddit", tags: ["humor"], key: "post-a" },
    {},
    () => {}
  );
  messageListener(
    { type: "recordConsumption", source: "reddit", tags: [], key: "post-b" },
    {},
    () => {}
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const day = Object.keys(self.savedStats.days)[0];

  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(self.savedStats.days[day].twitter.ad, 2);
  assert.equal(self.savedStats.days[day].youtube.other, 1);

  const consumptionDay = self.savedConsumption.days[day];

  assert.equal(consumptionDay.twitter.posts, 2);
  assert.equal(consumptionDay.twitter.tags.joy, 2);
  assert.equal(consumptionDay.twitter.tags["outrage-political"], 1);
  assert.equal(Object.hasOwn(consumptionDay.twitter.tags, "bogus"), false);
  assert.equal(consumptionDay.reddit.posts, 3, "duplicate key counted once");
  assert.deepEqual(consumptionDay.reddit.tags, { humor: 1 });

  const message = (payload) => new Promise((resolve) => messageListener(payload, {}, resolve));
  const post = (text) => ({
    source: "twitter",
    text,
    reasons: ["engagement bait"],
    criteria: ["Engagement bait"],
    url: `https://x.com/a/status/${text === "one" ? "123" : "456"}`
  });
  await Promise.all([
    message({ type: "recordFilteredPost", post: post("one") }),
    message({ type: "recordFilteredPost", post: post("two") }),
    message({ type: "recordFilteredPost", post: post("one") })
  ]);
  assert.equal(reviewState.items.length, 2, "concurrent tabs neither lose nor duplicate history");
  await message({
    type: "recordFilteredPost",
    post: { ...post("one"), criteria: ["A newly triggering rule"] }
  });
  assert.equal(reviewState.items.length, 2, "new rulings refresh a post without duplicating it");
  assert.deepEqual(reviewState.items.find((item) => item.text === "one").criteria, [
    "Engagement bait",
    "A newly triggering rule"
  ]);
  await message({
    type: "recordFilteredPost",
    post: {
      ...post("one"),
      text: "one with updated poll totals",
      url: "https://twitter.com/a/status/123?s=20",
      criteria: ["Polls"]
    }
  });
  assert.equal(
    reviewState.items.length,
    2,
    "changed text and URL aliases still identify one tweet"
  );
  assert.deepEqual(reviewState.items.find((item) => item.url.includes("123")).criteria, [
    "Engagement bait",
    "A newly triggering rule",
    "Polls"
  ]);
  const id = self.SmoothSurferSettings.getReviewPostKey("twitter", "one", [], post("one").url);
  assert.equal((await message({ type: "restoreFilteredPost", id })).ok, true);
  assert.deepEqual(reviewState.restored, [id]);
  await message({ type: "recordFilteredPost", post: post("one") });
  assert.equal(reviewState.items.length, 2);
  await message({ type: "refilterPost", id });
  assert.deepEqual(reviewState.restored, []);
  await message({ type: "restoreFilteredPost", id });
  await message({ type: "clearReviewHistory" });
  assert.equal(reviewState.items.length, 2, "archiving retains saved posts");
  assert.equal(reviewState.archived.length, 2);
  assert.deepEqual(reviewState.restored, [id], "archiving preserves restoration");
  await message({ type: "unarchiveReviewPost", id });
  assert.equal(reviewState.archived.includes(id), false);
  assert.ok(reviewState.items.find((item) => item.id === id).queuedAt);
  assert.equal((await message({ type: "restoreFilteredPost", id: "missing" })).ok, false);
  await Promise.all([
    message({ type: "addFilterCriterion", criterion: "First new rule" }),
    message({ type: "addFilterCriterion", criterion: "Second new rule" })
  ]);
  assert.ok(settingsState.filterCriteria.includes("First new rule"));
  assert.ok(settingsState.filterCriteria.includes("Second new rule"));
  await message({ type: "editFilterCriterion", previous: "First new rule", next: "Edited rule" });
  assert.ok(settingsState.filterCriteria.includes("Edited rule"));
  assert.equal(
    (await message({ type: "editFilterCriterion", previous: "First new rule", next: "Stale edit" }))
      .ok,
    false
  );
  await message({ type: "editFilterCriterion", previous: "Edited rule", next: "" });
  assert.equal(settingsState.filterCriteria.includes("Edited rule"), false);
  const beforeSuggestions = [...settingsState.filterCriteria];
  const suggestions = await message({ type: "suggestFilterCriteria", text: "Repost for a prize" });
  assert.equal(suggestions.ok, true);
  assert.equal(suggestions.suggestions.length, 3);
  assert.deepEqual(
    settingsState.filterCriteria,
    beforeSuggestions,
    "suggestions never change rules by themselves"
  );
  assert.equal(b.matchedCriteria.length, 1, "only valid matching criterion numbers are retained");
  const queueStart = fetchCalls.length;
  await Promise.all(
    Array.from({ length: 55 }, (_, index) => {
      const priority = 54 - index;
      return classify(`QUEUEPOST${priority}`, "twitter", priority);
    })
  );
  assert.equal(peakQueueCalls, 2, "classification uses at most two simultaneous batches");
  assert.equal(fetchCalls.length - queueStart, 3, "55 posts split into bounded batches");
  assert.match(
    fetchCalls[queueStart].messages[0].content[0].text,
    /1\. \[X\/Twitter post\] QUEUEPOST0\n/,
    "nearest post leads the batch even when queued last"
  );
  settingsState.filterCriteria = [];
  const noRules = await classify("BLOCKME but there are no rules", "twitter");
  assert.equal(
    noRules.blocked,
    false,
    "removing the final rule cannot silently reinstate defaults"
  );
  assert.match(fetchCalls.at(-1).messages[0].content[0].text, /No filter criteria/);

  settingsState.filterCriteria = ["Existing rule"];
  settingsState.imageAnalysisEnabled = false;
  settingsState.twitterHideQuotes = true;
  const pack = {
    ...self.SmoothSurferSettings.BUILTIN_FILTER_SETS[0],
    imageAnalysisEnabled: true,
    anthropicApiKey: "ignore"
  };
  assert.equal((await message({ type: "applyFilterSet", pack })).ok, true);
  assert.ok(settingsState.filterCriteria.includes("Existing rule"));
  assert.ok(settingsState.filterCriteria.includes(pack.criteria[0]));
  assert.equal(settingsState.twitterHideReposts, true);
  assert.equal(settingsState.twitterHideQuotes, true);
  assert.equal(settingsState.imageAnalysisEnabled, false);
  assert.equal(settingsState.anthropicApiKey, undefined);
  assert.equal(
    (await message({ type: "applyFilterSet", pack: { ...pack, version: 2 } })).ok,
    false
  );
  assert.equal(
    (await message({ type: "setFormatFilter", key: "enabled", enabled: false })).ok,
    false
  );
  await message({ type: "setFormatFilter", key: "twitterHideReposts", enabled: false });
  assert.equal(settingsState.twitterHideReposts, false);
  await Promise.all([
    message({ type: "saveFilterSet", name: "Personal" }),
    message({ type: "saveFilterSet", name: "Work" })
  ]);
  assert.equal(filterSetsState.length, 2);
  assert.deepEqual(
    filterSetsState.find((p) => p.name === "Personal").criteria,
    settingsState.filterCriteria
  );
  await message({ type: "deleteFilterSet", name: "Work" });
  assert.equal(filterSetsState.length, 1);
  assert.ok(settingsState.filterCriteria.includes("Existing rule"));

  await Promise.all([
    message({ type: "updateSettings", patch: { youtubeHideComments: true } }),
    message({ type: "addFilterCriterion", criterion: "Concurrent rule" })
  ]);
  assert.equal(settingsState.youtubeHideComments, true);
  assert.ok(settingsState.filterCriteria.includes("Concurrent rule"));
  assert.equal(
    (
      await message({
        type: "updateSettings",
        patch: { filterCriteria: ["Overwrite"] },
        expectedCriteria: []
      })
    ).ok,
    false
  );
  assert.ok(
    settingsState.filterCriteria.includes("Concurrent rule"),
    "a stale popup cannot overwrite calibrated rules"
  );
  assert.equal(
    (await message({ type: "updateSettings", patch: { anthropicApiKey: "wrong-store" } })).ok,
    false
  );
  const image = "https://pbs.twimg.com/media/example.png";
  const classifyImage = (text, images = [image]) =>
    message({ type: "classifyContent", source: "twitter", text, images });
  await classifyImage("Image opt out");
  assert.equal(
    fetchCalls.at(-1).messages[0].content.some((block) => block.type === "image"),
    false
  );
  settingsState.imageAnalysisEnabled = true;
  await classifyImage("");
  const content = fetchCalls.at(-1).messages[0].content;
  assert.deepEqual(
    content.find((block) => block.type === "image"),
    { type: "image", source: { type: "url", url: image + "?name=small" } }
  );
  const imageCount = fetchCalls.length;
  await classifyImage("");
  assert.equal(fetchCalls.length, imageCount, "same image verdict is cached");
  await classifyImage("", ["https://i.redd.it/different.png"]);
  assert.equal(fetchCalls.length, imageCount + 1, "different image gets its own verdict");
  await classifyImage("Unsupported image", ["https://untrusted.example/private.png"]);
  assert.equal(
    fetchCalls.at(-1).messages[0].content.some((block) => block.type === "image"),
    false
  );
  const staleStart = fetchCalls.length;
  const staleImage = classifyImage("Queued image opt-out");
  await new Promise((resolve) => setTimeout(resolve, 10));
  settingsState.imageAnalysisEnabled = false;
  assert.equal((await staleImage).classifier, "error");
  assert.equal(
    fetchCalls.length,
    staleStart,
    "revoking image analysis cancels queued image requests"
  );
  await message({
    type: "recordFilteredPost",
    post: { source: "twitter", text: "", images: [image], formats: ["twitterHideQuotes"] }
  });
  const imageReview = reviewState.items.find((item) => item.images.length);
  assert.ok(imageReview);
  assert.deepEqual(imageReview.formats, ["twitterHideQuotes"]);
  await message({ type: "restoreFilteredPost", id: imageReview.id });
  assert.ok(
    reviewState.restored.includes(
      self.SmoothSurferSettings.getReviewPostKey("twitter", "", [image])
    )
  );
  const beforeLocal = fetchCalls.length;
  const localCalls = [];
  let localFails = false;
  self.SmoothSurferLocalClient = {
    prompt: async (system, prompt) => {
      localCalls.push({ system, prompt });
      if (localFails) throw new Error("Model unavailable");
      if (system.startsWith("Suggest three"))
        return JSON.stringify({ suggestions: ["Local suggestion"] });
      if (prompt.includes("MALFORMED"))
        return '{"results":[{"i":1,"blocked":true,"matches":[999]}]}';
      const count = (prompt.match(/^\d+\. \[/gm) || []).length;
      return JSON.stringify({
        results: Array.from({ length: count }, (_, index) => ({
          i: index + 1,
          blocked: true,
          matches: [1],
          reasons: ["Local match"]
        }))
      });
    }
  };
  self.SmoothSurferStorage.loadSecrets = async () => ({ anthropicApiKey: "" });
  settingsState.aiProvider = "local";
  settingsState.imageAnalysisEnabled = true;
  const localResult = await classifyImage("Image opt out");
  assert.equal(
    localResult.classifier,
    "chrome-nano",
    "switching provider must not reuse a cloud cache entry"
  );
  assert.equal(localResult.blocked, true);
  assert.equal(
    localCalls[0].prompt.includes("pbs.twimg.com"),
    false,
    "local text mode must omit image URLs"
  );
  const localCount = localCalls.length;
  await classifyImage("Image opt out");
  assert.equal(localCalls.length, localCount, "local classifications are cached");
  assert.deepEqual((await message({ type: "suggestFilterCriteria", text: "A post" })).suggestions, [
    "Local suggestion"
  ]);
  assert.equal(
    (await classifyImage("MALFORMED")).classifier,
    "error",
    "local results validate every match"
  );
  localFails = true;
  assert.equal((await classifyImage("Unavailable local model")).classifier, "error");
  assert.equal(
    fetchCalls.length,
    beforeLocal,
    "local successes and failures never send data to the cloud"
  );
  localFails = false;
  const pendingLocal = classifyImage("Provider changed while queued");
  await new Promise((resolve) => setTimeout(resolve, 10));
  settingsState.aiProvider = "anthropic";
  assert.equal((await pendingLocal).classifier, "error");
  assert.equal(fetchCalls.length, beforeLocal, "queued local request must not switch to cloud");
  console.log("background tests passed");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
