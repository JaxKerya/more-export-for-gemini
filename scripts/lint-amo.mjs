/**
 * AMO linter (#15): builds the store package and runs Mozilla's addons-linter
 * on the resulting zip — the exact same validation addons.mozilla.org applies
 * on upload, so a Firefox-breaking manifest change fails in CI instead of at
 * submission time.
 *
 * Linting the built zip (not the repo directory) keeps tests, docs and
 * node_modules out of the linter's view — the zip is precisely what ships.
 *
 * Usage: node scripts/lint-amo.mjs   (or: npm run lint:amo)
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const zip = join(root, "store", `more-export-for-gemini-v${manifest.version}.zip`);

// 1. Fresh package (same script the release flow uses).
execFileSync(process.execPath, [join(root, "scripts", "build.mjs")], {
  stdio: "inherit",
  cwd: root,
});

// 2. addons-linter on the zip. Resolved via its package bin so the call is
// identical on Windows / macOS / Linux and in CI (no npx/shell quirks).
const linterBin = join(root, "node_modules", "addons-linter", "bin", "addons-linter");
if (!existsSync(linterBin)) {
  console.error("addons-linter not installed — run: npm install");
  process.exit(1);
}

try {
  execFileSync(process.execPath, [linterBin, zip], { stdio: "inherit", cwd: root });
} catch {
  console.error("\naddons-linter reported errors — AMO would reject this package.");
  process.exit(1);
}
