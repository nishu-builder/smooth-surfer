(function installModelStatus() {
  "use strict";
  const notice = document.querySelector("[data-model-notice]");
  const text = document.querySelector("[data-model-notice-text]");
  const action = document.querySelector("[data-model-notice-action]");
  const buttons = [...document.querySelectorAll("[data-local-model-refresh]")];
  const listeners = [];
  let settings = {},
    state = null,
    checking = false,
    checkedAt = 0;
  const enabled = () =>
    settings.enabled &&
    settings.aiProvider === "local" &&
    [
      "twitterFilterContent",
      "redditFilterContent",
      "substackFilterContent",
      "hackerNewsFilterContent"
    ].some((key) => settings[key]);
  function summary() {
    if (!settings.enabled) return "Paused";
    if (!enabled()) return "Ready";
    if (!state) return "Checking model…";
    if (state.state === "available" && !state.error) return "Model ready";
    return state.state === "downloadable"
      ? "Setup required"
      : state.state === "downloading"
        ? "Model downloading"
        : "AI filtering paused";
  }
  function render() {
    const messages = {
      downloadable: "AI filtering is paused. Download Gemini Nano to start filtering posts.",
      downloading: "AI filtering is paused while Gemini Nano downloads. Open setup for progress.",
      unavailable: "AI filtering is paused. Gemini Nano is unavailable.",
      unsupported:
        "AI filtering is paused. This browser cannot run Gemini Nano. Choose Claude in Settings."
    };
    notice.hidden =
      !enabled() || (state?.state === "available" && !state.error && !state.feed?.lastError);
    text.textContent = !state
      ? "Checking Gemini Nano. Filtering requires a one-time model download."
      : (messages[state.state] || "Gemini Nano needs attention.") +
        (state.error || state.feed?.lastError ? " " + (state.feed?.lastError || state.error) : "");
    action.textContent = state?.state === "downloading" ? "View download" : "Set up Gemini Nano";
    action.href =
      state?.state === "unsupported" ? "popup.html?view=settings" : "src/local-model-setup.html";
    if (state?.state === "unsupported") action.textContent = "Choose model";
    for (const button of buttons) {
      button.disabled = checking;
      button.textContent = checking ? "Checking…" : "Check status";
    }
    for (const listener of listeners) listener({ ...state, checking, checkedAt });
  }
  async function check() {
    if (checking) return;
    checking = true;
    render();
    let timer;
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage)
        throw new Error("Open the installed extension to check the model.");
      const result = await Promise.race([
        chrome.runtime.sendMessage({ type: "getLocalModelStatus" }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Status check timed out. Open setup and try again.")),
            8000
          );
        })
      ]);
      if (!result?.state)
        throw new Error(
          result?.error || "No model status received. Reload the extension and try again."
        );
      state = result;
    } catch (error) {
      state = { state: "unavailable", error: error.message };
    } finally {
      clearTimeout(timer);
      checking = false;
      checkedAt = Date.now();
      render();
    }
  }
  function updateSettings(next) {
    const wasEnabled = enabled();
    settings = next;
    render();
    if (enabled() && !wasEnabled) void check();
  }
  window.SmoothSurferModelStatus = {
    check,
    summary,
    subscribe: (listener) => listeners.push(listener)
  };
  buttons.forEach((button) => button.addEventListener("click", check));
  window.SmoothSurferStorage.loadSettings().then(updateSettings);
  window.SmoothSurferStorage.watchSettings(updateSettings);
  setInterval(() => {
    if (enabled() && !document.hidden) void check();
  }, 5000);
})();
