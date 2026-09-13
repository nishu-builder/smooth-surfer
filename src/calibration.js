(function installCalibration(root) {
  "use strict";
  const { normalizeCalibration, resolveCalibratedRule, reviewItemsWithFeedback } =
    root.SmoothSurferSettings;
  function create(deps) {
    let writes = Promise.resolve();
    let running = false;

    const mutate = (change, persist = true) => {
      const operation = writes.then(async () => {
        const state = normalizeCalibration(await deps.loadCalibration());
        const result = await change(state);
        if (persist) await deps.saveCalibration(state);
        return result;
      });
      writes = operation.catch(() => {});
      return operation;
    };
    const examplesFor = (state, rule) =>
      state.feedback.filter((item) => resolveCalibratedRule(item.rule, state.revisions) === rule);
    const signature = (items) => JSON.stringify(items);
    async function record({ postId, rule, judgment, explanation }) {
      if (
        !["good", "bad"].includes(judgment) ||
        typeof rule !== "string" ||
        (explanation !== undefined && typeof explanation !== "string")
      )
        throw new Error("Choose Good ruling or Bad ruling.");
      return mutate(async (state) => {
        const review = await deps.loadReview();
        const post = reviewItemsWithFeedback(review, state).find((item) => item.id === postId);
        if (!post) throw new Error("This post is no longer in review history.");
        if (!post.criteria.includes(rule) && !post.formats.some((key) => `format:${key}` === rule))
          throw new Error("This rule did not trigger the saved ruling.");
        const current = resolveCalibratedRule(rule, state.revisions);
        const matches = (item) =>
          item.postKey === post.id && resolveCalibratedRule(item.rule, state.revisions) === current;
        const previous = state.feedback.filter(matches);
        state.feedback = state.feedback.filter((item) => !matches(item));
        state.feedback.unshift({
          rule,
          postKey: post.id,
          judgment,
          explanation: String(explanation || "").slice(0, 800),
          text: post.text,
          images: post.images,
          source: post.source,
          url: post.url,
          author: post.author,
          display: post.display,
          reasons: post.reasons,
          postAt: post.at,
          at: Date.now()
        });
        // Use exactly the persisted representation for compare-and-swap undo.
        state.feedback = normalizeCalibration(state).feedback;
        const undoToken = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
        state.undo.unshift({ token: undoToken, previous, recorded: state.feedback[0] });
        return { undoToken };
      });
    }
    async function undoFeedback(token) {
      return mutate((state) => {
        const change = state.undo.find((item) => item.token === token);
        if (!change)
          throw new Error("Undo is no longer available. You can change the ruling directly.");
        const current = state.feedback.find(
          (item) =>
            item.postKey === change.recorded.postKey &&
            resolveCalibratedRule(item.rule, state.revisions) ===
              resolveCalibratedRule(change.recorded.rule, state.revisions)
        );
        if (signature(current) !== signature(change.recorded))
          throw new Error("This feedback changed elsewhere. Its latest judgment was kept.");
        state.feedback = state.feedback.filter((item) => item !== current);
        state.feedback.unshift(...change.previous);
        state.undo = state.undo.filter((item) => item.token !== token);
        return {};
      });
    }
    async function recalibrate() {
      if (running) throw new Error("Recalibration is already running.");
      running = true;
      try {
        const settings = await deps.loadSettings();
        const secrets = await deps.loadSecrets();
        if (!secrets.anthropicApiKey)
          throw new Error("Add an Anthropic key in the popup to recalibrate rules.");
        const initial = normalizeCalibration(await deps.loadCalibration());
        const affected = [
          ...new Set(
            initial.feedback
              .filter((item) => item.judgment === "bad")
              .map((item) => resolveCalibratedRule(item.rule, initial.revisions))
          )
        ];
        affected.sort(
          (a, b) =>
            (initial.attempts.find((item) => item.rule === a)?.at || 0) -
            (initial.attempts.find((item) => item.rule === b)?.at || 0)
        );
        const outcomes = [];
        let attempted = 0;
        for (const rule of affected) {
          if (rule.startsWith("format:")) {
            outcomes.push({
              rule,
              status: "kept",
              detail:
                "Format detection is local. Feedback is saved; recalibration does not rewrite format switches."
            });
            continue;
          }
          if (!settings.filterCriteria.includes(rule)) continue;
          if (attempted >= 3) {
            outcomes.push({
              rule,
              status: "pending",
              detail: "Run recalibration again to review more rules."
            });
            continue;
          }
          const all = examplesFor(initial, rule);
          const latest = initial.revisions.find(
            (revision) => !revision.undone && revision.after === rule
          );
          if (latest && all.every((item) => item.at <= latest.at)) continue;
          const good = all.filter((item) => item.judgment === "good");
          const bad = all.filter((item) => item.judgment === "bad");
          if (!good.length || !bad.length) {
            outcomes.push({
              rule,
              status: "kept",
              detail: "Mark at least one good and one bad ruling for this rule first."
            });
            continue;
          }
          // Balance the bounded replay set. With enough evidence, reserve older
          // examples from each class from the proposal prompt for a small holdout.
          const examples = [];
          for (let i = 0; examples.length < 40 && (good[i] || bad[i]); i++) {
            if (good[i]) examples.push(good[i]);
            if (bad[i] && examples.length < 40) examples.push(bad[i]);
          }
          if (examples.some((item) => item.images.length) && !settings.imageAnalysisEnabled) {
            outcomes.push({
              rule,
              status: "kept",
              detail: "Enable Analyze images to recalibrate this rule using its image examples."
            });
            continue;
          }
          const heldOut = new Set();
          for (const judgment of ["good", "bad"]) {
            const group = examples.filter((item) => item.judgment === judgment);
            if (group.length >= 3) heldOut.add(group.at(-1).postKey);
          }
          attempted++;
          try {
            const checkContext = async () => {
              const freshSettings = await deps.loadSettings(),
                freshSecrets = await deps.loadSecrets();
              if (
                freshSecrets.anthropicApiKey !== secrets.anthropicApiKey ||
                freshSettings.imageAnalysisEnabled !== settings.imageAnalysisEnabled ||
                !freshSettings.filterCriteria.includes(rule)
              )
                throw new Error("Settings changed during recalibration. Try again.");
            };
            await checkContext();
            const candidate = await deps.propose(
              rule,
              examples.filter((item) => !heldOut.has(item.postKey)),
              secrets.anthropicApiKey
            );
            if (
              typeof candidate !== "string" ||
              !candidate.trim() ||
              candidate.length > 500 ||
              candidate.trim() === rule ||
              settings.filterCriteria.includes(candidate.trim())
            )
              throw new Error("No distinct, valid revision was proposed.");
            const after = candidate.trim();
            const predictions = [];
            for (let i = 0; i < examples.length; i += 20) {
              await checkContext();
              predictions.push(
                ...(await deps.evaluate(
                  examples.slice(i, i + 20),
                  [rule, after],
                  secrets.anthropicApiKey
                ))
              );
            }
            if (
              predictions.length !== examples.length ||
              predictions.some((item) => !Array.isArray(item.matchedCriteria))
            )
              throw new Error("The replay was incomplete. No rule changed.");
            let oldErrors = 0,
              newErrors = 0;
            examples.forEach((example, index) => {
              const expected = example.judgment === "good";
              oldErrors += Number(predictions[index].matchedCriteria.includes(rule) !== expected);
              newErrors += Number(predictions[index].matchedCriteria.includes(after) !== expected);
            });
            if (newErrors || !oldErrors) {
              outcomes.push({
                rule,
                status: "kept",
                detail: newErrors
                  ? "The revision failed saved examples. The rule was kept."
                  : "The current rule already passed the replay. No change needed."
              });
              continue;
            }
            await deps.withRuleLock(() =>
              mutate(async (state) => {
                const current = await deps.loadSettings();
                if (
                  !current.filterCriteria.includes(rule) ||
                  current.filterCriteria.includes(after) ||
                  signature(examplesFor(state, rule)) !== signature(all) ||
                  current.imageAnalysisEnabled !== settings.imageAnalysisEnabled
                )
                  throw new Error("Rules or feedback changed during recalibration. Try again.");
                const previous = structuredClone(current);
                current.filterCriteria = current.filterCriteria.map((item) =>
                  item === rule ? after : item
                );
                await deps.saveSettings(current);
                state.revisions.unshift({
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                  before: rule,
                  after,
                  at: Date.now(),
                  examples: examples.length,
                  fixed: oldErrors,
                  undone: false
                });
                // Persist inside the lock; if local storage rejects, roll back the
                // rule so we never knowingly leave a revision without its history.
                try {
                  await deps.saveCalibration(state);
                } catch (error) {
                  await deps.saveSettings(previous);
                  throw error;
                }
              }, false)
            );
            outcomes.push({
              rule,
              status: "updated",
              after,
              detail: `Updated; ${examples.length} examples passed, ${oldErrors} mistakes corrected${heldOut.size ? `, including ${heldOut.size} held-out examples` : ""}.`
            });
          } catch (error) {
            outcomes.push({ rule, status: "kept", detail: error.message });
          }
        }
        await mutate((state) => {
          const tried = outcomes
            .filter((item) => item.status !== "pending")
            .map((item) => item.rule);
          state.attempts = [
            ...tried.map((rule) => ({ rule, at: Date.now() })),
            ...state.attempts.filter((item) => !tried.includes(item.rule))
          ];
        }).catch(() => {});
        return { outcomes };
      } finally {
        running = false;
      }
    }
    async function undo(id) {
      return deps.withRuleLock(() =>
        mutate(async (state) => {
          const revision = state.revisions.find((item) => item.id === id && !item.undone);
          if (!revision) throw new Error("That revision is no longer available.");
          const settings = await deps.loadSettings();
          if (
            !settings.filterCriteria.includes(revision.after) ||
            settings.filterCriteria.includes(revision.before)
          )
            throw new Error(
              "This rule has changed since recalibration. Undo its latest revision first."
            );
          const previous = structuredClone(settings);
          settings.filterCriteria = settings.filterCriteria.map((rule) =>
            rule === revision.after ? revision.before : rule
          );
          await deps.saveSettings(settings);
          // Votes on the new wording remain attached to this rule after undo.
          state.feedback.forEach((item) => {
            if (item.rule === revision.after) item.rule = revision.before;
          });
          revision.undone = true;
          try {
            await deps.saveCalibration(state);
          } catch (error) {
            await deps.saveSettings(previous);
            throw error;
          }
          return {};
        }, false)
      );
    }
    return { record, undoFeedback, recalibrate, undo };
  }
  root.SmoothSurferCalibration = { create };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.SmoothSurferCalibration;
})(typeof globalThis !== "undefined" ? globalThis : self);
