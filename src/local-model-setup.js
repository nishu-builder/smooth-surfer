(function setupLocalModel() {
  "use strict";
  const engine = self.SmoothSurferLocalEngine;
  const status = document.querySelector("[data-model-status]");
  const download = document.querySelector("[data-model-download]");
  const check = document.querySelector("[data-model-check]");
  const progress = document.querySelector("[data-model-progress]");
  const labels = {
    available: "Model ready. Return to Settings.",
    downloadable: "Model download required.",
    downloading: "Model is downloading. Continue setup to see progress.",
    unavailable:
      "This device cannot run Chrome's on-device model. Check hardware, disk space, and Chrome updates.",
    unsupported:
      "This browser does not support on-device AI. Use a supported desktop Chrome installation."
  };
  async function refresh() {
    const result = await engine.status();
    status.textContent = labels[result.state] || result.error || "On-device AI unavailable.";
    download.disabled = !["downloadable", "downloading"].includes(result.state);
    download.textContent = result.state === "downloading" ? "Continue setup" : "Download model";
  }
  check.addEventListener("click", refresh);
  download.addEventListener("click", async () => {
    download.disabled = true;
    check.disabled = true;
    progress.hidden = false;
    status.textContent = "Preparing model. Keep this tab open.";
    try {
      await engine.prepare((loaded) => {
        progress.value = loaded;
        status.textContent = `Downloading model: ${Math.round(loaded * 100)}%. Keep this tab open.`;
      });
      await refresh();
    } catch (error) {
      status.textContent = `Setup failed: ${error.message}. Check again to retry.`;
    } finally {
      progress.hidden = true;
      check.disabled = false;
    }
  });
  void refresh();
})();
