# Chrome Web Store listing

Source copy for the Chrome Web Store developer dashboard, updated for 0.2.14.
Package publishing does not update the long description, privacy answers, or
screenshots automatically; apply those fields in the dashboard before submission.

## Store listing tab

**Name:** Smooth Surfer

**Summary (132 chars max):**
Filter distracting feeds, add loading delays to habitual sites, and share pinned tabs across Chrome windows.

**Description:**

Smooth Surfer helps you browse with less feed noise and less habitual checking.
Clean up distracting feeds, add a brief pause before visiting selected sites,
and keep your pinned pages available across Chrome windows.

Loading delays:

- Turn on Loading delay alongside a site's other settings, or add any domain
  to the Visit delay list. Both controls stay in sync.
- Start with a one-second wait by default, or choose a first wait from 1 to
  300 seconds. Each completed wait makes the next one 1.5 times longer,
  rounded to whole seconds and capped at 20 minutes.
- Watch a smooth countdown that pauses while the tab is hidden. Leaving early
  does not increase the next wait. Reset the count at any time; daily counts
  restart at 03:00 local time.
- Either twitter.com or x.com covers both sites, including redirects. New rules
  apply to already-open tabs. A completed tab keeps its pass across reloads
  until it has been in the background for 30 minutes.
- See visits, completed waits, early exits, resets, time waited, and visits by hour.

Shared pinned tabs:

- Enable Share pins across windows and allow optional tab access. Existing and
  new pinned web pages appear in every regular Chrome window, including new ones.
- Pin or unpin the current tab with Cmd+Shift+P on Mac or Ctrl+Shift+P on
  Windows/Linux. Customize the shortcut in Chrome's extension keyboard shortcuts.
- Shared pins keep the exact URL you saved. Navigating away moves your current
  page into a regular tab and restores the saved pin, preserving your page state
  and browsing history. Other windows keep their pins.
- Drag pinned tabs into your preferred order; new windows preserve the last
  arrangement you made.
- Closing a window keeps your shared pins.
  Unpinning or closing an individual pin unpins other copies without closing them.
- Private windows are excluded. Saved pin URLs stay on this device.

Per-site cleanup:

- YouTube: hide recommendations, Shorts, games, live chat, end screens,
  engagement stats, and comments; grayscale thumbnails and disable autoplay.
- X / Twitter: hide ads and trends, prefer Following, or instantly hide
  reposts, quote posts, and video posts.
- Reddit: hide promoted posts, recommendation modules, and comments.
- Substack: hide recommendation modules. Hacker News: hide story scores.
- Across sites: soften distractions, pause deep scrolling, and change video
  speed with Alt+Right/Left (or Alt+]/[) and reset with Alt+backslash.
  Alt is Option on Mac; the modifier is configurable. With no modifier, use
  brackets and backslash so plain arrows keep their normal page behavior.

Optional AI filtering:

Write criteria in plain English to filter unwanted posts on X, Reddit, Substack,
and Hacker News. Choose Claude Haiku with your own Anthropic API key, or opt into
experimental on-device text processing with Chrome's built-in Gemini Nano on
supported desktop installations. Claude is the default. On-device mode requires
model setup and never falls back to a cloud provider automatically.

Review rulings shows filtered posts and the rules that matched them. Judge each
ruling, explain corrections, and use Recalibrate rules to test proposed wording
against saved examples. Revisions support undo. Archive unreviewed posts to keep
them for later. On X, Less like this lets you write a rule or request editable
suggestions. Analyze images is a separate opt-in for Claude and adds API cost.

Save and share named Filter sets, schedule when effects run, view hidden-item
statistics and Consumption Facts, and export settings without API keys. Open
settings with a Cmd/Ctrl+Shift+S double-tap.

Loading delays, pinned tabs, and basic cleanup need no API key. No Smooth Surfer
account, backend, or analytics. Open source:
https://github.com/nishu-builder/smooth-surfer

**Category:** Productivity → Workflow & Planning

**Language:** English

## Privacy tab

**Single purpose description:**
Smooth Surfer helps users browse with fewer distractions through feed cleanup,
user-selected loading delays, and consistent access to pinned pages.

**Permission justifications:**

- `storage`: Saves settings with `chrome.storage.sync`; stores API keys,
  review previews, feedback, filter sets, visit-delay statistics, and shared
  pinned URLs locally. Temporary pin-to-tab bindings and initial load/redirect
  state use `chrome.storage.session`.
- `alarms`: Resumes requested rule-recalibration jobs after worker suspension
  or a browser restart.
- `offscreen`: Hosts the bundled page that accesses Chrome's built-in model for
  optional on-device processing. It does not silently enable cloud processing.
- Optional `tabs`: Requested only when the user enables Share pins across
  windows, to read pinned-page URLs and maintain copies across regular windows.
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
