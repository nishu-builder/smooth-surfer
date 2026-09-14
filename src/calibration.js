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
        state.undo.unshift({
          token: undoToken,
          previous,
          recorded: state.feedback.find((item) => item.postKey === post.id && item.rule === rule)
        });
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
    let jobRun = null;
    let starts = Promise.resolve();
    async function startJob() {
      const operation = starts.then(async () => {
        let job = await deps.loadCalibrationJob();
        if (job?.status !== "running" && jobRun) {
          // Finish the prior job's alarm cleanup before scheduling a new job.
          await jobRun;
          job = await deps.loadCalibrationJob();
        }
        if (job?.status !== "running") {
          if (job?.status === "paused") {
            job.status = "running";
            job.error = "";
          } else {
            job = {
              version: 1,
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              status: "running",
              at: Date.now(),
              outcomes: [],
              attemptedRules: [],
              phase: "Starting"
            };
          }
          await deps.scheduleJob();
          await deps.saveCalibrationJob(job);
        }
        return job;
      });
      starts = operation.catch(() => {});
      const job = await operation;
      void resumeJob();
      return { job };
    }
    function resumeJob() {
      if (jobRun) return jobRun;
      jobRun = (async () => {
        const job = await deps.loadCalibrationJob();
        if (job?.status !== "running") return;
        await deps.scheduleJob();
        try {
          // Settings and history use separate storage areas. A durable intent
          // closes the crash window between those writes without reapplying.
          if (job.pending) {
            await deps.withRuleLock(() =>
              mutate(async (state) => {
                const { revision, outcome } = job.pending;
                const config = await deps.loadSettings();
                const recorded = state.revisions.some((item) => item.id === revision.id);
                if (
                  recorded ||
                  (config.filterCriteria.includes(revision.after) &&
                    !config.filterCriteria.includes(revision.before))
                ) {
                  if (!recorded) {
                    state.revisions.unshift(revision);
                    await deps.saveCalibration(state);
                  }
                  job.outcomes = job.outcomes.filter((item) => item.rule !== outcome.rule);
                  job.outcomes.push(outcome);
                } else if (!config.filterCriteria.includes(revision.before)) {
                  job.outcomes.push({
                    rule: revision.before,
                    status: "error",
                    detail:
                      "This rule changed while recalibration was interrupted. Current settings were kept."
                  });
                }
                job.pending = null;
                await deps.saveCalibrationJob(job);
              }, false)
            );
          }
          await recalibrate(job);
          job.status = "complete";
          job.phase = "Complete";
          job.finishedAt = Date.now();
          await deps.saveCalibrationJob(job);
        } catch (error) {
          job.status = "paused";
          job.error = error.message;
          await deps.saveCalibrationJob(job);
        }
        await deps.clearJobSchedule();
      })()
        .catch(() => {
          // Keep the durable job and alarm if storage itself is unavailable.
        })
        .finally(() => {
          jobRun = null;
        });
      return jobRun;
    }
    async function recalibrate(job = null) {
      if (running) throw new Error("Recalibration is already running.");
      running = true;
      try {
        const settings = await deps.loadSettings();
        const secrets = await deps.loadSecrets();
        const credential =
          settings.aiProvider === "local" ? { provider: "local" } : secrets.anthropicApiKey;
        if (!credential) throw new Error("Add an Anthropic key in the popup to recalibrate rules.");
        const initial = normalizeCalibration(await deps.loadCalibration());
        const affected = job?.rules || [
          ...new Set(
            initial.feedback
              .filter((item) => item.judgment === "bad" || item.explanation.trim())
              .map((item) => resolveCalibratedRule(item.rule, initial.revisions))
          )
        ];
        if (!job?.rules)
          affected.sort(
            (a, b) =>
              (initial.attempts.find((item) => item.rule === a)?.at || 0) -
              (initial.attempts.find((item) => item.rule === b)?.at || 0)
          );
        if (job && !job.rules) {
          job.rules = affected;
          await deps.saveCalibrationJob(job);
        }
        const outcomes = job ? job.outcomes : [];
        const report = async (outcome) => {
          if (job) {
            await deps.saveCalibrationJob({
              ...job,
              outcomes: [...outcomes, outcome],
              pending: null
            });
            job.pending = null;
          }
          outcomes.push(outcome);
        };
        const progress = async (phase, rule) => {
          if (job) {
            job.phase = phase;
            job.currentRule = rule;
            await deps.saveCalibrationJob(job);
          }
        };
        let attempted = job?.attemptedRules.length || 0;
        for (const rule of affected) {
          if (job?.outcomes.some((item) => item.rule === rule)) continue;
          if (rule.startsWith("format:")) {
            await report({
              rule,
              status: "not-supported",
              detail:
                "Format detection is local. Feedback is saved; recalibration does not rewrite format switches."
            });
            continue;
          }
          if (!settings.filterCriteria.includes(rule)) continue;
          if (attempted >= 3 && !job?.attemptedRules.includes(rule)) {
            await report({
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
          if (latest && !latest.remaining && all.every((item) => item.at <= latest.at)) continue;
          const usable =
            settings.aiProvider !== "local" && settings.imageAnalysisEnabled
              ? all
              : all.filter((item) => item.text.trim()).map((item) => ({ ...item, images: [] }));
          const skipped = all.length - usable.length;
          if (!usable.length) {
            await report({
              rule,
              status: "needs-images",
              detail:
                settings.aiProvider === "local"
                  ? "These examples contain only images. On-device AI is text-only; your feedback is still saved."
                  : "These examples contain only images. Enable Analyze images to check them; your feedback is still saved."
            });
            continue;
          }
          const good = usable.filter((item) => item.judgment === "good");
          const bad = usable.filter((item) => item.judgment === "bad");
          // Written corrections take priority over otherwise newer labels.
          for (const group of [good, bad])
            group.sort(
              (a, b) =>
                Number(Boolean(b.explanation.trim())) - Number(Boolean(a.explanation.trim()))
            );
          // Balance the bounded replay set. With enough evidence, reserve older
          // examples from each class from the proposal prompt for a small holdout.
          const examples = [];
          for (let i = 0; examples.length < 40 && (good[i] || bad[i]); i++) {
            if (good[i]) examples.push(good[i]);
            if (bad[i] && examples.length < 40) examples.push(bad[i]);
          }
          const heldOut = new Set();
          for (const judgment of ["good", "bad"]) {
            const group = examples.filter((item) => item.judgment === judgment);
            const withoutNotes = group.filter((item) => !item.explanation.trim());
            if (group.length >= 3 && withoutNotes.length) heldOut.add(withoutNotes.at(-1).postKey);
          }
          if (!job?.attemptedRules.includes(rule)) {
            attempted++;
            if (job) job.attemptedRules.push(rule);
          }
          try {
            const checkContext = async () => {
              const freshSettings = await deps.loadSettings(),
                freshSecrets = await deps.loadSecrets();
              if (
                freshSettings.aiProvider !== settings.aiProvider ||
                freshSecrets.anthropicApiKey !== secrets.anthropicApiKey ||
                freshSettings.imageAnalysisEnabled !== settings.imageAnalysisEnabled ||
                !freshSettings.filterCriteria.includes(rule)
              )
                throw new Error("Settings changed during recalibration. Try again.");
            };
            await checkContext();
            const proposalExamples = examples.filter((item) => !heldOut.has(item.postKey));
            const additions = new Map();
            let after = "",
              reason = "",
              evidence = [],
              oldErrors = 0,
              newErrors = 0,
              accepted = false;
            let baseline = null;
            for (let attempt = 0; attempt < 2; attempt++) {
              await progress(attempt ? "Refining revision" : "Proposing revision", rule);
              const candidate = await deps.propose(rule, proposalExamples, credential, {
                activeRules: settings.filterCriteria,
                ...(attempt
                  ? {
                      failedCandidate: after,
                      disagreements: evidence.filter(
                        (item) =>
                          !heldOut.has(item.postId) &&
                          item.afterMatched !== (item.judgment === "good")
                      )
                    }
                  : {})
              });
              const proposal = typeof candidate === "string" ? { rule: candidate } : candidate;
              if (!proposal || typeof proposal !== "object")
                throw new Error("No valid proposal was returned.");
              reason = typeof proposal.reason === "string" ? proposal.reason.slice(0, 800) : "";
              // Additional rules must cite an actual written instruction, not post text.
              for (const addition of Array.isArray(proposal.additions)
                ? proposal.additions.slice(0, 2)
                : []) {
                const source = proposalExamples[addition?.feedbackIndex - 1];
                if (
                  !source ||
                  typeof addition.rule !== "string" ||
                  !addition.rule.trim() ||
                  addition.rule.length > 500 ||
                  typeof addition.instruction !== "string" ||
                  addition.instruction.length < 8 ||
                  !source.explanation.includes(addition.instruction) ||
                  settings.filterCriteria.includes(addition.rule.trim())
                )
                  continue;
                additions.set(addition.rule.trim(), {
                  rule: addition.rule.trim(),
                  instruction: addition.instruction.slice(0, 800)
                });
              }
              if (proposal.rule === null || proposal.rule === rule) {
                after = "";
                break;
              }
              if (
                typeof proposal.rule !== "string" ||
                !proposal.rule.trim() ||
                proposal.rule.length > 500 ||
                settings.filterCriteria.includes(proposal.rule.trim())
              )
                throw new Error("No distinct, valid revision was proposed.");
              after = proposal.rule.trim();
              await progress("Checking saved judgments", rule);
              if (!baseline) {
                baseline = [];
                for (let i = 0; i < examples.length; i += 20) {
                  await checkContext();
                  baseline.push(
                    ...(await deps.evaluate(examples.slice(i, i + 20), [rule], credential))
                  );
                }
                if (
                  baseline.length !== examples.length ||
                  baseline.some((item) => !Array.isArray(item.matchedCriteria))
                )
                  throw new Error("The baseline replay was incomplete. No rule changed.");
              }
              const predictions = [];
              for (let i = 0; i < examples.length; i += 20) {
                await checkContext();
                predictions.push(
                  ...(await deps.evaluate(examples.slice(i, i + 20), [after], credential))
                );
              }
              if (
                predictions.length !== examples.length ||
                predictions.some((item) => !Array.isArray(item.matchedCriteria))
              )
                throw new Error("The replay was incomplete. No rule changed.");
              oldErrors = 0;
              newErrors = 0;
              let regressions = 0;
              evidence = examples.map((example, index) => {
                const expected = example.judgment === "good";
                const beforeMatched = baseline[index].matchedCriteria.includes(rule);
                const afterMatched = predictions[index].matchedCriteria.includes(after);
                oldErrors += Number(beforeMatched !== expected);
                newErrors += Number(afterMatched !== expected);
                regressions += Number(beforeMatched === expected && afterMatched !== expected);
                return {
                  postId: example.postKey,
                  text: example.text.slice(0, 300),
                  url: example.url,
                  judgment: example.judgment,
                  explanation: example.explanation,
                  beforeMatched,
                  afterMatched
                };
              });
              const explicitClarification =
                examples.some((item) => item.explanation.trim()) && newErrors === 0;
              accepted = !regressions && (newErrors < oldErrors || explicitClarification);
              if (accepted) break;
            }
            const diagnostics = {
              after,
              reason,
              evidence,
              additions: [...additions.values()],
              good: good.length,
              bad: bad.length,
              oldErrors,
              newErrors,
              skipped,
              textOnly:
                (settings.aiProvider === "local" || !settings.imageAnalysisEnabled) &&
                all.some((item) => item.images.length)
            };
            if (additions.size)
              await mutate((state) => {
                if (signature(examplesFor(state, rule)) !== signature(all))
                  throw new Error("Feedback changed during recalibration. Try again.");
                for (const addition of additions.values()) {
                  if (
                    state.suggestions.some(
                      (item) => item.rule.toLowerCase() === addition.rule.toLowerCase()
                    )
                  )
                    continue;
                  state.suggestions.unshift({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                    ...addition,
                    sourceRule: rule,
                    status: "pending",
                    created: false,
                    at: Date.now()
                  });
                }
              });
            if (!accepted) {
              await report({
                rule,
                ...diagnostics,
                status:
                  additions.size && !after
                    ? "suggested"
                    : after && newErrors
                      ? "rejected"
                      : "unchanged",
                detail: after
                  ? `Replay disagreed with ${newErrors} of ${examples.length} judgments (previously ${oldErrors}). No revision was applied.`
                  : reason || "No revision to this rule was proposed."
              });
              continue;
            }
            const revision = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
              before: rule,
              after,
              at: Date.now(),
              examples: examples.length,
              fixed: oldErrors - newErrors,
              remaining: newErrors,
              undone: false
            };
            const outcome = {
              rule,
              ...diagnostics,
              status: "updated",
              after,
              detail: `${examples.length} examples checked: ${oldErrors} disagreements before, ${newErrors} after${heldOut.size ? `; ${heldOut.size} examples withheld from drafting` : ""}. ${!oldErrors ? "Wording clarified from your explanation." : "Previously correct matches were preserved."}`
            };
            await deps.withRuleLock(() =>
              mutate(async (state) => {
                const current = await deps.loadSettings();
                if (
                  !current.filterCriteria.includes(rule) ||
                  current.filterCriteria.includes(after) ||
                  signature(examplesFor(state, rule)) !== signature(all) ||
                  current.aiProvider !== settings.aiProvider ||
                  current.imageAnalysisEnabled !== settings.imageAnalysisEnabled
                )
                  throw new Error("Rules or feedback changed during recalibration. Try again.");
                const previous = structuredClone(current);
                current.filterCriteria = current.filterCriteria.map((item) =>
                  item === rule ? after : item
                );
                if (job) {
                  job.pending = { revision, outcome };
                  await deps.saveCalibrationJob(job);
                }
                await deps.saveSettings(current);
                state.revisions.unshift(revision);
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
            await report(outcome);
          } catch (error) {
            if (job?.pending) throw error;
            await report({ rule, status: "error", detail: error.message });
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
    async function changeSuggestion(id, action) {
      return deps.withRuleLock(() =>
        mutate(async (state) => {
          const suggestion = state.suggestions.find((item) => item.id === id);
          if (!suggestion) throw new Error("This suggestion is no longer available.");
          const settings = await deps.loadSettings();
          const previous = structuredClone(settings);
          if (action === "add") {
            if (suggestion.status !== "pending")
              throw new Error("This suggestion has already been handled.");
            suggestion.created = !settings.filterCriteria.includes(suggestion.rule);
            settings.filterCriteria = root.SmoothSurferSettings.normalizeCriteria([
              ...settings.filterCriteria,
              suggestion.rule
            ]);
            if (!settings.filterCriteria.includes(suggestion.rule))
              throw new Error("Remove an existing rule before adding another.");
            suggestion.status = "added";
          } else if (action === "undo") {
            if (
              suggestion.status !== "added" ||
              !suggestion.created ||
              !settings.filterCriteria.includes(suggestion.rule)
            )
              throw new Error("This rule has changed since it was added.");
            settings.filterCriteria = settings.filterCriteria.filter(
              (rule) => rule !== suggestion.rule
            );
            suggestion.status = "pending";
            suggestion.created = false;
          } else if (action === "dismiss" && suggestion.status === "pending")
            suggestion.status = "dismissed";
          else if (action === "reopen" && suggestion.status === "dismissed")
            suggestion.status = "pending";
          else throw new Error("This suggestion has changed. Refresh and try again.");
          const changed = signature(settings) !== signature(previous);
          if (changed) await deps.saveSettings(settings);
          try {
            await deps.saveCalibration(state);
          } catch (error) {
            if (changed) await deps.saveSettings(previous);
            throw error;
          }
          return {};
        }, false)
      );
    }
    return { record, undoFeedback, recalibrate, startJob, resumeJob, undo, changeSuggestion };
  }
  root.SmoothSurferCalibration = { create };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.SmoothSurferCalibration;
})(typeof globalThis !== "undefined" ? globalThis : self);
