# Feed Dock

Chrome Manifest V3 extension for controlling YouTube and X/Twitter feed effects from the Chrome toolbar.

## Effects

- YouTube: grayscale video thumbnails.
- YouTube: hide recommendation surfaces, including the watch-page related column and home recommendation grid.
- X/Twitter: hide promoted feed posts.
- X/Twitter: hide tweets that match your filter criteria.
- X/Twitter: use either local rules or Claude Haiku (`claude-3-5-haiku-20241022`) for semantic classification.
- X/Twitter: optional criteria pills for additional tweet filtering.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Choose `Load unpacked`.
4. Select this folder: `/Users/nishadsingh/repos/feed-dock-extension`.

Click the Feed Dock button in Chrome's toolbar to open the controls. Toggle settings and criteria are saved with `chrome.storage.sync`.

Claude Haiku mode requires an Anthropic API key. The key is stored in `chrome.storage.local`, and tweet text is sent to Anthropic only when that mode is selected.

## Development

Run the local checks:

```sh
npm run check
```

The check command includes a real Chrome smoke test for the YouTube selector regression that previously hid the whole home feed.
