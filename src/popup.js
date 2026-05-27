(function installSmoothSurferPopup() {
  "use strict";

  const {
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    getPlatformForUrl,
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
  const popup = document.querySelector(".popup");
  const header = document.querySelector("header");
  const siteSections = Array.from(document.querySelectorAll("[data-site-section]"));
  const defaultSiteSectionOrder = [...siteSections];
  let activePlatform = "unknown";

  Promise.all([loadSettings(), loadSecrets()]).then(([loadedSettings, loadedSecrets]) => {
    settings = normalizeSettings(loadedSettings);
    secrets = normalizeSecrets(loadedSecrets);
    render();
  });
  detectActivePlatform().then((platform) => {
    activePlatform = platform;
    renderActiveSection();
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
      filterCriteria: normalizeCriteria([...settings.filterCriteria, phrase])
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
      filterCriteria: settings.filterCriteria.filter((item) => item !== phrase)
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
    phraseInput.disabled = !settings.enabled || !isAnyContentFilterEnabled();
    phraseForm.querySelector("button").disabled = phraseInput.disabled;
    renderActiveSection();
    renderPhrases();
  }

  function renderFilterKeyStatus() {
    const hasKey = Boolean(secrets.anthropicApiKey);
    const hasContentFilter = isAnyContentFilterEnabled();

    filterKeyStatus.hidden = !hasContentFilter;
    filterKeyStatus.textContent = hasKey
      ? "Claude Haiku filtering is active."
      : "Content filtering is off until an Anthropic key is saved.";
  }

  function renderPhrases() {
    phraseList.textContent = "";

    if (settings.filterCriteria.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No criteria";
      phraseList.append(empty);
      return;
    }

    settings.filterCriteria.forEach((phrase) => {
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

  function renderActiveSection() {
    let insertAfter = header;

    defaultSiteSectionOrder.forEach((section) => {
      popup.insertBefore(section, insertAfter.nextSibling);
      insertAfter = section;
    });

    siteSections.forEach((section) => {
      const isActive = section.dataset.siteSection === activePlatform;
      section.dataset.activeSite = String(isActive);
    });

    const activeSection = siteSections.find((section) => section.dataset.siteSection === activePlatform);

    if (activeSection) {
      popup.insertBefore(activeSection, header.nextSibling);
    }
  }

  function isAnyContentFilterEnabled() {
    return (
      settings.twitterFilterContent ||
      settings.redditFilterContent ||
      settings.substackFilterContent ||
      settings.hackerNewsFilterContent
    );
  }

  function detectActivePlatform() {
    return new Promise((resolve) => {
      if (
        typeof chrome === "undefined" ||
        !chrome.tabs ||
        typeof chrome.tabs.query !== "function"
      ) {
        resolve("unknown");
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve("unknown");
          return;
        }

        const tab = tabs && tabs[0];
        const platformFromUrl = getPlatformForUrl(tab && tab.url);

        if (
          platformFromUrl !== "unknown" ||
          !tab ||
          typeof tab.id !== "number" ||
          typeof chrome.tabs.sendMessage !== "function"
        ) {
          resolve(platformFromUrl);
          return;
        }

        chrome.tabs.sendMessage(tab.id, { type: "getSmoothSurferPlatform" }, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve("unknown");
            return;
          }

          resolve(response && response.platform ? response.platform : "unknown");
        });
      });
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
