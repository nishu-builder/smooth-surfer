# Chrome Web Store listing draft

Copy-paste source for the Chrome Web Store developer dashboard. Update as the
extension changes.

## Store listing tab

**Name:** Smooth Surfer

**Summary (132 chars max):**
Hide ads, recommendations, Shorts, and comments. Filter unwanted posts on X, Reddit, Substack, and Hacker News.

**Description:**

Smooth Surfer filters unwanted posts and reduces distractions. Manage settings
in the popup and review filtered posts in a separate tab. Optional AI filtering
uses Claude with your API key.

Per-site cleanup:

- YouTube: grayscale thumbnails, hide recommendations, hide/block Shorts,
  hide games, live chat, end screens, engagement stats, and comments;
  disable autoplay.
- X / Twitter: hide ads and trends, and prefer the Following timeline (you
  can still switch to For You). Optional switches instantly hide reposts, quote
  posts, or video posts, without an API key.
- Reddit: hide promoted posts, "communities you might like" modules, and
  comment threads.
- Substack: hide recommendation modules.
- Hacker News: hide story scores.
- Everywhere: soften distracting elements, pause after deep scrolling, and
  control video speed from the keyboard (Alt+] faster, Alt+[ slower, Alt+\
  reset; modifier configurable). Open the popup with a Cmd/Ctrl+Shift+S
  double-tap.

Settings:

- Review rulings: see triggering rules above each post. Mark good or bad
  rulings and optionally explain why. Recalibrate rules proposes changes and
  applies them only after they pass saved examples; revisions support undo.
  Review history stays local (up to 2,000 posts / seven days / 6 MB). Feedback
  stays separately (up to 2,000 judgments / 2 MB). Media loads lazily.
- Filter sets: save named sets, use presets, share JSON files, and choose
  which rules to import. API keys and image analysis are excluded.
- Focus schedule: run effects only during the hours you choose, including
  overnight windows.
- Stats: see how many items were hidden per site today and this week.
- Backup: export and import your settings as JSON (your API key is never
  included).

Optional AI filtering (off by default): if you save your own Anthropic API
key, Smooth Surfer can hide posts on X, Reddit, Substack, and Hacker News
that match filter criteria you write in plain English (e.g. engagement bait,
hashtag spam, FOMO hype), using Claude Haiku. The same classification powers
Consumption Facts, a nutrition-label-style daily summary of the emotional
ingredients (outrage, joy, humor, fear, curiosity, memes, polls) in the posts
you actually saw. Without a key, no feed text ever leaves your browser and
both features stay off. Analyze images is separately opt-in: it includes up to
two supported public post images per classification, adding cost and latency.
On X, Less like this opens an editable rule with optional Claude suggestions.

No Smooth Surfer account or analytics. Open source:
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
  `chrome.storage.local`), plus recent filtered-post previews, image URLs, restore choices, rule judgments, explanations, revision history, and named filter sets locally.
- `api.anthropic.com` host permission: Used only when the user saves their own
  Anthropic API key, to classify visible and upcoming feed text against the user's filter
  criteria, optionally analyze supported post images when separately enabled, compute the Consumption Facts label, suggest editable filter rules, and recalibrate rules from labeled examples when requested.
- Content script on `<all_urls>`: Powers every on-page effect the user can
  toggle — the per-site cleanups on YouTube, X/Twitter, Reddit, Substack, and
  Hacker News (ads, recommendations, Shorts, comments, scores) and the
  cross-site effects (graying distracting media, the deep-scroll pause, video speed keys, and the settings
  shortcut). Page content is read locally; nothing is transmitted except when
  the user enables AI filtering or requests filter suggestions, which send post text and optionally supported image URLs to Anthropic using their own key. Review images and avatars load from their original providers.

**Remote code:** No, I am not using remote code. (The extension calls the
Anthropic REST API for text classification but does not fetch or execute
code.)

**Data usage disclosures:**

- Collects "Website content" (visible and upcoming feed text), used only for the app's
  core functionality (AI content filtering, the Consumption Facts label, and requested filter suggestions),
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
