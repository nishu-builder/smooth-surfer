# Chrome Web Store listing draft

Copy-paste source for the Chrome Web Store developer dashboard. Update as the
extension changes.

## Store listing tab

**Name:** Smooth Surfer

**Summary (132 chars max):**
Surf with only the waves you want. Hide ads, recommendations, Shorts and
comments, with optional AI filtering on X, Reddit & more.

**Description:**

Smooth Surfer is a small, no-backend extension for browsing with less feed
noise. Everything runs locally in your browser and every rule is a toggle in
the toolbar popup.

Per-site cleanup:

- YouTube: grayscale thumbnails, hide recommendations, hide/block Shorts,
  hide games, live chat, end screens, engagement stats, and comments;
  disable autoplay.
- X / Twitter: hide ads and trends, and prefer the Following timeline (you
  can still switch to For You).
- Reddit: hide promoted posts, "communities you might like" modules, and
  comment threads.
- Substack: hide recommendation modules.
- Hacker News: hide story scores.
- Everywhere: hide sticky/floating video players, soften distracting
  elements, get a gentle "surf break" prompt after deep scrolling, and
  control video speed from the keyboard (Alt+] faster, Alt+[ slower, Alt+\
  reset; modifier configurable). Open the popup with a Cmd/Ctrl+Shift+S
  double-tap.

Stay in control:

- Focus schedule: run effects only during the hours you choose, including
  overnight windows.
- Stats: see how much noise was hidden per site today and this week.
- Backup: export and import your settings as JSON (your API key is never
  included).

Optional AI filtering (off by default): if you save your own Anthropic API
key, Smooth Surfer can hide posts on X, Reddit, Substack, and Hacker News
that match filter criteria you write in plain English (e.g. engagement bait,
hashtag spam, FOMO hype), using Claude Haiku. The same classification powers
Consumption Facts, a nutrition-label-style daily summary of the emotional
ingredients (outrage, joy, humor, fear, curiosity, memes, polls) in the posts
you actually saw. Without a key, no feed text ever leaves your browser and
both features stay off.

No accounts, no analytics, no data collection. Open source:
https://github.com/nishu-builder/smooth-surfer

**Category:** Productivity → Workflow & Planning (or Fun)

**Language:** English

## Privacy tab

**Single purpose description:**
Smooth Surfer reduces feed distractions by hiding or softening ads,
recommendations, and user-selected categories of content on social and news
sites.

**Permission justifications:**

- `storage`: Saves the user's toggle settings (synced via
  `chrome.storage.sync`) and their optional Anthropic API key (local only via
  `chrome.storage.local`).
- `api.anthropic.com` host permission: Used only when the user saves their own
  Anthropic API key, to classify visible feed text against the user's filter
  criteria and compute the Consumption Facts label.
- Content script on `<all_urls>`: Powers every on-page effect the user can
  toggle — the per-site cleanups on YouTube, X/Twitter, Reddit, Substack, and
  Hacker News (ads, recommendations, Shorts, comments, scores) and the
  cross-site effects (hiding sticky/floating video players, graying
  distracting media, the deep-scroll pause, video speed keys, and the settings
  shortcut). Page content is read locally; nothing is transmitted except when
  the user enables AI filtering, which sends visible feed text to their own
  Anthropic key.

**Remote code:** No, I am not using remote code. (The extension calls the
Anthropic REST API for text classification but does not fetch or execute
code.)

**Data usage disclosures:**

- Collects "Website content" (visible feed text), used only for the app's
  core functionality (AI content filtering and the Consumption Facts label),
  only when the user has saved their own API key. Sent to Anthropic's API; not
  sold, not used for unrelated purposes, not transferred for ads or
  creditworthiness.
- The user's Anthropic API key is stored locally via `chrome.storage.local`
  and sent only to `api.anthropic.com`.
- No analytics, no tracking, no sale of data.

**Privacy policy URL:**
https://github.com/nishu-builder/smooth-surfer/blob/main/PRIVACY.md

## Assets needed before submitting

- [x] Icon 128x128 (`icons/icon128.png`)
- [x] Screenshots, 1280x800 (`docs/store-assets/`): four popup-menu panels —
      per-site controls, the AI content filter, cross-site effects, and the
      Consumption Facts label
- [ ] Optional: small promo tile 440x280 (used in some store surfaces)

## Submission checklist

1. Bump `version` in `manifest.json`.
2. `npm run check`
3. `npm run package` → upload `dist/smooth-surfer.zip`.
4. Fill in the listing/privacy fields above in the
   [developer dashboard](https://chrome.google.com/webstore/devconsole).
5. Submit for review. Broad host access (`<all_urls>`) typically triggers
   in-depth review; expect days rather than hours.
