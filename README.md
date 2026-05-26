# Feed Dock

Chrome Manifest V3 extension for docking per-site feed controls onto YouTube and X/Twitter.

## Effects

- YouTube: grayscale video thumbnails.
- YouTube: hide recommendation surfaces, including the watch-page related column and home recommendation grid.
- X/Twitter: hide promoted feed posts.
- X/Twitter: hide tweets that combine AI language with FOMO, loss framing, or financial-upside language.
- X/Twitter: optional custom phrase list for additional tweet filtering.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Choose `Load unpacked`.
4. Select this folder: `/Users/nishadsingh/repos/feed-dock-extension`.

The dock appears on matching YouTube and X/Twitter pages. Toggle settings are saved with `chrome.storage.sync`.

## Development

Run the local checks:

```sh
npm run check
```
