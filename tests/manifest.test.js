"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes("storage"));
assert.ok(manifest.content_scripts.length > 0);
assert.equal(manifest.action.default_popup, "popup.html");
assert.equal(manifest.background.service_worker, "src/background.js");
assert.ok(manifest.host_permissions.includes("https://api.anthropic.com/*"));

const contentScript = manifest.content_scripts[0];
assert.ok(contentScript.matches.includes("<all_urls>"));

for (const file of [
  manifest.action.default_popup,
  manifest.background.service_worker,
  "src/popup.css",
  "src/popup.js",
  "src/storage.js",
  ...contentScript.css,
  ...contentScript.js
]) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
}
