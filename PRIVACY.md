# Privacy

Smooth Surfer does not run a backend service.

Settings are stored with `chrome.storage.sync`. Anthropic API keys are stored with `chrome.storage.local`.

When Claude is selected, `Filter out content` is enabled, and an Anthropic API key is saved, Smooth Surfer may send visible and upcoming feed text to Anthropic for classification. Without that key, cloud content filtering stays disabled.

When on-device processing is selected, feed classification, filter suggestions, and rule recalibration use Chrome's built-in model. Their text is not sent to Anthropic. Chrome manages the initial model download and model availability; local mode never falls back to a cloud provider automatically. This mode processes text and supplied image descriptions, not image pixels. An unavailable or failed model leaves posts visible. Loading websites, native X embeds, and saved media still involves their normal network requests.

The Review rulings page stores text previews, supported image URLs, post links, author labels, filtering reasons, matching rules, and format labels locally using `chrome.storage.local`. It keeps up to 2,000 recent and archived posts. Recent entries expire after seven days; archived entries have no time cutoff. A 6 MB budget may retain fewer exceptionally large entries. Restore choices are stored as up to 4,000 post fingerprints so the original text and image URLs are not needed after its preview expires. History and restore choices are not synced or sent to a Smooth Surfer server. Archive unreviewed moves pending rulings to an Archived inbox; they remain available to judge or return to the queue. Returned posts receive seven more days in the queue. Reviewed examples remain visible. New X entries may also retain the author handle, supported avatar URL, post timestamp, text layout, and quoted-post excerpt.

Choosing Suggest filters in Less like this processes that post's text with the selected model to suggest editable rules. Claude mode sends it to Anthropic using your saved API key; on-device mode processes it locally. Suggestions run only when requested and are not applied until you choose Add filter. Writing a rule yourself does not request suggestions.

Analyze images is off by default and applies only to Claude mode. When enabled alongside AI content filtering and an API key, up to two supported public image URLs per post are sent to Anthropic, which retrieves the images to classify them alongside the text. Supported hosts are pbs.twimg.com/media, i.redd.it, preview.redd.it, external-preview.redd.it, and substackcdn.com. Smooth Surfer does not upload image bytes or retain them. The review page lazily loads saved post images and supported avatars from their original providers, without a referrer.

Format filters for reposts, quote posts, and video posts run locally without an API key. Named filter sets are stored locally, up to 20 sets. Exported sets contain only a name, content rules, and enabled X format filters. API keys, image-analysis consent, and unrelated settings are excluded. Importing previews a set; only your selected rules and formats are added when you apply it.

The visit delay stores the domains you list with your settings and keeps per-day counts for those domains locally with `chrome.storage.local`: page loads, countdowns started, finished, and abandoned, resets, time waited, and the hour of day each countdown started. It keeps 30 days and records no URLs, page titles, or content. A tab that finished its wait keeps a pass in that tab's session storage.

Smooth Surfer does not sell data or collect analytics.

Good ruling / Bad ruling judgments and optional explanations are stored locally, separately from review previews, up to 2,000 judgments within 2 MB. They remain when review history is cleared. Recalibrate rules processes selected labeled examples and explanations with the selected model, then tests proposed revisions in separate classification calls. In Claude mode this sends the examples to Anthropic with the saved API key; supported image URLs may be included when Analyze images is enabled. On-device mode uses text only. Changes that pass the replay are applied automatically; the last 30 rule revisions remain locally for undo. Votes alone do not send an API request or change filtering. Format judgments stay local and are not used to rewrite content rules.

X posts default to native embeds, loaded near the viewport in a cross-origin frame with no access to extension data or APIs. Only the public post ID is supplied to the renderer. This contacts X and its media providers; X’s own privacy policy applies. The frame requests do-not-track mode. Choose Saved copies to avoid loading native embeds. Saved copies remain available if X cannot render a post. Feedback records also retain the saved author, post link, display data, and reasons so both good and bad examples remain reviewable after the seven-day history expires, within the feedback count and byte limits.

Undo keeps up to 50 prior judgment receipts locally within 512 KB so a background-worker restart does not disable undo. These receipts are not sent to Anthropic.

Rule suggestions retain the proposed rule, its source rule, the supporting excerpt
from your explanation, and its pending/added/dismissed status locally. Up to 50
suggestions are kept within 100 KB so they remain available across review sessions.

Recalibration progress, the latest run's results, and pending update recovery data
are also kept on this device. Explanation drafts are saved locally as you type;
unjudged drafts are not sent for recalibration. Jobs resume after Chrome reopens.
An API request interrupted by browser shutdown may be repeated. These local
records are removed when extension data is cleared or the extension is uninstalled.

Cross-window pinned tabs are off by default and request optional tab access when enabled. Only the URLs of pinned HTTP/HTTPS pages are saved in `chrome.storage.local`; tab IDs and their saved URLs are kept in `chrome.storage.session` while Chrome runs. These URLs stay on this device and are not synced or sent to a Smooth Surfer server. Opening a copy in another window contacts the website normally. Private windows are excluded. Disabling sharing clears the saved pin list without closing existing tabs.
