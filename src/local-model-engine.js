(function installLocalModelEngine(root) {
  "use strict";
  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }]
  };
  function modelOptions() {
    return {
      ...options,
      ...(typeof root.LanguageModel?.params === "function" ? { temperature: 0, topK: 1 } : {})
    };
  }
  let queue = Promise.resolve();
  let lastError = "";
  async function status() {
    if (!root.LanguageModel)
      return {
        state: "unsupported",
        error: "On-device AI requires a supported desktop Chrome installation."
      };
    let timer;
    try {
      const state = await Promise.race([
        root.LanguageModel.availability(modelOptions()),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error("Chrome's model status check timed out. Open setup and try again.")),
            5000
          );
        })
      ]);
      return { state, error: lastError };
    } catch (error) {
      return { state: "unavailable", error: error.message };
    } finally {
      clearTimeout(timer);
    }
  }
  // Call directly from the setup page's button handler: the initial download
  // requires user activation and must not originate in a background worker.
  async function prepare(onProgress) {
    if (!root.LanguageModel) throw new Error("This browser does not support on-device AI.");
    const session = await root.LanguageModel.create({
      ...modelOptions(),
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => onProgress(event.loaded));
      }
    });
    session.destroy();
    lastError = "";
  }
  function prompt(system, text) {
    const queuedAt = Date.now();
    const operation = queue.then(async () => {
      let session;
      try {
        if (Date.now() - queuedAt > 45000)
          throw new Error("On-device AI is busy. Try again shortly.");
        const availability = await status();
        if (availability.state !== "available")
          throw new Error("On-device model is not ready. Open Settings > Set up on-device AI.");
        if (system.length + text.length > 30000)
          throw new Error(
            "This request is too large for on-device AI. No rule changed. Reduce the number or length of rules and examples."
          );
        const signal = AbortSignal.timeout(45000);
        session = await root.LanguageModel.create({
          ...modelOptions(),
          signal,
          initialPrompts: [{ role: "system", content: system }]
        });
        // Each operation owns a fresh session: previous posts must not leak
        // into another classification or consume its context budget.
        const promptOptions = { signal, responseConstraint: { type: "object" } };
        let overflowed = false;
        session.addEventListener?.("contextoverflow", () => {
          overflowed = true;
        });
        if (typeof session.measureContextUsage === "function") {
          const required = await session.measureContextUsage(text, promptOptions);
          if (required + (session.contextUsage || 0) + 1500 > session.contextWindow)
            throw new Error("This request exceeds the on-device model context. No rule changed.");
        }
        const answer = await session.prompt(text, promptOptions);
        if (overflowed) throw new Error("The on-device model ran out of context. No rule changed.");
        JSON.parse(answer); // Never accept truncated or non-JSON model output.
        lastError = "";
        return answer;
      } catch (error) {
        lastError =
          error.name === "QuotaExceededError"
            ? "This request exceeds the on-device model context. No rule changed."
            : error.message;
        throw new Error(lastError, { cause: error });
      } finally {
        session?.destroy();
      }
    });
    queue = operation.catch(() => {});
    return operation;
  }
  root.SmoothSurferLocalEngine = { status, prepare, prompt };
})(typeof self === "undefined" ? globalThis : self);
