# Smooth Surfer

Smooth Surfer is a Chrome extension for browsing with only the waves you want.

It is intentionally simple: no build step, no bundled dependencies, no analytics, and no page-resident control panel. Load the folder in Chrome, click the toolbar button, and choose the waves you want to smooth out.

## Current Waves

- Grayscale YouTube thumbnails.
- Hide YouTube watch-page recommendation surfaces without blanking the home feed.
- Hide promoted X/Twitter feed posts.
- Filter X/Twitter posts that match your own criteria.
- Choose a local rules evaluator or Claude Haiku (`claude-3-5-haiku-20241022`) for semantic classification.
- Add and remove filter criteria as popup pills.

The project is not meant to stop at these sites. The architecture is intentionally small so new web-smoothing effects can be added without turning the extension into a framework.

## Status

This repo is private today, but the project is structured as if it will be public soon. It is source-loadable for development and personal use. It is not packaged for the Chrome Web Store yet.

## Requirements

- Google Chrome or another Chromium browser with Manifest V3 support.
- Node.js for running checks.
- Optional: an Anthropic API key if you want Claude Haiku classification.

## Install From Source

Clone the repo:

```sh
git clone git@github.com:nishu-builder/smooth-surfer.git
cd smooth-surfer
```

Load it in Chrome:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the cloned `smooth-surfer` folder.
5. Pin Smooth Surfer from Chrome's extensions menu if you want the button visible in the toolbar.

After pulling updates or editing files, click the reload button for Smooth Surfer on `chrome://extensions`, then refresh any open YouTube or X/Twitter tabs.

## Configuration

Open the Smooth Surfer toolbar popup to configure:

- `Enabled`: master switch for all effects.
- `Gray thumbnails`: grayscales YouTube thumbnails.
- `Hide recommendations`: hides YouTube watch-page recommendation surfaces.
- `Remove feed ads`: hides promoted X/Twitter feed posts.
- `Filter out content`: hides X/Twitter posts that match your criteria.
- `Evaluator`: choose `Local rules` or `Claude Haiku`.

Claude Haiku mode requires an Anthropic API key. The key is stored in `chrome.storage.local`. Toggle settings and criteria are stored in `chrome.storage.sync`.

## Privacy

- YouTube effects run locally through CSS.
- Local X/Twitter filtering runs locally in the extension.
- Claude Haiku mode sends tweet text and your filter criteria to Anthropic for classification.
- Your Anthropic API key is never injected into YouTube or X/Twitter pages.
- The extension does not include analytics or telemetry.

## Architecture

```text
manifest.json         Chrome extension manifest
popup.html            Toolbar popup shell
src/popup.js          Popup UI state and events
src/popup.css         Popup styling
src/content.js        YouTube/X content effects
src/background.js     Haiku classification service worker
src/settings.js       Settings defaults and normalization
src/storage.js        Shared Chrome/local storage helpers
src/filter-rules.js   Local X/Twitter filter rules
src/styles.css        Page-injected CSS effects
tests/                Node and Chrome smoke tests
```

There is no bundler. Files are loaded directly by Chrome, which keeps debugging and source loading straightforward.

## Development

Run the full check suite:

```sh
npm run check
```

The check command validates JavaScript syntax, manifest references, settings normalization, local filter behavior, popup behavior, and a Chrome smoke test for the YouTube selector regression that previously hid the whole home feed.

## Troubleshooting

- If changes do not appear, reload the extension on `chrome://extensions` and refresh the target tab.
- If the toolbar popup looks stale, close and reopen it after reloading the extension.
- If YouTube thumbnails are not grayscale, confirm `Enabled` and `Gray thumbnails` are checked, then refresh YouTube.
- If Claude Haiku mode does not filter anything, confirm the API key is saved and that `Evaluator` is set to `Claude Haiku`.

## Release Checklist

Before publishing publicly or submitting to the Chrome Web Store:

- Add extension icons.
- Add screenshots or a short demo.
- Add Chrome Web Store privacy disclosures matching the `Privacy` section.
- Decide whether direct user-provided Anthropic keys are acceptable or whether a hosted proxy is needed.
- Add CI for `npm run check`.

## Contributing

Keep changes small and easy to inspect. Prefer direct browser APIs, plain JavaScript, and tests that cover the real DOM shapes that caused bugs.

## License

MIT. See [LICENSE](LICENSE).
