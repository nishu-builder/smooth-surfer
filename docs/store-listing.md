# Chrome Web Store listing

Source copy for the Chrome Web Store developer dashboard, updated for 0.2.15.
Package publishing does not update the long description, privacy answers, or
screenshots automatically; apply those fields in the dashboard before submission.

## Store listing tab

**Name:** Smooth Surfer

**Summary (132 chars max):**
Calmer feeds, a pause before habit sites, and pinned tabs that follow you into every Chrome window.

**Description:**

Smooth Surfer makes the web a little less sticky.

Cleaner feeds
Hide recommendations, Shorts, ads, trends, and engagement counts on YouTube,
X, Reddit, Substack, and Hacker News. Turn each one on or off per site.

Filter posts with your own rules
Describe what you don't want to see in plain English, and Smooth Surfer hides
matching posts. Use Claude with your own Anthropic API key, or Chrome's
on-device model. Review what was hidden and refine your rules from there.

A pause before habit sites
Distracting sites open behind a short countdown that grows each time you visit
that day. It's on for the built-in sites by default, and you can add any other.

Pinned tabs in every window
Pin a tab with Cmd+Shift+P (Alt+P on Windows/Linux) and it appears in every
Chrome window. Pins stay at their saved page, and closing one brings it back
instead of losing it.

No account, no analytics, and no Smooth Surfer servers. Open source:
https://github.com/nishu-builder/smooth-surfer

**Category:** Productivity → Workflow & Planning

**Language:** English

## Privacy tab

**Single purpose description:**
Smooth Surfer helps users browse with fewer distractions through feed cleanup,
loading delays on habit-forming sites, and consistent access to pinned pages.

**Permission justifications:**

- `storage`: Saves settings with `chrome.storage.sync`; stores API keys,
  review previews, feedback, filter sets, visit-delay statistics, and shared
  pinned URLs locally. Temporary pin-to-tab bindings and initial load/redirect
  state use `chrome.storage.session`.
- `alarms`: Resumes requested rule-recalibration jobs after worker suspension
  or a browser restart.
- `offscreen`: Hosts the bundled page that accesses Chrome's built-in model for
  optional on-device processing. It does not silently enable cloud processing.
- `tabs`: Powers Share pins across windows (on by default) by reading
  pinned-page URLs and maintaining copies across regular windows. Unused when
  the user turns sharing off.
  Only pinned HTTP/HTTPS URLs are retained locally; private windows are excluded.
- `api.anthropic.com` host permission: Sends feed text and optional supported
  public image URLs to Anthropic only when Claude is selected and the user's key
  is configured, or when that provider is used for requested suggestions or
  recalibration. Powers filtering and Consumption Facts in cloud mode.
- Content scripts on `<all_urls>`: Apply selected cleanup effects, loading-delay
  overlays, video-speed keys, scrolling breaks, and the settings shortcut.
  On-device model requests process text locally. Claude requests use the user's
  own key. Review images, avatars, and native X embeds load from their providers.

**Remote code:** No. Extension code is bundled. Cloud classification calls the
Anthropic API; optional on-device inference uses Chrome's built-in model APIs.
Native X embeds run in a separate cross-origin frame without extension API access.

**Data usage disclosures:**

- Website content: feed text and optional public image URLs support filtering,
  Consumption Facts, suggestions, and recalibration. Claude mode sends relevant
  content to Anthropic with the user's key. On-device text processing stays local.
- Web history: only user-selected pinned-page URLs are retained for cross-window
  pins, on this device. Visit-delay statistics record listed domains and counts,
  not full visited URLs or page contents. There is no general browsing-history log.
- The Anthropic API key is stored locally and sent only to `api.anthropic.com`.
- Review history retains up to 2,000 posts within 6 MB; recent posts expire after
  seven days and archived posts have no time cutoff. Feedback is stored separately,
  up to 2,000 judgments within 2 MB. Visit-delay statistics retain 30 days.
- No analytics, sale of data, advertising transfers, or unrelated data use.

**Privacy policy URL:**
https://github.com/nishu-builder/smooth-surfer/blob/main/PRIVACY.md

## Store assets

- Icon: `icons/icon128.png` (128x128).
- Screenshots: `docs/store-assets/shot-1-menu.png` through `shot-5-menu.png`
  (1280x800): YouTube controls, other site controls, loading delays and pinned
  tabs, filtering and cross-site controls, and Consumption Facts.
- Regenerate screenshots with `npm run screenshots` using Chrome for Testing.

## Submission checklist

1. Keep versions in `manifest.json`, `package.json`, and `package-lock.json` equal.
2. Run `npm run check` and `npm run package`.
3. Update the dashboard description, privacy answers, and screenshots above.
4. Land the release on main, push its version tag, and approve the existing
   chrome-web-store deployment to upload and submit the package for review.
5. Verify the upload/publish result and check the public store version separately;
   submission success does not mean Google's review has completed.
