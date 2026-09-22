(function installSmoothSurferPopup() {
  "use strict";

  const {
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    getPlatformForUrl,
    normalizeCriteria,
    normalizeSecrets,
    normalizeSettings,
    normalizeVisitDomain,
    normalizeVisitDomains,
    getVisitDelayDayKey,
    getVisitDelayStatus,
    REVIEW_KEY,
    CALIBRATION_KEY
  } = window.SmoothSurferSettings;
  const {
    watchSettings,
    loadConsumption,
    loadSecrets,
    loadSettings,
    loadStats,
    loadVisitDelay,
    applyVisitDelayEvent,
    saveConsumption: writeConsumption,
    saveSecrets: writeSecrets,
    saveSettings: writeSettings,
    saveStats: writeStats,
    watchConsumption,
    watchStats,
    watchVisitDelay
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
  let visitDelay = { days: {} };
  let activeHost = "";

  const status = document.querySelector("[data-status]");
  const settingInputs = Array.from(document.querySelectorAll("[data-setting]"));
  const secretInputs = Array.from(document.querySelectorAll("[data-secret]"));
  const apiKeyRow = document.querySelector("[data-api-key-row]");
  const filterKeyStatus = document.querySelector("[data-filter-key-status]");
  const localModelControls = document.querySelector("[data-local-model-controls]");
  let localModelState = null;
  window.SmoothSurferModelStatus.subscribe((next) => {
    localModelState = next;
    renderFilterKeyStatus();
  });
  document.querySelector("[data-local-model-setup]").addEventListener("click", async () => {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage)
        throw new Error("Open the installed Chrome extension to set up on-device AI.");
      await chrome.runtime.sendMessage({ type: "openLocalModelSetup" });
    } catch (error) {
      setStatus(error.message);
    }
  });
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
  const domainForm = document.querySelector("[data-domain-form]");
  const domainInput = document.querySelector("[data-domain-input]");
  const domainList = document.querySelector("[data-domain-list]");
  const addCurrentDomainButton = document.querySelector("[data-add-current-domain]");
  const visitToday = document.querySelector("[data-visit-today]");
  const visitTable = document.querySelector("[data-visit-delay-table]");
  const visitHours = document.querySelector("[data-visit-delay-hours]");
  const visitHourTable = document.querySelector("[data-visit-delay-hour-table]");
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
  loadVisitDelay().then((loaded) => {
    visitDelay = loaded;
    renderVisitDelay();
  });
  watchVisitDelay((next) => {
    visitDelay = next;
    renderVisitDelay();
  });
  // Keep multi-megabyte review records out of the popup's rendering thread.
  // The worker returns only a count; navigation and settings never wait for it.
  let reviewCountTimer = 0,
    reviewCountLoading = false,
    reviewCountDirty = false;
  const scheduleReviewCount = () => {
    reviewCountDirty = true;
    if (reviewCountTimer || reviewCountLoading) return;
    reviewCountTimer = window.setTimeout(() => {
      reviewCountTimer = 0;
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
      reviewCountLoading = true;
      reviewCountDirty = false;
      chrome.runtime.sendMessage({ type: "getReviewCount" }, (response) => {
        const failed = chrome.runtime.lastError;
        reviewCountLoading = false;
        if (
          !failed &&
          response?.ok &&
          Number.isSafeInteger(response.count) &&
          response.count >= 0
        ) {
          const link = document.querySelector("[data-review-link]");
          if (link) link.textContent = `Review rulings (${response.count})`;
        }
        if (reviewCountDirty) scheduleReviewCount();
      });
    }, 150);
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(scheduleReviewCount));
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, area) => {
      // Do not normalize changed history records merely to invalidate a count.
      if (area === "local" && (changes[REVIEW_KEY] || changes[CALIBRATION_KEY]))
        scheduleReviewCount();
    });
  }
  watchSettings((next) => {
    settings = next;
    render();
  });
  detectActiveTab().then(({ platform, host }) => {
    activePlatform = platform;
    activeHost = host;
    renderActiveSection();
    renderVisitDelay();
  });

  domainForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addVisitDomain(domainInput.value);
  });

  addCurrentDomainButton.addEventListener("click", () => {
    addVisitDomain(activeHost);
  });

  domainList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-domain]");

    if (!button) {
      return;
    }

    event.preventDefault();
    saveSettings({
      visitDelayDomains: settings.visitDelayDomains.filter(
        (domain) => domain !== button.dataset.removeDomain
      )
    });
  });

  visitToday.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-reset-domain]");

    if (!button) {
      return;
    }

    button.disabled = true;
    visitDelayCommand(button.dataset.resetDomain, "reset").then(
      () => setStatus("Count reset"),
      () => setStatus("Not saved")
    );
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
    writeStats(stats).then(
      () => setStatus("Stats cleared"),
      () => setStatus("Not saved")
    );
  });

  clearFactsButton.addEventListener("click", () => {
    consumption = { days: {} };
    renderFacts();
    writeConsumption(consumption).then(
      () => setStatus("Facts cleared"),
      () => setStatus("Not saved")
    );
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
        const imported =
          parsed && typeof parsed === "object" && parsed.settings ? parsed.settings : parsed;

        if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
          throw new Error("Invalid settings file");
        }

        saveSettings(normalizeSettings(imported));
      })
      .catch(() => setStatus("Import failed"));
  });

  function saveSettings(partial) {
    const expectedCriteria = [...settings.filterCriteria];
    settings = normalizeSettings({ ...settings, ...partial });
    render();
    const operation =
      typeof chrome !== "undefined" && chrome.runtime?.sendMessage
        ? new Promise((resolve, reject) =>
            chrome.runtime.sendMessage(
              { type: "updateSettings", patch: partial, expectedCriteria },
              (response) => {
                if (chrome.runtime.lastError || !response?.ok)
                  reject(new Error(response?.error || "Not saved"));
                else resolve();
              }
            )
          )
        : writeSettings(settings);
    operation.then(
      () => setStatus("Saved"),
      async (error) => {
        settings = await loadSettings();
        render();
        setStatus(error.message || "Not saved");
      }
    );
  }

  function saveSecrets(partial) {
    secrets = normalizeSecrets({ ...secrets, ...partial });
    render();
    writeSecrets(secrets).then(
      () => setStatus("Saved"),
      () => setStatus("Not saved")
    );
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

    apiKeyRow.hidden = settings.aiProvider === "local";
    localModelControls.hidden = settings.aiProvider !== "local";
    document.querySelector('[data-setting="imageAnalysisEnabled"]').disabled =
      !settings.enabled || settings.aiProvider === "local";
    renderFilterKeyStatus();
    phraseInput.disabled = !settings.enabled || !isAnyContentFilterEnabled();
    phraseForm.querySelector("button").disabled = phraseInput.disabled;
    renderActiveSection();
    renderPhrases();
    renderVisitDelay();
  }

  function addVisitDomain(value) {
    const domain = normalizeVisitDomain(value);

    if (!domain) {
      setStatus("Enter a site like example.com");
      return;
    }

    saveSettings({
      visitDelayDomains: normalizeVisitDomains([...settings.visitDelayDomains, domain])
    });
    domainInput.value = "";
  }

  // The worker owns visit counts; extension-less previews apply the same rules locally.
  function visitDelayCommand(domain, event) {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      return new Promise((resolve, reject) =>
        chrome.runtime.sendMessage({ type: "visitDelayEvent", domain, event }, (response) => {
          if (chrome.runtime.lastError || !response?.ok)
            reject(new Error(response?.error || "Not saved"));
          else resolve(response);
        })
      );
    }

    return applyVisitDelayEvent({ domain, event }).then((status) => {
      loadVisitDelay().then((next) => {
        visitDelay = next;
        renderVisitDelay();
      });
      return status;
    });
  }

  function renderVisitDelay() {
    const domains = settings.visitDelayDomains;
    const usable = settings.enabled;

    domainInput.disabled = !usable;
    domainForm.querySelector("button").disabled = !usable;
    const currentDomain = normalizeVisitDomain(activeHost);
    addCurrentDomainButton.hidden =
      !usable ||
      !currentDomain ||
      domains.includes(currentDomain) ||
      Boolean(document.body.dataset.workspace);
    addCurrentDomainButton.textContent = `Add ${currentDomain}`;

    domainList.replaceChildren();
    if (domains.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No sites listed.";
      domainList.append(empty);
    }
    domains.forEach((domain) => {
      const pill = document.createElement("div");
      pill.className = "pill pill-plain";
      const label = document.createElement("span");
      label.className = "pill-label";
      label.textContent = domain;
      label.title = domain;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.removeDomain = domain;
      remove.title = `Remove ${domain}`;
      remove.textContent = "x";
      remove.disabled = !usable;
      pill.append(label, remove);
      domainList.append(pill);
    });

    visitToday.replaceChildren();
    domains.forEach((domain) => {
      const status = getVisitDelayStatus(visitDelay, domain, settings.visitDelaySeconds);
      const row = document.createElement("div");
      row.className = "stats-row";
      const label = document.createElement("span");
      label.textContent = domain;
      const counts = document.createElement("span");
      counts.textContent = `${status.step} today · ${formatDuration(status.waitedMs)} waited · next ${formatDuration(status.waitMs)}`;
      row.append(label, counts);
      if (status.step > 0) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.dataset.resetDomain = domain;
        reset.textContent = "Reset";
        reset.disabled = !usable;
        row.append(reset);
      }
      visitToday.append(row);
    });

    renderVisitDelayStats(domains);
  }

  function renderVisitDelayStats(domains) {
    if (!visitTable) return;
    const todayKey = getVisitDelayDayKey();
    const weekKeys = new Set(
      Array.from({ length: 7 }, (_, offset) =>
        getVisitDelayDayKey(Date.now() - offset * 24 * 60 * 60 * 1000)
      )
    );
    const totals = new Map();
    const hours = Array(24).fill(0);
    const blank = () => ({
      loads: 0,
      starts: 0,
      completed: 0,
      abandoned: 0,
      resets: 0,
      waitedMs: 0
    });

    for (const [day, entries] of Object.entries(visitDelay.days)) {
      if (!weekKeys.has(day)) continue;
      for (const [domain, entry] of Object.entries(entries)) {
        const total = totals.get(domain) || { today: blank(), week: blank() };
        for (const key of Object.keys(total.week)) {
          total.week[key] += entry[key];
          if (day === todayKey) total.today[key] += entry[key];
        }
        entry.hours.forEach((count, hour) => {
          hours[hour] += count;
        });
        totals.set(domain, total);
      }
    }
    for (const domain of domains) {
      if (!totals.has(domain)) totals.set(domain, { today: blank(), week: blank() });
    }

    visitTable.replaceChildren();
    if (totals.size === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No sites listed yet.";
      visitTable.append(empty);
    } else {
      const table = document.createElement("table");
      table.className = "visit-table";
      const head = table.createTHead().insertRow();
      for (const heading of ["Site", "Loads", "Visits", "Left early", "Resets", "Waited"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = heading;
        head.append(cell);
      }
      const body = table.createTBody();
      const ordered = [...totals].sort((a, b) => b[1].week.starts - a[1].week.starts);
      for (const [domain, total] of ordered) {
        const row = body.insertRow();
        row.insertCell().textContent = domain;
        for (const key of ["loads", "completed", "abandoned", "resets"]) {
          row.insertCell().textContent = `${total.today[key]} · ${total.week[key]}`;
        }
        row.insertCell().textContent = `${formatDuration(total.today.waitedMs)} · ${formatDuration(total.week.waitedMs)}`;
      }
      visitTable.append(table);
    }

    const peak = Math.max(1, ...hours);
    visitHours.replaceChildren();
    visitHours.setAttribute(
      "aria-label",
      `Visit starts by hour of day over the past 7 days, ${hours.reduce((sum, count) => sum + count, 0)} in total.`
    );
    hours.forEach((count, hour) => {
      const bar = document.createElement("div");
      bar.className = "hour-bar";
      bar.tabIndex = 0;
      const label = `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
      bar.setAttribute("aria-label", `${label}: ${count} ${count === 1 ? "visit" : "visits"}`);
      if (!count) bar.dataset.empty = "";
      const fill = document.createElement("div");
      fill.className = "hour-bar-fill";
      fill.style.height = count ? `${Math.max(2, (count / peak) * 100)}%` : "1px";
      const tip = document.createElement("span");
      tip.className = "hour-bar-tip";
      tip.textContent = `${count} · ${label}`;
      bar.append(fill, tip);
      if (hour % 6 === 0) {
        const axis = document.createElement("span");
        axis.className = "hour-label";
        axis.textContent = `${String(hour).padStart(2, "0")}:00`;
        bar.append(axis);
      }
      visitHours.append(bar);
    });

    visitHourTable.replaceChildren();
    const hourTable = document.createElement("table");
    hourTable.className = "visit-table";
    const hourHead = hourTable.createTHead().insertRow();
    for (const heading of ["Hour", "Visits"]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = heading;
      hourHead.append(cell);
    }
    const hourBody = hourTable.createTBody();
    hours.forEach((count, hour) => {
      const row = hourBody.insertRow();
      row.insertCell().textContent = `${String(hour).padStart(2, "0")}:00`;
      row.insertCell().textContent = String(count);
    });
    visitHourTable.append(hourTable);
  }

  function formatDuration(ms) {
    const total = Math.round(ms / 1000);
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  }

  function renderFilterKeyStatus() {
    status.textContent = window.SmoothSurferModelStatus.summary();
    const hasKey = Boolean(secrets.anthropicApiKey);
    const hasContentFilter = isAnyContentFilterEnabled();

    filterKeyStatus.hidden = !hasContentFilter;
    if (settings.aiProvider === "local") {
      const messages = {
        available: "Model ready.",
        downloadable: "Download the on-device model to start filtering.",
        downloading: "Model downloading. Open setup for progress.",
        unavailable: "On-device AI is unavailable on this device. Cloud filtering remains off.",
        unsupported: "On-device AI requires a supported desktop Chrome installation."
      };
      const state = localModelState;
      if (state?.checking) {
        filterKeyStatus.textContent = "Checking Gemini Nano…";
        return;
      }
      const parts = [
        state ? messages[state.state] || "On-device AI unavailable." : "Checking on-device model…"
      ];
      if (state?.feed) {
        const { checked, filtered, failed, active, queued } = state.feed;
        parts.push(
          `This session: ${checked} checked · ${filtered} filtered · ${active + queued} waiting · ${failed} failed.`
        );
        if (!checked && !active && !queued && !failed && state.state === "available")
          parts.push("Waiting for posts. Refresh the feed after reloading the extension.");
      }
      if (state?.activity?.activeSince)
        parts.push(
          `Current request: ${Math.max(1, Math.round((Date.now() - state.activity.activeSince) / 1000))}s.`
        );
      else if (state?.activity?.lastDurationMs)
        parts.push(`Last request: ${(state.activity.lastDurationMs / 1000).toFixed(1)}s.`);
      const error = state?.feed?.lastError || state?.error;
      if (error) parts.push(error);
      if (state?.checkedAt)
        parts.push(`Checked ${new Date(state.checkedAt).toLocaleTimeString()}.`);
      filterKeyStatus.textContent = parts.join(" ");
      return;
    }
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
    if (document.body.dataset.workspace) return;
    let insertAfter = header;

    defaultSiteSectionOrder.forEach((section) => {
      popup.insertBefore(section, insertAfter.nextSibling);
      insertAfter = section;
    });

    siteSections.forEach((section) => {
      const isActive = section.dataset.siteSection === activePlatform;
      section.dataset.activeSite = String(isActive);
    });

    const activeSection = siteSections.find(
      (section) => section.dataset.siteSection === activePlatform
    );

    if (activeSection) {
      popup.insertBefore(activeSection, header.nextSibling);
    }
  }

  function renderStats() {
    statsList.textContent = "";

    const weekKeys = new Set(lastDayKeys(7));
    const todayKey = localDayKey(new Date());
    const totals = new Map();
    const reasons = new Map();

    Object.keys(stats.days).forEach((day) => {
      if (!weekKeys.has(day)) {
        return;
      }

      const platforms = stats.days[day];

      Object.keys(platforms).forEach((platformName) => {
        const count = Object.values(platforms[platformName]).reduce((sum, value) => sum + value, 0);
        for (const [reason, amount] of Object.entries(platforms[platformName]))
          reasons.set(reason, (reasons.get(reason) || 0) + amount);
        const entry = totals.get(platformName) || { today: 0, week: 0 };

        entry.week += count;

        if (day === todayKey) {
          entry.today += count;
        }

        totals.set(platformName, entry);
      });
    });

    const todayTotal = document.querySelector("[data-hidden-today]");
    if (todayTotal) {
      todayTotal.textContent = [...totals.values()]
        .reduce((sum, value) => sum + value.today, 0)
        .toLocaleString();
      document.querySelector("[data-hidden-week]").textContent = [...totals.values()]
        .reduce((sum, value) => sum + value.week, 0)
        .toLocaleString();
      const host = document.querySelector("[data-stats-reasons]");
      host.replaceChildren();
      for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
        const row = document.createElement("div");
        row.className = "stats-row";
        const label = document.createElement("span");
        label.textContent = reason;
        const value = document.createElement("span");
        value.textContent = count.toLocaleString();
        row.append(label, value);
        host.append(row);
      }
      if (!reasons.size) host.textContent = "No recorded reasons yet.";
    }
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
    postsRow.append(factsElement("span", "", "Posts"), factsElement("span", "", String(posts)));
    panel.append(postsRow);
    panel.append(factsElement("div", "facts-bar facts-bar-thin", ""));
    panel.append(factsElement("div", "facts-percent-heading", "% Posts Experiencing*"));

    FACTS_ROWS.forEach((row) => {
      const count = row.tags.reduce((sum, tag) => sum + (tagCounts[tag] || 0), 0);
      const percent = Math.round((count / posts) * 100);
      const rowElement = factsElement(
        "div",
        "facts-row" + (row.bold ? " facts-row-bold" : "") + (row.indent ? " facts-row-indent" : ""),
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

  function detectActiveTab() {
    return new Promise((resolve) => {
      if (
        typeof chrome === "undefined" ||
        !chrome.tabs ||
        typeof chrome.tabs.query !== "function"
      ) {
        resolve({ platform: "unknown", host: "" });
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({ platform: "unknown", host: "" });
          return;
        }

        const tab = tabs && tabs[0];
        const platformFromUrl = getPlatformForUrl(tab && tab.url);
        let host = "";

        try {
          const url = new URL(tab && tab.url);
          host = /^https?:$/.test(url.protocol) ? url.hostname : "";
        } catch {
          host = "";
        }

        if (
          platformFromUrl !== "unknown" ||
          !tab ||
          typeof tab.id !== "number" ||
          typeof chrome.tabs.sendMessage !== "function"
        ) {
          resolve({ platform: platformFromUrl, host });
          return;
        }

        chrome.tabs.sendMessage(tab.id, { type: "getSmoothSurferPlatform" }, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve({ platform: "unknown", host });
            return;
          }

          resolve({
            platform: response && response.platform ? response.platform : "unknown",
            host
          });
        });
      });
    });
  }

  function setStatus(message) {
    status.textContent = message;
    window.setTimeout(() => {
      status.textContent = window.SmoothSurferModelStatus.summary();
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
