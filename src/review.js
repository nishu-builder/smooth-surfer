(function installReviewPage() {
  "use strict";
  const {
    loadReview,
    watchReview,
    loadSettings,
    watchSettings,
    loadCalibration,
    watchCalibration,
    loadCalibrationJob,
    watchCalibrationJob
  } = window.SmoothSurferStorage;
  const { safePostUrl, FORMAT_LABELS, resolveCalibratedRule, reviewItemsWithFeedback } =
    window.SmoothSurferSettings;
  const $ = (id) => document.getElementById(id);
  const labels = {
    twitter: "X / Twitter",
    reddit: "Reddit",
    substack: "Substack",
    "hacker-news": "Hacker News"
  };
  let review = { items: [], restored: [] },
    settings = { filterCriteria: [] },
    calibration = { feedback: [], revisions: [] };
  let limit = 25,
    running = false;
  const drafts = new Map();
  const draftStorageKey = "smoothSurferReviewDrafts";
  let draftError = false,
    starting = false,
    currentJob = null,
    resultSignature = "";
  try {
    const saved = JSON.parse(localStorage.getItem(draftStorageKey) || "[]");
    for (const [key, text] of saved.slice(0, 2000)) {
      const pair = JSON.parse(key);
      if (
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every((part) => typeof part === "string") &&
        typeof text === "string"
      )
        drafts.set(key, text.slice(0, 800));
    }
  } catch {
    draftError = true;
  }
  function persistDrafts() {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify([...drafts]));
      draftError = false;
    } catch {
      draftError = true;
    }
    renderSafety();
  }
  function removeDraft(key) {
    drafts.delete(key);
    persistDrafts();
  }
  function renderSafety() {
    $("save-status").textContent = draftError
      ? "Draft could not be saved. Keep this page open and try again."
      : saving || starting
        ? "Saving… Wait before refreshing or closing this page."
        : "Saved on this device. Safe to refresh or close this tab." +
          (drafts.size
            ? " Draft explanations are kept; choose Good or Bad to use them in recalibration."
            : "");
  }
  window.addEventListener("beforeunload", (event) => {
    if (saving || starting || draftError) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  const cards = new Map();
  const undoStack = [];
  let activeKey = "",
    saving = false,
    inbox = "unreviewed",
    undoRequested = false;
  let archivedPosts = new Set();
  const keyFor = (item, rule) => JSON.stringify([item.id, rule]);
  const rows = () => [...$("posts").querySelectorAll(".ruling")];
  const embedTimers = new Map();
  const embedObserver = new window.IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          const frame = entry.target;
          if (!frame.src) {
            frame.src = frame.dataset.src;
            embedTimers.set(
              frame,
              setTimeout(() => unavailableEmbed(frame), 15000)
            );
          }
          embedObserver.unobserve(frame);
        }
    },
    { rootMargin: "300px" }
  );
  function releaseFrame(frame) {
    clearTimeout(embedTimers.get(frame));
    embedTimers.delete(frame);
    embedObserver.unobserve(frame);
  }
  function unavailableEmbed(frame) {
    if (!frame.isConnected || frame.parentElement.dataset.ready === "true") return;
    releaseFrame(frame);
    frame.parentElement.dataset.ready = "false";
    frame.hidden = true;
    frame.parentElement.querySelector(".embed-status").textContent =
      "X embed unavailable. Showing saved copy.";
  }
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://platform.twitter.com") return;
    let data = event.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    const message = data?.["twttr.embed"];
    if (!message || typeof message !== "object") return;
    const frame = [...$("posts").querySelectorAll(".tweet-embed")].find(
      (node) => node.contentWindow === event.source && node.id === message.id
    );
    if (!frame) return;
    if (message.method === "twttr.private.no_results") {
      unavailableEmbed(frame);
      return;
    }
    const height = message.params?.[0]?.height;
    if (message.method !== "twttr.private.resize" || !Number.isFinite(height) || height < 1) return;
    releaseFrame(frame);
    frame.hidden = false;
    frame.style.height = `${Math.min(2400, Math.max(160, height))}px`;
    frame.parentElement.dataset.ready = "true";
    frame.parentElement.querySelector(".embed-status").textContent = "";
  });
  $("post-view").addEventListener("change", () => {
    clearCards();
    render();
  });
  $("undo-feedback").addEventListener("click", undoJudgment);
  $("posts").addEventListener("click", (event) => {
    const row =
      event.target.closest(".ruling") || event.target.closest(".post")?.querySelector(".ruling");
    if (row?.isConnected) selectRuling(row.dataset.key);
  });
  $("posts").addEventListener("focusin", (event) => {
    const row = event.target.closest(".ruling");
    if (row?.isConnected) selectRuling(row.dataset.key);
  });
  document.querySelectorAll("[data-inbox]").forEach((button) => {
    button.addEventListener("click", () => {
      inbox = button.dataset.inbox;
      limit = 25;
      render();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.target.closest(
        "input, textarea, select, [contenteditable], summary, .workspace-sidebar"
      )
    )
      return;
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      void undoJudgment();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const row = rows().find((node) => node.dataset.key === activeKey) || rows()[0];
    if (!row) return;
    if (event.key.length === 1 && !saving) {
      // Preserve Space activation for focused buttons and links.
      if (event.key === " " && event.target.closest("button, a")) return;
      event.preventDefault();
      const input = row.querySelector("textarea");
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
      if (input.value.length < input.maxLength) {
        input.setRangeText(event.key, input.value.length, input.value.length, "end");
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      }
      return;
    }
    if (event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key))
      return;
    event.preventDefault();
    if (saving) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      moveRuling(row.dataset.key, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    selectRuling(row.dataset.key);
    row.querySelector(`[data-judgment="${event.key === "ArrowRight" ? "good" : "bad"}"]`).click();
  });
  function selectRuling(key, focus = false) {
    activeKey = key;
    const selected = rows().find((row) => row.dataset.key === key);
    $("posts")
      .querySelectorAll(".post")
      .forEach((card) => {
        card.dataset.current = String(card === selected?.closest(".post"));
      });
    rows().forEach((row) => {
      const current = row.dataset.key === key;
      row.dataset.current = String(current);
      if (current) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
      row.tabIndex = current ? 0 : -1;
      if (current && focus) {
        row.focus({ preventScroll: true });
        const box = row.getBoundingClientRect();
        if (box.top < 80 || box.bottom > window.innerHeight)
          row.scrollIntoView({ block: "center", behavior: "instant" });
      }
    });
    if (selected) {
      const card = selected.closest(".post");
      const postIndex = [...$("posts").children].indexOf(card) + 1;
      const rulings = [...card.querySelectorAll(".ruling")];
      $("keyboard-target").textContent =
        `Post ${postIndex} · Ruling ${rulings.indexOf(selected) + 1} of ${rulings.length}: ${selected.querySelector(".trigger-rule").textContent}`;
    } else $("keyboard-target").textContent = "No ruling selected";
  }
  function moveRuling(key, direction) {
    let list = rows();
    const index = list.findIndex((row) => row.dataset.key === key);
    if (direction > 0 && index === list.length - 1 && !$("more").hidden) {
      limit += 25;
      render();
      list = rows();
    }
    const next = list[Math.max(0, Math.min(index + direction, list.length - 1))];
    if (next) selectRuling(next.dataset.key, true);
  }
  async function undoJudgment() {
    if (saving) {
      undoRequested = true;
      return;
    }
    if (!undoStack.length) {
      status("Nothing to undo yet. Mark a ruling Good or Bad first.");
      return;
    }
    saving = true;
    $("undo-feedback").disabled = true;
    const last = undoStack.at(-1);
    try {
      await send({ type: "undoRuleFeedback", undoToken: last.token });
      undoStack.pop();
      calibration = await loadCalibration();
      inbox = last.inbox;
      activeKey = last.key;
      render();
      selectRuling(last.key, true);
      status("Judgment undone.");
    } catch (error) {
      undoRequested = false;
      status(error.message);
    } finally {
      finishSaving();
    }
  }
  function finishSaving() {
    saving = false;
    renderSafety();
    $("undo-feedback").disabled = !undoStack.length;
    $("recalibrate").disabled = running;
    if (undoRequested) {
      undoRequested = false;
      void undoJudgment();
    }
  }
  async function confirmJudgment(row, judgment, leaving) {
    if (!row.isConnected) return;
    row.dataset.feedback = judgment;
    row.querySelector(".selection-marker").textContent =
      judgment === "good" ? "Good ruling saved" : "Bad ruling saved";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target =
      leaving && row.closest(".post").querySelectorAll(".ruling").length === 1
        ? row.closest(".post")
        : row;
    // Hold the confirmation before fading. Reduced motion keeps a short, static flash.
    const animation = target.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.65 }, { opacity: leaving && !reduced ? 0 : 1 }],
      { duration: reduced ? 180 : 500, easing: "ease-out", fill: "forwards" }
    );
    try {
      await animation.finished;
    } catch {
      // A view change can detach the card while its judgment is already saved.
    } finally {
      animation.cancel();
      delete row.dataset.feedback;
      row.querySelector(".selection-marker").textContent = "";
    }
  }
  function clearCards() {
    embedObserver.disconnect();
    for (const frame of embedTimers.keys()) releaseFrame(frame);
    cards.clear();
    $("posts").replaceChildren();
  }

  Promise.all([loadReview(), loadSettings(), loadCalibration()])
    .then(([history, config, state]) => {
      review = history;
      settings = config;
      calibration = state;
      render();
    })
    .catch(() => status("Could not load review. Reload to try again."));
  // Leave an explanation draft and its focus intact while a feed tab adds history.
  const refresh = () => {
    if (!saving && !document.activeElement?.matches(".ruling textarea")) render();
  };
  watchReview((next) => {
    review = next;
    refresh();
  });
  watchSettings((next) => {
    settings = next;
    refresh();
  });
  watchCalibration((next) => {
    calibration = next;
    refresh();
  });
  ["search", "source"].forEach((id) =>
    $(id).addEventListener("input", () => {
      limit = 25;
      render();
    })
  );
  $("more").addEventListener("click", () => {
    limit += 25;
    render();
  });
  $("clear").addEventListener("click", async () => {
    $("clear").disabled = true;
    try {
      await send({ type: "archiveUnreviewed" });
      review = await loadReview();
      inbox = "archived";
      render();
      status("Unreviewed posts archived. You can review them here or return them to the queue.");
    } catch (error) {
      status(error.message);
      $("clear").disabled = false;
    }
  });
  async function saveExplanationDrafts() {
    let unjudged = 0;
    saving = true;
    renderSafety();
    try {
      const items = reviewItemsWithFeedback(review, calibration);
      for (const [key, explanation] of [...drafts]) {
        const [id, rule] = JSON.parse(key);
        const item = items.find((post) => post.id === id);
        const vote = item && voteFor(item, rule);
        if (!vote) {
          if (explanation.trim()) unjudged++;
          continue;
        }
        if (explanation !== vote.explanation) {
          const result = await send({
            type: "recordRuleFeedback",
            postId: id,
            rule,
            judgment: vote.judgment,
            explanation
          });
          undoStack.push({ token: result.undoToken, key, inbox: vote.judgment });
          if (undoStack.length > 50) undoStack.shift();
        }
        if (drafts.get(key) === explanation) removeDraft(key);
      }
      calibration = await loadCalibration();
      return unjudged;
    } finally {
      finishSaving();
    }
  }
  function renderCalibrationOutcome(outcome) {
    const row = el("div", "calibration-result", "");
    const titles = {
      updated: "Updated",
      pending: "Next run",
      error: "Error",
      rejected: "Needs revision",
      unchanged: "No change",
      suggested: "New rule suggested",
      "needs-images": "Needs image analysis",
      "not-supported": "Format filter"
    };
    row.append(
      el("strong", "", titles[outcome.status] || "No change"),
      el("p", "", outcome.rule),
      el("p", "", outcome.detail)
    );
    if (outcome.textOnly)
      row.append(
        el("p", "", "Images were not analyzed; this check used post text and your explanations.")
      );
    if (outcome.skipped)
      row.append(
        el(
          "p",
          "",
          `${outcome.skipped} image-only examples could not be checked without image analysis.`
        )
      );
    if (outcome.after)
      row.append(
        el(
          "p",
          "",
          `${outcome.status === "updated" ? "New wording" : "Proposed wording"}: ${outcome.after}`
        )
      );
    if (outcome.reason && outcome.reason !== outcome.detail)
      row.append(el("p", "", outcome.reason));
    if (outcome.evidence?.length) {
      const replay = el("details", "replay-evidence", "");
      replay.append(
        el(
          "summary",
          "",
          `Review ${outcome.evidence.length} checked examples (${outcome.good} Good, ${outcome.bad} Bad available)`
        )
      );
      for (const example of outcome.evidence) {
        const item = el("div", "replay-example", "");
        item.append(
          el("p", "", example.text),
          el(
            "p",
            "",
            `Your judgment: ${example.judgment === "good" ? "Should match" : "Should not match"}. Before: ${example.beforeMatched ? "matched" : "did not match"}. Proposed: ${example.afterMatched ? "matched" : "did not match"}.`
          )
        );
        if (example.explanation)
          item.append(el("p", "", `Your explanation: ${example.explanation}`));
        replay.append(item);
      }
      row.append(replay);
    }
    return row;
  }
  function renderSuggestions() {
    const host = $("rule-suggestions");
    const suggestions = calibration.suggestions || [];
    host.hidden = !suggestions.length;
    host.replaceChildren();
    if (!suggestions.length) return;
    host.append(el("h2", "ruling-heading", "Suggested rules"));
    const history = el("details", "suggestion-history", "");
    history.append(el("summary", "", "Handled suggestions"));
    for (const suggestion of suggestions) {
      const row = el("div", "suggested-rule", "");
      row.dataset.state = suggestion.status;
      row.append(
        el(
          "strong",
          "",
          suggestion.status === "pending"
            ? "New rule"
            : suggestion.status === "added"
              ? "Added"
              : "Dismissed"
        ),
        el("p", "", suggestion.rule),
        el("p", "", `From your feedback: ${suggestion.instruction}`)
      );
      const action = (label, type) =>
        button(label, async (node) => {
          node.disabled = true;
          try {
            await send({ type, id: suggestion.id });
            [settings, calibration] = await Promise.all([loadSettings(), loadCalibration()]);
            renderSuggestions();
            status(
              type === "applyRuleSuggestion"
                ? "New rule added."
                : type === "undoRuleSuggestion"
                  ? "Addition undone."
                  : type === "dismissRuleSuggestion"
                    ? "Suggestion dismissed."
                    : "Suggestion reopened."
            );
          } catch (error) {
            node.disabled = false;
            status(error.message);
          }
        });
      if (suggestion.status === "pending")
        row.append(
          action("Add rule", "applyRuleSuggestion"),
          action("Dismiss", "dismissRuleSuggestion")
        );
      else if (suggestion.status === "added" && suggestion.created)
        row.append(action("Undo addition", "undoRuleSuggestion"));
      else if (suggestion.status === "dismissed")
        row.append(action("Reconsider", "reopenRuleSuggestion"));
      (suggestion.status === "pending" ? host : history).append(row);
    }
    if (history.children.length > 1) host.append(history);
  }
  function renderJob(job) {
    currentJob = job;
    running = starting || job?.status === "running";
    $("recalibrate").disabled = running || saving;
    $("recalibrate").textContent = running
      ? "Recalibrating…"
      : job?.status === "paused"
        ? "Resume recalibration"
        : "Recalibrate rules";
    const progress = $("calibration-progress");
    progress.textContent =
      job?.status === "running"
        ? `${job.phase || "Recalibrating"} · ${job.outcomes.filter((item) => item.status !== "pending").length} rules checked. Progress is saved; reopen Review rulings to resume after the browser pauses.`
        : job?.status === "paused"
          ? `Paused: ${job.error} Completed work is saved. Resume when ready.`
          : job?.status === "complete"
            ? "Recalibration complete. Results saved on this device."
            : "";
    const signature = JSON.stringify([job?.id, job?.status, job?.outcomes]);
    if (signature !== resultSignature) {
      resultSignature = signature;
      $("calibration-results").replaceChildren(
        ...(job?.outcomes || []).map(renderCalibrationOutcome)
      );
      if (job?.status === "complete") {
        const count = job.outcomes.filter((item) => item.status === "updated").length;
        const suggestions = job.outcomes.reduce(
          (sum, item) => sum + (item.additions?.length || 0),
          0
        );
        status(
          (job.outcomes.length
            ? `${count} ${count === 1 ? "rule" : "rules"} updated.`
            : "No new corrections to apply.") +
            (suggestions
              ? ` ${suggestions} additional ${suggestions === 1 ? "rule suggested" : "rules suggested"}.`
              : "")
        );
      }
    }
    renderSafety();
  }
  watchCalibrationJob(renderJob);
  loadCalibrationJob()
    .then(renderJob)
    .catch(() => status("Could not load recalibration progress."));
  send({ type: "getCalibrationJob" }).catch(() => {});
  $("recalibrate").addEventListener("click", async () => {
    if (running || saving) return;
    starting = true;
    renderJob(currentJob);
    try {
      await saveExplanationDrafts();
      await send({ type: "recalibrateRules" });
      // Read the current checkpoint; the job may already have advanced since
      // its initial acknowledgement was sent.
      currentJob = await loadCalibrationJob();
    } catch (error) {
      status(error.message);
    } finally {
      starting = false;
      renderJob(currentJob);
    }
  });
  function status(text) {
    $("status").textContent = text;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function button(text, action, className = "") {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", () => action(node));
    return node;
  }
  function rulesFor(item) {
    const unique = new Map();
    for (const rule of [...item.criteria, ...item.formats.map((key) => `format:${key}`)]) {
      const current = resolveCalibratedRule(rule, calibration.revisions);
      if (!unique.has(current)) unique.set(current, rule);
    }
    return [...unique.values()];
  }
  function voteFor(item, rule) {
    const current = resolveCalibratedRule(rule, calibration.revisions);
    return calibration.feedback.find(
      (vote) =>
        vote.postKey === item.id &&
        resolveCalibratedRule(vote.rule, calibration.revisions) === current
    );
  }
  function unansweredInbox(item) {
    return archivedPosts.has(item.id) ? "archived" : "unreviewed";
  }
  function categoryFor(item, rule) {
    return voteFor(item, rule)?.judgment || unansweredInbox(item);
  }
  function visibleRulesFor(item) {
    return rulesFor(item).filter((rule) => categoryFor(item, rule) === inbox);
  }
  function render() {
    archivedPosts = new Set(review.archived || []);
    const query = $("search").value.trim().toLowerCase();
    const allItems = reviewItemsWithFeedback(review, calibration);
    const scopedItems = allItems.filter(
      (item) =>
        (!$("source").value || item.source === $("source").value) &&
        (!query ||
          [item.text, item.author, item.display?.text, ...item.reasons, ...item.criteria]
            .join(" ")
            .toLowerCase()
            .includes(query))
    );
    const counts = { unreviewed: 0, good: 0, bad: 0, archived: 0 };
    for (const item of scopedItems) {
      const rules = rulesFor(item);
      if (!rules.length) counts[unansweredInbox(item)]++;
      for (const rule of rules) counts[categoryFor(item, rule)]++;
    }
    document.querySelectorAll("[data-inbox]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.inbox === inbox));
      button.querySelector(".inbox-count").textContent = counts[button.dataset.inbox];
    });
    const items = scopedItems.filter(
      (item) =>
        visibleRulesFor(item).length || (inbox === unansweredInbox(item) && !rulesFor(item).length)
    );
    $("count").textContent = `${items.length} ${items.length === 1 ? "post" : "posts"}`;
    $("clear").disabled = !allItems.some(
      (item) =>
        unansweredInbox(item) === "unreviewed" &&
        (!rulesFor(item).length || rulesFor(item).some((rule) => !voteFor(item, rule)))
    );
    const shown = items.slice(0, limit);
    const shownIds = new Set(shown.map((item) => item.id));
    for (const [id, saved] of cards)
      if (!shownIds.has(id)) {
        saved.node.querySelectorAll(".tweet-embed").forEach(releaseFrame);
        saved.node.remove();
        cards.delete(id);
      }
    $("posts").querySelector(".empty")?.remove();
    for (const [index, item] of shown.entries()) {
      let saved = cards.get(item.id);
      const signature = JSON.stringify(item);
      if (!saved || saved.signature !== signature) {
        const node = renderPost(item);
        if (saved) {
          saved.node.querySelectorAll(".tweet-embed").forEach(releaseFrame);
          saved.node.replaceWith(node);
        }
        saved = { node, signature };
        cards.set(item.id, saved);
      } else {
        saved.node.querySelector(".rulings").replaceWith(renderRulings(item));
      }
      // Leave an existing iframe attached while feedback changes.
      const position = $("posts").children[index];
      if (position !== saved.node) $("posts").insertBefore(saved.node, position || null);
    }
    if (!rows().some((row) => row.dataset.key === activeKey))
      activeKey = rows()[0]?.dataset.key || "";
    selectRuling(activeKey);
    if (!items.length)
      $("posts").append(
        el(
          "div",
          "empty",
          allItems.length
            ? inbox === "unreviewed" && !query && !$("source").value
              ? "Nothing left to categorize."
              : "No rulings in this inbox."
            : "Filtered posts appear here."
        )
      );
    $("more").hidden = items.length <= limit;
    renderRevisions();
    renderSuggestions();
  }
  function renderRuling(item, rule) {
    const vote = voteFor(item, rule),
      key = keyFor(item, rule);
    const row = el("section", "ruling", "");
    row.dataset.rule = rule;
    row.dataset.key = key;
    row.setAttribute("aria-label", `Ruling: ${rule}`);
    const isFormat = rule.startsWith("format:");
    const name = isFormat
      ? `Hide ${FORMAT_LABELS[rule.slice(7)]?.toLowerCase() || "this format"}`
      : rule;
    const marker = el("p", "selection-marker", "");
    marker.setAttribute("aria-hidden", "true");
    row.append(marker, el("p", "trigger-rule", name));
    const current = resolveCalibratedRule(rule, calibration.revisions);
    if (current !== rule) row.append(el("p", "ruling-note", `Recalibrated: ${current}`));
    if (isFormat)
      row.append(
        el(
          "p",
          "ruling-note",
          "Format detection is local. These judgments are saved separately from AI rule calibration."
        )
      );
    const controls = el("div", "judgments", "");
    const notes = el("div", "feedback-note", "");
    const input = document.createElement("textarea");
    input.maxLength = 800;
    input.rows = 1;
    input.placeholder = "Explanation (optional)";
    input.setAttribute("aria-label", `Explanation for ${name}`);
    input.value = drafts.get(key) ?? vote?.explanation ?? "";
    input.addEventListener("input", () => {
      drafts.set(key, input.value);
      persistDrafts();
      input.classList.toggle("has-text", Boolean(input.value));
      saveNote.hidden = !vote || input.value === vote.explanation;
    });
    input.classList.toggle("has-text", Boolean(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        selectRuling(key, true);
        if (vote && input.value !== vote.explanation) void save(null, vote.judgment, false);
      }
    });
    const save = async (node, judgment, advance = true) => {
      if (saving) return;
      saving = true;
      renderSafety();
      $("recalibrate").disabled = true;
      $("undo-feedback").disabled = true;
      const list = rows(),
        index = list.findIndex((row) => row.dataset.key === key);
      const nextKey = list[index + 1]?.dataset.key || list[index - 1]?.dataset.key;
      const originInbox = inbox;
      const buttons = [...row.querySelectorAll("button")];
      buttons.forEach((b) => (b.disabled = true));
      input.readOnly = true;
      try {
        const result = await send({
          type: "recordRuleFeedback",
          postId: item.id,
          rule,
          judgment,
          explanation: input.value
        });
        undoStack.push({ token: result.undoToken, key, inbox: originInbox });
        if (undoStack.length > 50) undoStack.shift();
        calibration = await loadCalibration();
        $("undo-feedback").disabled = false;
        status(judgment === "good" ? "Good ruling saved." : "Bad ruling saved.");
        await confirmJudgment(row, judgment, judgment !== originInbox);
        removeDraft(key);
        activeKey = advance && nextKey ? nextKey : key;
        render();
        selectRuling(activeKey, true);
        status(
          `${judgment === "good" ? "Good" : "Bad"} ruling saved. Example kept for recalibration.`
        );
      } catch (error) {
        undoRequested = false;
        status(error.message);
        buttons.forEach((b) => (b.disabled = false));
        input.readOnly = false;
      } finally {
        finishSaving();
      }
    };
    for (const judgment of ["bad", "good"]) {
      const node = button(judgment === "good" ? "Good ruling →" : "← Bad ruling", (button) =>
        save(button, judgment)
      );
      node.dataset.judgment = judgment;
      node.setAttribute("aria-pressed", String(vote?.judgment === judgment));
      controls.append(node);
    }
    const saveNote = button("Save explanation", (node) => save(node, vote?.judgment, false));
    saveNote.hidden = !vote || input.value === vote.explanation;
    const hint = el(
      "p",
      "note-hint",
      `${vote ? "Enter to save" : "Enter to return"} · Shift+Enter for a new line`
    );
    notes.append(input, hint, saveNote);
    row.append(controls, notes);
    return row;
  }
  function renderRulings(item) {
    const rulings = el("div", "rulings", "");
    rulings.append(el("h2", "ruling-heading", "Rulings"));
    if (inbox === "archived") {
      const back = button("Return to queue", async (node) => {
        node.disabled = true;
        try {
          await send({ type: "unarchiveReviewPost", id: item.id });
          review = await loadReview();
          render();
          status("Returned to Uncategorized.");
        } catch (error) {
          status(error.message);
          node.disabled = false;
        }
      });
      back.className = "return-to-queue";
      rulings.append(back);
    }
    const rules = visibleRulesFor(item);
    rulings.append(...rules.map((rule) => renderRuling(item, rule)));
    if (!rules.length)
      rulings.append(
        el("p", "ruling-note", "The matching rule was not recorded for this older ruling.")
      );
    if (item.reasons.length) rulings.append(el("p", "ruling-reason", item.reasons.join(" · ")));
    return rulings;
  }
  function renderPost(item) {
    const card = el("article", "post", "");
    card.dataset.postId = item.id;
    const post = el("div", "tweet-preview", "");
    const display = item.display || {};
    const meta = el("div", "tweet-author", "");
    const name = display.name || item.author || labels[item.source] || item.source;
    const avatar = el("span", "avatar", name.slice(0, 1).toUpperCase());
    if (display.avatar) {
      const image = postImage(display.avatar, "", "avatar-image");
      image.addEventListener("error", () => image.remove(), { once: true });
      avatar.append(image);
    }
    const author = el("div", "author-lines", "");
    author.append(el("strong", "author-name", name));
    if (display.handle) author.append(el("span", "author-handle", display.handle));
    const time = el(
      "time",
      "post-time",
      display.postedAt
        ? new Date(display.postedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
          })
        : labels[item.source] || item.source
    );
    if (display.postedAt) time.dateTime = display.postedAt;
    meta.append(avatar, author, time);
    post.append(meta);
    post.append(el("p", "tweet-text", display.text || item.text || ""));
    if (item.images.length) {
      const media = el("div", "tweet-media", "");
      item.images.forEach((url) => {
        const image = postImage(url, "Post image", "");
        image.addEventListener(
          "error",
          () =>
            image.replaceWith(
              el("span", "ruling-note", "Image unavailable. Open the original post.")
            ),
          { once: true }
        );
        media.append(image);
      });
      post.append(media);
    }
    if (display.quoted) {
      const quote = el("div", "quoted-post", "");
      quote.append(
        el("strong", "", display.quoted.name || display.quoted.handle || "Quoted post"),
        el("span", "author-handle", display.quoted.handle || ""),
        el("p", "tweet-text", display.quoted.text)
      );
      post.append(quote);
    }
    const footer = el("div", "post-footer", "");
    footer.append(
      el(
        "span",
        "",
        `Filtered ${new Date(item.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
      )
    );
    const url = safePostUrl(item.url);
    if (url) {
      const link = el("a", "", "Open original");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      footer.append(link);
    }
    post.append(footer);
    const embedId = tweetId(item);
    if (embedId && $("post-view").value === "embed") {
      const host = el("div", "embedded-post", "");
      const frame = document.createElement("iframe");
      frame.className = "tweet-embed";
      frame.setAttribute("scrolling", "no");
      frame.title = `X post by ${name}`;
      frame.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      );
      frame.referrerPolicy = "no-referrer";
      frame.dataset.tweetId = embedId;
      frame.id = `ss-tweet-${embedId}-${cards.size}`;
      frame.dataset.src = `https://platform.twitter.com/embed/Tweet.html?id=${embedId}&embedId=${frame.id}&dnt=true&theme=light&hideThread=true`;
      host.append(frame, el("p", "embed-status", "Loading X embed. Saved copy below."), post);
      card.append(host);
      embedObserver.observe(frame);
    } else card.append(post);
    card.append(renderRulings(item));
    return card;
  }
  function tweetId(item) {
    if (item.source !== "twitter") return "";
    try {
      const url = new URL(item.url);
      if (
        url.protocol !== "https:" ||
        !["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(
          url.hostname
        )
      )
        return "";
      return url.pathname.match(/^\/(?:[^/]+|i\/web)\/status\/(\d{1,25})(?:\/|$)/)?.[1] || "";
    } catch {
      return "";
    }
  }
  function postImage(url, alt, className) {
    const image = document.createElement("img");
    image.className = className;
    image.alt = alt;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.src = url;
    return image;
  }
  function renderRevisions() {
    $("revision-history").hidden = !calibration.revisions.length;
    $("revisions").replaceChildren(
      ...calibration.revisions.map((revision) => {
        const row = el("div", "revision", "");
        row.append(
          el("p", "", revision.before),
          el("p", "", `Revised: ${revision.after}`),
          el(
            "small",
            "",
            revision.undone
              ? "Undone"
              : `${revision.examples} examples checked; ${revision.fixed} mistakes corrected; ${revision.remaining || 0} disagreements remain.`
          )
        );
        if (!revision.undone) {
          const undo = button("Undo revision", async (node) => {
            node.disabled = true;
            try {
              await send({ type: "undoCalibration", id: revision.id });
              [settings, calibration] = await Promise.all([loadSettings(), loadCalibration()]);
              render();
              status("Previous rule restored.");
            } catch (error) {
              status(error.message);
              node.disabled = false;
            }
          });
          undo.disabled = !settings.filterCriteria.includes(revision.after);
          row.append(undo);
        }
        return row;
      })
    );
  }
  function send(message) {
    return new Promise((resolve, reject) =>
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response?.ok)
          reject(new Error(response?.error || "Could not save. Try again."));
        else resolve(response);
      })
    );
  }
})();
