# Feed Dock

Feed Dock is a Chrome Manifest V3 extension for controlling YouTube and X/Twitter feed effects from the Chrome toolbar.

It is built as a no-bundle extension: clone the repo, load the folder in Chrome, and reload the extension after edits.

## Features

- YouTube: grayscale video thumbnails.
- YouTube: hide recommendation surfaces on watch pages without blanking the home feed.
- X/Twitter: hide promoted feed posts.
- X/Twitter: hide tweets that match your filter criteria.
- X/Twitter: use either local rules or Claude Haiku (`claude-3-5-haiku-20241022`) for semantic classification.
- X/Twitter: optional criteria pills for additional tweet filtering.

## Install From Source

Clone the repo:

```sh
git clone git@github.com:nishu-builder/feed-dock-extension.git
cd feed-dock-extension
```

Load it in Chrome:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Choose `Load unpacked`.
4. Select the cloned `feed-dock-extension` folder.
5. Pin Feed Dock from Chrome's extensions menu if you want the button visible in the toolbar.

Click the Feed Dock button in Chrome's toolbar to open the controls. Toggle settings and criteria are saved with `chrome.storage.sync`.

After pulling updates or editing files, return to `chrome://extensions` and click the reload button on Feed Dock. Refresh any open YouTube or X/Twitter tabs so the updated content scripts run.

## Configuration

The popup includes these controls:

- `Enabled`: master switch for all effects.
- `Gray thumbnails`: grayscales YouTube thumbnails.
- `Hide recommendations`: hides YouTube watch-page recommendation surfaces.
- `Remove feed ads`: hides promoted X/Twitter feed posts.
- `Filter out content`: hides X/Twitter posts that match your criteria.
- `Evaluator`: choose `Local rules` or `Claude Haiku`.

Claude Haiku mode requires an Anthropic API key in the popup. The key is stored in `chrome.storage.local`, and tweet text is sent to Anthropic only when Haiku mode is selected.

## Privacy Notes

- YouTube effects run locally through CSS.
- Local X/Twitter rules run locally in the content script and background worker.
- Claude Haiku mode sends tweet text and your filter criteria to Anthropic for classification.
- Anthropic API keys are not injected into YouTube or X/Twitter pages.

## Development

Run the checks:

```sh
npm run check
```

The check command validates JavaScript syntax, manifest references, filter settings, popup behavior, and a Chrome smoke test for the YouTube selector regression that previously hid the whole home feed.

## Release Readiness

Before making the repo public or packaging for the Chrome Web Store:

- Add extension icons.
- Add screenshots of the popup and effects.
- Add a Chrome Web Store privacy disclosure matching the `Privacy Notes` section.
- Consider replacing direct Anthropic API-key entry with a safer hosted proxy if broader distribution is planned.
