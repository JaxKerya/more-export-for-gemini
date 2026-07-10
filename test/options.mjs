/**
 * Options page tests.
 *
 * Loads the real options.html into linkedom and imports the real ES-module
 * entry (src/options/options.js) against a recording chrome mock. Unlike the
 * content-script tests (vm sandbox), the options page is an ES module, so the
 * shims live on globalThis and the classic GEP libs are evaluated with
 * vm.runInThisContext (which shares that global).
 *
 * Covers: initial render from storage, toggle/select persistence, per-format
 * overrides, profile save/apply/delete, recent-report history entries and the
 * storage.onChanged cross-context sync.
 *
 * Usage: node test/options.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const tick = () => new Promise((r) => setTimeout(r, 0));

// ── DOM: the real options page ──────────────────────────────────────
const optionsHtml = fs.readFileSync(path.join(root, "src", "options", "options.html"), "utf8");
const { window, document } = parseHTML(optionsHtml);

// ── chrome mock with live stores + recorded writes ──────────────────
const syncStore = {};
const localStore = {};
const syncWrites = [];
const changedListeners = [];

function storageGet(store) {
  return async (defaults) => {
    const out = {};
    for (const k of Object.keys(defaults || {})) {
      out[k] = store[k] !== undefined ? structuredClone(store[k]) : defaults[k];
    }
    return out;
  };
}

const chromeMock = {
  storage: {
    sync: {
      get: storageGet(syncStore),
      set: async (obj) => {
        Object.assign(syncStore, structuredClone(obj));
        syncWrites.push(structuredClone(obj));
      },
    },
    local: {
      get: storageGet(localStore),
      set: async (obj) => { Object.assign(localStore, structuredClone(obj)); },
    },
    onChanged: { addListener: (fn) => changedListeners.push(fn) },
  },
  runtime: {
    getManifest: () => ({ version: "9.9.9", version_name: "9.9.9 Test" }),
  },
  tabs: { query: async () => [] },
  i18n: { getMessage },
};

/** Simulates a write from another context (popup / second window). */
function fireExternalChange(changes) {
  for (const fn of changedListeners) fn(changes, "sync");
}

// ── Globals the page world expects ───────────────────────────────────
let reloadCount = 0;

Object.assign(globalThis, {
  window,
  document,
  chrome: chromeMock,
  Event: window.Event,
  location: {
    href: "chrome-extension://test/src/options/options.html",
    search: "",
    hash: "",
    pathname: "/src/options/options.html",
    reload: () => { reloadCount++; },
  },
  history: { replaceState() {} },
  localStorage: {
    _s: {},
    getItem(k) { return k in this._s ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
});
window.location = globalThis.location;

// linkedom's <select> exposes only a value getter; give it browser-like
// get/set semantics (select the matching <option>) for the page code.
{
  const selectProto = Object.getPrototypeOf(document.createElement("select"));
  Object.defineProperty(selectProto, "value", {
    configurable: true,
    get() {
      const opts = [...this.querySelectorAll("option")];
      const sel = opts.find((o) => o.hasAttribute("selected")) || opts[0];
      return sel ? (sel.getAttribute("value") ?? sel.textContent) : "";
    },
    set(v) {
      for (const o of this.querySelectorAll("option")) {
        const val = o.getAttribute("value") ?? o.textContent;
        if (val === String(v)) o.setAttribute("selected", "");
        else o.removeAttribute("selected");
      }
    },
  });
}

// ── Classic GEP libs (attach to window.GEP / globalThis.GEP) ─────────
for (const f of ["src/lib/i18n.js", "src/lib/settings.js", "src/lib/export-opts.js", "src/lib/history.js", "src/lib/links.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}
const GEP = globalThis.GEP;

// ── Seed storage BEFORE the page boots ───────────────────────────────
syncStore.formats = { ...GEP.settings.DEFAULTS, txt: false, epub: true };
syncStore.options = { ...GEP.settings.OPTION_DEFAULTS, citation_style: "apa" };
syncStore.overrides = {};
await GEP.history.add(
  {
    title: "Seeded report",
    url: "https://gemini.google.com/app/x",
    blocks: [{ type: "paragraph", runs: [{ text: "hello" }] }],
    footnotes: [{ id: 1, title: "Src", url: "https://example.com" }],
  },
  { format: "markdown" }
);

// ── Boot the real page module ────────────────────────────────────────
await import(pathToFileURL(path.join(root, "src", "options", "options.js")).href);
await tick();

// =====================================================================
section("Initial render from storage");

{
  const input = (fmt) => document.querySelector(`.toggle[data-format="${fmt}"] input`);
  check("stored format reflected (epub on)", input("epub").checked === true);
  check("stored format reflected (txt off)", input("txt").checked === false);
  check("default format reflected (markdown on)", input("markdown").checked === true);
  check("citation select shows stored value",
    document.getElementById("citationStyle").value === "apa");
  check("overview summary shows citation label",
    (document.getElementById("ovCitation").textContent || "").length > 0);
  const enabled = Object.values(syncStore.formats).filter(Boolean).length;
  check("sidebar footer counts enabled formats",
    document.getElementById("enabledCountFooter").textContent.startsWith(String(enabled)));
}

// =====================================================================
section("Toggles and selects persist to storage.sync");

{
  const txtToggle = document.querySelector('.toggle[data-format="txt"] input');
  txtToggle.checked = true;
  txtToggle.dispatchEvent(new window.Event("change"));
  await tick();
  check("format toggle write recorded", syncWrites.length > 0);
  check("txt enabled in stored formats", syncStore.formats.txt === true);

  const citation = document.getElementById("citationStyle");
  citation.value = "ieee";
  citation.dispatchEvent(new window.Event("change"));
  await tick();
  check("citation change persisted", syncStore.options.citation_style === "ieee");

  const toc = document.querySelector('.toggle[data-option="include_toc"] input');
  toc.checked = true;
  toc.dispatchEvent(new window.Event("change"));
  await tick();
  check("boolean option persisted", syncStore.options.include_toc === true);
}

// =====================================================================
section("Per-format overrides");

{
  const fmtSel = document.getElementById("overrideFormat");
  const fmt = fmtSel.value;
  check("override format select has a value", typeof fmt === "string" && fmt.length > 0);

  const tocSel = document.getElementById("overrideToc");
  tocSel.value = "off";
  tocSel.dispatchEvent(new window.Event("change"));
  await tick();
  check("override persisted for selected format",
    syncStore.overrides[fmt] && syncStore.overrides[fmt].include_toc === false);
  check("override status describes the override",
    document.getElementById("overrideStatus").textContent.includes("TOC off"));

  tocSel.value = "";
  tocSel.dispatchEvent(new window.Event("change"));
  await tick();
  check("clearing the override removes the entry", !(fmt in syncStore.overrides));
}

// =====================================================================
section("Profiles: save / apply / delete");

{
  const nameInput = document.getElementById("profileName");
  const saveBtn = document.getElementById("profileSaveBtn");
  const list = document.getElementById("profileList");

  nameInput.value = "Academic";
  saveBtn.dispatchEvent(new window.Event("click"));
  await tick();
  check("profile stored in sync", !!(syncStore.profiles && syncStore.profiles.Academic));
  check("profile snapshot captures citation style",
    syncStore.profiles.Academic.options.citation_style === "ieee");
  check("profile listed in UI", list.querySelectorAll(".profile-item").length === 1);

  // Drift the live state, then apply the profile to restore it.
  const citation = document.getElementById("citationStyle");
  citation.value = "mla";
  citation.dispatchEvent(new window.Event("change"));
  await tick();
  check("live state drifted", syncStore.options.citation_style === "mla");

  const applyBtn = list.querySelector(".profile-item .backup-btn");
  applyBtn.dispatchEvent(new window.Event("click"));
  await tick();
  check("apply restores citation style", syncStore.options.citation_style === "ieee");
  check("apply syncs the select control", citation.value === "ieee");

  const delBtn = list.querySelector(".profile-item .backup-btn.danger");
  delBtn.dispatchEvent(new window.Event("click"));
  await tick();
  check("delete removes profile from sync", !(syncStore.profiles && syncStore.profiles.Academic));
  check("delete removes profile from UI", list.querySelectorAll(".profile-item").length === 0);
}

// =====================================================================
section("Recent reports from export history");

{
  const list = document.getElementById("recentList");
  const items = list.querySelectorAll(".recent-item");
  check("seeded backup listed", items.length === 1);
  check("entry shows the report title",
    items[0].textContent.includes("Seeded report"));

  const loadBtn = items[0].querySelector(".backup-btn");
  loadBtn.dispatchEvent(new window.Event("click"));
  await tick();
  check("load enables the re-export button",
    document.getElementById("reexportBtn").disabled === false);
  check("load shows the report in the file line",
    document.getElementById("reexportFileName").textContent.includes("Seeded report"));

  const delBtn = items[0].querySelector(".backup-btn.danger");
  delBtn.dispatchEvent(new window.Event("click"));
  await tick();
  check("delete empties the history", (await GEP.history.list()).length === 0);
  check("empty state rendered", list.querySelectorAll(".recent-empty").length === 1);
}

// =====================================================================
section("storage.onChanged: external writes update the page");

{
  const citation = document.getElementById("citationStyle");
  const newOptions = { ...syncStore.options, citation_style: "chicago" };
  fireExternalChange({ options: { newValue: newOptions } });
  await tick();
  check("external option change updates the select", citation.value === "chicago");

  const newFormats = { ...syncStore.formats, epub: false };
  fireExternalChange({ formats: { newValue: newFormats } });
  await tick();
  check("external format change updates the toggle",
    document.querySelector('.toggle[data-format="epub"] input').checked === false);

  fireExternalChange({
    profiles: { newValue: { Remote: { options: { citation_style: "apa" }, savedAt: 1 } } },
  });
  await tick();
  check("external profile change re-renders the list",
    document.getElementById("profileList").querySelectorAll(".profile-item").length === 1);
}

// =====================================================================
section("Pinned UI language (uiLang)");

{
  const langSel = document.getElementById("uiLang");
  check("language select present, defaults to auto", !!langSel && langSel.value === "auto");

  langSel.value = "tr";
  langSel.dispatchEvent(new window.Event("change"));
  await tick();
  check("language choice persisted to sync", syncStore.uiLang === "tr");

  // A uiLang change (own write or another window) must reload the page so
  // every static and dynamically-rendered string re-localizes.
  chromeMock.runtime.getURL = (p) => p;
  globalThis.fetch = async (p) => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(path.join(root, p), "utf8")),
  });
  fireExternalChange({ uiLang: { newValue: "tr" } });
  await tick();
  check("uiLang change reloads the page", reloadCount === 1);

  // The i18n helper must serve the pinned catalog instead of chrome.i18n.
  await GEP.i18n.init(true);
  check("pinned catalog overrides chrome.i18n",
    GEP.i18n.t("optLangAuto") === "Otomatik (tarayıcı dili)");
  check("substitutions work in the pinned catalog",
    GEP.i18n.t("toastDownloading", "x.md").includes("x.md"));
  check("missing key falls back to chrome.i18n / key",
    GEP.i18n.t("definitelyNotAKey") === "definitelyNotAKey");
  check("normalizeLang clamps unknown values", GEP.i18n.normalizeLang("xx") === "auto");

  // Back to auto: t() serves the browser language again.
  syncStore.uiLang = "auto";
  await GEP.i18n.init(true);
  check("auto restores browser-language lookups",
    GEP.i18n.t("optLangAuto") === "Auto (browser language)");
}

// =====================================================================
console.log(`\n  ${passed}/${total} options-page checks passed.`);
if (!ok) {
  console.error("  Some options-page checks FAILED. ✗");
  process.exit(1);
}
console.log("  All options-page checks passed. ✓");
