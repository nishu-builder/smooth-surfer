"use strict";
const assert = require("node:assert/strict");
global.self = global;
require("../src/local-model-engine.js");
const engine = global.SmoothSurferLocalEngine;
let state = "available",
  fail = false,
  active = 0,
  peak = 0,
  destroyed = 0,
  overflow = false,
  budget = 20000;
const creations = [];
global.LanguageModel = {
  params: async () => ({ maxTopK: 128 }),
  availability: async () => state,
  create: async (options) => {
    creations.push(options);
    let onOverflow;
    return {
      contextWindow: budget,
      contextUsage: 10,
      measureContextUsage: async () => 50,
      addEventListener: (name, listener) => {
        if (name === "contextoverflow") onOverflow = listener;
      },
      prompt: async (text, options) => {
        assert.deepEqual(options.responseConstraint, { type: "object" });
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        if (overflow) onOverflow();
        return fail ? "invalid json" : JSON.stringify({ text });
      },
      destroy: () => {
        destroyed++;
      }
    };
  }
};
(async () => {
  const model = global.LanguageModel;
  delete global.LanguageModel;
  assert.equal((await engine.status()).state, "unsupported");
  global.LanguageModel = model;
  state = "downloadable";
  await assert.rejects(engine.prompt("System", "Post"), /not ready/);
  assert.equal(creations.length, 0, "background inference never starts a download");
  await engine.prepare(() => {});
  assert.equal(destroyed, 1, "setup releases its temporary session");
  state = "available";
  const answers = await Promise.all([
    engine.prompt("System A", "Post A"),
    engine.prompt("System B", "Post B")
  ]);
  assert.equal(peak, 1, "only one inference runs at once");
  assert.equal(creations.length, 3, "every prompt has its own context");
  assert.equal(JSON.parse(answers[1]).text, "Post B");
  assert.deepEqual(creations[2].initialPrompts, [{ role: "system", content: "System B" }]);
  assert.equal(destroyed, 3);
  assert.equal(creations[2].temperature, 0);
  assert.equal(creations[2].topK, 1);
  fail = true;
  await assert.rejects(engine.prompt("System", "Post"), /JSON|Unexpected/);
  assert.equal(destroyed, 4, "failed inference releases the session");
  fail = false;
  budget = 100;
  await assert.rejects(engine.prompt("System", "Post"), /exceeds.*context/);
  budget = 20000;
  overflow = true;
  await assert.rejects(engine.prompt("System", "Post"), /ran out of context/);
  overflow = false;
  await assert.rejects(engine.prompt("System", "a".repeat(31000)), /too large/);
  await engine.prompt("System", "Recovered");
  assert.equal((await engine.status()).error, "");
  console.log(
    "local model tests passed (readiness, isolation, serialization, validation, context limits)"
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
