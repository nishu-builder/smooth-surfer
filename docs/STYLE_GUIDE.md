# Product style

The visual reference is [Fogg’s identity on Brand Archive](https://brandarchive.xyz/identity/fogg), credited to Kurppa Hosk Bunch (2013). Use its typography and crisp geometry as direction for Smooth Surfer. Our palette is black, white, and neutral gray; do not use the reference’s purple or orange. Keep layouts dense. The reference is Fogg’s identity and stationery, not Brand Archive’s surrounding interface.

## CSS tokens

Use `src/theme.css` across the popup, review page, and in-page controls.

| Token | Value | Use |
| --- | --- | --- |
| `--ss-paper` | `#FFFFFF` | Main surfaces |
| `--ss-gray` | `#F2F2F2` | Secondary surfaces |
| `--ss-action` | `#111111` | Primary actions, links, headings |
| `--ss-focus` | `#111111` | Focus indicators |
| `--ss-ink` | `#171717` | Reading text |
| `--ss-muted` | `#616161` | Supporting text |
| `--ss-radius` | `2px` | Controls and panels |

These are Smooth Surfer’s monochrome interface tokens, adapted from the reference’s geometry rather than its colors.

## Typography and layout

- The reference uses Gridnik by Wim Crouwel. Prefer Gridnik when available; the current CSS uses local system monospace fallbacks. No Gridnik font files are bundled.
- Use the geometric/monospaced stack for headings, actions, and metadata. Use a neutral sans serif for longer post previews and help text.
- Keep white surfaces, thin dividers, crisp corners, and consistent alignment. Avoid pill-shaped panels and heavy shadows.
- Default to compact spacing: 4–8px between related controls, 10–12px inside post cards, and 8px between cards. Headers should not push content down.
- Keep post previews at 14px with 1.4 line height. Reduce padding before shrinking reading text. Controls should remain at least 28px high.
- Use black for primary actions and white for surfaces. Supporting fills, borders, and hover states stay neutral gray.
- Keep decoration out of reading and decision areas. Do not copy Fogg’s logo or artwork into the extension.
- Preserve visible focus indicators, legible contrast, narrow-screen wrapping, and existing feed geometry.
- Theme variables are namespaced. Content styles must not restyle the host page.

## Copy

- Keep copy terse and factual. Use sentence case and concrete actions: “Restore post,” “Edit rule,” “Filter added.”
- Remove slogans, motivational language, and introductions that repeat the controls.
- Keep details that affect a choice: data sharing, rule scope, persistence, and error recovery.
- Use the same terms across the popup, review page, feed controls, and listing.
