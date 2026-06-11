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
    loadConsumption,
    loadSecrets,
    loadSettings,
    loadStats,
    saveConsumption: writeConsumption,
    saveSecrets: writeSecrets,
    saveSettings: writeSettings,
    saveStats: writeStats,
    watchConsumption,
    watchStats
  } = window.SmoothSurferStorage;
  const STATS_SITE_LABELS = {
    youtube: "YouTube",
    twitter: "X / Twitter",
    reddit: "Reddit",
    substack: "Substack",
    "hacker-news": "Hacker News",
    other: "Other sites"
  };
  // Label rows mirror a nutrition-facts panel: family totals in bold with
  // their ingredients indented beneath. Totals sum their member tags, which
  // stays exact because the classifier assigns at most one tag per family.
  const FACTS_ROWS = [
    {
      label: "Total Outrage",
      tags: ["outrage-political", "outrage-callout", "outrage-other"],
      bold: true
    },
    { label: "Political Outrage", tags: ["outrage-political"], indent: true },
    { label: "Personal Directed Callouts", tags: ["outrage-callout"], indent: true },
    { label: "Total Joy", tags: ["joy"], bold: true },
    { label: "Total Humor", tags: ["humor"], bold: true },
    {
      label: "Total Fear",
      tags: ["fear-existential", "fear-safety", "fear-societal", "fear-political", "fear-other"],
      bold: true
    },
    { label: "Existential Dread", tags: ["fear-existential"], indent: true },
    { label: "Personal Safety Fear", tags: ["fear-safety"], indent: true },
    { label: "Societal Fear", tags: ["fear-societal"], indent: true },
    { label: "Political Fear", tags: ["fear-political"], indent: true },
    { label: "Total Curiosity/Beauty", tags: ["curiosity-beauty"], bold: true },
    { label: "Polls", tags: ["poll"], rule: true },
    { label: "Memes & Copypasta", tags: ["meme"] }
  ];

  let settings = { ...DEFAULT_SETTINGS };
  let secrets = { ...DEFAULT_SECRETS };
  let stats = { days: {} };
  let consumption = { days: {} };

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
  const statsList = document.querySelector("[data-stats-list]");
  const clearStatsButton = document.querySelector("[data-clear-stats]");
  const factsLabel = document.querySelector("[data-facts-label]");
  const clearFactsButton = document.querySelector("[data-clear-facts]");
  const exportButton = document.querySelector("[data-export-settings]");
  const importButton = document.querySelector("[data-import-settings]");
  const importFile = document.querySelector("[data-import-file]");
  let activePlatform = "unknown";

  Promise.all([loadSettings(), loadSecrets()]).then(([loadedSettings, loadedSecrets]) => {
    settings = normalizeSettings(loadedSettings);
    secrets = normalizeSecrets(loadedSecrets);
    render();
  });
  loadStats().then((loadedStats) => {
    stats = loadedStats;
    renderStats();
  });
  watchStats((nextStats) => {
    stats = nextStats;
    renderStats();
  });
  loadConsumption().then((loadedConsumption) => {
    consumption = loadedConsumption;
    renderFacts();
  });
  watchConsumption((nextConsumption) => {
    consumption = nextConsumption;
    renderFacts();
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

  clearStatsButton.addEventListener("click", () => {
    stats = { days: {} };
    renderStats();
    writeStats(stats).then(() => setStatus("Stats cleared"), () => setStatus("Not saved"));
  });

  clearFactsButton.addEventListener("click", () => {
    consumption = { days: {} };
    renderFacts();
    writeConsumption(consumption).then(() => setStatus("Facts cleared"), () => setStatus("Not saved"));
  });

  exportButton.addEventListener("click", () => {
    const payload = {
      app: "smooth-surfer",
      exportedAt: new Date().toISOString(),
      settings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "smooth-surfer-settings.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Exported");
  });

  importButton.addEventListener("click", () => {
    importFile.click();
  });

  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];

    importFile.value = "";

    if (!file) {
      return;
    }

    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text);
        const imported = parsed && typeof parsed === "object" && parsed.settings ? parsed.settings : parsed;

        if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
          throw new Error("Invalid settings file");
        }

        saveSettings(normalizeSettings(imported));
      })
      .catch(() => setStatus("Import failed"));
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

  function renderStats() {
    statsList.textContent = "";

    const weekKeys = new Set(lastDayKeys(7));
    const todayKey = localDayKey(new Date());
    const totals = new Map();

    Object.keys(stats.days).forEach((day) => {
      if (!weekKeys.has(day)) {
        return;
      }

      const platforms = stats.days[day];

      Object.keys(platforms).forEach((platformName) => {
        const count = Object.values(platforms[platformName]).reduce(
          (sum, value) => sum + value,
          0
        );
        const entry = totals.get(platformName) || { today: 0, week: 0 };

        entry.week += count;

        if (day === todayKey) {
          entry.today += count;
        }

        totals.set(platformName, entry);
      });
    });

    if (totals.size === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nothing hidden yet.";
      statsList.append(empty);
      return;
    }

    const ordered = Array.from(totals.entries()).sort((a, b) => b[1].week - a[1].week);

    ordered.forEach(([platformName, entry]) => {
      const row = document.createElement("div");
      row.className = "stats-row";

      const label = document.createElement("span");
      label.textContent = STATS_SITE_LABELS[platformName] || platformName;

      const counts = document.createElement("span");
      counts.textContent = `${entry.today} today · ${entry.week} this week`;

      row.append(label, counts);
      statsList.append(row);
    });
  }

  function renderFacts() {
    factsLabel.textContent = "";

    const platforms = consumption.days[localDayKey(new Date())] || {};
    let posts = 0;
    const tagCounts = {};

    Object.values(platforms).forEach((entry) => {
      posts += entry.posts || 0;
      Object.keys(entry.tags || {}).forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + entry.tags[tag];
      });
    });

    if (posts === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No posts labeled yet today.";
      factsLabel.append(empty);
      return;
    }

    const panel = document.createElement("div");
    panel.className = "facts-panel";
    panel.append(factsElement("div", "facts-title", "Consumption Facts"));
    panel.append(factsElement("div", "facts-subtitle", "Consumed today"));
    panel.append(factsElement("div", "facts-bar", ""));

    const postsRow = factsElement("div", "facts-posts", "");
    postsRow.append(
      factsElement("span", "", "Posts"),
      factsElement("span", "", String(posts))
    );
    panel.append(postsRow);
    panel.append(factsElement("div", "facts-bar facts-bar-thin", ""));
    panel.append(factsElement("div", "facts-percent-heading", "% Posts Experiencing*"));

    FACTS_ROWS.forEach((row) => {
      const count = row.tags.reduce((sum, tag) => sum + (tagCounts[tag] || 0), 0);
      const percent = Math.round((count / posts) * 100);
      const rowElement = factsElement(
        "div",
        "facts-row" +
          (row.bold ? " facts-row-bold" : "") +
          (row.indent ? " facts-row-indent" : ""),
        ""
      );

      if (row.rule) {
        panel.append(factsElement("div", "facts-bar facts-bar-thin", ""));
      }

      rowElement.append(
        factsElement("span", "facts-row-label", `${row.label} ${count}p`),
        factsElement("span", "facts-row-percent", `${percent}%`)
      );
      panel.append(rowElement);
    });

    panel.append(
      factsElement(
        "p",
        "facts-note",
        "*The % Posts Experiencing tells you how often a post you saw today carried a particular emotional ingredient. Some posts contribute to more than one row."
      )
    );
    factsLabel.append(panel);
  }

  function factsElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text) {
      element.textContent = text;
    }

    return element;
  }

  function localDayKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${day}`;
  }

  function lastDayKeys(count) {
    const keys = [];

    for (let offset = 0; offset < count; offset += 1) {
      const date = new Date();

      date.setDate(date.getDate() - offset);
      keys.push(localDayKey(date));
    }

    return keys;
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
