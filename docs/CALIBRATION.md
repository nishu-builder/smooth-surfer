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

Triggering rules and judgment controls precede the saved post. For newly captured X posts, preserve primary text line breaks, author name/handle, timestamp, supported avatar, media, and a quoted-post excerpt. Render local HTML with text nodes, not an X embed or remote script. Older entries use the available text and author label. No engagement counts are invented.

Media loads lazily from the original host with no referrer. Recalibration sends selected examples, explanations, and supported images to Anthropic using the user's key. Image examples require Analyze images to remain enabled. Requests are bounded, run sequentially, and stop on settings changes or API errors. No API key is stored with a filter set or feedback record.

The approach draws on [Anthropic's example-driven prompt improvement workflow](https://www.anthropic.com/news/prompt-improver) and [evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). Replay thresholds, sampling limits, and per-rule feedback are Smooth Surfer design choices.
