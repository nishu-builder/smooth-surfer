import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const iosOutput = path.join(repositoryRoot, "dist", "ios");

export function safariManifest(chromeManifest) {
  const manifest = structuredClone(chromeManifest);
  // Safari supports MV3 workers, storage, alarms and Chrome's callback APIs.
  // Chrome's offscreen document API (used for Gemini Nano) is not available.
  manifest.permissions = (manifest.permissions || []).filter((name) => name !== "offscreen");
  delete manifest.minimum_chrome_version;
  delete manifest.update_url;
  delete manifest.key;
  // Safari asks the user for site access. Keep the same site coverage as Chrome;
  // content-script matches must also be explicit MV3 host permissions in Safari.
  manifest.host_permissions = [
    ...new Set([
      ...(manifest.host_permissions || []),
      ...(manifest.content_scripts || []).flatMap((script) => script.matches || [])
    ])
  ];
  return manifest;
}

export async function prepareIOS(root = repositoryRoot, output = path.join(root, "dist", "ios")) {
  const destination = path.join(output, "extension");
  // Only replace this task's generated extension staging directory.
  if (path.resolve(destination) !== path.join(path.resolve(root), "dist", "ios", "extension")) {
    throw new Error("iOS staging must be inside the repository's dist/ios/extension directory.");
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const manifest = safariManifest(
    JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
  );
  await writeFile(
    path.join(destination, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  for (const folder of ["src", "icons"]) {
    await cp(path.join(root, folder), path.join(destination, folder), { recursive: true });
  }
  // Root HTML includes extension pages and any bundled model runtime document.
  // Never package tests, dependencies, developer previews, or repository secrets.
  for (const file of await readdir(root)) {
    if (!file.endsWith(".html")) continue;
    const html = await readFile(path.join(root, file), "utf8");
    await writeFile(
      path.join(destination, file),
      html.replace(/<\/head>/i, '  <link rel="stylesheet" href="src/ios-mobile.css">\n</head>')
    );
  }
  await cp(
    path.join(root, "ios", "Web", "mobile.css"),
    path.join(destination, "src", "ios-mobile.css")
  );
  return { destination, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { destination } = await prepareIOS();
  console.log(`Safari extension staged at ${destination}`);
}
