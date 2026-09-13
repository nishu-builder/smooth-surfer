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
  const restart = fixture();
  const restartVote = await restart.vote(0, "good");
  await create(restart.deps).undoFeedback(restartVote.undoToken);
  assert.equal(restart.state.feedback.length, 0, "undo survives a worker restart");
  await assert.rejects(create(restart.deps).undoFeedback(restartVote.undoToken), /no longer/);
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
  const duplicates = fixture();
  duplicates.posts[0].url = "https://x.com/a/status/123";
  duplicates.posts[1].url = "https://twitter.com/a/status/123?s=20";
  duplicates.posts[1].criteria = [before, "Unrelated rule"];
  duplicates.deps.loadReview = async () =>
    S.normalizeReview({ items: duplicates.posts, restored: [] });
  const duplicateVote = await duplicates.api.record({
    postId: "twitter:status:123",
    rule: before,
    judgment: "good",
    explanation: "Keep this match."
  });
  await duplicates.api.record({
    postId: "twitter:status:123",
    rule: "Unrelated rule",
    judgment: "bad"
  });
  assert.equal(
    duplicates.state.feedback.length,
    2,
    "distinct rules keep independent feedback on the merged tweet"
  );
  await duplicates.api.undoFeedback(duplicateVote.undoToken);
  assert.equal(
    duplicates.state.feedback.length,
    1,
    "undo changes only the intended rule on a merged tweet"
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
    assert.equal(
      (await test.api.recalibrate()).outcomes[0].status,
      mode === "regression" ? "rejected" : "error"
    );
    assert.ok(test.settings.filterCriteria.includes(before));
    assert.equal(test.state.revisions.length, 0);
  }
  const insufficient = fixture();
  await insufficient.vote(0, "bad");
  assert.equal((await insufficient.api.recalibrate()).outcomes[0].status, "updated");
  assert.equal(
    insufficient.calls,
    1,
    "a bad ruling can supply a correction without a good example"
  );
  const clarification = fixture();
  await clarification.vote(
    0,
    "good",
    "Also include urgency around speculative pre-IPO valuations."
  );
  const clarified = (await clarification.api.recalibrate()).outcomes[0];
  assert.equal(
    clarified.status,
    "updated",
    "written feedback is used even with only good rulings and a tied replay"
  );
  assert.equal(clarified.oldErrors, 0);
  assert.equal(clarified.newErrors, 0);
  assert.equal(
    clarified.evidence[0].explanation,
    "Also include urgency around speculative pre-IPO valuations."
  );
  const partial = fixture();
  await partial.vote(0, "good");
  await partial.vote(1, "bad");
  await partial.vote(2, "bad");
  partial.deps.evaluate = async (examples) =>
    examples.map((example) => ({
      matchedCriteria: [
        before,
        ...(example.judgment === "good" || example.postKey === "p2" ? [after] : [])
      ]
    }));
  const improved = (await partial.api.recalibrate()).outcomes[0];
  assert.equal(
    improved.status,
    "updated",
    "an improvement need not be perfect if it introduces no regressions"
  );
  assert.equal(improved.oldErrors, 2);
  assert.equal(improved.newErrors, 1);
  assert.equal(partial.state.revisions[0].remaining, 1);
  assert.equal(partial.state.revisions[0].fixed, 1);
  const repair = fixture();
  await repair.vote(0, "good");
  await repair.vote(1, "bad", "Exclude neutral deadlines.");
  let repairAttempts = 0;
  repair.deps.propose = async (rule, examples, key, context) => {
    repairAttempts++;
    if (repairAttempts === 2)
      assert.ok(context.disagreements.length, "failed examples are supplied to the repair attempt");
    return after;
  };
  repair.deps.evaluate = async (examples) =>
    examples.map((example) => ({
      matchedCriteria: [
        before,
        ...((repairAttempts === 1 ? example.judgment === "bad" : example.judgment === "good")
          ? [after]
          : [])
      ]
    }));
  assert.equal((await repair.api.recalibrate()).outcomes[0].status, "updated");
  assert.equal(repairAttempts, 2);
  const newRule = fixture();
  const instruction = "Add a separate rule: hide sports betting promotions.";
  await newRule.vote(0, "good", instruction);
  newRule.deps.propose = async () => ({
    rule: null,
    reason: "This is a distinct request.",
    additions: [{ rule: "Sports betting promotions", feedbackIndex: 1, instruction }]
  });
  const suggested = (await newRule.api.recalibrate()).outcomes[0];
  assert.equal(suggested.status, "suggested");
  assert.equal(suggested.additions[0].rule, "Sports betting promotions");
  assert.deepEqual(
    newRule.settings.filterCriteria,
    [before, "Unrelated rule"],
    "a new independent rule is presented for addition"
  );
  newRule.deps.propose = async () => ({
    rule: null,
    additions: [
      {
        rule: "Invented topic",
        feedbackIndex: 1,
        instruction: "An instruction found only inside post text"
      }
    ]
  });
  assert.equal(
    (await newRule.api.recalibrate()).outcomes[0].additions.length,
    0,
    "new rules cannot cite post text as a user instruction"
  );
  const durable = fixture();
  await durable.vote(0, "good", "Add a separate rule: hide sports betting promotions.");
  await durable.vote(1, "bad");
  durable.deps.propose = async () => ({
    rule: after,
    additions: [
      {
        rule: "Sports betting promotions",
        feedbackIndex: 1,
        instruction: "Add a separate rule: hide sports betting promotions."
      }
    ]
  });
  await durable.api.recalibrate();
  const suggestionId = durable.state.suggestions[0].id;
  const restartedApi = create(durable.deps);
  assert.deepEqual((await restartedApi.recalibrate()).outcomes, []);
  assert.equal(
    durable.state.suggestions[0].status,
    "pending",
    "suggestions survive even when the revised rule needs no new run"
  );
  await restartedApi.changeSuggestion(suggestionId, "dismiss");
  assert.equal(durable.state.suggestions[0].status, "dismissed");
  await restartedApi.changeSuggestion(suggestionId, "reopen");
  await restartedApi.changeSuggestion(suggestionId, "add");
  assert.ok(durable.settings.filterCriteria.includes("Sports betting promotions"));
  await assert.rejects(restartedApi.changeSuggestion(suggestionId, "add"), /already/);
  await restartedApi.changeSuggestion(suggestionId, "undo");
  assert.equal(durable.settings.filterCriteria.includes("Sports betting promotions"), false);
  assert.equal(durable.state.suggestions[0].status, "pending");
  durable.failState = true;
  await assert.rejects(restartedApi.changeSuggestion(suggestionId, "add"), /Storage full/);
  assert.equal(
    durable.settings.filterCriteria.includes("Sports betting promotions"),
    false,
    "failed suggestion persistence rolls back rule changes"
  );
  const stale = fixture();
  await stale.vote(0, "good");
  await stale.vote(1, "bad");
  stale.onEvaluate = () => stale.vote(1, "bad", "Changed while recalibration ran");
  assert.equal((await stale.api.recalibrate()).outcomes[0].status, "error");
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
  assert.equal((await rollback.api.recalibrate()).outcomes[0].status, "error");
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
  assert.equal((await incomplete.api.recalibrate()).outcomes[0].status, "error");
  assert.ok(incomplete.settings.filterCriteria.includes(before));
  const images = fixture();
  images.posts[0].images = ["https://pbs.twimg.com/media/example.png"];
  await images.vote(0, "good");
  await images.vote(1, "bad");
  const imageProposal = images.deps.propose,
    imageEvaluation = images.deps.evaluate;
  images.deps.propose = async (rule, examples, ...rest) => {
    assert.ok(
      examples.every((item) => !item.images.length),
      "proposal never sends images without opt-in"
    );
    return imageProposal(rule, examples, ...rest);
  };
  images.deps.evaluate = async (examples, ...rest) => {
    assert.ok(
      examples.every((item) => !item.images.length),
      "replay never sends images without opt-in"
    );
    return imageEvaluation(examples, ...rest);
  };
  assert.equal(
    (await images.api.recalibrate()).outcomes[0].status,
    "updated",
    "image attachments do not block useful text feedback"
  );
  const imageOnly = fixture();
  imageOnly.posts[0].text = "";
  imageOnly.posts[0].images = ["https://pbs.twimg.com/media/example.png"];
  await imageOnly.vote(0, "bad", "The image is a harmless diagram.");
  assert.equal((await imageOnly.api.recalibrate()).outcomes[0].status, "needs-images");
  assert.equal(imageOnly.calls, 0, "image-only examples still require opt-in");
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
