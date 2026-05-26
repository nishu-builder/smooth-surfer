(function createSmoothSurferStorage(root) {
  "use strict";

  const {
    DEFAULT_SECRETS,
    DEFAULT_SETTINGS,
    SECRETS_KEY,
    STORAGE_KEY,
    normalizeSecrets,
    normalizeSettings
  } = root.SmoothSurferSettings;

  function loadSettings() {
    return read("sync", STORAGE_KEY, DEFAULT_SETTINGS, normalizeSettings);
  }

  function saveSettings(settings) {
    return write("sync", STORAGE_KEY, normalizeSettings(settings));
  }

  function loadSecrets() {
    return read("local", SECRETS_KEY, DEFAULT_SECRETS, normalizeSecrets);
  }

  function saveSecrets(secrets) {
    return write("local", SECRETS_KEY, normalizeSecrets(secrets));
  }

  function watchSettings(callback) {
    watchStorage("sync", STORAGE_KEY, normalizeSettings, callback);
  }

  function watchSecrets(callback) {
    watchStorage("local", SECRETS_KEY, normalizeSecrets, callback);
  }

  function watchStorage(areaName, key, normalize, callback) {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.onChanged ||
      typeof chrome.storage.onChanged.addListener !== "function"
    ) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, changedAreaName) => {
      if (changedAreaName === areaName && changes[key]) {
        callback(normalize(changes[key].newValue));
      }
    });
  }

  function area(name) {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage[name] ||
      typeof chrome.storage[name].get !== "function"
    ) {
      return null;
    }

    return chrome.storage[name];
  }

  function read(areaName, key, defaults, normalize) {
    const chromeArea = area(areaName);

    if (chromeArea) {
      return new Promise((resolve) => {
        chromeArea.get({ [key]: defaults }, (result) => {
          resolve(normalize(result[key]));
        });
      });
    }

    if (!root.localStorage) {
      return Promise.resolve(normalize(defaults));
    }

    try {
      const stored = root.localStorage.getItem(key);
      return Promise.resolve(normalize(stored ? JSON.parse(stored) : defaults));
    } catch (error) {
      return Promise.resolve(normalize(defaults));
    }
  }

  function write(areaName, key, value) {
    const chromeArea = area(areaName);

    if (chromeArea) {
      return new Promise((resolve, reject) => {
        chromeArea.set({ [key]: value }, () => {
          const lastError = chrome.runtime && chrome.runtime.lastError;
          lastError ? reject(new Error(lastError.message)) : resolve();
        });
      });
    }

    if (!root.localStorage) {
      return Promise.resolve();
    }

    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  root.SmoothSurferStorage = {
    loadSecrets,
    loadSettings,
    saveSecrets,
    saveSettings,
    watchSecrets,
    watchSettings
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
