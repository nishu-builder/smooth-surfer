# Releasing Smooth Surfer

How a release gets from this repo to the Chrome Web Store. Designed so a
Claude session (or anyone) can run every step except the ones marked
**human**, which need the store account.

Extension ID: `cgmineplcpnmdfokdblnnapnbpknfghe`
- Public listing: https://chromewebstore.google.com/detail/smooth-surfer/cgmineplcpnmdfokdblnnapnbpknfghe
- Dashboard: https://chrome.google.com/webstore/devconsole

**Status:** Smooth Surfer is published and live on the Chrome Web Store. The
one-time setup below (steps 1–4) is done. What remains optional is wiring the
auto-publish credentials in step 5 so tagged releases publish without a manual
upload.

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

5. ⬜ To enable automated publishing (optional but recommended — not yet wired):
   - Follow the [chrome-webstore-upload keys guide](https://github.com/fregante/chrome-webstore-upload-keys)
     to create a Google Cloud OAuth client and refresh token for the
     Chrome Web Store API.
   - Add GitHub Actions secrets: `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`,
     `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
   - Set the repository variable `CWS_PUBLISH` to `true`.

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
checks, builds the zip, stores it as a build artifact, and — when
`CWS_PUBLISH` is `true` and the secrets exist — uploads it to the Web Store
with auto-publish. New versions of an approved extension are usually
reviewed much faster than the first submission.

Until the API credentials exist, the last step is manual: download the zip
from the workflow artifact (or run `npm run package`) and upload it in the
developer dashboard.
