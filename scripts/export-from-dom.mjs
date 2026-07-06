/**
 * End-to-end export harness: real Gemini DOM -> IR -> every text exporter -> disk.
 *
 * This is the companion to test/extractor.mjs. Where that test only checks the
 * DOM->IR half, this script runs the FULL pipeline the extension runs in the
 * browser: it loads the real extractor + all lib modules + all text exporters
 * into a linkedom-backed sandbox, extracts the IR from a captured DOM, then
 * writes one output file per format so you can:
 *
 *   1. read the actual converted output by hand (e.g. inspect RTF math), and
 *   2. feed the folder to scripts/external-validate.mjs for parser-level checks:
 *        node scripts/external-validate.mjs validate/output
 *
 * HOW TO CAPTURE THE DOM (most faithful input):
 *   In Gemini, open DevTools (F12), select the report body container in the
 *   Elements panel → right-click → Copy → Copy outerHTML, and save it to
 *   referance/outer-html.md. That single capture is enough: the sources panel
 *   (browse-web-item elements with URLs/titles) lives inside the same report
 *   subtree, so the extractor resolves footnote URLs from it directly — no
 *   separate sources file is needed.
 *
 *   outerHTML (not rendered text) preserves math (data-math / KaTeX
 *   annotations), footnote source indices, table structure and code-block
 *   languages — all of which are lost if you copy text only.
 *
 * Usage:
 *   node scripts/export-from-dom.mjs [contentFile] [sourcesFile] [--out=dir]
 *
 *   contentFile   HTML/outerHTML of the report body
 *                 (default: referance/outer-html.md)
 *   sourcesFile   optional extra HTML appended to the DOM, only for the rare
 *                 case where the sources panel was captured separately.
 *   --out=dir     output directory (default: validate/output)
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── CLI args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const outArg = argv.find((a) => a.startsWith("--out="));
const positional = argv.filter((a) => !a.startsWith("--"));
const contentFile = path.resolve(root, positional[0] || "referance/outer-html.md");
// The sources panel is part of the report subtree, so a second capture is
// normally unnecessary. Only appended when explicitly passed.
const sourcesFile = positional[1] ? path.resolve(root, positional[1]) : null;
const outDir = path.resolve(root, outArg ? outArg.slice("--out=".length) : "validate/output");

if (!fs.existsSync(contentFile)) {
  console.error(`Content file not found: ${contentFile}`);
  process.exit(2);
}

// ── build a browser-like sandbox over the captured DOM ──────────────────────
const content = fs.readFileSync(contentFile, "utf8");
const sources = sourcesFile && fs.existsSync(sourcesFile) ? fs.readFileSync(sourcesFile, "utf8") : "";
const html = `<!DOCTYPE html><html><body>${content}\n${sources}</body></html>`;

const { window, document } = parseHTML(html);

const sandbox = {
  window,
  document,
  Node: window.Node,
  console,
  location: { href: "https://gemini.google.com/app/harness" },
  navigator: { clipboard: { writeText: async () => {} }, userAgent: "node" },
  chrome: undefined,
  // Node globals that vm contexts do not inherit but exporters may touch.
  setTimeout, clearTimeout, queueMicrotask,
  TextEncoder, TextDecoder, URL, URLSearchParams,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
};
sandbox.window.location = sandbox.location;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(rel, { optional = false } = {}) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    if (!optional) console.warn(`  (skip, missing) ${rel}`);
    return false;
  }
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: rel });
    return true;
  } catch (err) {
    console.warn(`  (load failed) ${rel}: ${String(err.message || err).split("\n")[0]}`);
    return false;
  }
}

// vendor first (math/code rendering used by html/reader), then libs, then the
// extractor, then every exporter. Anything browser-only that throws at load is
// caught and simply disables the formats that depend on it.
for (const f of ["src/vendor/katex.js", "src/vendor/highlight.js"]) load(f, { optional: true });
for (const f of [
  "src/lib/texmath.js", "src/lib/links.js", "src/lib/citation.js",
  "src/lib/docmeta.js", "src/lib/toc.js", "src/lib/validator.js", "src/lib/ir-filter.js",
]) load(f);
load("src/lib/extractor.js");
for (const f of fs.readdirSync(path.join(root, "src/exporters")).sort()) {
  if (f.endsWith(".js")) load(`src/exporters/${f}`, { optional: true });
}

const GEP = sandbox.window.GEP;
if (!GEP || !GEP.extractor) {
  console.error("extractor failed to load into sandbox");
  process.exit(2);
}

// ── extract IR ──────────────────────────────────────────────────────────────
const ir = GEP.extractor.extract();
if (!ir) {
  console.error("extract() returned null — no content root found in the captured DOM.");
  process.exit(1);
}

const blockCounts = {};
for (const b of ir.blocks) blockCounts[b.type] = (blockCounts[b.type] || 0) + 1;
const inlineMath = ir.blocks.reduce((n, b) => n + (b.runs || []).filter((r) => r.math).length, 0);

console.log(`\nExtracted IR from: ${path.relative(root, contentFile)}`);
console.log(`  title:      ${JSON.stringify(ir.title)}`);
console.log(`  blocks:     ${ir.blocks.length}  ${JSON.stringify(blockCounts)}`);
console.log(`  inlineMath: ${inlineMath}`);
console.log(`  footnotes:  ${ir.footnotes.length} (${ir.footnotes.filter((f) => f.url).length} with URL)`);

// ── run every text exporter ──────────────────────────────────────────────────
// Mirrors content.js getExportOpts() defaults.
const opts = {
  flavor: "gfm",
  includeToc: true,
  includeFootnotes: true,
  citationStyle: "numbered",
  meta: { author: "", affiliation: "", keywords: "", abstract: "" },
};

// format key -> output filename (extension drives external-validate routing).
const TEXT_FORMATS = {
  markdown: "markdown.md",
  txt: "txt.txt",
  html: "html.html",
  reader: "reader.html",
  json: "json.json",
  latex: "latex.tex",
  csv: "csv.csv",
  bibtex: "bibtex.bib",
  ris: "ris.ris",
  csljson: "csljson.json",
  rtf: "rtf.rtf",
};

fs.mkdirSync(outDir, { recursive: true });
console.log(`\nWriting outputs to: ${path.relative(root, outDir)}`);
console.log("─".repeat(60));

let written = 0;
const failures = [];
for (const [fmt, fileName] of Object.entries(TEXT_FORMATS)) {
  const mod = GEP[fmt];
  if (!mod || typeof mod.convert !== "function") {
    console.log(`  skip  ${fmt.padEnd(12)} (exporter not available)`);
    continue;
  }
  try {
    const result = mod.convert(ir, opts);
    const text = typeof result === "string" ? result : String(result);
    fs.writeFileSync(path.join(outDir, fileName), text, "utf8");
    console.log(`  ok    ${fmt.padEnd(12)} → ${fileName} (${text.length} chars)`);
    written++;
  } catch (err) {
    failures.push(fmt);
    console.log(`  FAIL  ${fmt.padEnd(12)} ${String(err.message || err).split("\n")[0]}`);
  }
}

console.log("─".repeat(60));
console.log(`  ${written} written, ${failures.length} failed.`);
console.log(`\nNext: node scripts/external-validate.mjs ${path.relative(root, outDir)}\n`);
process.exitCode = failures.length ? 1 : 0;
