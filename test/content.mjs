/**
 * Content-script orchestration smoke tests.
 *
 * Loads the real full GEP stack + src/content.js into a vm sandbox backed by
 * the linkedom Gemini fixture, with a recording chrome mock. Exercises the
 * runtime message handlers end to end: PING, EXPORT (download capture),
 * QUALITY and invalid input.
 *
 * Usage: node test/content.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

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

// ── Sandbox over the Gemini fixture ─────────────────────────────────
const fixtureHtml = fs.readFileSync(path.join(__dirname, "fixtures", "gemini-report.html"), "utf8");
const { window, document } = parseHTML(fixtureHtml);

const messageListeners = [];
const storageListeners = [];

const chromeMock = {
  storage: {
    sync: {
      get: async (defaults) => defaults,
      set: async () => {},
    },
    onChanged: { addListener: (fn) => storageListeners.push(fn) },
  },
  runtime: {
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
    getManifest: () => ({ version: "0.0.0-test" }),
  },
};

const sandbox = {
  window,
  document,
  Node: window.Node,
  console,
  chrome: chromeMock,
  location: { href: "https://gemini.google.com/app/test" },
  navigator: { clipboard: { writeText: async () => {} }, userAgent: "node" },
  setTimeout, clearTimeout, queueMicrotask,
  Blob, TextEncoder, TextDecoder, DataView, Uint8Array, Uint32Array,
  URL, URLSearchParams,
  // content.js observes the document at load; a no-op observer is enough here.
  MutationObserver: class { observe() {} disconnect() {} },
};
sandbox.window.location = sandbox.location;
vm.createContext(sandbox);

// Same order as manifest.json content_scripts.
const STACK = [
  "src/vendor/katex.js", "src/vendor/highlight.js",
  "src/lib/texmath.js", "src/lib/docmeta.js", "src/lib/export-opts.js",
  "src/lib/source-hygiene.js",
  "src/exporters/zip.js", "src/exporters/markdown.js", "src/exporters/txt.js",
  "src/exporters/docx.js", "src/exporters/pdf.js", "src/exporters/html.js",
  "src/exporters/reader.js", "src/exporters/json.js", "src/exporters/latex.js",
  "src/exporters/csv.js", "src/exporters/epub.js", "src/exporters/bibtex.js",
  "src/exporters/ris.js", "src/exporters/csljson.js", "src/exporters/rtf.js",
  "src/exporters/vault.js",
  "src/lib/extractor.js", "src/lib/validator.js", "src/lib/download.js",
  "src/lib/settings.js", "src/lib/citation.js", "src/lib/toc.js",
  "src/lib/ir-filter.js", "src/lib/menu-injector.js",
  "src/content.js",
];
for (const f of STACK) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const GEP = sandbox.window.GEP;

// Capture downloads instead of touching URL.createObjectURL / anchors.
const downloads = [];
GEP.download.downloadBlob = (data, fileName, mimeType) => {
  downloads.push({ data, fileName, mimeType });
};

/** Sends a runtime message and resolves with the sendResponse payload. */
function send(msg) {
  return new Promise((resolve) => {
    let responded = false;
    for (const fn of messageListeners) {
      fn(msg, { id: "test" }, (payload) => { responded = true; resolve(payload); });
    }
    // Handlers always return true (async); guard against silent drops.
    setTimeout(() => { if (!responded) resolve(undefined); }, 200);
  });
}

// =====================================================================
section("Registration & PING");

check("content.js registered a message listener", messageListeners.length === 1);
check("storage change listener registered", storageListeners.length >= 1);

{
  const res = await send({ type: "GEP_PING" });
  check("PING reports content on fixture page", res && res.hasContent === true);
}

{
  const res = await send({ type: "not-a-real-type" });
  check("unknown message type ignored", res === undefined);
}

// =====================================================================
section("EXPORT via message");

let fullMarkdown = "";
{
  downloads.length = 0;
  const res = await send({ type: "GEP_EXPORT", format: "markdown" });
  await tick();
  check("markdown export responds ok", res && res.ok === true);
  check("markdown export produced one download", downloads.length === 1);
  const dl = downloads[0] || {};
  check("file name carries .md extension", typeof dl.fileName === "string" && dl.fileName.endsWith(".md"));
  check("mime is markdown", (dl.mimeType || "").startsWith("text/markdown"));
  check("content includes fixture title", typeof dl.data === "string" && dl.data.includes("The Ontology of Sound"));
  fullMarkdown = typeof dl.data === "string" ? dl.data : "";
}

{
  downloads.length = 0;
  const res = await send({ type: "GEP_EXPORT", format: "markdown@tables" });
  await tick();
  check("scoped export responds ok", res && res.ok === true);
  check("scoped export downloads", downloads.length === 1);
  const dl = downloads[0] || {};
  check("scoped output is filtered (smaller than full export)",
    typeof dl.data === "string" && dl.data.length > 0 && dl.data.length < fullMarkdown.length);
}

{
  downloads.length = 0;
  const res = await send({ type: "GEP_EXPORT", format: "docx" });
  await tick();
  check("docx export responds ok", res && res.ok === true);
  check("docx export downloads a Blob", downloads.length === 1 && downloads[0].data instanceof Blob);
  check("docx file name carries .docx", downloads[0].fileName.endsWith(".docx"));
}

{
  downloads.length = 0;
  const res = await send({ type: "GEP_EXPORT", format: 123 });
  check("non-string format rejected", res && res.ok === false);
  check("no download on invalid format", downloads.length === 0);
}

{
  downloads.length = 0;
  const res = await send({ type: "GEP_EXPORT", format: "definitely-not-a-format" });
  await tick();
  check("unknown format resolves without download", res && res.ok === true && downloads.length === 0);
}

// =====================================================================
section("QUALITY & DIAGNOSE");

{
  const res = await send({ type: "GEP_QUALITY" });
  check("quality responds ok", res && res.ok === true);
  check("quality returns a report", res && res.report && typeof res.report.ok === "boolean");
}

{
  downloads.length = 0;
  const res = await send({ type: "GEP_DIAGNOSE" });
  check("diagnose responds ok", res && res.ok === true);
  check("diagnose downloads report file", downloads.length === 1 && downloads[0].fileName === "gep-diagnostics.txt");
  const text = downloads[0].data;
  check("diagnostics text includes content root", typeof text === "string" && text.includes("Content root"));
  check("diagnostics text includes menu stats", typeof text === "string" && text.includes("Menu injection"));
}

// =====================================================================
console.log(`\n${"═".repeat(58)}`);
console.log(`  ${passed}/${total} content-script checks passed.`);
console.log(ok ? "  All content-script checks passed. ✓" : "  SOME CHECKS FAILED ✗");
console.log("═".repeat(58) + "\n");
process.exit(ok ? 0 : 1);
