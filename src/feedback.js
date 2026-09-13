(function installFeedFeedback() {
  "use strict";
  const installed = new WeakMap();
  let activeDialog = null;
  function install(article, getText) {
    const previous = installed.get(article);
    if (previous?.isConnected) return;
    const group = article.querySelector('[role="group"]');
    if (!group) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "smooth-surfer-less-like";
    button.setAttribute("aria-label", "Less like this");
    button.title = "Less like this · Smooth Surfer";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M8 12h8");
    svg.append(path);
    button.append(svg);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = getText();
      openDialog(text, button);
    });
    group.append(button);
    installed.set(article, button);
  }
  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError || !response?.ok)
            reject(
              new Error(response?.error || "Could not connect. Reload the page and try again.")
            );
          else resolve(response);
        });
      } catch {
        reject(new Error("Reload the page to reconnect to Smooth Surfer."));
      }
    });
  }
  function openDialog(text, trigger) {
    if (activeDialog) return;
    let finished = false;
    const host = document.createElement("div");
    host.dataset.smoothSurferFeedback = "";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { color-scheme: light; } * { box-sizing: border-box; }
      dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 40px); overflow: auto; margin: auto; padding: 16px; border: 1px solid var(--ss-action); border-radius: var(--ss-radius); color: var(--ss-ink); background: white; font: 14px/1.4 var(--ss-sans); box-shadow: 0 18px 60px #17171726; }
      dialog::backdrop { background: #17171766; } h2 { font: 18px/1.3 var(--ss-mono); margin: 0 0 6px; } p { margin: 6px 0; color: var(--ss-muted); }
      blockquote { margin: 8px 0; padding: 8px; background: var(--ss-gray); border-left: 2px solid var(--ss-focus); max-height: 140px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
      label { display: block; margin: 10px 0 4px; font-weight: 600; }
      textarea { width: 100%; min-height: 65px; resize: vertical; font: inherit; padding: 6px; border: 1px solid var(--ss-control-line); border-radius: var(--ss-radius); }
      button { font: 12px/1.35 var(--ss-mono); cursor: pointer; border-radius: var(--ss-radius); border: 1px solid var(--ss-action); padding: 5px 8px; min-height: 28px; background: #fff; color: var(--ss-action); }
      button:hover { background: var(--ss-hover); } button:disabled { opacity: .55; cursor: wait; }
      .primary { background: var(--ss-action); color: white; } .primary:hover { background: var(--ss-action-hover); }
      .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } .suggestions { display: grid; gap: 4px; margin-top: 8px; } .suggestions button { text-align: left; }
      :focus-visible { outline: 2px solid var(--ss-focus); outline-offset: 2px; } small { display: block; margin-top: 4px; color: var(--ss-muted); } [role=status]:empty { display: none; }
    `;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", "feedback-title");
    const make = (tag, value) => {
      const node = document.createElement(tag);
      node.textContent = value;
      return node;
    };
    const title = make("h2", "Less like this");
    title.id = "feedback-title";
    const intro = make(
      "p",
      text
        ? "Write a filter or get suggestions for this post."
        : "Write a filter for this post. Suggestions require text."
    );
    const preview = make("blockquote", text ? text.slice(0, 2000) : "Image post");
    const suggest = make("button", "Suggest filters");
    suggest.type = "button";
    suggest.disabled = !text;
    const note = make(
      "small",
      "Sends post text to Claude using your API key. Choose Add filter to apply."
    );
    const choices = make("div", "");
    choices.className = "suggestions";
    const label = make("label", "Filter posts that match");
    label.htmlFor = "feedback-rule";
    const input = make("textarea", "");
    input.id = "feedback-rule";
    input.maxLength = 500;
    input.placeholder = "For example: posts asking readers to repost for a giveaway";
    const scope = make("small", "Applies wherever content filtering is enabled.");
    const status = make("p", "");
    status.setAttribute("role", "status");
    const actions = make("div", "");
    actions.className = "actions";
    const save = make("button", "Add filter");
    save.type = "button";
    save.className = "primary";
    const cancel = make("button", "Cancel");
    cancel.type = "button";
    actions.append(save, cancel);
    dialog.append(
      title,
      intro,
      preview,
      suggest,
      note,
      choices,
      label,
      input,
      scope,
      status,
      actions
    );
    shadow.append(style, dialog);
    document.body.append(host);
    activeDialog = dialog;
    dialog.addEventListener("close", () => {
      finished = true;
      host.remove();
      activeDialog = null;
      if (trigger.isConnected) trigger.focus();
    });
    cancel.addEventListener("click", () => dialog.close());
    suggest.addEventListener("click", async () => {
      suggest.disabled = true;
      status.textContent = "Loading suggestions…";
      try {
        const result = await send({ type: "suggestFilterCriteria", text });
        if (finished) return;
        choices.replaceChildren(
          ...result.suggestions.map((suggestion) => {
            const choice = make("button", suggestion);
            choice.type = "button";
            choice.addEventListener("click", () => {
              input.value = suggestion;
              input.focus();
            });
            return choice;
          })
        );
        status.textContent = "Choose a suggestion to edit.";
      } catch (error) {
        if (!finished) status.textContent = error.message;
      } finally {
        if (!finished) suggest.disabled = false;
      }
    });
    save.addEventListener("click", async () => {
      if (!input.value.trim()) {
        status.textContent = "Enter a filter or choose a suggestion.";
        input.focus();
        return;
      }
      save.disabled = true;
      try {
        await send({ type: "addFilterCriterion", criterion: input.value });
        finished = true;
        status.textContent = "Filter added.";
        save.hidden = true;
        suggest.disabled = true;
        input.disabled = true;
        cancel.textContent = "Done";
        choices.replaceChildren();
      } catch (error) {
        status.textContent = error.message;
        save.disabled = false;
      }
    });
    dialog.showModal();
    input.focus();
  }
  window.SmoothSurferFeedback = { install };
})();
