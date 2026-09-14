import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { iosOutput, prepareIOS, repositoryRoot } from "./prepare-ios.mjs";

const APP_NAME = "Smooth Surfer";
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Usage: node scripts/build-ios.mjs [--generate-only] [--device] [--bundle-id ID] [--build-number N]
Default: regenerate the shared Safari bundle and Xcode project, then build an unsigned Simulator app.
--device builds an unsigned iPhone device app for compile validation, not installation.
--generate-only prepares the Xcode project for manual signing and device builds.
Generated outputs live in dist/ios. Requires macOS, Xcode and Node.js.`);
  process.exit(0);
}
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`Missing ${name} value`);
  return args[index + 1];
}
const bundleId = option("--bundle-id", "com.smoothsurfer.app");
const buildNumber = option("--build-number", "1");
const allowedFlags = new Set(["--generate-only", "--device", "--bundle-id", "--build-number"]);
for (let index = 0; index < args.length; index++) {
  if (!allowedFlags.has(args[index])) throw new Error(`Unknown argument: ${args[index]}`);
  if (["--bundle-id", "--build-number"].includes(args[index])) index++;
}
if (!/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+$/.test(bundleId))
  throw new Error("Invalid bundle identifier");
if (!/^[1-9][0-9]*$/.test(buildNumber)) throw new Error("Build number must be a positive integer");
if (process.platform !== "darwin")
  throw new Error(
    "Building the iPhone app requires macOS and Xcode. Staging and packaging tests run on any platform."
  );

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: repositoryRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
const { destination, manifest } = await prepareIOS();
const projectContainer = path.join(iosOutput, "project");
const projectRoot = path.join(projectContainer, APP_NAME);
const projectPath = path.join(projectRoot, `${APP_NAME}.xcodeproj`);
await mkdir(projectContainer, { recursive: true });
run("xcrun", [
  "safari-web-extension-converter",
  destination,
  "--project-location",
  projectContainer,
  "--app-name",
  APP_NAME,
  "--bundle-identifier",
  bundleId,
  "--swift",
  "--ios-only",
  "--no-open",
  "--no-prompt",
  "--force"
]);
await cp(
  path.join(repositoryRoot, "ios", "App", "ViewController.swift"),
  path.join(projectRoot, APP_NAME, "ViewController.swift")
);
await cp(
  path.join(repositoryRoot, "ios", "Extension", "SafariWebExtensionHandler.swift"),
  path.join(projectRoot, `${APP_NAME} Extension`, "SafariWebExtensionHandler.swift")
);

// Use the full-resolution product icon, not the converter's enlarged toolbar icon.
const appIcons = path.join(projectRoot, APP_NAME, "Assets.xcassets", "AppIcon.appiconset");
const iconManifest = JSON.parse(await readFile(path.join(appIcons, "Contents.json"), "utf8"));
for (const filename of new Set(
  iconManifest.images
    .filter((item) => item.size === "1024x1024" && item.filename)
    .map((item) => item.filename)
)) {
  await cp(path.join(repositoryRoot, "icons", "icon1024.png"), path.join(appIcons, filename));
}

const pbxPath = path.join(projectPath, "project.pbxproj");
let project = await readFile(pbxPath, "utf8");
project = project
  .replace(/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g, "IPHONEOS_DEPLOYMENT_TARGET = 16.0;")
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${manifest.version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`)
  .replace(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g, (_, original) => {
    const suffix = original.endsWith(".Extension")
      ? ".extension"
      : original.endsWith("UITests")
        ? ".uitests"
        : original.endsWith("Tests")
          ? ".tests"
          : "";
    return `PRODUCT_BUNDLE_IDENTIFIER = "${bundleId}${suffix}";`;
  })
  // The staging phase deliberately reads shared sources outside SRCROOT.
  .replace(/ENABLE_USER_SCRIPT_SANDBOXING = YES;/g, "ENABLE_USER_SCRIPT_SANDBOXING = NO;");

// Re-stage on every Xcode build too. Opening the generated project must not ship
// an old snapshot after editing src/*. The converter uses folder references for
// src/icons, so new files there are included without copying a second codebase.
const phaseId = "53534652505245504152453031";
const shellQuote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
const relativeRoot = path.relative(projectRoot, repositoryRoot);
const shellScript = `set -eu\ncd "$SRCROOT/${relativeRoot}"\n${shellQuote(process.execPath)} scripts/prepare-ios.mjs\ncp ios/App/ViewController.swift "$SRCROOT/${APP_NAME}/ViewController.swift"\ncp ios/Extension/SafariWebExtensionHandler.swift "$SRCROOT/${APP_NAME} Extension/SafariWebExtensionHandler.swift"\n`;
const phase = `\n/* Begin PBXShellScriptBuildPhase section */\n\t\t${phaseId} /* Prepare shared Safari resources */ = {\n\t\t\tisa = PBXShellScriptBuildPhase;\n\t\t\talwaysOutOfDate = 1;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = ();\n\t\t\tinputPaths = ();\n\t\t\toutputPaths = ();\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t\tshellPath = /bin/sh;\n\t\t\tshellScript = ${JSON.stringify(shellScript)};\n\t\t};\n/* End PBXShellScriptBuildPhase section */\n`;
project = project.replace(
  "/* Begin PBXSourcesBuildPhase section */",
  `${phase}\n/* Begin PBXSourcesBuildPhase section */`
);
const extensionTarget = new RegExp(
  `(\\/\\* ${APP_NAME} Extension \\*\\/ = \\{\\s*isa = PBXNativeTarget;[\\s\\S]*?buildPhases = \\()`,
  "m"
);
if (!extensionTarget.test(project))
  throw new Error("Converter project layout changed: extension target was not found");
project = project.replace(
  extensionTarget,
  `$1\n\t\t\t\t${phaseId} /* Prepare shared Safari resources */,`
);
await writeFile(pbxPath, project);

// Explicit shared scheme makes CI independent of Xcode's per-user auto schemes.
const appTargetMatch = project.match(
  /([A-F0-9]{24}) \/\* Smooth Surfer \*\/ = \{\s*isa = PBXNativeTarget;/
);
if (!appTargetMatch) throw new Error("Converter project layout changed: app target was not found");
const schemes = path.join(projectPath, "xcshareddata", "xcschemes");
await mkdir(schemes, { recursive: true });
const reference = `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${appTargetMatch[1]}" BuildableName="Smooth Surfer.app" BlueprintName="Smooth Surfer" ReferencedContainer="container:Smooth Surfer.xcodeproj"/>`;
await writeFile(
  path.join(schemes, "Smooth Surfer.xcscheme"),
  `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1640" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">${reference}</BuildActionEntry></BuildActionEntries></BuildAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">${reference}</BuildableProductRunnable></LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">${reference}</BuildableProductRunnable></ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>\n`
);
console.log(`Xcode project: ${projectPath}`);
if (!args.includes("--generate-only")) {
  const device = args.includes("--device");
  run("xcodebuild", [
    "-project",
    projectPath,
    "-scheme",
    APP_NAME,
    "-configuration",
    "Debug",
    "-sdk",
    device ? "iphoneos" : "iphonesimulator",
    "-destination",
    device ? "generic/platform=iOS" : "generic/platform=iOS Simulator",
    "-derivedDataPath",
    path.join(iosOutput, device ? "device-build" : "simulator-build"),
    "-jobs",
    "2",
    "CODE_SIGNING_ALLOWED=NO",
    "build"
  ]);
}
