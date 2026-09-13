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
  const cards = new Map();
  const undoStack = [];
  let activeKey = "",
    saving = false;
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
    if (row) selectRuling(row.dataset.key);
  });
  $("posts").addEventListener("focusin", (event) => {
    const row = event.target.closest(".ruling");
    if (row) selectRuling(row.dataset.key);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.target.closest("input, textarea, select, [contenteditable], summary")
    )
      return;
    if (!["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    const row = rows().find((node) => node.dataset.key === activeKey) || rows()[0];
    if (!row && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (saving) return;
    if (event.key === "ArrowUp") {
      void undoJudgment();
      return;
    }
    if (event.key === "ArrowDown") {
      nextRuling(row.dataset.key);
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
  function nextRuling(key) {
    let list = rows();
    const index = list.findIndex((row) => row.dataset.key === key);
    if (index === list.length - 1 && !$("more").hidden) {
      limit += 25;
      render();
      list = rows();
    }
    const next = list[Math.min(index + 1, list.length - 1)];
    if (next) selectRuling(next.dataset.key, true);
  }
  async function undoJudgment() {
    if (saving || !undoStack.length) return;
    saving = true;
    $("undo-feedback").disabled = true;
    const last = undoStack.at(-1);
    try {
      await send({ type: "undoRuleFeedback", undoToken: last.token });
      undoStack.pop();
      calibration = await loadCalibration();
      activeKey = last.key;
      render();
      selectRuling(last.key, true);
      status("Judgment undone.");
    } catch (error) {
      status(error.message);
    } finally {
      saving = false;
      $("undo-feedback").disabled = !undoStack.length;
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
      status("Unreviewed posts cleared. Good and bad examples kept.");
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
    const allItems = reviewItemsWithFeedback(review, calibration);
    const items = allItems.filter((item) => {
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
        el("div", "empty", allItems.length ? "No matching rulings." : "Filtered posts appear here.")
      );
    $("more").hidden = items.length <= limit;
    renderRevisions();
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
    const marker = el("p", "selection-marker", "Selected · ← Bad · → Good");
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
    const save = async (node, judgment, advance = true) => {
      if (saving) return;
      saving = true;
      $("undo-feedback").disabled = true;
      const list = rows(),
        index = list.findIndex((row) => row.dataset.key === key);
      const nextKey = list[index + 1]?.dataset.key;
      const buttons = [...row.querySelectorAll("button")];
      buttons.forEach((b) => (b.disabled = true));
      try {
        const result = await send({
          type: "recordRuleFeedback",
          postId: item.id,
          rule,
          judgment,
          explanation: input.value
        });
        undoStack.push({ token: result.undoToken, key });
        if (undoStack.length > 100) undoStack.shift();
        calibration = await loadCalibration();
        drafts.delete(key);
        activeKey = advance && nextKey ? nextKey : key;
        render();
        selectRuling(activeKey, true);
        status(
          `${judgment === "good" ? "Good" : "Bad"} ruling saved. Example kept for recalibration.`
        );
      } catch (error) {
        status(error.message);
        buttons.forEach((b) => (b.disabled = false));
      } finally {
        saving = false;
        $("undo-feedback").disabled = !undoStack.length;
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
    const saveNote = button("Save explanation", (node) => save(node, vote?.judgment, false));
    saveNote.disabled = !vote;
    notes.append(input, saveNote);
    row.append(controls, notes);
    return row;
  }
  function renderRulings(item) {
    const rulings = el("div", "rulings", "");
    rulings.append(el("h2", "ruling-heading", "Rulings"));
    const rules = rulesFor(item);
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
