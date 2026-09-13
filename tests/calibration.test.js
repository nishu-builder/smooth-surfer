"use strict";
const assert = require("node:assert/strict");
const S = require("../src/settings.js");
const { create } = require("../src/calibration.js");
const before = "Promotional urgency",
  after = "Promotional urgency about buying a speculative asset; exclude factual deadlines.";
function fixture() {
  let state = S.normalizeCalibration(),
    settings = S.normalizeSettings({ filterCriteria: [before, "Unrelated rule"] });
  let queue = Promise.resolve(),
    mode = "pass",
    calls = 0,
    failState = false;
  const posts = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    text: `Example ${i}`,
    criteria: [before],
    formats: [],
    images: [],
    source: "twitter",
    at: Date.now()
  }));
  let onEvaluate = () => {};
  const deps = {
    loadReview: async () => ({ items: posts, restored: [] }),
    loadCalibration: async () => structuredClone(state),
    saveCalibration: async (value) => {
      if (failState) throw new Error("Storage full");
      state = S.normalizeCalibration(value);
    },
    loadSettings: async () => structuredClone(settings),
    saveSettings: async (value) => {
      settings = structuredClone(value);
    },
    loadSecrets: async () => ({ anthropicApiKey: "test-key" }),
    withRuleLock: (change) => {
      const operation = queue.then(change);
      queue = operation.catch(() => {});
      return operation;
    },
    propose: async () => {
      calls++;
      if (mode === "invalid") return "";
      if (mode === "network") throw new Error("API offline");
      return after;
    },
    evaluate: async (examples) => {
      await onEvaluate();
      return examples.map((example) => ({
        matchedCriteria: [
          before,
          ...((mode === "regression" ? example.judgment === "bad" : example.judgment === "good")
            ? [after]
            : [])
        ]
      }));
    }
  };
  const api = create(deps);
  const vote = (index, judgment, explanation = "") =>
    api.record({ postId: `p${index}`, rule: before, judgment, explanation });
  return {
    api,
    vote,
    posts,
    deps,
    get state() {
      return state;
    },
    get settings() {
      return settings;
    },
    get calls() {
      return calls;
    },
    set mode(value) {
      mode = value;
    },
    set failState(value) {
      failState = value;
    },
    set onEvaluate(value) {
      onEvaluate = value;
    }
  };
}
(async () => {
  const retention = fixture();
  const firstVote = await retention.vote(0, "good", "Keep the true positive.");
  const secondVote = await retention.vote(0, "bad", "Changed my mind.");
  await retention.api.undoFeedback(secondVote.undoToken);
  assert.equal(retention.state.feedback[0].judgment, "good");
  assert.equal(retention.state.feedback[0].explanation, "Keep the true positive.");
  await retention.api.undoFeedback(firstVote.undoToken);
  assert.equal(retention.state.feedback.length, 0, "undo restores an unreviewed ruling");
  const staleVote = await retention.vote(0, "good");
  await retention.vote(0, "bad");
  await assert.rejects(retention.api.undoFeedback(staleVote.undoToken), /changed elsewhere/);
  assert.equal(retention.state.feedback[0].judgment, "bad");
  await retention.vote(1, "good");
  retention.posts.splice(0);
  const archived = S.reviewItemsWithFeedback({ items: [] }, retention.state);
  assert.equal(archived.length, 2, "both good and bad examples survive history expiry");
  assert.equal(archived.find((p) => p.id === "p1").text, "Example 1");
  await retention.vote(1, "bad", "Editable after history expires");
  assert.equal(retention.state.feedback[0].explanation, "Editable after history expires");
  const old = S.normalizeCalibration({
    feedback: retention.state.feedback.map((f) => ({ ...f, at: 1, postAt: 1 }))
  });
  assert.equal(
    S.reviewItemsWithFeedback({ items: [] }, old).length,
    2,
    "reviewed examples have no seven-day cutoff"
  );
  const f = fixture();
  await Promise.all([f.vote(0, "good"), f.vote(1, "bad", "The deadline is factual.")]);
  assert.equal(f.state.feedback.length, 2, "concurrent judgments survive");
  await f.vote(1, "bad", "A neutral deadline, not sales pressure.");
  assert.equal(f.state.feedback.length, 2, "editing an explanation replaces its vote");
  assert.equal(f.state.feedback[0].explanation, "A neutral deadline, not sales pressure.");
  await assert.rejects(
    () => f.api.record({ postId: "p0", rule: "Other", judgment: "bad" }),
    /did not trigger/
  );
  await assert.rejects(
    () => f.api.record({ postId: "missing", rule: before, judgment: "bad" }),
    /no longer/
  );
  assert.deepEqual(
    f.settings.filterCriteria,
    [before, "Unrelated rule"],
    "votes do not restore posts or change settings"
  );
  const result = await f.api.recalibrate();
  assert.equal(result.outcomes[0].status, "updated");
  assert.deepEqual(f.settings.filterCriteria, [after, "Unrelated rule"]);
  assert.equal(f.state.revisions[0].fixed, 1);
  assert.equal(S.resolveCalibratedRule(before, f.state.revisions), after);
  assert.deepEqual(
    (await f.api.recalibrate()).outcomes,
    [],
    "accepted revisions are not regenerated without fresh feedback"
  );
  assert.equal(f.calls, 1);
  await f.api.undo(f.state.revisions[0].id);
  assert.deepEqual(f.settings.filterCriteria, [before, "Unrelated rule"]);
  assert.equal(S.resolveCalibratedRule(before, f.state.revisions), before);
  assert.equal(f.state.feedback.length, 2, "undo keeps labeled examples");
  for (const mode of ["regression", "invalid", "network"]) {
    const test = fixture();
    test.mode = mode;
    await test.vote(0, "good");
    await test.vote(1, "bad");
    assert.equal((await test.api.recalibrate()).outcomes[0].status, "kept");
    assert.ok(test.settings.filterCriteria.includes(before));
    assert.equal(test.state.revisions.length, 0);
  }
  const insufficient = fixture();
  await insufficient.vote(0, "bad");
  assert.match((await insufficient.api.recalibrate()).outcomes[0].detail, /good and one bad/);
  assert.equal(insufficient.calls, 0, "do not spend API calls without both classes");
  const stale = fixture();
  await stale.vote(0, "good");
  await stale.vote(1, "bad");
  stale.onEvaluate = () => stale.vote(1, "bad", "Changed while recalibration ran");
  assert.equal((await stale.api.recalibrate()).outcomes[0].status, "kept");
  assert.ok(stale.settings.filterCriteria.includes(before));
  const changed = fixture();
  await changed.vote(0, "good");
  await changed.vote(1, "bad");
  changed.onEvaluate = () =>
    changed.deps.saveSettings(S.normalizeSettings({ filterCriteria: ["New manual rule"] }));
  await changed.api.recalibrate();
  assert.deepEqual(changed.settings.filterCriteria, ["New manual rule"]);
  const rollback = fixture();
  await rollback.vote(0, "good");
  await rollback.vote(1, "bad");
  rollback.failState = true;
  assert.equal((await rollback.api.recalibrate()).outcomes[0].status, "kept");
  assert.ok(
    rollback.settings.filterCriteria.includes(before),
    "failed revision storage rolls back the setting"
  );
  const format = fixture();
  format.posts[0].formats = ["twitterHideReposts"];
  await format.api.record({ postId: "p0", rule: "format:twitterHideReposts", judgment: "bad" });
  assert.match((await format.api.recalibrate()).outcomes[0].detail, /Format detection is local/);
  assert.equal(format.calls, 0);
  const holdout = fixture();
  for (let i = 0; i < 8; i++) await holdout.vote(i, i % 2 ? "bad" : "good");
  let proposalCount = 0,
    evaluationCount = 0;
  holdout.deps.propose = async (rule, examples) => {
    proposalCount = examples.length;
    return after;
  };
  const originalEvaluate = holdout.deps.evaluate;
  holdout.deps.evaluate = async (...args) => {
    evaluationCount = args[0].length;
    return originalEvaluate(...args);
  };
  await holdout.api.recalibrate();
  assert.equal(proposalCount, 6);
  assert.equal(evaluationCount, 8);
  assert.ok(holdout.settings.filterCriteria.includes(after));
  const incomplete = fixture();
  await incomplete.vote(0, "good");
  await incomplete.vote(1, "bad");
  incomplete.deps.evaluate = async () => [];
  assert.equal((await incomplete.api.recalibrate()).outcomes[0].status, "kept");
  assert.ok(incomplete.settings.filterCriteria.includes(before));
  const images = fixture();
  images.posts[0].images = ["https://pbs.twimg.com/media/example.png"];
  await images.vote(0, "good");
  await images.vote(1, "bad");
  assert.match((await images.api.recalibrate()).outcomes[0].detail, /Analyze images/);
  assert.equal(images.calls, 0, "image examples never leave the browser without opt-in");
  // Failed early rules cannot permanently starve later rules in bounded runs.
  const rotation = fixture();
  const names = ["Rule A", "Rule B", "Rule C", "Rule D"];
  await rotation.deps.saveSettings(S.normalizeSettings({ filterCriteria: names }));
  for (let i = 0; i < 8; i++) {
    rotation.posts[i].criteria = [names[Math.floor(i / 2)]];
    await rotation.api.record({
      postId: `p${i}`,
      rule: names[Math.floor(i / 2)],
      judgment: i % 2 ? "bad" : "good"
    });
  }
  const attempted = [];
  rotation.deps.propose = async (rule) => {
    attempted.push(rule);
    throw new Error("No usable revision");
  };
  await rotation.api.recalibrate();
  const first = new Set(attempted);
  assert.equal(first.size, 3);
  await rotation.api.recalibrate();
  assert.equal(new Set(attempted).size, 4);
  const concurrent = fixture();
  await concurrent.vote(0, "good");
  await concurrent.vote(1, "bad");
  let resume;
  concurrent.deps.propose = () =>
    new Promise((resolve) => {
      resume = () => resolve(after);
    });
  const pending = concurrent.api.recalibrate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(() => concurrent.api.recalibrate(), /already running/);
  resume();
  await pending;
  console.log(
    "calibration tests passed (feedback, replay, regression rejection, holdout, stale state, rollback, undo)"
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
