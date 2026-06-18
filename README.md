# Smooth Surfer

[![CI](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/cgmineplcpnmdfokdblnnapnbpknfghe?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/smooth-surfer/cgmineplcpnmdfokdblnnapnbpknfghe)

<img src="assets/smooth-surfer-icon.png" alt="Smooth Surfer icon" width="420">

Smooth Surfer is a small Chrome extension for browsing with less feed noise. It hides or softens selected YouTube, X/Twitter, Reddit, Substack, Hacker News, and generic feed distractions from the toolbar popup.

Content filtering is disabled unless you save an Anthropic key. When a key is present, Smooth Surfer uses Claude Haiku with your filter criteria, batching visible posts into shared classification calls.

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

```sh
npm run check
```
