# Feedback and rule calibration

Review targets a **rule–post pair**, not the visibility of the whole post. A post can match several rules; disagreeing with one match must not imply that all other matches were wrong. Good ruling means this post should match the named rule. Bad ruling means it should not. An optional explanation supplies the user's boundary or exception.

Votes are local labels. They do not restore a post or immediately rewrite a rule. Recalibrate rules is the explicit API action, and it applies validated revisions automatically.

## Algorithm

1. Save the latest judgment and explanation for each rule–post pair, with the classification text, source, and supported image URLs. Keep feedback independently of the seven-day review history. The store is capped at 2,000 examples / 2 MB; old examples fall out first.
2. Select active rules with disagreements or written explanations, including explanations on good rulings. Either label class can be used on its own. Process at most three rules per run, rotating previously attempted rules behind unprocessed ones. Written explanations take priority when choosing the bounded replay set. A fully successful revision waits for new feedback; a partial improvement can be revisited.
3. Build a balanced replay set of up to 40 good/bad examples per rule. Where possible, withhold an older example without an explanation from drafting. Written instructions are never withheld. All selected examples participate in evaluation. When image analysis is off, use available post text and explanations without sending images. Image-only examples are skipped and reported; evaluating them requires opt-in.
4. Ask Claude Haiku to incorporate explicit boundaries, exceptions, and new preferences while preserving the rule's purpose. Good means this rule should match the post; Bad means it should not. Post text and images are untrusted data; explanations are user preferences. Independent new-rule requests produce separate suggestions, each grounded in a verbatim excerpt from a numbered explanation. They can be added from the result card and are not silently enabled using labels belonging to a different rule.
5. Replay the original and proposed wording independently, each in its own API call so the candidate cannot influence judgments of the original. Reuse the baseline for a repair attempt. The evaluator receives post content and rule text, not judgments or explanations. Validate complete decisions and show the per-example outcomes. If a candidate is rejected, allow one repair attempt with its concrete replay disagreements, excluding withheld examples.
6. Apply an improvement only when it reduces disagreements without breaking a previously correct example. Perfect replay is not required. Explicit written feedback may also justify a clearer wording when both versions pass all selected examples. Preserve existing settings if no candidate meets these conditions. Distinguish no change, rejected revisions, API errors, missing image permission, unsupported format switches, and pending rules in the results.
7. Check that settings and feedback have not changed before applying. Record before/after wording, corrected mistakes, and remaining disagreements; keep the last 30 revisions with undo. If saving history fails, roll back the settings write.

Enter saves an edited explanation on an already judged ruling. Recalibrate also
saves judged explanation drafts before starting, including drafts in other inboxes.
Unjudged explanations still need a Good or Bad label and are reported explicitly.

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

Archive unreviewed moves pending posts to Archived without deleting their previews.
Archived posts share the 2,000-post / 6 MB budget and do not expire by age. Good
and bad judgments keep their categories. Posts can be judged from Archived or
returned to Uncategorized with a fresh seven-day queue window.

Additional-rule suggestions are persisted separately from the current run. They
remain available after reloads or a successful revision, with Add, Dismiss,
Reconsider, and Undo addition actions. Applying or undoing an addition uses the
same settings lock and rollback-on-storage-failure behavior as revisions.
The local suggestion history is limited to 50 records within 100 KB.

## Refresh and restart recovery

Recalibrate starts a persisted background job and returns immediately. The review
page subscribes to its progress, so closing or refreshing that page does not own
the job's lifetime. Chrome startup, extension startup, and a one-minute alarm
resume a running job after interruption. Nothing runs while Chrome is closed.
Completed rule outcomes are checkpointed and skipped on recovery; an unfinished
rule is retried using current settings and feedback. An interrupted API request
may therefore be repeated and incur another charge. API errors are displayed,
not automatically retried forever. A paused job offers Resume recalibration.

A durable update intent is saved before changing synced rules. On recovery, the
worker reconciles it with the current rules and local revision history so an
applied revision is recorded once and remains undoable. Unrelated settings are
not overwritten. Multiple review tabs attach to the same active job. The latest
job's results remain visible after reload; starting a new job replaces that
result display, while revision history and suggestions remain saved.

Explanation drafts are saved locally while typing, including drafts without a
judgment. Drafts do not become calibration examples until judged. The review page
shows when saving is in progress and warns before navigating away during a save.
Once it says Safe to refresh, saved feedback, drafts, and job progress survive a
normal browser restart. Uninstalling the extension or clearing its data removes
this local state.
