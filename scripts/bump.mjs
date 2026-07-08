/**
 * Version bump (#19): updates every hand-synced copy of the version number
 * in one command, then prints the remaining manual release steps.
 *
 *   manifest.json      version + the numeric part of version_name
 *                      (a " Beta" suffix, if present, is preserved)
 *   package.json       version   (via `npm version`, keeps formatting)
 *   package-lock.json  version + packages[""].version (same)
 *
 * Usage: npm run bump -- 2.2.0
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];

if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error("Usage: npm run bump -- <x.y.z>   (e.g. npm run bump -- 2.2.0)");
  process.exit(1);
}

// manifest.json — targeted text replacement so the file keeps its
// hand-formatted layout (compact arrays etc.).
const manifestPath = join(root, "manifest.json");
const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const prev = manifest.version;

let updated = manifestText.replace(
  /("version"\s*:\s*")\d+\.\d+\.\d+(")/,
  `$1${next}$2`
);
updated = updated.replace(
  /("version_name"\s*:\s*")\d+\.\d+\.\d+/,
  `$1${next}`
);
if (updated === manifestText && prev !== next) {
  console.error("Could not find a version field to update in manifest.json.");
  process.exit(1);
}
writeFileSync(manifestPath, updated);
const versionName = JSON.parse(updated).version_name;

// package.json + package-lock.json — npm updates both in place.
execSync(`npm version ${next} --no-git-tag-version --allow-same-version`, {
  cwd: root,
  stdio: "ignore",
});

console.log(`
  Version bumped: ${prev} -> ${next}
    manifest.json      version${versionName ? ` + version_name ("${versionName}")` : ""}
    package.json       version
    package-lock.json  version (x2)

  Before tagging, do the manual steps (see RELEASE_CHECKLIST.md):
    1. CHANGELOG.md          move [Unreleased] into a new [${next}] section
    2. whats-new.js          add a RELEASE_NOTES entry for ${next}
                             (src/options/modules/whats-new.js)
    3. Run the smoke test against a real Gemini page
    4. git commit, then:     git tag v${next} && git push origin master v${next}
       (the Release workflow verifies the tag matches manifest.json)
`);
