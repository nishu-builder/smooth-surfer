(function installWelcome() {
  "use strict";
  const { normalizeSettings } = window.SmoothSurferSettings;
  const {
    loadSettings,
    loadSecrets,
    saveSecrets,
    saveSettings: writeSettings
  } = window.SmoothSurferStorage;
  const AI_SETTINGS = [
    "twitterFilterContent",
    "redditFilterContent",
    "substackFilterContent",
    "hackerNewsFilterContent"
  ];
  const result = document.querySelector("[data-result]");
  const key = document.getElementById("key");
  const radios = [...document.querySelectorAll("input[name=provider]")];
  const isMac = /Mac|iPhone|iPad/.test(window.navigator.platform || window.navigator.userAgent);
  let settings = null;

  if (typeof chrome !== "undefined" && chrome.commands?.getAll)
    chrome.commands.getAll((commands) => {
      const shortcut = (commands || []).find((entry) => entry.name === "toggle-pin-tab")?.shortcut;
      if (shortcut) document.querySelector("[data-pin-shortcut]").textContent = shortcut;
    });
  else if (!isMac) document.querySelector("[data-pin-shortcut]").textContent = "Alt+P";

  if (!isMac) document.querySelector("[data-search-shortcut]").textContent = "Ctrl+K";

  Promise.all([loadSettings(), loadSecrets()]).then(([loaded, secrets]) => {
    settings = normalizeSettings(loaded);
    key.value = secrets.anthropicApiKey || "";
    radios.forEach((radio) => (radio.checked = radio.value === settings.aiProvider));
    showPanel();
  });

  radios.forEach((radio) =>
    radio.addEventListener("change", async () => {
      showPanel();
      await save({ aiProvider: radio.value });
    })
  );

  document.querySelector("[data-save-key]").addEventListener("click", async () => {
    const value = key.value.trim();
    if (!value) {
      say("Paste your API key first.", "warn");
      key.focus();
      return;
    }
    try {
      await saveSecrets({ ...(await loadSecrets()), anthropicApiKey: value });
      await save({
        aiProvider: "anthropic",
        ...Object.fromEntries(AI_SETTINGS.map((k) => [k, true]))
      });
      say(
        value.startsWith("sk-ant-")
          ? "AI filter is on. Open X or Reddit and filtered posts will fade out; check them anytime in Hidden posts."
          : "Key saved, but Anthropic keys usually start with sk-ant-. If posts aren’t filtered, check the key.",
        value.startsWith("sk-ant-") ? "good" : "warn"
      );
    } catch {
      say("Couldn’t save. Try again.", "warn");
    }
  });
  key.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.querySelector("[data-save-key]").click();
  });

  document.querySelector("[data-local-setup]").addEventListener("click", async () => {
    await save({ aiProvider: "local" });
    try {
      await chrome.runtime.sendMessage({ type: "openLocalModelSetup" });
    } catch {
      window.location.href = "src/local-model-setup.html";
    }
  });

  document.querySelector("[data-skip]").addEventListener("click", async () => {
    await save(Object.fromEntries(AI_SETTINGS.map((k) => [k, false])));
    say("AI filter is off. Everything else keeps working. Turn it on anytime from the menu.", "");
  });

  function showPanel() {
    const provider = radios.find((radio) => radio.checked)?.value || "anthropic";
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== provider;
    });
  }

  function say(text, tone) {
    result.textContent = text;
    result.dataset.tone = tone;
  }

  // Same save path as the popup: the worker merges the patch into current settings.
  function save(patch) {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage)
      return new Promise((resolve, reject) =>
        chrome.runtime.sendMessage({ type: "updateSettings", patch }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) reject(new Error("Not saved"));
          else resolve();
        })
      );
    settings = normalizeSettings({ ...settings, ...patch });
    return writeSettings(settings);
  }
})();
