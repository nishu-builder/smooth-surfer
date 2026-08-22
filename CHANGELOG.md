# Changelog

Notable changes per released version. Versions match `manifest.json`, and a
release is a `v*` tag; see [docs/RELEASING.md](docs/RELEASING.md).

## 0.2.3 — not yet released

Everything below is on `main` and ships when `v0.2.3` is tagged.

### Fixed

- X/Twitter: classification verdicts are held per post rather than per
  timeline cell. A grouped conversation cell holds several posts, and one
  shared slot let them overwrite each other's pending request, re-ask on
  every scan, and flip the cell between hidden and visible.
- X/Twitter: posts with no text of their own (media, cards) are classified
  on their stable parts. Reading the whole article folded in view counts and
  the relative timestamp, so a post already on screen was re-sent for review
  and hidden again every few seconds.
- X/Twitter: a scan can no longer be starved. A timeline that mutates and
  scrolls faster than the debounce window used to push the scan out
  indefinitely, which stalled settings changes and the deep-scroll break.
- X/Twitter: a post whose verdict never arrives is shown again after ten
  seconds instead of staying hidden.
- X/Twitter: only the Promoted badge marks an ad. A post whose own text was
  exactly "Ad" was hidden as advertising.
- X/Twitter: the Following preference matches tab labels case-insensitively,
  so a timeline rendering "For You" no longer defeats it.
- Reddit and Hacker News are classified on the post's own words and the
  comment body, leaving scores, comment counts and ages out of the
  classification key.
- The Consumption Facts label counts a post once when it is open in two tabs.

### Added

- ESLint and Prettier, with `npm run lint`, `npm run format` and
  `npm run verify`. `npm test` aliases `npm run check`.

## 0.2.2

### Added

- Consumption Facts label: a nutrition-facts-style breakdown of the emotional
  ingredients in the posts seen each day.

### Changed

- README, store listing, icons and store screenshots refreshed.
- Release workflow hardened: publishing is gated on a deployment approval and
  refuses a tag that is not on `main`, the token is read-only, and actions are
  pinned by SHA.
- Dependabot watches GitHub Actions.

## 0.2.1

### Added

- Video speed keys take a configurable modifier (Alt by default), and a
  double-tap shortcut opens the popup.

### Fixed

- Chrome smoke test runs cross-platform and survives headless CI.
