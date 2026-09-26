"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes("storage"));
assert.ok(manifest.permissions.includes("offscreen"));
// Shared pins are on by default, so tab access is granted at install.
assert.ok(manifest.permissions.includes("tabs"));
assert.equal(manifest.optional_permissions, undefined);
assert.ok(manifest.content_scripts.length > 0);
assert.equal(manifest.action.default_popup, "popup.html");
assert.equal(manifest.background.service_worker, "src/background.js");
// Site access comes from the content-script <all_urls> match; only the
// Anthropic API needs an explicit host permission.
assert.deepEqual(manifest.host_permissions, ["https://api.anthropic.com/*"]);
assert.equal(manifest.icons["128"], "icons/icon128.png");
assert.equal(manifest.action.default_icon["16"], "icons/icon16.png");

const contentScript = manifest.content_scripts[0];
assert.ok(contentScript.matches.includes("<all_urls>"));
// The visit-delay countdown must cover a listed site before it paints, and the
// feed script relies on the shared settings and storage globals it defines.
assert.equal(contentScript.run_at, "document_start");
assert.deepEqual(contentScript.js, ["src/settings.js", "src/storage.js", "src/visit-delay.js"]);
assert.deepEqual(contentScript.css, ["src/theme.css", "src/styles.css"]);
const feedScript = manifest.content_scripts[1];
assert.deepEqual(feedScript.matches, contentScript.matches);
assert.equal(feedScript.run_at, "document_idle");
assert.deepEqual(feedScript.js, ["src/feedback.js", "src/content.js"]);

for (const file of [
  manifest.action.default_popup,
  manifest.background.service_worker,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  "filters.html",
  "src/filters.js",
  "src/calibration.js",
  "src/local-model-client.js",
  "src/local-model-engine.js",
  "src/local-model-frame.html",
  "src/local-model-frame.js",
  "src/local-model-offscreen.html",
  "src/local-model-setup.html",
  "src/local-model-setup.js",
  "src/workspace.js",
  "src/workspace.css",
  "src/filters.css",
  "review.html",
  "src/review.js",
  "src/review.css",
  "src/popup.css",
  "src/popup.js",
  "src/storage.js",
  ...manifest.content_scripts.flatMap((script) => [...(script.css || []), ...script.js])
]) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
}
