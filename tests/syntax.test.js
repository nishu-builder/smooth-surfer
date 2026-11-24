"use strict";
// Every shipped script must parse as a classic (non-module) script: they are
// loaded by the manifest, script tags and importScripts, with no build step.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = path.join(__dirname, "..", "src");
const files = fs.readdirSync(src).filter((name) => name.endsWith(".js"));
for (const file of files) {
  new vm.Script(fs.readFileSync(path.join(src, file), "utf8"), { filename: `src/${file}` });
}
console.log(`syntax passed (${files.length} scripts)`);
