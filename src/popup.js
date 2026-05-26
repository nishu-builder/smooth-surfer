(function installSmoothSurferPopup() {
  "use strict";

  const {
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    normalizeCriteria,
    normalizeSecrets,
    normalizeSettings
  } =
    window.SmoothSurferSettings;
  const {
    loadSecrets,
    loadSettings,
    saveSecrets: writeSecrets,
    saveSettings: writeSettings
  } = window.SmoothSurferStorage;

  let settings = { ...DEFAULT_SETTINGS };
  let secrets = { ...DEFAULT_SECRETS };

  const status = document.querySelector("[data-status]");
  const settingInputs = Array.from(document.querySelectorAll("[data-setting]"));
  const secretInputs = Array.from(document.querySelectorAll("[data-secret]"));
  const apiKeyRow = document.querySelector("[data-api-key-row]");
  const filterKeyStatus = document.querySelector("[data-filter-key-status]");
  const phraseForm = document.querySelector("[data-phrase-form]");
  const phraseInput = document.querySelector("[data-phrase-input]");
  const phraseList = document.querySelector("[data-phrase-list]");

  Promise.all([loadSettings(), loadSecrets()]).then(([loadedSettings, loadedSecrets]) => {
    settings = normalizeSettings(loadedSettings);
    secrets = normalizeSecrets(loadedSecrets);
    render();
  });

  settingInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.type === "checkbox" ? input.checked : input.value;
      saveSettings({ [input.dataset.setting]: value });
    });
  });

  secretInputs.forEach((input) => {
    input.addEventListener("change", () => {
      saveSecrets({ [input.dataset.secret]: input.value });
    });
    input.addEventListener(
      "input",
      debounce(() => {
        saveSecrets({ [input.dataset.secret]: input.value });
      }, 350)
    );
  });

  phraseForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const phrase = phraseInput.value.replace(/\s+/g, " ").trim();

    if (!phrase) {
      return;
    }

    saveSettings({
      twitterFilterCriteria: normalizeCriteria([...settings.twitterFilterCriteria, phrase])
    });
    phraseInput.value = "";
    phraseInput.focus();
  });

  phraseList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-phrase]");

    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const phrase = button.dataset.removePhrase;
    saveSettings({
      twitterFilterCriteria: settings.twitterFilterCriteria.filter((item) => item !== phrase)
    });
  });

  function saveSettings(partial) {
    settings = normalizeSettings({ ...settings, ...partial });
    render();
    writeSettings(settings).then(() => setStatus("Saved"), () => setStatus("Not saved"));
  }

  function saveSecrets(partial) {
    secrets = normalizeSecrets({ ...secrets, ...partial });
    render();
    writeSecrets(secrets).then(() => setStatus("Saved"), () => setStatus("Not saved"));
  }

  function render() {
    settingInputs.forEach((input) => {
      if (input.type === "checkbox") {
        input.checked = Boolean(settings[input.dataset.setting]);
      } else {
        input.value = settings[input.dataset.setting];
      }

      input.disabled = input.dataset.setting !== "enabled" && !settings.enabled;
    });

    secretInputs.forEach((input) => {
      input.value = secrets[input.dataset.secret] || "";
      input.disabled = !settings.enabled;
    });

    apiKeyRow.hidden = false;
    renderFilterKeyStatus();
    phraseInput.disabled = !settings.enabled || !settings.twitterFilterContent;
    phraseForm.querySelector("button").disabled = phraseInput.disabled;
    renderPhrases();
  }

  function renderFilterKeyStatus() {
    const hasKey = Boolean(secrets.anthropicApiKey);

    filterKeyStatus.hidden = !settings.twitterFilterContent;
    filterKeyStatus.textContent = hasKey
      ? "Claude Haiku filtering is active."
      : "Content filtering is off until an Anthropic key is saved.";
  }

  function renderPhrases() {
    phraseList.textContent = "";

    if (settings.twitterFilterCriteria.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No criteria";
      phraseList.append(empty);
      return;
    }

    settings.twitterFilterCriteria.forEach((phrase) => {
      const pill = document.createElement("details");
      pill.className = "pill";
      pill.dataset.criterion = "";

      const summary = document.createElement("summary");

      const label = document.createElement("span");
      label.className = "pill-label";
      label.dataset.criterionLabel = "";
      label.textContent = phrase;
      label.title = phrase;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.dataset.removePhrase = phrase;
      removeButton.title = "Remove " + phrase;
      removeButton.textContent = "x";
      removeButton.disabled = !settings.enabled || !settings.twitterFilterContent;

      summary.append(label, removeButton);
      pill.append(summary);
      phraseList.append(pill);
    });
  }

  function setStatus(message) {
    status.textContent = message;
    window.setTimeout(() => {
      status.textContent = "Ready";
    }, 900);
  }

  function debounce(callback, delay) {
    let timeout = 0;

    return () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(callback, delay);
    };
  }
})();
