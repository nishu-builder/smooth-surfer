(function installReviewPage() {
  "use strict";
  const {
    loadReview,
    watchReview,
    loadSettings,
    watchSettings,
    loadCalibration,
    watchCalibration
  } = window.SmoothSurferStorage;
  const { safePostUrl, FORMAT_LABELS, resolveCalibratedRule } = window.SmoothSurferSettings;
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
    if (!document.activeElement?.matches(".ruling textarea")) render();
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
  ["search", "source", "state"].forEach((id) =>
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
      await send({ type: "clearReviewHistory" });
      review = await loadReview();
      render();
      status("History cleared. Feedback kept.");
    } catch (error) {
      status(error.message);
      $("clear").disabled = false;
    }
  });
  $("recalibrate").addEventListener("click", async () => {
    if (running) return;
    running = true;
    $("recalibrate").disabled = true;
    $("recalibrate").textContent = "Recalibrating…";
    status("Proposing revisions and replaying saved judgments. This can take a minute.");
    $("calibration-results").replaceChildren();
    try {
      const result = await send({ type: "recalibrateRules" });
      [settings, calibration] = await Promise.all([loadSettings(), loadCalibration()]);
      $("calibration-results").replaceChildren(
        ...result.outcomes.map((outcome) => {
          const row = el("div", "calibration-result", "");
          row.append(
            el(
              "strong",
              "",
              outcome.status === "updated"
                ? "Updated"
                : outcome.status === "pending"
                  ? "Pending"
                  : "Kept"
            ),
            el("p", "", outcome.rule),
            el("p", "", outcome.detail)
          );
          return row;
        })
      );
      const count = result.outcomes.filter((item) => item.status === "updated").length;
      status(
        result.outcomes.length
          ? `${count} ${count === 1 ? "rule" : "rules"} updated.`
          : "Mark good and bad rulings before recalibrating."
      );
      render();
    } catch (error) {
      status(error.message);
    } finally {
      running = false;
      $("recalibrate").disabled = false;
      $("recalibrate").textContent = "Recalibrate rules";
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
    return [...item.criteria, ...item.formats.map((key) => `format:${key}`)];
  }
  function voteFor(item, rule) {
    const current = resolveCalibratedRule(rule, calibration.revisions);
    return calibration.feedback.find(
      (vote) =>
        vote.postKey === item.id &&
        resolveCalibratedRule(vote.rule, calibration.revisions) === current
    );
  }
  function render() {
    const query = $("search").value.trim().toLowerCase();
    const items = review.items.filter((item) => {
      const votes = rulesFor(item).map((rule) => voteFor(item, rule));
      const state = $("state").value;
      return (
        (!$("source").value || item.source === $("source").value) &&
        (!state ||
          (state === "unreviewed"
            ? !votes.length || votes.some((vote) => !vote)
            : votes.some((vote) => vote?.judgment === state))) &&
        (!query ||
          [item.text, item.author, item.display?.text, ...item.reasons, ...item.criteria]
            .join(" ")
            .toLowerCase()
            .includes(query))
      );
    });
    $("count").textContent = `${items.length} ${items.length === 1 ? "post" : "posts"}`;
    $("clear").disabled = !review.items.length;
    $("posts").replaceChildren(...items.slice(0, limit).map(renderPost));
    if (!items.length)
      $("posts").append(
        el(
          "div",
          "empty",
          review.items.length ? "No matching rulings." : "Filtered posts appear here."
        )
      );
    $("more").hidden = items.length <= limit;
    renderRevisions();
  }
  function renderRuling(item, rule) {
    const vote = voteFor(item, rule),
      key = JSON.stringify([item.id, rule]);
    const row = el("section", "ruling", "");
    row.dataset.rule = rule;
    const isFormat = rule.startsWith("format:");
    const name = isFormat
      ? `Hide ${FORMAT_LABELS[rule.slice(7)]?.toLowerCase() || "this format"}`
      : rule;
    row.append(el("p", "trigger-rule", name));
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
    const notes = el("details", "feedback-note", "");
    notes.append(el("summary", "", "Explanation (optional)"));
    const input = document.createElement("textarea");
    input.maxLength = 800;
    input.rows = 2;
    input.placeholder = "What should this rule include or exclude?";
    input.setAttribute("aria-label", `Explanation for ${name}`);
    input.value = drafts.get(key) ?? vote?.explanation ?? "";
    input.addEventListener("input", () => drafts.set(key, input.value));
    notes.open = Boolean(input.value);
    const save = async (node, judgment) => {
      const buttons = [...row.querySelectorAll("button")];
      buttons.forEach((b) => (b.disabled = true));
      try {
        await send({
          type: "recordRuleFeedback",
          postId: item.id,
          rule,
          judgment,
          explanation: input.value
        });
        calibration = await loadCalibration();
        drafts.delete(key);
        render();
        status("Feedback saved. Recalibrate rules to update filtering.");
      } catch (error) {
        status(error.message);
        buttons.forEach((b) => (b.disabled = false));
      }
    };
    for (const judgment of ["good", "bad"]) {
      const node = button(judgment === "good" ? "Good ruling" : "Bad ruling", (button) =>
        save(button, judgment)
      );
      node.dataset.judgment = judgment;
      node.setAttribute("aria-pressed", String(vote?.judgment === judgment));
      controls.append(node);
    }
    const saveNote = button("Save explanation", (node) => save(node, vote?.judgment));
    saveNote.disabled = !vote;
    notes.append(input, saveNote);
    row.append(controls, notes);
    return row;
  }
  function renderPost(item) {
    const card = el("article", "post", "");
    card.dataset.postId = item.id;
    const rulings = el("div", "rulings", "");
    rulings.append(el("h2", "ruling-heading", "Triggering rules"));
    const rules = rulesFor(item);
    rulings.append(...rules.map((rule) => renderRuling(item, rule)));
    if (!rules.length)
      rulings.append(
        el("p", "ruling-note", "The matching rule was not recorded for this older ruling.")
      );
    if (item.reasons.length) rulings.append(el("p", "ruling-reason", item.reasons.join(" · ")));
    card.append(rulings);
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
    card.append(post);
    return card;
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
              : `${revision.examples} examples passed; ${revision.fixed} mistakes corrected in replay.`
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
