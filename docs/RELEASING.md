# Releasing Smooth Surfer

How a release gets from this repo to the Chrome Web Store. Designed so a
Claude session (or anyone) can run every step except the ones marked
**human**, which need the store account.

Extension ID: `cgmineplcpnmdfokdblnnapnbpknfghe`
- Public listing: https://chromewebstore.google.com/detail/smooth-surfer/cgmineplcpnmdfokdblnnapnbpknfghe
- Dashboard: https://chrome.google.com/webstore/devconsole

**Status:** Smooth Surfer is published and live on the Chrome Web Store, and
the setup below is complete — including auto-publish. Pushing a `v*` tag
builds the release and, once a maintainer approves the deployment, publishes
it to the store.

## One-time setup (human)

1. ✅ Register at the [developer dashboard](https://chrome.google.com/webstore/devconsole)
   ($5 one-time, 2FA required on the Google account).
2. ✅ Create the item: upload `dist/smooth-surfer.zip`, then fill in the Store
   listing and Privacy tabs from [store-listing.md](store-listing.md).
   Screenshots live in [store-assets/](store-assets/).
3. ✅ Submit for review. Approval gives the extension a permanent ID.
4. ✅ Install the release workflow (automation tokens cannot write workflow
   files, so this needs a human push):

   ```sh
   mkdir -p .github/workflows
   git mv docs/release-workflow.yml .github/workflows/release.yml
   git commit -m "Install release workflow" && git push
   ```

5. ✅ Automated publishing is enabled. A Chrome Web Store API client and the
   credentials the `publish` job needs are configured, and publishing is gated
   behind a manual deployment approval (see
   [Security hardening](#security-hardening-human)). The
   [chrome-webstore-upload keys guide](https://github.com/fregante/chrome-webstore-upload-keys)
   covers creating or rotating the API client if that's ever needed.

## Security hardening (human)

The release workflow now refuses to publish from a commit that isn't on
`main` and runs with a read-only `GITHUB_TOKEN`. The remaining protections
are GitHub dashboard toggles only a maintainer can set:

1. ✅ **Gate the publish environment** — a required reviewer is configured, so
   each publish pauses for a manual approval before it uploads to the store.
   (Recommended companion setting: restrict the environment's deployment
   branches and tags to `main` and `v*`.)
2. ⬜ **Require approval for fork PRs** (Settings → Actions → General → Fork
   pull request workflows) → "Require approval for all external
   contributors". Keep CI on `pull_request`; never switch to
   `pull_request_target`.
3. ⬜ **Protect `main`** (Settings → Rules/Branches): require the `Check`
   status to pass, require branch up to date, block force-pushes and
   deletion, require a PR before merge.
4. ⬜ **Restrict who can create `v*` tags** (Settings → Rules → tag ruleset)
   to maintainers.
5. ⬜ **Enable secret scanning + push protection** (Settings → Code security).

## Every release (automatable)

1. Land changes on `main`.
2. Bump `version` in `manifest.json` and `package.json` (keep them equal —
   the release workflow refuses mismatched tags).
3. `npm run check`
4. If the UI or site styling changed, refresh screenshots:
   `node scripts/capture-store-assets.mjs`
   (needs ffmpeg; downloads Chrome for Testing into `.cache/` on Linux if no
   `CHROME_BIN` is set — plain Chrome 137+ ignores `--load-extension`).
5. Tag and push: `git tag v<version> && git push origin v<version>`.

The `Release` workflow then verifies the tag matches the manifest, runs
checks, builds the zip, and stores it as a build artifact. With auto-publish
enabled, it pauses for a maintainer to approve the deployment, then uploads to
the Web Store. New versions of an approved extension are usually reviewed much
faster than the first submission.

If auto-publish is ever turned off, the fallback is manual: download the zip
from the workflow artifact (or run `npm run package`) and upload it in the
developer dashboard.
