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
      :host { color-scheme: light dark; } * { box-sizing: border-box; }
      dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 40px); overflow: auto; margin: auto; padding: 24px; border: 1px solid var(--ss-ink); border-radius: 8px; color: var(--ss-ink); background: var(--ss-paper); font: 14px/1.55 var(--ss-sans); box-shadow: 5px 6px 0 var(--ss-stamp); }
      dialog::backdrop { background: rgb(32 34 30 / 45%); }
      h2 { font: 700 20px/1.25 var(--ss-mono); letter-spacing: -0.8px; margin: 0 0 6px; } p { margin: 6px 0; color: var(--ss-muted); }
      blockquote { margin: 12px 0; padding: 10px 12px; border-radius: 10px 10px 10px 3px; background: var(--ss-gray); max-height: 140px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
      label { display: block; margin: 16px 0 6px; font: 600 12px/1.5 var(--ss-mono); }
      textarea { width: 100%; min-height: 72px; resize: vertical; font: inherit; padding: 10px 12px; border: 1px solid var(--ss-control-line); border-radius: 5px; background: var(--ss-paper); color: var(--ss-ink); }
      textarea:focus { border-color: var(--ss-ink); outline: none; }
      button { font: 12px/1.3 var(--ss-mono); cursor: pointer; border-radius: 5px; border: 1px solid var(--ss-ink); padding: 0 14px; min-height: 36px; background: var(--ss-paper); color: var(--ss-ink); }
      button:hover:not(:disabled) { background: var(--ss-hover); } button:disabled { opacity: .5; cursor: default; }
      .primary { background: var(--ss-accent); color: var(--ss-accent-ink); box-shadow: 2px 3px 0 var(--ss-stamp); } .primary:hover:not(:disabled) { background: var(--ss-accent-hover); }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; } .suggestions { display: grid; gap: 6px; margin-top: 10px; }
      .suggestions button { min-height: 0; padding: 8px 12px; border-color: var(--ss-line); text-align: left; font: 13px/1.45 var(--ss-sans); } .suggestions button:hover { border-color: var(--ss-ink); }
      :focus-visible { outline: 3px solid var(--ss-focus); outline-offset: 3px; } small { display: block; margin-top: 6px; color: var(--ss-muted); font-size: 12px; } [role=status] { color: var(--ss-ink); } [role=status]:empty { display: none; }
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
        ? "Describe posts like this one, or let the AI suggest a rule."
        : "Describe posts like this one. Suggestions need post text."
    );
    const preview = make("blockquote", text ? text.slice(0, 2000) : "Image post");
    const suggest = make("button", "Suggest rules");
    suggest.type = "button";
    suggest.disabled = !text;
    const note = make(
      "small",
      "Sends this post’s text to your selected AI model. Nothing changes until you add a rule."
    );
    const choices = make("div", "");
    choices.className = "suggestions";
    const label = make("label", "Hide posts that are…");
    label.htmlFor = "feedback-rule";
    const input = make("textarea", "");
    input.id = "feedback-rule";
    input.maxLength = 500;
    input.placeholder = "For example: posts asking readers to repost for a giveaway";
    const scope = make("small", "Applies on every site where the AI filter is on.");
    const status = make("p", "");
    status.setAttribute("role", "status");
    const actions = make("div", "");
    actions.className = "actions";
    const save = make("button", "Add rule");
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
        status.textContent = "Describe the posts to hide, or pick a suggestion.";
        input.focus();
        return;
      }
      save.disabled = true;
      try {
        await send({ type: "addFilterCriterion", criterion: input.value });
        finished = true;
        status.textContent = "Rule added. Similar posts will be hidden.";
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
