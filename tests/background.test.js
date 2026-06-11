"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const src = path.join(__dirname, "..", "src");

global.self = global;

let messageListener = null;
global.chrome = {
  runtime: {
    onMessage: {
      addListener(listener) {
        messageListener = listener;
      }
    }
  }
};

const fetchCalls = [];
global.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  fetchCalls.push(body);

  const prompt = body.messages[0].content[0].text;

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

    results.push({ i, blocked, reasons: blocked ? ["engagement bait"] : [], tags });
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
    } else if (file === "storage.js") {
      self.SmoothSurferStorage = {
        loadSettings: async () => self.SmoothSurferSettings.normalizeSettings(),
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

function classify(text, source) {
  return new Promise((resolve) => {
    const isAsync = messageListener({ type: "classifyContent", text, source }, {}, resolve);

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
  assert.equal(consumptionDay.reddit.posts, 1);
  assert.deepEqual(consumptionDay.reddit.tags, {});

  console.log("background tests passed");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
