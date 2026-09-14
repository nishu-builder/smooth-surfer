(function installLocalModelClient(root) {
  "use strict";
  let creating;
  async function ensureDocument() {
    if (!chrome.offscreen?.createDocument || !chrome.runtime.getContexts)
      throw new Error("On-device AI requires desktop Chrome with offscreen document support.");
    const url = chrome.runtime.getURL("src/local-model-offscreen.html");
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url]
    });
    if (contexts.length) return;
    if (!creating) {
      creating = chrome.offscreen
        .createDocument({
          url,
          reasons: ["IFRAME_SCRIPTING"],
          justification:
            "Run the browser's on-device language model in a same-origin extension iframe, independent of the popup."
        })
        .finally(() => {
          creating = null;
        });
    }
    await creating;
  }
  async function request(action, data = {}) {
    await ensureDocument();
    // The iframe may not have installed its listener when createDocument resolves.
    for (let attempt = 0; attempt < 10; attempt++) {
      let reply;
      try {
        reply = await chrome.runtime.sendMessage({ target: "local-model", action, ...data });
      } catch (error) {
        if (attempt === 9) throw error;
      }
      if (reply) {
        if (!reply.ok) throw new Error(reply.error || "On-device AI failed.");
        return reply;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("On-device AI could not start. Reload the extension and try again.");
  }
  root.SmoothSurferLocalClient = {
    status: async () => {
      try {
        return await request("status");
      } catch (error) {
        return { state: "unsupported", error: error.message };
      }
    },
    prompt: async (system, text) => (await request("prompt", { system, text })).answer
  };
})(self);
