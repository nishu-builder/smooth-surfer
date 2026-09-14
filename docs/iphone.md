# iPhone and iPad

Smooth Surfer has an iOS 16+ containing app and a Safari Web Extension. It uses the same filtering, settings, review, feedback, recalibration, and stats source as the Chrome extension. It works on websites opened in Safari, not inside the native X, YouTube, Reddit, or other apps. Mobile website markup can differ; validate each supported website on a device before advertising full mobile parity.

## Build

The packaging test and staging step run anywhere Node.js runs:

```sh
node tests/ios-package.test.mjs
node scripts/prepare-ios.mjs
```

Building the native app requires a Mac with full Xcode selected, the iOS platform installed, and Node.js:

```sh
node scripts/build-ios.mjs
```

This stages the extension into `dist/ios/extension`, uses Apple's Safari Web Extension converter to create `dist/ios/project/Smooth Surfer/Smooth Surfer.xcodeproj`, overlays the maintained Swift onboarding and native handler, then builds an unsigned Simulator app. It never changes the selected Xcode, downloads platforms, accesses signing credentials, or submits an app.

Other modes:

```sh
node scripts/build-ios.mjs --generate-only
node scripts/build-ios.mjs --device
node scripts/build-ios.mjs --generate-only --bundle-id com.yourcompany.smoothsurfer --build-number 2
```

`--device` is an unsigned device build for compile validation, not an installable or distributable IPA. The default bundle identifier `com.smoothsurfer.app` is a development default; use an identifier owned by the publishing team for distribution. The extension identifier is the app identifier plus `.extension`. Both targets inherit the Chrome manifest version, a separately incrementable iOS build number, and the iOS 16 deployment target. iPad uses the same app.

The generated project is disposable. Edit native code under `ios/`, shared extension code under `src/` and root HTML, and mobile-only CSS under `ios/Web/`. The generated project re-stages shared source and native templates on every Xcode build. Regenerate the project after changing root HTML filenames, manifest version, native project structure, bundle identifiers, or build number. Do not edit generated source or store signing credentials in this repository. Regenerating resets manual project signing selections.

Apple's converter can change its project format with Xcode updates; generation fails explicitly if expected targets are absent. CI should run the unsigned Simulator build on a Mac runner with an iOS Simulator platform installed. A generated project from Xcode 16.4 validates compatibility with the older deployment target, but App Store Connect submissions currently require [Xcode 26 or later and the iOS 26 SDK](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).

## Enable and use

1. Install the signed app from Xcode or TestFlight.
2. In iOS Settings, open Apps → Safari → Extensions → Smooth Surfer. On iOS 16–17, Safari is directly in Settings.
3. Enable the extension and grant access to the websites to filter. Cloud AI also needs permission for `api.anthropic.com`.
4. Open a supported website in Safari. Open Safari's page menu, select Smooth Surfer, and open Settings to enter an Anthropic API key and choose rules.
5. Review rulings, Settings, Stats, and Filter sets open as extension pages in Safari tabs. Touch controls have larger targets and feedback fields avoid iOS focus zoom.

The containing app shows these instructions. Its **Open app settings** button uses Apple's supported app-settings URL; it does not pretend to jump directly to Safari's extensions pane. API keys stay in the extension's local storage. The native container neither reads them nor logs extension messages.

Chrome's Gemini Nano/offscreen runtime is unavailable in Safari and is not a mobile on-device implementation. Safari packaging removes the Chrome-only `offscreen` permission; runtime capability detection reports the local option as unavailable. Selecting a local provider must never silently send posts to a cloud model. Use Anthropic explicitly on iPhone.

Rules, review history, and feedback belong to this Safari profile and do not automatically sync with Chrome. Safari may suspend extension workers when the browser is backgrounded. Recalibration checkpoints are stored, and opening Review rulings resumes the job; timers are not a promise that work continues while the phone is locked. Successfully saved feedback is safe to refresh. Keep the existing saved-state indicator as the source of truth while a write is pending.

## Compatibility boundaries

- Manifest V3 service worker, `storage`, `alarms`, runtime messages, tabs, and the Chrome callback namespace are shared with Safari. No desktop native bridge is required.
- Content-script match patterns are also added to Safari's `host_permissions` so site access is explicit. Safari still controls which sites the user grants.
- Popup and full-page UI load bundled scripts. The native host shows SwiftUI onboarding; it does not render extension pages in a WKWebView, which would lack extension APIs.
- X embeds and saved media still need network access to their original hosts. Saved copies remain available if an embed fails.
- Keyboard shortcuts work with a connected hardware keyboard. All review actions also have touch controls.
- YouTube mobile has different DOM components and is not guaranteed to support every desktop cleanup toggle. X, Reddit, Substack, and Hacker News need signed-device acceptance testing too.

## Device acceptance and distribution

Before TestFlight, test on an iPhone and iPad with a signed build:

- Enable/disable the extension; deny, then grant website/API access and confirm the UI gives useful feedback.
- Verify X filtering and deduplication while scrolling, navigating, and resuming Safari. Check a format filter without an API key and an AI rule with one.
- Open each workspace tab, save settings, submit good/bad feedback with an explanation, undo, archive, and refresh to verify persistence.
- Start recalibration, background/lock the phone, reopen Review rulings, and confirm checkpoint recovery without duplicate changes.
- Check portrait/landscape, the onscreen keyboard, font scaling, and minimum-width layouts. Verify mobile YouTube, Reddit, Substack, and Hacker News independently.
- Verify no cloud requests occur while a local-only configuration is selected, and that the unavailable local model is clearly explained.

Distribution then requires an Apple Developer team, app/extension bundle IDs and signing, an App Store Connect record, current supported Xcode/SDK, privacy disclosures, screenshots, and App Review. Choose the team for **both** targets in the generated project, archive for a physical iOS destination, validate, then upload through Xcode Organizer. A Chrome Web Store release does not publish the iPhone app. This implementation does not create an App Store record, enroll an account, or upload a build.

Apple references: [Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions), [Safari compatibility](https://developer.apple.com/documentation/safariservices/optimizing-your-web-extension-for-safari), [website permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions).
