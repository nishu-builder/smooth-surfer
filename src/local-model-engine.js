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
  let baseSession, baseSystem, idleTimer;
  const activity = { queued: 0, activeSince: 0, completed: 0, failed: 0, lastDurationMs: 0 };
  function releaseBase() {
    clearTimeout(idleTimer);
    baseSession?.destroy();
    baseSession = null;
    baseSystem = null;
  }
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
      return { state, error: lastError, activity: { ...activity } };
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
    activity.queued += 1;
    clearTimeout(idleTimer);
    const operation = queue.then(async () => {
      let session, timer;
      const controller = new AbortController();
      activity.queued -= 1;
      activity.activeSince = Date.now();
      clearTimeout(idleTimer);
      try {
        if (Date.now() - queuedAt > 45000)
          throw new Error("On-device AI is busy. Try again shortly.");
        if (baseSystem !== system) releaseBase();
        if (!baseSession) {
          const availability = await status();
          if (availability.state !== "available")
            throw new Error("On-device model is not ready. Open Settings > Set up on-device AI.");
        }
        if (system.length + text.length > 30000)
          throw new Error(
            "This request is too large for on-device AI. No rule changed. Reduce the number or length of rules and examples."
          );
        const signal = controller.signal;
        timer = setTimeout(() => controller.abort(), 45000);
        if (!baseSession) {
          baseSession = await root.LanguageModel.create({
            ...modelOptions(),
            signal,
            initialPrompts: [{ role: "system", content: system }]
          });
          baseSystem = system;
        }
        // Keep a warm, unprompted base. Each clone sees only the system prompt,
        // never previous posts, while avoiding a cold create() for every batch.
        if (typeof baseSession.clone === "function") {
          session = await baseSession.clone({ signal });
        } else {
          session = baseSession;
          baseSession = null;
        }
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
        activity.completed += 1;
        return answer;
      } catch (error) {
        activity.failed += 1;
        controller.abort();
        releaseBase();
        lastError =
          error.name === "QuotaExceededError"
            ? "This request exceeds the on-device model context. No rule changed."
            : error.name === "AbortError" || error.name === "TimeoutError"
              ? "On-device AI timed out. Posts remain visible; try fewer rules or choose Claude in Settings."
              : error.message;
        throw new Error(lastError, { cause: error });
      } finally {
        clearTimeout(timer);
        session?.destroy();
        activity.lastDurationMs = Date.now() - activity.activeSince;
        activity.activeSince = 0;
        if (!activity.queued && baseSession) {
          idleTimer = setTimeout(releaseBase, 5 * 60 * 1000);
          idleTimer.unref?.();
        }
      }
    });
    queue = operation.catch(() => {});
    return operation;
  }
  root.SmoothSurferLocalEngine = { status, prepare, prompt };
})(typeof self === "undefined" ? globalThis : self);
