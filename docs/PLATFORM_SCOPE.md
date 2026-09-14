# Local models and iPhone

These are separate capabilities. Desktop local inference does not imply that the
same model can run on an iPhone.

## Desktop local inference

The first provider is Chrome's built-in Gemini Nano through the Prompt API.
Model availability depends on Chrome, hardware, available disk space, and the
browser's model download. A setup action must show readiness or a useful failure;
selecting local processing must never silently fall back to Claude.

Feed classification, rule suggestions, and feedback recalibration must all honor
the chosen provider. Local processing initially uses text, including supplied
image descriptions. Image analysis remains a cloud capability. Failures leave
posts visible. Cached decisions must be separated by provider and settings.

The runtime belongs to an extension document, independent of the popup. Closing
the popup must not cancel feed classification. Model requests must be bounded,
serialized, and validated before they can hide content or revise a rule.

This is an initial provider, not a model catalog. Downloadable WebGPU models or
native model runtimes can be added later through the same provider boundary.

## iPhone

The first iPhone target is an iOS Safari Web Extension with a containing app that
explains how to enable it and grant website access. It uses the shared extension
source for filtering, settings, review, feedback, and stats.

It operates on websites in Safari. It cannot modify feeds in the native X,
YouTube, Reddit, or other apps. Chrome's Prompt API is unavailable on iOS, so the
initial iPhone AI path uses the existing Anthropic provider. Deterministic
filters continue to work without an API key.

The build must stage current web sources rather than maintain a second copy.
Safari manifest differences belong in packaging. Touch controls and narrow
layouts must remain usable without changing the desktop interface.

Unsigned Simulator compilation validates the native package and shared assets.
Safari execution and real-device testing are separate checks. TestFlight or App
Store distribution additionally needs Apple signing, provisioning, a registered
app, and the appropriate account access. A successful build is not a published
iPhone app.

## References

- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Apple Safari extensions](https://developer.apple.com/safari/extensions/)
- [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
