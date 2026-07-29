/**
 * Menu-injector tests.
 *
 * Runs the real src/lib/menu-injector.js against linkedom-built fake Gemini
 * export menus. Guards the layer where two real-world bugs previously lived
 * (menu ignoring format settings) and the new detection fallbacks that keep
 * injection alive when Gemini renames its test ids.
 *
 * Usage: node test/menu-injector.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { getMessage } from "./i18n-mock.mjs";

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

/** Fresh sandbox + injector per scenario so PROCESSED_ATTR / stats don't leak. */
function makeInjector(bodyHtml) {
  const { window, document } = parseHTML(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`);
  const sandbox = {
    window, document, console, Node: window.Node,
    // Shared with the test so the trigger TTL can be exercised.
    Date,
    chrome: { i18n: { getMessage } },
  };
  vm.createContext(sandbox);
  // i18n.js + selectors.js first, exactly like the manifest content_scripts order.
  for (const f of ["src/lib/i18n.js", "src/lib/selectors.js", "src/lib/menu-injector.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
  }
  return {
    injector: sandbox.window.GEP.menuInjector,
    selectors: sandbox.window.GEP.selectors,
    document,
  };
}

/** A faithful mini export menu: native copy button + one cloneable item. */
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

const noop = () => {};

// =====================================================================
section("Export menu detection");

{
  const { injector, document } = makeInjector(EXPORT_MENU);
  const menu = document.querySelector(".mat-mdc-menu-content");
  check("exact test id detected", injector.isExportMenu(menu) === true);
}

{
  // Renamed test id — substring fallback must still identify the menu.
  const { injector, document } = makeInjector(`
    <div class="mat-mdc-menu-content">
      <div data-test-id="copy-report-button"><gem-menu-item><span class="label">Copy</span></gem-menu-item></div>
    </div>`);
  const menu = document.querySelector(".mat-mdc-menu-content");
  check("renamed copy id detected via fallback", injector.isExportMenu(menu) === true);
}

{
  const { injector, document } = makeInjector(`
    <div class="mat-mdc-menu-content">
      <div data-test-id="share-and-export"><gem-menu-item><span class="label">Share</span></gem-menu-item></div>
    </div>`);
  const menu = document.querySelector(".mat-mdc-menu-content");
  check("share id detected via fallback", injector.isExportMenu(menu) === true);
}

{
  // A generic (non-export) Gemini menu must NOT be touched.
  const { injector, document } = makeInjector(`
    <div class="mat-mdc-menu-content">
      <div data-test-id="pin-conversation"><gem-menu-item><span class="label">Pin</span></gem-menu-item></div>
    </div>`);
  const menu = document.querySelector(".mat-mdc-menu-content");
  check("unrelated menu not detected", injector.isExportMenu(menu) === false);
  check("inject() refuses unrelated menu", injector.inject(menu, noop, {}) === false);
  check("unrelated menu left unmodified", menu.querySelectorAll(".gep-menu-item").length === 0);
}

// =====================================================================
section("Trigger scoping (which button opened the menu)");

// Gemini's sidebar settings menu carries an export/share-ish test id of its
// own, so the content test alone matched it and appended our items to the
// account menu. The trigger the user activated has to settle it instead.
const SETTINGS_MENU_HTML = `
  <bard-sidenav>
    <div class="mavatar-footer-right">
      <gem-icon-button data-test-id="mavatar-footer-settings-button" class="mavatar-settings-button">
        <button class="mdc-icon-button mat-mdc-menu-trigger" aria-label="Ayarlar"
                aria-haspopup="menu" aria-expanded="false"><span class="mat-ripple"></span></button>
      </gem-icon-button>
    </div>
  </bard-sidenav>
  <div class="mat-mdc-menu-content" id="settings-menu">
    <div data-test-id="share-links-button"><gem-menu-item><span class="label">Public links</span></gem-menu-item></div>
  </div>`;

const REPORT_TOOLBAR_HTML = `
  <deep-research-immersive-panel>
    <toolbar>
      <div class="action-buttons">
        <button data-test-id="export-menu-button"
                class="mdc-button mat-mdc-menu-trigger export-menu-button"
                aria-haspopup="menu"><span class="mdc-button__label">Share &amp; export</span></button>
      </div>
    </toolbar>
  </deep-research-immersive-panel>`;

{
  const { injector, selectors, document } = makeInjector(SETTINGS_MENU_HTML);
  const menu = document.querySelector("#settings-menu");
  // Content alone would match, exactly as it did in the wild.
  check("settings menu would match on contents alone",
    !!menu.querySelector(selectors.EXPORT_MENU));

  injector.noteTrigger(document.querySelector(".mat-ripple"));
  check("settings-menu trigger rejects the menu", injector.isExportMenu(menu) === false);
  check("inject() refuses the settings menu", injector.inject(menu, noop, {}) === false);
  check("settings menu left unmodified", menu.querySelectorAll(".gep-menu-item").length === 0);
  check("stats: counted as trigger rejection", injector.stats.rejectedByTrigger === 1);
}

{
  // The report's own export button: injectable even if Gemini renames every
  // item inside the menu, which is what makes the trigger the primary signal.
  const { injector, document } = makeInjector(REPORT_TOOLBAR_HTML + `
    <div class="mat-mdc-menu-content" id="m">
      <div data-test-id="totally-renamed"><gem-menu-item><span class="label">?</span></gem-menu-item></div>
    </div>`);
  const menu = document.querySelector("#m");
  injector.noteTrigger(document.querySelector(".mdc-button__label"));
  check("export-menu-button accepts the menu", injector.isExportMenu(menu) === true);
  check("inject() succeeds on unrecognizable contents", injector.inject(menu, noop, {}) === true);
}

{
  // Renamed trigger, still inside the report toolbar: fall back to contents
  // rather than silently disabling injection.
  const { injector, document } = makeInjector(`
    <deep-research-immersive-panel><toolbar><div class="action-buttons">
      <button data-test-id="brand-new-name" class="mat-mdc-menu-trigger" aria-haspopup="menu">
        <span class="lbl">x</span></button>
    </div></toolbar></deep-research-immersive-panel>` + EXPORT_MENU);
  const menu = document.querySelector(".mat-mdc-menu-content");
  injector.noteTrigger(document.querySelector(".lbl"));
  check("renamed report trigger defers to contents", injector.isExportMenu(menu) === true);
}

{
  // A report-scoped trigger that is NOT the export button (e.g. the table of
  // contents menu) still has to be filtered out by the contents.
  const { injector, document } = makeInjector(`
    <deep-research-immersive-panel><toolbar>
      <button data-test-id="toc-menu-button" class="mat-mdc-menu-trigger" aria-haspopup="menu">
        <span class="lbl">TOC</span></button>
    </toolbar></deep-research-immersive-panel>
    <div class="mat-mdc-menu-content" id="m">
      <div data-test-id="toc-entry"><gem-menu-item><span class="label">Intro</span></gem-menu-item></div>
    </div>`);
  const menu = document.querySelector("#m");
  injector.noteTrigger(document.querySelector(".lbl"));
  check("TOC menu not injected", injector.isExportMenu(menu) === false);
}

{
  // No trigger ever recorded (programmatic open, or a listener that never
  // fired): keep the pre-existing content-only behavior.
  const { injector, document } = makeInjector(EXPORT_MENU);
  const menu = document.querySelector(".mat-mdc-menu-content");
  check("without a trigger, contents still decide", injector.isExportMenu(menu) === true);
}

{
  // A stale trigger must not keep vetoing menus opened much later.
  const { injector, document } = makeInjector(SETTINGS_MENU_HTML.replace("share-links-button", "copy-button"));
  const menu = document.querySelector("#settings-menu");
  injector.noteTrigger(document.querySelector(".mat-ripple"));
  check("fresh settings trigger vetoes", injector.isExportMenu(menu) === false);
  // linkedom shares the sandbox clock, so move the recorded time out of range.
  const realNow = Date.now;
  Date.now = () => realNow() + 10000;
  check("stale trigger falls back to contents", injector.isExportMenu(menu) === true);
  Date.now = realNow;
}

// =====================================================================
section("Injection & format filtering");

{
  const { injector, document } = makeInjector(EXPORT_MENU);
  const menu = document.querySelector(".mat-mdc-menu-content");
  const enabled = {
    clipboard_md: true, markdown: true, docx: true, pdf: true, reader: true,
    clipboard_txt: false, clipboard_html: false, clipboard_json: false,
    txt: false, html: false, json: false, latex: false, csv: false, xlsx: false,
    bibtex: false, ris: false, csljson: false, rtf: false, epub: false,
    vault: false, zip_all: false, sections_pick: false,
  };
  check("inject() succeeds on export menu", injector.inject(menu, noop, enabled) === true);

  const items = [...menu.querySelectorAll(".gep-menu-item:not(.gep-limit-notice)")];
  check("only enabled formats injected (5)", items.length === 5);

  const formats = items.map((el) => el.getAttribute("data-gep-format"));
  check("disabled format absent", !formats.includes("txt"));
  check("enabled format present", formats.includes("reader"));
  check("cloned items carry role=menuitem", items.every((el) => el.getAttribute("role") === "menuitem"));
  check("marked as processed", menu.getAttribute("data-gep-processed") === "1");
  check("re-inject blocked", injector.inject(menu, noop, enabled) === false);
  check("re-inject added nothing", menu.querySelectorAll(".gep-menu-item:not(.gep-limit-notice)").length === 5);
}

{
  // Missing keys default to visible (`enabled[f] !== false`) — all 20 formats
  // enabled must cap at MAX_MENU_ITEMS with a "more in settings" notice.
  const { injector, document } = makeInjector(EXPORT_MENU);
  const menu = document.querySelector(".mat-mdc-menu-content");
  injector.inject(menu, noop, {});
  const items = menu.querySelectorAll(".gep-menu-item:not(.gep-limit-notice)");
  check("item cap enforced (12)", items.length === 12);
  check("limit notice shown", menu.querySelectorAll(".gep-limit-notice").length === 1);
}

{
  // "Export section…" (#9) is a menu entry like any format and must inject
  // with its localized label when enabled.
  const { injector, document } = makeInjector(EXPORT_MENU);
  const menu = document.querySelector(".mat-mdc-menu-content");
  const enabled = { sections_pick: true };
  for (const g of injector.GROUPS) for (const it of g.items) {
    if (it.format !== "sections_pick") enabled[it.format] = false;
  }
  injector.inject(menu, noop, enabled);
  const item = menu.querySelector('[data-gep-format="sections_pick"]');
  check("sections_pick entry injected", !!item);
  check("sections_pick label resolved", !!item && item.textContent.includes("Export section"));
}

{
  // No cloneable gem-menu-item — fallback items must still render the menu.
  const { injector, document } = makeInjector(`
    <div class="mat-mdc-menu-content">
      <div data-test-id="copy-button"></div>
    </div>`);
  const menu = document.querySelector(".mat-mdc-menu-content");
  const enabled = { clipboard_md: true };
  // Everything else off:
  for (const g of injector.GROUPS) for (const it of g.items) {
    if (it.format !== "clipboard_md") enabled[it.format] = false;
  }
  check("inject() works without reference item", injector.inject(menu, noop, enabled) === true);
  const fallback = menu.querySelector(".gep-menu-item.gep-fallback");
  check("fallback item rendered", !!fallback);
  check("fallback carries format attr", fallback && fallback.getAttribute("data-gep-format") === "clipboard_md");
}

// =====================================================================
section("Session stats (diagnostics)");

{
  const { injector, document } = makeInjector(EXPORT_MENU + `
    <div class="mat-mdc-menu-content" id="other">
      <div data-test-id="pin-conversation"><gem-menu-item><span class="label">Pin</span></gem-menu-item></div>
    </div>`);
  const exportMenu = document.querySelector(".mat-mdc-menu-content");
  const otherMenu = document.querySelector("#other");

  injector.inject(exportMenu, noop, {});
  injector.inject(otherMenu, noop, {});

  check("stats: menus seen = 2", injector.stats.menusSeen === 2);
  check("stats: export menus matched = 1", injector.stats.exportMenusMatched === 1);
  check("stats: injected = 1", injector.stats.injected === 1);
}

// =====================================================================
console.log(`\n${"═".repeat(58)}`);
console.log(`  ${passed}/${total} menu-injector checks passed.`);
console.log(ok ? "  All menu-injector checks passed. ✓" : "  SOME CHECKS FAILED ✗");
console.log("═".repeat(58) + "\n");
process.exit(ok ? 0 : 1);
