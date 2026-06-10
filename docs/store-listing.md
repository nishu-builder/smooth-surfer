# Chrome Web Store listing draft

Copy-paste source for the Chrome Web Store developer dashboard. Update as the
extension changes.

## Store listing tab

**Name:** Smooth Surfer

**Summary (132 chars max):**
Surf the web with only the waves you want. Hide ads, recommendations, Shorts,
and AI-classified noise on YouTube, X, Reddit & more.

**Description:**

Smooth Surfer is a small, no-backend extension for browsing with less feed
noise. Everything runs locally in your browser and every rule is a toggle in
the toolbar popup.

Per-site cleanup:

- YouTube: grayscale thumbnails, hide recommendations, hide/block Shorts,
  hide games, live chat, end screens, engagement stats, and comments;
  disable autoplay.
- X / Twitter: hide ads and trends, keep the Following tab selected.
- Reddit: hide promoted posts, "communities you might like" modules, and
  comment threads.
- Substack: hide recommendation modules.
- Hacker News: hide scores.
- Everywhere: hide sticky/floating video players, soften distracting
  elements, get a gentle "surf break" prompt after deep scrolling, and
  control video speed from the keyboard (] faster, [ slower, \ reset).

Stay in control:

- Focus schedule: run effects only during the hours you choose, including
  overnight windows.
- Stats: see how much noise was hidden per site today and this week.
- Backup: export and import your settings as JSON (your API key is never
  included).

Optional AI filtering (off by default): if you save your own Anthropic API
key, Smooth Surfer can hide posts that match filter criteria you write in
plain English (e.g. engagement bait, hashtag spam, FOMO hype) using Claude
Haiku. Without a key, no text ever leaves your browser.

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

- `storage`: Saves the user's per-site toggle settings (synced) and their
  optional Anthropic API key (local only).
- Host permissions (YouTube, X/Twitter, Reddit, Substack, Hacker News):
  Required to detect and hide ads, recommendation modules, Shorts, and other
  feed items on the supported sites.
- `api.anthropic.com`: Used only when the user saves their own Anthropic API
  key, to classify visible feed text against the user's filter criteria.
- Content script on `<all_urls>`: Powers the cross-site features the user can
  toggle — hiding sticky/floating video players, softening distracting
  elements, and the deep-scroll pause — which apply on any site the user
  visits. No data is read or transmitted from these pages.

**Remote code:** No, I am not using remote code. (The extension calls the
Anthropic REST API for text classification but does not fetch or execute
code.)

**Data usage disclosures:**

- Collects "Website content" (visible feed text), used only for the app's
  core functionality (AI content filtering), only when the user has saved
  their own API key. Sent to Anthropic's API; not sold, not used for
  unrelated purposes, not transferred for ads or creditworthiness.
- The user's Anthropic API key is stored locally via `chrome.storage.local`
  and sent only to `api.anthropic.com`.
- No analytics, no tracking, no sale of data.

**Privacy policy URL:**
https://github.com/nishu-builder/smooth-surfer/blob/main/PRIVACY.md

## Assets needed before submitting

- [x] Icon 128x128 (`icons/icon128.png`)
- [ ] At least one screenshot, 1280x800 or 640x400 PNG/JPEG (popup open over
      a cleaned-up feed is ideal; 3-5 screenshots recommended)
- [ ] Optional: small promo tile 440x280 (used in some store surfaces)

## Submission checklist

1. Bump `version` in `manifest.json`.
2. `npm run check`
3. `npm run package` → upload `dist/smooth-surfer.zip`.
4. Fill in the listing/privacy fields above in the
   [developer dashboard](https://chrome.google.com/webstore/devconsole).
5. Submit for review. Broad host access (`<all_urls>`) typically triggers
   in-depth review; expect days rather than hours.
