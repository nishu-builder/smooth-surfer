# On-device AI

Choose **Gemini Nano · on-device** under Settings → Content filter. Open **Set up on-device AI**, then download the model. Keep that tab open during setup. Once ready, it can be closed; feed filtering uses an offscreen extension document. Chrome retains the model across browser restarts and extension updates. Availability is checked again before inference, so a removed/unavailable model pauses AI filtering instead of switching providers.

This implementation is experimental: real-model quality and latency validation remain outstanding.

The first implementation uses Chrome's built-in Prompt API, not an external local server. Chrome downloads and updates Gemini Nano. Model choice within local mode is not yet supported. No post, rule, feedback, or API key is sent to an AI service in on-device mode. Chrome still contacts its model distribution service for downloads. Ordinary site browsing and X embeds retain their existing network behavior.

## Scope and limits

- Desktop Chrome with Prompt API and offscreen support. Chrome's current requirements include macOS 13+, Windows 10/11, Linux, or Chromebook Plus; at least 22 GB free storage; supported GPU or 16 GB RAM and four CPU cores for CPU inference. Chrome makes the final availability decision. Chrome on iPhone and Android are unsupported.
- Text classification, consumption tags, rule suggestions, and feedback recalibration all honor the selected provider. Local mode needs no API key. Nano is the desktop default for new installations and older settings without a provider. Explicit saved choices are preserved. Safari packages default to Claude. An unavailable Nano model leaves posts visible until setup completes or the user explicitly selects Claude; a saved API key never enables automatic fallback.
- Text only, including extracted image descriptions. Image URLs/pixels are excluded from local AI requests, and the image-analysis toggle is disabled. Image-only calibration examples are skipped and reported; feedback is retained.
- English is declared as the input/output language. Unsupported languages may be rejected by Chrome.
- Local inference is serialized and sessions are isolated per request. Feed batches contain at most two posts, with queued requests bounded by age. Posts remain visible while local decisions are pending to avoid long blank gaps. Local hardware can be slower or less accurate than cloud models; no inference-quality benchmark has been established.
- Requests exceeding character/token limits or generating context-overflow events fail clearly. Recalibration retains feedback and reports the error; it does not silently truncate evidence or apply incomplete rulings. The existing balanced selection of up to 40 examples is unchanged.
- Download requires a click on the visible setup page. Readiness checks never initiate model downloads. Closing setup mid-download is safe but setup may need to be resumed.

## Implementation and verification

`local-model-client.js` creates an offscreen page using `IFRAME_SCRIPTING`. Its same-origin iframe hosts the Prompt API, avoiding dependency on inconsistent service-worker availability across Chrome versions. Only extension runtime messages bridge the worker and model; this needs the `offscreen` manifest permission. No remotely hosted executable code is loaded.

`tests/local-model.test.js` checks readiness, strict JSON parsing, serialized isolated inference, context measurement, overflow rejection, and cleanup. Background tests verify provider-separated caching, no cloud fallback, stale provider cancellation, and malformed response rejection. `CHROME_BIN=/path/to/Chrome-for-Testing node tests/local-model-chrome.test.mjs` verifies real extension/offscreen routing, missing-model errors, and actual user activation on setup. That smoke test uses a model stub after reporting device availability: it does not download weights or establish real inference quality.

References: [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api), [offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [WebLLM extension examples](https://webllm.mlc.ai/docs/user/advanced_usage.html). WebLLM would enable selectable models but adds a packaged runtime, weight distribution, and additional compatibility/testing work; it is outside this initial provider.
