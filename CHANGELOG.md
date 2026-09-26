# Changelog

Notable changes per released version. Versions match `manifest.json`, and a
release is a `v*` tag; see [docs/RELEASING.md](docs/RELEASING.md).

## 0.2.15

- With sharing on, only the pin shortcut (Cmd+Shift+P on Mac, Alt+P on Windows/Linux) pins or unpins tabs. Pins and unpins from Chrome’s tab menu or drags are undone, and a menu-unpinned pin returns to its slot.
- Turn on loading delays by default for YouTube, X/Twitter, Reddit, Substack, and Hacker News. Existing saved site lists are unchanged.
- Close a shared pin without unpinning it, as in Arc: the pin returns at its saved URL in that window, and other windows keep theirs. Unpin to remove a pin everywhere.
- Share pinned tabs across windows by default. Tab access is now granted at install instead of requested from Settings; turn off **Share pins across windows** to keep pins per window.

## 0.2.14

- Add Cmd+Shift+P on Mac and Alt+P on Windows/Linux to pin or unpin the current tab; customize it in Chrome’s extension keyboard shortcuts.
- Keep shared pins tied to their saved URL. Navigating away turns the current page into a regular tab and restores the saved pin without interrupting the page or changing other windows.

## 0.2.13

- Keep posts visible while cloud filtering decisions are pending, preventing allowed posts from collapsing and reappearing on Reddit and other feeds.
- Repair Reddit hide states before the next frame when posts are remounted or their CSS classes are replaced. Ignore late filtering replies for recycled posts.
- Keep blocked X/Twitter rows collapsed during staged rebuilds, including empty wrappers and rebuilds that interrupt a fade. Restore rows when replacement posts or feed modules arrive.

## 0.2.12

- Stop an X/Twitter hide/show loop when hidden posts lose their video player, media captions, text, or promoted label. Keep blocked decisions attached to the post’s permalink across rerenders and remounts; release them for new post IDs, changed filters, and explicit restores.
- Keep a blocked post’s fade from being canceled by media or text changes within the same post.

## 0.2.11

- Support Option/Alt + Right/Left Arrow for video speed changes, alongside the existing bracket shortcuts. Preserve normal arrow-key behavior when no modifier is selected or while editing text.
- Stop Reddit posts from flickering between hidden and visible. A hide decision now stays with the post until settings change, even when hiding it removes the recommendation label or changes which image size Reddit loads.

## 0.2.10

- Prevent filtered X/Twitter posts from flashing back into view when the page replaces their CSS classes, including during fades.
- Preserve row height when a late filtering decision affects a post partly above the viewport, preventing a jump in the reading position.

## 0.2.9

- Add loading delays for habitual sites, with a one-second starting default, a configurable first wait, 1.5× growth after completed waits, a 20-minute cap, and a daily reset at 03:00.
- Add Loading delay checkboxes to each supported site's settings, synchronized with the domain list. Apply new rules to already-open tabs and cover both twitter.com and x.com with either rule.
- Animate countdown progress smoothly, pause while the tab is hidden, and record visits, early exits, resets, waited time, and visits by hour.
- Add optional shared pinned tabs across regular Chrome windows. Preserve pins when a window closes; unpin copies without closing their pages when an individual pin is removed. Keep URLs local and exclude private windows.
- Remember the last pinned-tab order arranged in a regular window and use it when opening new windows.
- Refresh the README, store listing, permission explanations, and screenshots. Record the Gmail inbox queue as future work only.

## 0.2.8

- Add desktop on-device text processing with Chrome's built-in Gemini Nano, explicit setup and availability, and no automatic cloud fallback. Claude remains the default; explicit provider choices are preserved.
- Use the selected model for feed decisions, filter suggestions, and feedback recalibration.
- Add an iPhone Safari extension package with native setup instructions and a reproducible build from shared web sources.
- Add a shared sidebar for review, settings, stats, and filter sets; keep tooltips clear of controls and expose Share ruleset.

## 0.2.7

- Add native X embeds, a responsive post-and-ruling layout, clearer selection, and compact matching popup styling.
- Organize review into Uncategorized, Good rulings, Bad rulings, and Archived; retain judgments and archive unreviewed posts instead of deleting them.
- Add arrow-key navigation and judgments, Cmd/Ctrl+Z undo, typing directly into explanations, Enter to save, and brief judgment confirmation animations.
- Deduplicate posts by canonical status ID and keep popup startup fast without loading bulk review history.
- Use written feedback and Bad rulings to propose and independently test rule revisions; explain outcomes and retain additional rule suggestions with Add, Dismiss, Reconsider, and Undo.
- Save explanation drafts and run recalibration as a recoverable background job, with persistent results, restart recovery, and a clear safe-to-refresh status.

## 0.2.6

- Replace restore/edit controls in review with per-rule Good ruling / Bad ruling feedback and optional explanations.
- Add explicit rule recalibration: bounded balanced examples, withheld examples when available, independent replay, regression rejection, stale-state checks, and undo history.
- Show triggering rules above a tweet-style preview with saved author details, line breaks, media, and quoted text.
- Retain local feedback separately from review history and fail open on incomplete classifier replies.

## 0.2.5

- Simplify interface copy and use a compact black-and-white theme with Fogg-inspired typography and geometry.
- Add a full Recently filtered page with reasons, search, restore, rule editing, and optional image previews. Retain up to 2,000 posts for seven days, within a 6 MB storage cap, and up to 4,000 restore choices.
- Add instant X format filters for reposts, quote posts, and video posts without an API key.
- Add opt-in image analysis for up to two supported post images alongside text.
- Add named filter sets, Quiet browsing and Work presets, export, and selective import in a dedicated page.
- Add Less like this on X, with optional editable Claude suggestions before adding a rule.
- Prioritize visible and upcoming X posts and limit simultaneous classification batches.
- Surf break allows sixteen screenfuls of scrolling between breaks, up from eight.

## 0.2.4

### Fixed

- X/Twitter: pending reviews preserve the feed layout; confirmed matches fade
  out, while removals above the viewport preserve the reading position.
- X/Twitter: recycled posts ignore stale decisions, concurrent reviews share
  requests, and failed or lost requests retry with a cooldown.
- X/Twitter: quoted text, link previews and supplied image descriptions are
  included without changing engagement counts causing new reviews.
- Filtering callbacks are invalidated when settings or credentials change,
  while completed verdicts survive an off/on toggle.
- Consumption Facts records approved posts only when they are in view.
- X/Twitter: only an advertising badge marks an ad; ordinary post or card
  text saying "Ad" does not. Following labels are matched case-insensitively.
- Reddit and Hacker News classification excludes changing scores and ages.
- Consumption Facts deduplicates posts seen in multiple tabs.

### Added

- Browser regression coverage for pending layouts, positioned feed cells,
  recycled posts, grouped conversations, late responses and request failures.
- ESLint and Prettier, with `npm run lint`, `npm run format` and
  `npm run verify`. `npm test` aliases `npm run check`.

## 0.2.3

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
