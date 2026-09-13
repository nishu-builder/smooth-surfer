# Smooth Surfer

[![CI](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/cgmineplcpnmdfokdblnnapnbpknfghe?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/smooth-surfer/cgmineplcpnmdfokdblnnapnbpknfghe)

<img src="icons/icon1024.png" alt="Smooth Surfer icon" width="420">

Smooth Surfer is a small Chrome extension for browsing with less feed noise. It hides or softens selected YouTube, X/Twitter, Reddit, Substack, Hacker News, and generic feed distractions from the toolbar popup.

AI content filtering is disabled unless you save an Anthropic key. When a key is present, Smooth Surfer uses Claude Haiku 4.5 to filter X/Twitter, Reddit, Substack, and Hacker News against your filter criteria, batching visible and upcoming posts into shared classification calls.

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
Use Left for Bad, Right for Good, Up/Down to move between rulings, and Cmd/Ctrl+Z to undo. Votes save your judgment; they do not restore the
post or change a rule immediately.

**Recalibrate rules** uses your API key to propose revisions and replay saved
examples. Each rule needs at least one good and one bad example. A revision
applies only if it improves the original and passes every selected example.
Otherwise the rule stays as it is. The last 30 revisions support undo. This is
calibration against your examples, not a guarantee of future accuracy. See
[the algorithm](docs/CALIBRATION.md).

Review keeps up to 2,000 posts from seven days within 6 MB. Feedback is retained
separately, up to 2,000 judgments within 2 MB, so clearing history does not erase
what you taught the filter. Both good and bad examples remain visible after the
seven-day history expires. X embeds and media load lazily from their original hosts.

On X, the **Less like this** button beside a post's actions opens a rule editor.
Write your own rule or choose **Suggest filters** to ask Claude for suggestions.
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

- A Consumption Facts label: a nutrition-facts-style breakdown of the emotional ingredients (outrage, joy, humor, fear, curiosity/beauty, memes, polls) in the posts you actually saw today. It rides on the same Haiku classification calls as filtering, so it also needs an Anthropic key.
- Comment hiding for YouTube and Reddit.
- Video speed keys on any site: `Alt+]` faster, `Alt+[` slower, `Alt+\` reset. The modifier is configurable (Alt/Ctrl/Shift/Cmd, or no modifier) in the popup.
- A settings shortcut: press `Cmd+Shift+S` (`Ctrl+Shift+S` on Windows/Linux) twice quickly to open the popup.
- A focus schedule that runs effects only during chosen hours.
- A stats panel counting what was hidden per site today and this week.
- Settings export/import as JSON (the API key is never exported).

## Install

Most people want the published build from the Chrome Web Store — it stays up to
date automatically:

**[Install Smooth Surfer from the Chrome Web Store →](https://chromewebstore.google.com/detail/smooth-surfer/cgmineplcpnmdfokdblnnapnbpknfghe)**

The store build is packaged from this repository; see
[docs/RELEASING.md](docs/RELEASING.md) for how a tagged commit becomes a store
release.

After installing, pin Smooth Surfer from Chrome's extensions menu. To enable
Haiku filtering, open the toolbar popup and save an Anthropic API key. Without a
key, `Filter out content` does not hide posts.

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
