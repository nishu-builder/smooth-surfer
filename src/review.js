(function installReviewPage() {
  "use strict";
  const { loadReview, watchReview, loadSettings, watchSettings } = window.SmoothSurferStorage;
  const { safePostUrl, FORMAT_LABELS } = window.SmoothSurferSettings;
  const $ = (id) => document.getElementById(id);
  const labels = {
    twitter: "X / Twitter",
    reddit: "Reddit",
    substack: "Substack",
    "hacker-news": "Hacker News"
  };
  let review = { items: [], restored: [] };
  let settings = { filterCriteria: [] };
  let limit = 25;
  let writingRule = false;
  Promise.all([loadReview(), loadSettings()])
    .then(([history, config]) => {
      review = history;
      settings = config;
      render();
    })
    .catch(() => {
      $("status").textContent = "Could not load recent posts. Reload to try again.";
    });
  watchReview((next) => {
    review = next;
    render();
  });
  watchSettings((next) => {
    settings = next;
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
  $("clear").addEventListener("click", () =>
    action($("clear"), { type: "clearReviewHistory" }, "History cleared. Restore choices kept.")
  );
  $("manage-rules").addEventListener("click", () => editRules([]));
  $("close-dialog").addEventListener("click", () => $("rule-dialog").close());
  $("rule-select").addEventListener("change", () => {
    $("rule-text").value = $("rule-select").value;
  });
  $("rule-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveRule($("rule-text").value);
  });
  $("delete-rule").addEventListener("click", () => saveRule(""));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function button(text, callback, className = "") {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", () => callback(node));
    return node;
  }
  function render() {
    const query = $("search").value.trim().toLowerCase();
    const restored = new Set(review.restored);
    const items = review.items.filter(
      (item) =>
        (!$("source").value || item.source === $("source").value) &&
        (!$("state").value || restored.has(item.id) === ($("state").value === "restored")) &&
        (!query ||
          [item.text, item.author, ...item.reasons, ...item.criteria]
            .join(" ")
            .toLowerCase()
            .includes(query))
    );
    $("count").textContent =
      `${items.length} ${items.length === 1 ? "post" : "posts"}${query || $("source").value || $("state").value ? " found" : " in the last 7 days"}`;
    $("clear").disabled = review.items.length === 0;
    $("posts").replaceChildren();
    for (const item of items.slice(0, limit)) {
      const isRestored = restored.has(item.id);
      const card = el("article", "post", "");
      const meta = el("div", "meta", "");
      meta.append(el("span", "site", labels[item.source] || item.source));
      if (item.author) meta.append(el("span", "", item.author));
      const time = el(
        "time",
        "",
        new Date(item.at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        })
      );
      time.dateTime = new Date(item.at).toISOString();
      meta.append(time);
      if (isRestored) meta.append(el("span", "badge", "Restored"));
      const reason = el("div", "reason", "");
      reason.append(
        el("strong", "", "Filtered because"),
        el("span", "", item.reasons.join(" · ") || "Matched your content filters.")
      );
      item.criteria.forEach((rule) => reason.append(el("p", "rule", `Rule: ${rule}`)));
      const actions = el("div", "actions", "");
      actions.append(
        button(
          isRestored ? "Filter again" : "Restore post",
          (node) =>
            action(
              node,
              { type: isRestored ? "refilterPost" : "restoreFilteredPost", id: item.id },
              isRestored
                ? "Filters apply to this post again."
                : "Post restored. It will stay visible."
            ),
          isRestored ? "" : "primary"
        )
      );
      if (item.formats.length)
        item.formats.forEach((key) =>
          actions.append(
            button(`Allow ${FORMAT_LABELS[key].toLowerCase()}`, (node) =>
              action(
                node,
                { type: "setFormatFilter", key, enabled: false },
                "Format filter disabled."
              )
            )
          )
        );
      else actions.append(button("Edit rule", () => editRules(item.criteria)));
      const url = safePostUrl(item.url);
      if (url) {
        const link = el("a", "", "Open original");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        actions.append(link);
      }
      const media = el("div", "review-images", "");
      if (item.images.length)
        actions.append(
          button("View images", (node) => {
            const showing = media.childElementCount > 0;
            media.replaceChildren();
            if (!showing)
              item.images.forEach((url) => {
                const image = document.createElement("img");
                image.alt = "Post image";
                image.referrerPolicy = "no-referrer";
                image.src = url;
                image.addEventListener(
                  "error",
                  () =>
                    image.replaceWith(el("p", "", "Image unavailable. Open the original post.")),
                  { once: true }
                );
                media.append(image);
              });
            node.textContent = showing ? "View images" : "Hide images";
          })
        );
      card.append(meta, el("p", "preview", item.text || "Image post"), media, reason, actions);
      $("posts").append(card);
    }
    if (!items.length) {
      const empty = el("div", "empty", "");
      empty.append(
        el("h2", "", review.items.length ? "No posts match" : "No filtered posts"),
        el(
          "p",
          "",
          review.items.length
            ? "Try a different search or filter."
            : "Posts hidden by content filters appear here."
        )
      );
      $("posts").append(empty);
    }
    $("more").hidden = items.length <= limit;
  }
  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response?.ok)
          reject(new Error(response?.error || "Could not save. Try again."));
        else resolve(response);
      });
    });
  }
  async function action(node, message, success) {
    node.disabled = true;
    try {
      await send(message);
      review = await loadReview();
      render();
      $("status").textContent = success;
    } catch (error) {
      $("status").textContent = error.message;
    } finally {
      node.disabled = false;
    }
  }
  function editRules(matches) {
    const rules = [...settings.filterCriteria].sort(
      (a, b) => Number(matches.includes(b)) - Number(matches.includes(a))
    );
    if (!rules.length) {
      $("status").textContent = "No active rules. Add a rule in the Smooth Surfer popup.";
      return;
    }
    $("rule-select").replaceChildren(
      ...rules.map((rule) => {
        const option = el("option", "", rule);
        option.value = rule;
        return option;
      })
    );
    $("rule-text").value = rules[0];
    $("rule-status").textContent =
      matches.length && !rules.some((rule) => matches.includes(rule))
        ? "The original rule has changed. Choose an active rule to edit."
        : "";
    $("rule-dialog").showModal();
  }
  async function saveRule(next) {
    if (writingRule) return;
    writingRule = true;
    const controls = [...$("rule-form").querySelectorAll("button, select, textarea")];
    controls.forEach((node) => {
      node.disabled = true;
    });
    try {
      await send({ type: "editFilterCriterion", previous: $("rule-select").value, next });
      settings = await loadSettings();
      $("rule-dialog").close();
      $("status").textContent = next ? "Rule updated." : "Rule removed.";
    } catch (error) {
      $("rule-status").textContent = error.message;
    } finally {
      writingRule = false;
      controls.forEach((node) => {
        node.disabled = false;
      });
    }
  }
})();
