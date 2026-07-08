/**
 * Background service-worker tests.
 *
 * Loads the real src/background.js into a vm sandbox with a recording mock of
 * the chrome.* APIs plus an importScripts shim (so the settings.js single
 * source of truth loads exactly like in the real worker). Guards the context
 * menu build (a real bug lived here: menu ignored format settings), scoped
 * items, separator logic, storage-change rebuilds and keyboard commands.
 *
 * Usage: node test/background.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Builds a sandbox with a recording chrome mock and loads background.js.
 * @param {object} storedData what chrome.storage.sync "contains"
 */
function makeWorker(storedData) {
  const state = {
    stored: storedData || {},
    created: [],          // chrome.contextMenus.create calls (props)
    createdTabs: [],      // chrome.tabs.create calls (props)
    removeAllCalls: 0,
    sent: [],             // chrome.tabs.sendMessage calls {tabId, msg}
    listeners: { installed: [], startup: [], storage: [], clicked: [], command: [] },
    tabs: [{ id: 7, url: "https://gemini.google.com/app/x", active: true }],
  };

  const chrome = {
    storage: {
      sync: {
        get: async (key) => {
          if (typeof key === "string") return { [key]: state.stored[key] };
          const out = {};
          for (const k of Object.keys(key || {})) {
            out[k] = state.stored[k] !== undefined ? state.stored[k] : key[k];
          }
          return out;
        },
        set: async (obj) => { Object.assign(state.stored, obj); },
      },
      onChanged: { addListener: (fn) => state.listeners.storage.push(fn) },
    },
    contextMenus: {
      create: (props) => { state.created.push(props); return props.id; },
      removeAll: (cb) => { state.removeAllCalls++; state.created.length = 0; if (cb) cb(); },
      onClicked: { addListener: (fn) => state.listeners.clicked.push(fn) },
    },
    runtime: {
      onInstalled: { addListener: (fn) => state.listeners.installed.push(fn) },
      onStartup: { addListener: (fn) => state.listeners.startup.push(fn) },
      getURL: (rel) => "chrome-extension://test-id/" + rel,
    },
    tabs: {
      query: async (q) => {
        let tabs = state.tabs;
        if (q && q.active) tabs = tabs.filter((t) => t.active);
        return tabs;
      },
      sendMessage: async (tabId, msg) => { state.sent.push({ tabId, msg }); },
      create: (props) => { state.createdTabs.push(props); },
    },
    commands: {
      onCommand: { addListener: (fn) => state.listeners.command.push(fn) },
    },
  };

  const sandbox = { chrome, console, setTimeout, clearTimeout };
  sandbox.importScripts = (...rels) => {
    for (const rel of rels) {
      const file = path.join(root, "src", rel);
      vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: rel });
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/background.js"), "utf8"),
    sandbox,
    { filename: "src/background.js" }
  );
  return { state, sandbox };
}

/** Triggers onInstalled (menu build) and waits for the async rebuild. */
async function install(state) {
  for (const fn of state.listeners.installed) fn();
  await tick();
}

const itemIds = (state) =>
  state.created.filter((p) => p.type !== "separator" && p.id !== "gep-parent").map((p) => p.id);

// =====================================================================
section("Single source of truth");

{
  const { sandbox } = makeWorker({});
  check("settings.js loaded via importScripts", !!(sandbox.GEP && sandbox.GEP.settings));
  // Top-level consts live in the context's scope, not on the sandbox object —
  // evaluate the identity check inside the context itself.
  check(
    "DEFAULT_FORMATS is GEP.settings.DEFAULTS",
    vm.runInContext("DEFAULT_FORMATS === GEP.settings.DEFAULTS", sandbox) === true
  );
}

// =====================================================================
section("Menu build from defaults");

{
  const { state } = makeWorker({}); // nothing stored → pure defaults
  await install(state);

  const ids = itemIds(state);
  check("parent menu created", state.created.some((p) => p.id === "gep-parent"));
  // Defaults: clipboard_md, markdown, reader, docx, pdf ON (5 items; no scoped
  // items because their base formats markdown=on → markdown@tables gated by
  // "markdown" key which IS on… base:"markdown" → enabled). Recompute:
  // scoped items are gated by their base format, so markdown@tables and
  // markdown@nosrc are also visible with default settings.
  check("default ON item present: markdown", ids.includes("gep-markdown"));
  check("default ON item present: reader", ids.includes("gep-reader"));
  check("default OFF item absent: txt", !ids.includes("gep-txt"));
  check("default OFF item absent: epub", !ids.includes("gep-epub"));
  check("scoped item follows base: markdown@tables", ids.includes("gep-markdown@tables"));
  check("scoped item follows base: csv@tables absent (csv off)", !ids.includes("gep-csv@tables"));
  check("all items target gemini pages", state.created.every(
    (p) => (p.documentUrlPatterns || [])[0] === "https://gemini.google.com/*"
  ));
}

// =====================================================================
section("Menu respects stored formats");

{
  const { state } = makeWorker({
    formats: { markdown: false, txt: true, epub: true },
  });
  await install(state);

  const ids = itemIds(state);
  check("disabled stored format absent: markdown", !ids.includes("gep-markdown"));
  check("enabled stored format present: txt", ids.includes("gep-txt"));
  check("enabled stored format present: epub", ids.includes("gep-epub"));
  check("scoped item hidden when base off", !ids.includes("gep-markdown@tables"));
  check("unspecified keys keep defaults: docx", ids.includes("gep-docx"));
}

{
  // Separator logic: no dangling separators, none adjacent.
  const { state } = makeWorker({});
  await install(state);
  const children = state.created.filter((p) => p.id !== "gep-parent");
  check("no leading separator", children[0].type !== "separator");
  check("no trailing separator", children[children.length - 1].type !== "separator");
  const adjacent = children.some((p, i) => p.type === "separator" && (children[i + 1] || {}).type === "separator");
  check("no adjacent separators", !adjacent);
}

// =====================================================================
section("First-run onboarding");

{
  const { state } = makeWorker({});
  for (const fn of state.listeners.installed) fn({ reason: "install" });
  await tick();
  check("install opens options page once", state.createdTabs.length === 1);
  check("welcome flag present in url", (state.createdTabs[0] || {}).url ===
    "chrome-extension://test-id/src/options/options.html?welcome=1");

  state.createdTabs.length = 0;
  for (const fn of state.listeners.installed) fn({ reason: "update" });
  await tick();
  check("update does not open options page", state.createdTabs.length === 0);
}

// =====================================================================
section("Storage-change rebuild");

{
  const { state } = makeWorker({});
  await install(state);
  const before = state.removeAllCalls;

  for (const fn of state.listeners.storage) fn({ formats: { newValue: {} } }, "sync");
  await tick();
  check("formats change triggers rebuild", state.removeAllCalls === before + 1);

  for (const fn of state.listeners.storage) fn({ options: { newValue: {} } }, "sync");
  await tick();
  check("options change does not rebuild", state.removeAllCalls === before + 1);

  for (const fn of state.listeners.storage) fn({ formats: { newValue: {} } }, "local");
  await tick();
  check("non-sync area ignored", state.removeAllCalls === before + 1);
}

// =====================================================================
section("Context-menu clicks");

{
  const { state } = makeWorker({});
  await install(state);

  for (const fn of state.listeners.clicked) {
    await fn({ menuItemId: "gep-markdown@tables" }, { id: 42 });
  }
  check("click sends GEP_EXPORT with scoped format", state.sent.some(
    (s) => s.tabId === 42 && s.msg.type === "GEP_EXPORT" && s.msg.format === "markdown@tables"
  ));

  state.sent.length = 0;
  for (const fn of state.listeners.clicked) {
    await fn({ menuItemId: "gep-parent" }, { id: 42 });
    await fn({ menuItemId: "gep-sep0" }, { id: 42 });
    await fn({ menuItemId: "unrelated" }, { id: 42 });
  }
  check("parent/separator/foreign clicks ignored", state.sent.length === 0);
}

// =====================================================================
section("Keyboard commands");

{
  const { state } = makeWorker({ options: { primary_format: "docx" } });
  await install(state);

  for (const fn of state.listeners.command) await fn("export_primary");
  check("export_primary uses stored primary format", state.sent.some(
    (s) => s.msg.type === "GEP_EXPORT" && s.msg.format === "docx"
  ));

  state.sent.length = 0;
  for (const fn of state.listeners.command) await fn("copy_markdown");
  check("copy_markdown routes clipboard_md", state.sent.some((s) => s.msg.format === "clipboard_md"));

  state.sent.length = 0;
  for (const fn of state.listeners.command) await fn("download_all");
  check("download_all routes zip_all", state.sent.some((s) => s.msg.format === "zip_all"));

  state.sent.length = 0;
  for (const fn of state.listeners.command) await fn("unknown_command");
  check("unknown command ignored", state.sent.length === 0);
}

{
  // primary_format not stored → falls back to markdown.
  const { state } = makeWorker({});
  await install(state);
  for (const fn of state.listeners.command) await fn("export_primary");
  check("export_primary falls back to markdown", state.sent.some((s) => s.msg.format === "markdown"));
}

{
  // No Gemini tab at all → command silently ignored.
  const { state } = makeWorker({});
  state.tabs = [];
  await install(state);
  for (const fn of state.listeners.command) await fn("copy_markdown");
  check("no gemini tab → no message", state.sent.length === 0);
}

// =====================================================================
console.log(`\n${"═".repeat(58)}`);
console.log(`  ${passed}/${total} background checks passed.`);
console.log(ok ? "  All background checks passed. ✓" : "  SOME CHECKS FAILED ✗");
console.log("═".repeat(58) + "\n");
process.exit(ok ? 0 : 1);
