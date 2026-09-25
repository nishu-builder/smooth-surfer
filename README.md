# Smooth Surfer

[![CI](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/cgmineplcpnmdfokdblnnapnbpknfghe?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/smooth-surfer/cgmineplcpnmdfokdblnnapnbpknfghe)

<img src="icons/icon1024.png" alt="Smooth Surfer icon" width="420">

Smooth Surfer reduces feed noise and habitual site checking. Clean up YouTube, X/Twitter, Reddit, Substack, and Hacker News; add a loading delay before distracting sites; and keep pinned pages available across Chrome windows. The source also includes an iPhone Safari extension package.

Loading delays, shared pinned tabs, and the basic cleanup switches run locally without an API key. Start with **Loading delay** under a site’s settings or **Share pins across windows** in the Pinned tabs section.

Choose Claude Haiku 4.5 with an Anthropic key or on-device processing with Chrome's built-in Gemini Nano. Both filter X/Twitter, Reddit, Substack, and Hacker News against your criteria. Claude is the default on desktop and Safari; explicit saved provider choices are preserved. Gemini Nano is an experimental opt-in. On-device processing requires a supported desktop Chrome installation and model setup; it does not silently fall back to Claude. Local mode processes text and supplied image descriptions. Image analysis is available with Claude.

On X/Twitter, posts stay in place while classification runs. Confirmed matches
fade out, and removals above your reading position keep their space until you
scroll back, avoiding sudden jumps. Cached decisions apply immediately when a
post reappears. By default, filtering reads post text, link previews, and supplied
image descriptions. **Analyze images** optionally includes up to two public post
images from X, Reddit, or Substack in each review. It is off by default and adds
API cost and latency. If classification fails,
posts remain visible and retries are spaced out.

Open **Review rulings** at the top of the popup to judge each triggering rule in
a full tab. Mark **Good ruling** or **Bad ruling**, optionally explaining why.
The post appears first, with its rulings underneath and dividers between posts.
X posts use native embeds; saved copies remain available when an embed cannot load.
Use Left for Bad, Right for Good, Up/Down to move between rulings, and Cmd/Ctrl+Z
to undo. Start typing to add an explanation to the selected ruling; Enter returns
to navigation. A brief green or red confirmation fades before the ruling leaves
its inbox. Votes save your judgment; they do not restore the post or change a
rule immediately.

**Recalibrate rules** uses your selected model to propose revisions and replay saved
examples. Corrections and written explanations can be used without both label
classes. Revisions must improve the replay without introducing regressions;
written feedback can also justify clearer wording when both versions pass.
Results show the proposed wording, per-example decisions, and any additional
rules suggested by your instructions. Suggestions stay available across sessions,
with controls to add, dismiss, reconsider, or undo an addition.
Enter saves edited explanations; starting
recalibration saves remaining drafts on judged rulings. The last 30 revisions support undo. This is
calibration against your examples, not a guarantee of future accuracy. See
[the algorithm](docs/CALIBRATION.md).

Review keeps up to 2,000 recent and archived posts within 6 MB. Recent posts expire
after seven days; archived posts have no time cutoff. **Archive unreviewed** moves
pending rulings to **Archived**, where you can judge them or return them to the queue. Feedback is retained
separately, up to 2,000 judgments within 2 MB, so archiving does not erase
what you taught the filter. Both good and bad examples remain visible after the
seven-day history expires. X embeds and media load lazily from their original hosts.

On X, the **Less like this** button beside a post's actions opens a rule editor.
Write your own rule or choose **Suggest filters** to ask the selected model for suggestions.
You can edit a suggestion before adding it; suggestions never change your rules
automatically. New rules apply wherever content filtering is enabled.

X prioritizes the visible feed and the next two screens, with at most two
classification batches running at once. Surf break now allows 16 screens of
scrolling between breaks.

X also has instant switches for reposts, quote posts, and video posts. These
work without an API key. Filtered formats appear in Review rulings. Their judgments are saved, but
recalibration only rewrites AI content rules; format switches remain in the popup. Repost detection uses X's
English repost label or a supported repost marker.

Open **Filter sets** from the popup or review page to save named sets, preview
Quiet browsing and Work presets, or share a set as JSON. Import previews every
rule and format switch; only checked selections are added, preserving existing
rules. Up to 20 sets stay on this device. Sets exclude API keys, image analysis,
and unrelated settings.

The popup also includes:

- A Consumption Facts label: a nutrition-facts-style breakdown of the emotional ingredients (outrage, joy, humor, fear, curiosity/beauty, memes, polls) in the posts you actually saw today. It uses the same selected-model classification calls as filtering.
- Comment hiding for YouTube and Reddit.
- Video speed keys on any site: `Alt+Right` or `Alt+]` faster, `Alt+Left` or `Alt+[` slower, and `Alt+\` reset. Alt is Option on Mac. The modifier is configurable (Alt/Ctrl/Shift/Cmd, or no modifier) in the popup. With no modifier, use the bracket and backslash keys; plain arrows keep their normal page behavior.
- A settings shortcut: press `Cmd+Shift+S` (`Ctrl+Shift+S` on Windows/Linux) twice quickly to open the popup.
- [Loading delays](#loading-delays) with a one-second starting default, per-site checkboxes, a smooth countdown, and visit statistics.
- [Shared pinned tabs](#cross-window-pinned-tabs) that keep their saved URL across regular Chrome windows. Pin or unpin with `Cmd+Shift+P` (`Alt+P` on Windows/Linux).
- A focus schedule that runs effects only during chosen hours.
- A stats panel counting what was hidden per site today and this week.
- Settings export/import as JSON (the API key is never exported).

## Loading delays

Turn on **Loading delay** alongside the other controls for YouTube, X/Twitter,
Reddit, Substack, or Hacker News. These checkboxes and the **Visit delay** domain
list stay in sync. Add any other domain in that list. Either `twitter.com` or
`x.com` covers both names, including redirects. New rules apply to tabs that are
already open.

The first wait defaults to **1 second**, configurable from 1 to 300 seconds.
Existing saved durations are preserved. Each completed wait increases the next
wait that day by 1.5×, rounded to whole seconds, up to 20 minutes. The smooth
progress bar and countdown pause while the tab is hidden. Leaving early records
an abandoned attempt without advancing the next wait.

A tab that finishes keeps its pass across reloads. It waits again after spending
30 minutes in the background; a new tab starts a fresh visit. **Reset count**
returns to the first wait, and counts reset at 03:00 local time. Stats shows page
loads, completed waits, early exits, resets, time waited, and visits by hour.

## Cross-window pinned tabs

Enable **Share pins across windows** in Settings and allow the optional tab
permission. Pin or unpin the current tab with **Cmd+Shift+P** on Mac or
**Alt+P** on Windows/Linux, or use Chrome’s normal **Pin** tab-menu action.
Change the shortcut in `chrome://extensions/shortcuts` if needed. The shortcut
also works as ordinary Chrome pinning when sharing is off.

Existing and newly pinned HTTP/HTTPS pages appear as inactive pinned copies in every
regular Chrome window, including windows opened later. Pins remember the exact
URL you pinned. Navigating to a different URL (including a path, query, or fragment
change) turns that page into a regular tab, preserving its history and current
state, and restores an inactive pin at the saved URL. Other windows keep their
pins. Reloading the same URL leaves it pinned. A restored pin’s initial redirects
are allowed to finish before later navigation splits it into a regular tab.

Reorder pinned tabs by dragging them in any regular window. New windows use the
last order you arranged; existing windows keep their own current arrangement.
The saved order survives a browser restart.

Closing a window keeps the saved pins. Unpinning or closing an individual pin
removes it from the shared list and unpins its other copies without closing their
pages. Disabling sharing leaves existing tabs alone. Private windows are excluded;
the saved URLs stay on this device. Pinned tabs appear as small icons at the far
left of Chrome’s tab bar.

## Install

Most people want the published build from the Chrome Web Store — it stays up to
date automatically:

**[Install Smooth Surfer from the Chrome Web Store →](https://chromewebstore.google.com/detail/smooth-surfer/cgmineplcpnmdfokdblnnapnbpknfghe)**

The store build is packaged from this repository; see
[docs/RELEASING.md](docs/RELEASING.md) for how a tagged commit becomes a store
release.

After installing, pin Smooth Surfer from Chrome's extensions menu. To enable
Haiku filtering, open the toolbar popup and save an Anthropic API key. Alternatively,
choose on-device processing in Settings and complete model setup. Until the
selected provider is ready, content filtering leaves posts visible.
See [on-device setup and limits](docs/LOCAL_MODELS.md).

The iPhone target operates on websites in Safari, not native apps. It initially
uses Claude for AI filtering; Chrome's built-in model is unavailable on iOS.
Building the iPhone package does not install it from the App Store. See the
[iPhone build instructions](docs/iphone.md) and [platform scope](docs/PLATFORM_SCOPE.md).

## Build from source

To run the extension straight from this repo (for development, or to use an
unreleased version):

```sh
git clone git@github.com:nishu-builder/smooth-surfer.git
cd smooth-surfer
```

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `smooth-surfer` folder.
5. Pin Smooth Surfer from Chrome's extensions menu.

After changing files or pulling updates, reload the extension on
`chrome://extensions`, then refresh open target tabs.

## Checks

The extension itself has no dependencies and ships as plain source, so the
tests run with nothing installed:

```sh
npm run check   # syntax checks, unit tests, and the Chrome smoke test
```

Linting and formatting need the dev dependencies (`npm ci`):

```sh
npm run lint          # ESLint
npm run format        # Prettier, writing changes
npm run verify        # lint + format check + npm run check
```

Prettier covers JavaScript and JSON; HTML, CSS and Markdown stay
hand-formatted.

## Product design

Follow the [product style guide](docs/STYLE_GUIDE.md) for interface copy and interactions.

Review has three inboxes: Uncategorized, Good rulings, and Bad rulings. Categorizing a ruling moves it out of the current queue; other uncategorized rules on the same post remain. Counts refer to rulings. Undo restores the prior category and selects that ruling.

Recalibration runs in the background and saves its progress. You can refresh or
close the review page once it says **Safe to refresh**. Closing Chrome pauses work;
it resumes when Chrome reopens. Explanation drafts and the latest results survive
reloads. The judgment buttons mirror the keyboard: **← Bad ruling** and
**Good ruling →**.

Full-page Review rulings, Settings, Stats, and Filter sets share a sidebar. Open
any page from the popup, then switch sections without opening more tabs. Stats
shows hidden-item totals for today and the past seven days, broken down by site
and recorded reason, with consumption facts below. Settings share the same
controls and saved values as the toolbar popup.

Future work is tracked in [TODO.md](TODO.md). The Gmail inbox queue is planned and is not part of this release.
