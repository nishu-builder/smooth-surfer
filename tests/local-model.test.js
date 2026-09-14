"use strict";
const assert = require("node:assert/strict");
global.self = global;
require("../src/local-model-engine.js");
const engine = global.SmoothSurferLocalEngine;
let state = "available",
  fail = false,
  active = 0,
  peak = 0,
  overflow = false,
  budget = 20000;
let cloning = true;
const creations = [],
  sessions = [];
function makeSession(options, isClone = false) {
  let onOverflow;
  const history = [...(options.initialPrompts || [])];
  const session = {
    destroyed: false,
    history,
    get contextWindow() {
      return budget;
    },
    contextUsage: 10,
    measureContextUsage: async () => 50,
    addEventListener: (name, listener) => {
      if (name === "contextoverflow") onOverflow = listener;
    },
    ...(cloning ? { clone: async () => makeSession(options, true) } : {}),
    prompt: async (text, options) => {
      assert.ok(isClone || !cloning, "never prompt the shared base");
      assert.equal(history.length, 1, "no previous post or answer in the context");
      assert.deepEqual(options.responseConstraint, { type: "object" });
      history.push({ role: "user", content: text });
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (overflow) onOverflow();
      return fail ? "invalid json" : JSON.stringify({ text });
    },
    destroy: () => {
      session.destroyed = true;
    }
  };
  sessions.push(session);
  return session;
}
global.LanguageModel = {
  params: async () => ({ maxTopK: 128 }),
  availability: async () => state,
  create: async (options) => {
    creations.push(options);
    return makeSession(options);
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
  assert.ok(sessions[0].destroyed, "setup releases its temporary session");
  state = "available";
  const operations = [engine.prompt("System A", "Post A"), engine.prompt("System A", "Post B")];
  assert.equal(
    (await engine.status()).activity.queued +
      Number(Boolean((await engine.status()).activity.activeSince)),
    2
  );
  const answers = await Promise.all(operations);
  assert.equal(peak, 1, "only one inference runs at once");
  assert.equal(creations.length, 2, "repeated batches share one initialized base");
  assert.equal(JSON.parse(answers[1]).text, "Post B");
  assert.equal(
    sessions.filter((session) => !session.destroyed).length,
    1,
    "only the unprompted base stays alive"
  );
  await engine.prompt("System B", "New rules");
  assert.equal(creations.length, 3, "changing the system prompt replaces the base");
  assert.ok(sessions[1].destroyed, "old base is released");
  assert.deepEqual(creations[2].initialPrompts, [{ role: "system", content: "System B" }]);
  assert.equal(creations[2].temperature, 0);
  assert.equal(creations[2].topK, 1);
  fail = true;
  await assert.rejects(engine.prompt("System B", "Post"), /JSON|Unexpected/);
  assert.ok(
    sessions.every((session) => session.destroyed),
    "failure releases base and clone"
  );
  assert.match((await engine.status()).error, /JSON|Unexpected/);
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
  assert.equal((await engine.status()).activity.completed, 4);
  assert.equal((await engine.status()).activity.failed, 5);
  assert.equal((await engine.status()).activity.activeSince, 0);
  assert.equal((await engine.status()).activity.queued, 0);
  cloning = false;
  const countBefore = creations.length;
  await engine.prompt("No clone API", "Post A");
  await engine.prompt("No clone API", "Post B");
  assert.equal(creations.length, countBefore + 2, "older runtimes retain isolated fresh sessions");
  assert.ok(sessions.every((session) => session.destroyed));
  console.log(
    "local model tests passed (warm sessions, isolation, serialization, diagnostics, validation, context limits)"
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
