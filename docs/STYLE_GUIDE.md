# Product style

Smooth Surfer shares its visual language with
[beeper-muse](https://github.com/nishu-builder/beeper-muse): warm paper, ink
lines, monospace headings, offset "stamp" shadows, and one electric lime accent.
It should feel like a well-made paper tool, not a generic settings screen.

## Principles

- **Every screen answers “what is happening?” first.** The popup header says what
  Smooth Surfer did today; each section's summary says what is on (“8 of 11 on”,
  “5 sites · 1s first”, “Needs API key”) before you open it.
- **Never let a switch lie.** If a setting is on but cannot run (the AI filter
  without a key or model), say so where the switch is, in the header, and in the
  section summary, and offer both fixes: set it up, or turn it off.
- **Explain inline, not on hover.** Every setting shows a one-line description
  under its label. Tooltips don't work on touch and hide the information that
  helps people decide.
- **Show, then tell.** Prefer a live shortcut key, a numbered “how it works”
  list, or a small illustration over a paragraph.
- **One name per idea.** Use the terms below everywhere: popup, pages, in-feed
  controls, docs, and the store listing.
- **Calm, not scolding.** A light touch of warmth is fine (“Surf break”, “All
  caught up”). No guilt, streaks, or motivational slogans.

## Terms

| Use | Not |
| --- | --- |
| AI filter | Content filter, Filter out content |
| Rules | Criteria, filters (for AI rules) |
| Hidden posts | Review rulings |
| Right call / Wrong call | Good ruling / Bad ruling |
| To review, Right calls, Wrong calls, Archived | Uncategorized, Good rulings, Bad rulings |
| Improve rules | Recalibrate rules |
| Loading delay | Visit delay |
| Pinned tabs, shared across windows | Cross-window pins |

## Tokens

Defined in `src/theme.css`, which is also injected into every web page, so it
holds namespaced variables only. A matching warm dark palette follows
`prefers-color-scheme`.

| Token | Light | Use |
| --- | --- | --- |
| `--ss-canvas` | `#FFFDF4` | Page and popup background (paper) |
| `--ss-paper` | `#FFFEF9` | Cards, inputs |
| `--ss-gray` | `#F4F4E8` | Quiet fills, notices, rule bubbles |
| `--ss-ink` | `#20221E` | Text, borders on important surfaces |
| `--ss-muted` | `#64655B` | Supporting text |
| `--ss-line` | `#D7D7C9` | Dividers, quiet borders |
| `--ss-accent` | `#E3FF73` | Lime: primary actions, switches that are on, the current page |
| `--ss-focus` | `#355DAD` | Focus rings (3px, offset 3px) |
| `--ss-stamp` | `#E7E7DC` | Offset shadow color |
| `--ss-good` / `--ss-bad` / `--ss-warn` | olive / brick / amber | Confirmations and setup warnings, each with a `-soft` fill |

## Type

- Monospace (`--ss-mono`, SF Mono → Consolas → Liberation Mono) for headings,
  section titles, buttons, labels, counts, keys, and small uppercase eyebrows
  (10–11px, 1px letter-spacing). Large headings are bold with tight negative
  tracking.
- Arial/Helvetica (`--ss-sans`) for descriptions, post text, and anything longer
  than a label. Setting names are bold sans so they scan against mono titles.
- Keep post previews at 14–15px with about 1.45 line height.

## Shapes

- Important surfaces (section lists, post cards, dialogs, the countdown) get a
  1px ink border and a hard offset shadow: `3px 4px 0 var(--ss-stamp)`, or
  `5px 6px 0` for the focused or largest element. No blurred shadows.
- Quiet surfaces (notices, inputs, secondary rows) use `--ss-line` borders and
  no shadow. Radius is 5px for controls and 6–8px for cards.
- Primary buttons are lime with an ink border and a small stamp shadow;
  secondary buttons are paper with an ink border; tertiary actions are
  underlined text.
- Switches are lime with an ink knob when on, and a pale track when off.
- Disclosures use `+` / `−` markers.
- Dot-grid backgrounds (`radial-gradient` on `--ss-dot`) mark empty or
  in-between moments: the welcome hero, the countdown, empty inboxes.

## Layout

- The popup is 360px wide. Order: header (status, setup banner, this-site card,
  Hidden posts + Stats + Settings), **Sites** (current site first and open),
  then **Tools**. Sections in a group stack into one bordered list; only one
  opens at a time.
- Full pages share a 220px sidebar (Hidden posts, Filter sets, Stats, Settings);
  the current page is a lime chip. Below 760px it becomes a top row.
- Settings reuse the popup's controls in a multi-column layout with every
  section open. Stats separates hiding counts from consumption facts.
- Hidden posts puts the post first and its matched rules beside it once the
  content column is at least 760px wide, stacked below it otherwise. The
  selected rule has an ink border; a sticky bar names exactly which post and
  rule the arrow keys will judge.
- In-page UI (countdown, surf break, speed toast, Less like this) lives in a
  shadow root or namespaced classes and must never restyle the host page.
- Preserve visible focus, contrast, reduced motion, and narrow-screen wrapping.
