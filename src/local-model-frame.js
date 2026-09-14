chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== "local-model" || sender.id !== chrome.runtime.id) return false;
  const engine = self.SmoothSurferLocalEngine;
  if (message.action !== "status" && message.action !== "prompt") return false;
  // Runtime messages keep the service worker's response channel alive during
  // serial inference. This timer exists only while this request is running.
  const keepAlive = setInterval(() => {
    chrome.runtime.sendMessage({ type: "localModelKeepAlive" }).catch(() => {});
  }, 20000);
  const operation =
    message.action === "status"
      ? engine.status()
      : engine
          .prompt(String(message.system || ""), String(message.text || ""))
          .then((answer) => ({ answer }));
  operation
    .then(
      (result) => respond({ ok: true, ...result }),
      (error) => respond({ ok: false, error: error.message })
    )
    .finally(() => clearInterval(keepAlive));
  return true;
});
