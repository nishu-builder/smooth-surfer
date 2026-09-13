# Feedback and rule calibration

Review targets a **rule–post pair**, not the visibility of the whole post. A post can match several rules; disagreeing with one match must not imply that all other matches were wrong. Good ruling means this post should match the named rule. Bad ruling means it should not. An optional explanation supplies the user's boundary or exception.

Votes are local labels. They do not restore a post or immediately rewrite a rule. Recalibrate rules is the explicit API action, and it applies validated revisions automatically.

## Algorithm

1. Save the latest judgment and explanation for each rule–post pair, with the classification text, source, and supported image URLs. Keep feedback independently of the seven-day review history. The store is capped at 2,000 examples / 2 MB; old examples fall out first.
2. Select active rules with disagreements and at least one agreed example. Process at most three eligible rules per run, rotating previously attempted rules behind unprocessed ones. A successfully revised rule is not retried until it receives new feedback.
3. Build a balanced replay set of up to 40 recent good/bad examples per rule. If either class has at least three examples, reserve its oldest selected example from the proposal prompt. Those withheld examples still participate in evaluation. Small datasets have only a regression replay, not a separate holdout.
4. Ask Claude Haiku to revise only that rule, preserving its purpose and confirmed matches while clarifying the boundary described by negative examples. Post text and images are untrusted content; explanations represent user preferences. The rewrite must be nonempty, distinct, and at most 500 characters. The prompt prohibits memorizing individual posts, authors, and URLs.
5. In separate API calls, run the normal classifier with the original and proposed rule against the full replay set. The evaluator receives post content and rule text, not the judgments or explanations. Validate a complete, well-formed decision for every example.
6. Accept only if the candidate agrees with every selected judgment and strictly improves on the original rule. Otherwise keep the current rule. Check that settings and feedback have not changed during the run before applying it.
7. Record the before/after text and replay counts locally. Keep the last 30 revisions with undo. Undo preserves feedback. If saving revision history fails, roll back the settings write rather than knowingly leaving a rule without history.

This is prompt calibration, not model weight training. It provides a conservative check against saved preferences; it does not establish general accuracy. Old examples outside the replay window and unlabeled posts are not tested. Continued good/bad judgments supply evidence as browsing preferences evolve. Future work could add held-out sampling over longer histories and comparisons across independent classifier runs if the added API cost is justified.

Format switches are deterministic detectors, not natural-language rules. Their feedback is stored under separate format keys and never sent through a text-rule rewrite or used to silently disable a switch. These reports can guide improvements to the detector; the current recalibration path does not learn format exceptions.

## Presentation and privacy

The post precedes its ruling controls, with a divider between posts. For newly captured X posts, preserve primary text line breaks, author name/handle, timestamp, supported avatar, media, and a quoted-post excerpt. X posts use its hosted tweet frame, sandboxed on X’s own origin with no extension API or parent DOM access. No remote script is loaded into the extension page. The parent accepts only bounded sizing messages from the exact frame window and X origin; failed loads reveal the saved copy. A locally rendered saved copy remains available for failed embeds and other sites. Older entries use the available text and author label. No engagement counts are invented.

Media loads lazily from the original host with no referrer. Recalibration sends selected examples, explanations, and supported images to Anthropic using the user's key. Image examples require Analyze images to remain enabled. Requests are bounded, run sequentially, and stop on settings changes or API errors. No API key is stored with a filter set or feedback record.

The approach draws on [Anthropic's example-driven prompt improvement workflow](https://www.anthropic.com/news/prompt-improver) and [evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). Replay thresholds, sampling limits, and per-rule feedback are Smooth Surfer design choices.

Reviewed examples of both judgments remain visible after rolling history expires or is cleared. Their post metadata is retained with feedback, within the existing 2,000-judgment / 2 MB budget. Left marks bad, right marks good, up/down navigate between rulings, and Cmd/Ctrl+Z undoes the latest judgment. Typing fields keep normal arrow behavior. The selected rule–post pair is highlighted; voting advances selection and moves the judgment between Uncategorized, Good rulings, and Bad rulings. Each inbox shows only its matching rule–post pairs. A post remains in Uncategorized while any of its rulings are unanswered. Undo restores the prior judgment and explanation, and refuses to overwrite intervening edits. Up to 50 undo receipts are stored with feedback within a separate 512 KB budget. They survive worker restarts; the current page keeps the action order. Empty undo shows an explicit message.

Native tweet rendering uses X’s hosted `https://platform.twitter.com/embed/Tweet.html` frame. Its sizing messages use the `twttr.embed` envelope with `twttr.private.resize`, as observed in X’s own widget implementation. This protocol may change; a 15-second deadline falls back to the saved post when no valid sizing message arrives. Frames are loaded near the viewport and preserved across votes.

Twitter review records use the permanent status ID across X/Twitter URL variants.
Existing text-based duplicates merge when read, keeping their distinct triggering
rules. Feedback is deduplicated per tweet and rule; the latest judgment and its
explanation win. Enter leaves the explanation box; Shift+Enter adds a new line.
