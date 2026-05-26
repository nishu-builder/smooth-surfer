(function installFeedDockPopup() {
  "use strict";

  const {
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    SECRETS_KEY,
    STORAGE_KEY,
    normalizePatternList,
    normalizeSecrets,
    normalizeSettings
  } =
    window.FeedDockSettings;

  let settings = { ...DEFAULT_SETTINGS };
  let secrets = { ...DEFAULT_SECRETS };

  const status = document.querySelector("[data-status]");
  const settingInputs = Array.from(document.querySelectorAll("[data-setting]"));
  const secretInputs = Array.from(document.querySelectorAll("[data-secret]"));
  const apiKeyRow = document.querySelector("[data-api-key-row]");
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
      twitterFilterCriteria: normalizePatternList([...settings.twitterFilterCriteria, phrase])
    });
    phraseInput.value = "";
    phraseInput.focus();
  });

  phraseList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-phrase]");

    if (!button) {
      return;
    }

    const phrase = button.dataset.removePhrase;
    saveSettings({
      twitterFilterCriteria: settings.twitterFilterCriteria.filter((item) => item !== phrase)
    });
  });

  function hasChromeStorage() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync &&
      typeof chrome.storage.sync.get === "function"
    );
  }

  function hasChromeLocalStorage() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local &&
      typeof chrome.storage.local.get === "function"
    );
  }

  function loadSettings() {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
          resolve(result[STORAGE_KEY]);
        });
      });
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return Promise.resolve(stored ? JSON.parse(stored) : DEFAULT_SETTINGS);
    } catch (error) {
      return Promise.resolve(DEFAULT_SETTINGS);
    }
  }

  function loadSecrets() {
    if (hasChromeLocalStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get({ [SECRETS_KEY]: DEFAULT_SECRETS }, (result) => {
          resolve(result[SECRETS_KEY]);
        });
      });
    }

    try {
      const stored = window.localStorage.getItem(SECRETS_KEY);
      return Promise.resolve(stored ? JSON.parse(stored) : DEFAULT_SECRETS);
    } catch (error) {
      return Promise.resolve(DEFAULT_SECRETS);
    }
  }

  function saveSettings(partial) {
    settings = normalizeSettings({ ...settings, ...partial });
    render();

    if (hasChromeStorage()) {
      chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => setStatus("Saved"));
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setStatus("Saved");
    } catch (error) {
      setStatus("Not saved");
    }
  }

  function saveSecrets(partial) {
    secrets = normalizeSecrets({ ...secrets, ...partial });
    render();

    if (hasChromeLocalStorage()) {
      chrome.storage.local.set({ [SECRETS_KEY]: secrets }, () => setStatus("Saved"));
      return;
    }

    try {
      window.localStorage.setItem(SECRETS_KEY, JSON.stringify(secrets));
      setStatus("Saved");
    } catch (error) {
      setStatus("Not saved");
    }
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
      input.disabled = !settings.enabled || settings.twitterClassifierMode !== "anthropic-haiku";
    });

    apiKeyRow.hidden = settings.twitterClassifierMode !== "anthropic-haiku";
    phraseInput.disabled = !settings.enabled || !settings.twitterFilterContent;
    phraseForm.querySelector("button").disabled = phraseInput.disabled;
    renderPhrases();
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
      const pill = document.createElement("div");
      pill.className = "pill";

      const label = document.createElement("span");
      label.textContent = phrase;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.dataset.removePhrase = phrase;
      removeButton.title = "Remove " + phrase;
      removeButton.textContent = "x";
      removeButton.disabled = !settings.enabled || !settings.twitterFilterContent;

      pill.append(label, removeButton);
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
