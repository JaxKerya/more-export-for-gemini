/**
 * E2E smoke test — the extension inside a real Chromium (Playwright).
 *
 * The unit/integration suite runs everything in Node sandboxes; this test
 * covers what those can't: the manifest actually loading, the service worker
 * registering, content scripts injecting into a (faked) gemini.google.com,
 * the lazy exporter stack resolving via chrome.runtime.getURL, and a real
 * export producing a real download.
 *
 * gemini.google.com is faked without touching the network: a local HTTPS
 * server with a self-signed cert serves the extraction fixture, and Chromium
 * is launched with --host-resolver-rules mapping the domain to it (plus
 * --ignore-certificate-errors). Content scripts then match and run exactly
 * as in production.
 *
 * Not part of `npm test` (needs a Playwright browser): run via `npm run
 * test:e2e` after `npx playwright install chromium`. CI runs it as its own
 * job.
 *
 * Usage: node test/e2e.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import selfsigned from "selfsigned";

/* global chrome, document -- evaluate() callbacks run inside the browser */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let ok = true;
let total = 0;
let passed = 0;

function check(label, cond) {
  total++;
  if (cond) {
    passed++;
  } else {
    ok = false;
    console.error(`  ✗ ${label}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 56 - name.length))}`);
}

// ── Fake gemini.google.com: HTTPS server over the extraction fixture ──
// A closed export menu is appended so content.js's initial scan injects our
// items into it (in production the menu appears via the MutationObserver;
// the injection path is identical).
const EXPORT_MENU = `
  <div class="mat-mdc-menu-content">
    <div data-test-id="copy-button">
      <gem-menu-item>
        <span class="leading-container">ic</span>
        <span class="label">Copy</span>
        <span class="trailing-container"></span>
      </gem-menu-item>
    </div>
  </div>`;

const fixtureHtml = fs
  .readFileSync(path.join(__dirname, "fixtures", "gemini-report.html"), "utf8")
  .replace("</body>", `${EXPORT_MENU}\n</body>`);

// selfsigned v5 is async.
const pems = await selfsigned.generate(
  [{ name: "commonName", value: "gemini.google.com" }],
  { days: 1, keySize: 2048 }
);

const server = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(fixtureHtml);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

// ── Launch Chromium with the unpacked extension ──
// Extensions need a persistent context; headless works via the new headless
// mode (channel: "chromium").
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gep-e2e-"));

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  acceptDownloads: true,
  ignoreHTTPSErrors: true,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    `--host-resolver-rules=MAP gemini.google.com 127.0.0.1:${port}`,
    "--ignore-certificate-errors",
  ],
});

try {
  // ── Service worker / extension identity ──
  section("Extension loads");

  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const extensionId = new URL(sw.url()).host;
  check("service worker registered", sw.url().endsWith("src/background.js"));

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const swInfo = await sw.evaluate(() => ({
    version: chrome.runtime.getManifest().version,
    hasContextMenus: typeof chrome.contextMenus !== "undefined",
  }));
  check("manifest version matches repo", swInfo.version === manifest.version);
  check("contextMenus API available to worker", swInfo.hasContextMenus === true);

  // ── Content script on (faked) gemini.google.com ──
  section("Content script injection on gemini.google.com");

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto("https://gemini.google.com/app/e2e-test", { waitUntil: "domcontentloaded" });
  check("fixture page served through host mapping",
    (await page.title()).includes("The Ontology of Sound"));

  // content.js scans existing menus once settings load; our injected items
  // appear inside the pre-rendered export menu.
  await page.waitForSelector('[data-gep-format="markdown"]', { timeout: 15000 });
  // Default settings enable a small starter set (clipboard_md, markdown,
  // reader, docx, pdf) — all of them must be injected.
  const injectedCount = await page.locator("[data-gep-format]").count();
  check("export menu items injected", injectedCount >= 5);
  const mdLabel = await page
    .locator('[data-gep-format="markdown"] .label, [data-gep-format="markdown"] .gep-label')
    .first()
    .textContent();
  check("menu label localized (not a raw key)",
    !!mdLabel && mdLabel.trim().length > 0 && mdLabel.trim() !== "fmtMarkdown");

  // ── Real export: lazy stack import + extraction + download ──
  section("Markdown export end to end");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click('[data-gep-format="markdown"]'),
  ]);
  check("export triggers a download", !!download);
  check("download is a .md file", download.suggestedFilename().endsWith(".md"));

  const dlPath = await download.path();
  const md = fs.readFileSync(dlPath, "utf8");
  check("markdown contains the report title", md.includes("The Ontology of Sound"));
  check("markdown contains a footnote reference", md.includes("[^1]"));
  check("no page errors during export", pageErrors.length === 0);
  if (pageErrors.length) console.error("    page errors:", pageErrors.join(" | "));

  // ── Section picker: choose one heading, export the slice ──
  section("Section picker end to end");

  await page.click('[data-gep-format="sections_pick"]');
  // Playwright locators pierce the open shadow root of the picker host.
  await page.waitForSelector("#gep-section-picker-host .gep-sec-item", { timeout: 15000 });
  const boxes = page.locator("#gep-section-picker-host .gep-sec-item input");
  check("picker lists the report's headings", (await boxes.count()) >= 3);

  const exportBtn = page.locator("#gep-section-picker-host .gep-sec-btn.primary");
  check("picker export starts disabled", await exportBtn.isDisabled());

  await boxes.nth(1).check(); // first h2 section
  check("selecting a section enables export", !(await exportBtn.isDisabled()));

  const [secDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    exportBtn.click(),
  ]);
  check("section export downloads a .md file", secDownload.suggestedFilename().endsWith(".md"));
  const secMd = fs.readFileSync(await secDownload.path(), "utf8");
  check("section slice is a strict subset of the full export",
    secMd.length > 0 && secMd.length < md.length);
  check("picker closed after export",
    (await page.locator("#gep-section-picker-host").count()) === 0);

  // ── Options page renders and reaches storage ──
  section("Options page");

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
    waitUntil: "domcontentloaded",
  });
  await options.waitForSelector("#uiLang", { timeout: 15000 });
  check("language selector present, defaults to auto",
    (await options.locator("#uiLang").inputValue()) === "auto");

  // localizeDocument() must have replaced every data-i18n placeholder.
  const rawKeys = await options.evaluate(() => {
    let raw = 0;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.textContent.trim() === el.getAttribute("data-i18n")) raw++;
    });
    return raw;
  });
  check("no raw i18n keys visible on options page", rawKeys === 0);

  const stored = await options.evaluate(() => chrome.storage.sync.get(null));
  check("options page can read sync storage", typeof stored === "object" && stored !== null);

  // ── Popup renders ──
  section("Popup");

  const popup = await context.newPage();
  const popupErrors = [];
  popup.on("pageerror", (err) => popupErrors.push(String(err)));
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`, {
    waitUntil: "domcontentloaded",
  });
  await popup.waitForSelector("#donateLink", { timeout: 15000 });
  check("popup renders its action links", (await popup.locator(".action-btn").count()) >= 1);
  check("no page errors in popup", popupErrors.length === 0);
  if (popupErrors.length) console.error("    popup errors:", popupErrors.join(" | "));
} finally {
  await context.close();
  server.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* Windows file locks */ }
}

console.log(`\n${"═".repeat(58)}`);
console.log(`  ${passed}/${total} e2e checks passed.`);
console.log(ok ? "  All e2e checks passed. ✓" : "  SOME CHECKS FAILED ✗");
console.log("═".repeat(58) + "\n");
process.exit(ok ? 0 : 1);
