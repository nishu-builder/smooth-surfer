# Smooth Surfer

[![CI](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nishu-builder/smooth-surfer/actions/workflows/ci.yml)

<img src="assets/smooth-surfer-icon.png" alt="Smooth Surfer icon" width="420">

Smooth Surfer is a small Chrome extension for browsing with less feed noise. It hides or softens selected YouTube, X/Twitter, and generic feed distractions from the toolbar popup.

X/Twitter content filtering is disabled unless you save an Anthropic key. When a key is present, Smooth Surfer uses Claude Haiku with your filter criteria.

## Setup

```sh
git clone git@github.com:nishu-builder/smooth-surfer.git
cd smooth-surfer
```

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `smooth-surfer` folder.
5. Pin Smooth Surfer from Chrome's extensions menu.

After changing files or pulling updates, reload the extension on `chrome://extensions`, then refresh open target tabs.

To enable Haiku filtering, open the toolbar popup and save an Anthropic API key. Without a key, `Filter out content` does not hide posts.

```sh
npm run check
```
