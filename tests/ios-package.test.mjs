import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareIOS, repositoryRoot, safariManifest } from "../scripts/prepare-ios.mjs";

const chromeManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "manifest.json"), "utf8")
);
const candidate = {
  ...chromeManifest,
  permissions: [...chromeManifest.permissions, "offscreen"],
  minimum_chrome_version: "138",
  update_url: "https://example.com/update",
  key: "development-only"
};
const safari = safariManifest(candidate);
assert(candidate.permissions.includes("offscreen"), "Do not mutate the Chrome manifest");
assert(!safari.permissions.includes("offscreen"));
assert(safari.permissions.includes("alarms"));
assert(safari.permissions.includes("storage"));
assert.equal(safari.background.service_worker, chromeManifest.background.service_worker);
assert.equal(safari.version, chromeManifest.version);
assert(!("minimum_chrome_version" in safari));
assert(!("update_url" in safari));
assert(!("key" in safari));
assert(safari.host_permissions.includes("https://api.anthropic.com/*"));
assert(safari.host_permissions.includes("<all_urls>"));
assert.equal(safari.host_permissions.length, new Set(safari.host_permissions).size);

const root = await mkdtemp(path.join(os.tmpdir(), "smooth-surfer-ios-test-"));
try {
  for (const filename of [
    "manifest.json",
    "src",
    "icons",
    "ios",
    "popup.html",
    "review.html",
    "filters.html"
  ]) {
    await cp(path.join(repositoryRoot, filename), path.join(root, filename), { recursive: true });
  }
  await writeFile(path.join(root, ".env"), "SHOULD_NOT_BE_PACKAGED=yes");
  await writeFile(path.join(root, "package.json"), "{}");
  const { destination } = await prepareIOS(root);
  const files = await readdir(destination);
  assert(!files.includes(".env"));
  assert(!files.includes("package.json"));
  for (const page of ["popup.html", "review.html", "filters.html"]) {
    const html = await readFile(path.join(destination, page), "utf8");
    assert.equal((html.match(/ios-mobile.css/g) || []).length, 1);
    for (const [, resource] of html.matchAll(/(?:src|href)="((?:src|icons)\/[^"?#]+)"/g)) {
      await readFile(path.join(destination, resource));
    }
  }
  const original = await readFile(path.join(root, "src", "background.js"), "utf8");
  assert.equal(await readFile(path.join(destination, "src", "background.js"), "utf8"), original);
  await writeFile(path.join(root, "src", "background.js"), `${original}\n// fresh source\n`);
  await writeFile(path.join(destination, "stale-file.js"), "obsolete");
  await prepareIOS(root);
  assert(
    (await readFile(path.join(destination, "src", "background.js"), "utf8")).endsWith(
      "// fresh source\n"
    )
  );
  assert(!(await readdir(destination)).includes("stale-file.js"));
  await assert.rejects(() => prepareIOS(root, path.join(root, "src")), /staging must be inside/);
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log("iPhone manifest and packaging tests passed");
