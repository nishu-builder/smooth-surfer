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

    results.push({ i, blocked, reasons: blocked ? ["engagement bait"] : [] });
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
  const [a, b, c, d, duplicate] = await Promise.all([
    classify("ordinary technical post about compilers", "twitter"),
    classify("BLOCKME like and retweet for more", "twitter"),
    classify("a normal reddit thread", "reddit"),
    classify("BLOCKME smash that follow button", "hacker-news"),
    classify("ordinary technical post about compilers", "twitter")
  ]);

  assert.equal(fetchCalls.length, 1, "all requests batched into one API call");
  assert.equal(a.blocked, false);
  assert.equal(b.blocked, true);
  assert.deepEqual(b.reasons, ["engagement bait"]);
  assert.equal(c.blocked, false);
  assert.equal(d.blocked, true);
  assert.equal(duplicate.blocked, false);

  const prompt = fetchCalls[0].messages[0].content[0].text;

  assert.match(prompt, /1\. \[X\/Twitter post\]/);
  assert.match(prompt, /\[Reddit post\]/);
  assert.match(prompt, /\[Hacker News story or comment\]/);
  assert.equal((prompt.match(/^\d+\. \[/gm) || []).length, 4, "duplicate deduped in prompt");

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
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const day = Object.keys(self.savedStats.days)[0];

  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(self.savedStats.days[day].twitter.ad, 2);
  assert.equal(self.savedStats.days[day].youtube.other, 1);

  console.log("background tests passed");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
