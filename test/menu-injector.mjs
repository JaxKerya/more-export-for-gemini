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
    chrome: { i18n: { getMessage } },
  };
  vm.createContext(sandbox);
  // i18n.js + selectors.js first, exactly like the manifest content_scripts order.
  for (const f of ["src/lib/i18n.js", "src/lib/selectors.js", "src/lib/menu-injector.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
  }
  return { injector: sandbox.window.GEP.menuInjector, document };
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
