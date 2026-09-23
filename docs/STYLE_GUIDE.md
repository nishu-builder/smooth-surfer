# Product style

Smooth Surfer’s extension pages use the [Beeper Muse](https://github.com/nishu-builder/beeper-muse) visual language: warm cream surfaces, dark outlines, monospace headings, readable sans-serif text, and restrained lime accents. Use the same treatment for the visit-delay splash.

## CSS tokens

Load `src/ui-theme.css` after `src/theme.css` on extension-owned pages. Keep the base theme and its host-page geometry unchanged; do not inject the UI stylesheet into websites. The visit-delay overlay defines matching tokens inside its shadow root.

| Token | Value | Use |
| --- | --- | --- |
| `--ss-canvas` | `#FFFDF4` | Page background |
| `--ss-paper` | `#FFFEF9` | Cards and fields |
| `--ss-gray` | `#F4F4E8` | Supporting surfaces |
| `--ss-ink`, `--ss-action` | `#20221E` | Text and dark outlines |
| `--ss-muted` | `#64655B` | Supporting text |
| `--ss-line` | `#D7D7C9` | Dividers and card borders |
| `--ss-accent` | `#E3FF73` | Primary actions and selected controls |
| `--ss-focus` | `#355DAD` | Keyboard focus |
| `--ss-radius` | `6px` | Controls and panels |

## Typography and layout

- Use bundled system font stacks: monospace for headings, navigation, buttons, and metadata; sans serif for setting labels and explanatory text. No network fonts.
- Use bold headings and 13–15px reading text. Supporting text in the popup can be 12px. Keep readable line heights and visible keyboard focus.
- Use thin borders, 6–8px corners, and a small solid offset shadow for the main card or selected area. Avoid gradients, decorative imagery, and motion.
- Use lime sparingly with dark text. Secondary and destructive actions keep a paper background. Feedback retains green/red state colors.
- The popup is 360px wide. Open the current site’s native disclosure and collapse other sites. Preserve disclosure state while saving settings. All controls remain accessible; keep the page links at the top.
- Full-page settings keep site controls expanded. At wider sizes, split model configuration and rules into two columns within the Content filter card.
- Full pages share a 216px sidebar for Review rulings, Settings, Stats, and Filter sets. At 700px or narrower, use a top navigation row and a single content column. Use 44px touch targets on mobile.
- Review cards put the saved or native post first and judgments second. Columns depend on available content width; preserve the sticky keyboard bar, selected-ruling marker, and existing feedback interactions.
- Stats distinguish hiding-action counts from consumption facts. Keep the nutrition-label treatment readable.
- Setup and visit-delay screens use one centered outlined card, clear status, and a small number of actions. Preserve mobile wrapping and the countdown’s existing behavior.

## Copy

Use sentence case and concrete actions: “Good ruling,” “Recalibrate rules,” “Add,” “Check again.” Keep explanations that affect a choice: data sharing, rule scope, persistence, and recovery. Avoid slogans and redundant introductions. Use consistent terms across the popup, settings, and store listing.
