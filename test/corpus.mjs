/**
 * Report-corpus pipeline test: every real Gemini capture in
 * referance/reports/ runs through the FULL pipeline the extension runs in
 * the browser — DOM → extractor → IR → every exporter — and the outputs get
 * the same structural checks (test/format-checks.mjs) that test/validate.mjs
 * applies to the real browser-exported /validate set.
 *
 * Why: the extractor test only asserts that extraction *succeeds* on these
 * captures; the deep per-format checks used to see exactly one manually
 * exported report. Real reports are where exporter edge cases live (code
 * blocks containing `**` and `#include <...>`, mixed-language prose, odd
 * table shapes) — this test runs all of them on every push.
 *
 * Options are pinned to the same set the Validation Set button uses (GFM +
 * numbered citations, TOC and footnotes on) so the two pipelines stay
 * comparable.
 *
 * Corpus files are raw outerHTML pastes named report[N].md; any number of
 * captures is picked up automatically. Usage: node test/corpus.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import {
  makeContext, readZipEntries,
  checkMarkdown, checkTxt, checkHtml, checkJson, checkLatex, checkCsv,
  checkBib, checkRis, checkRtf, checkDocx, checkEpub, checkCrossFormat,
} from "./format-checks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportsDir = path.join(root, "referance", "reports");

let ok = true;
let total = 0;
let passed = 0;
const failures = [];
let currentReport = "";

function check(label, cond) {
  total++;
  if (cond) {
    passed++;
  } else {
    ok = false;
    failures.push(`[${currentReport}] ${label}`);
    console.error(`  ✗ ${label}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}`);
}

// ── Sandbox: the same module stack the content script runs ───────────

/**
 * Builds a linkedom-backed sandbox over one captured DOM and loads vendors,
 * libs, the extractor and every exporter into it — mirroring
 * scripts/export-from-dom.mjs (the manual single-report harness).
 */
function makeSandbox(content) {
  const html = `<!DOCTYPE html><html><body>${content}</body></html>`;
  const { window, document } = parseHTML(html);

  const sandbox = {
    window,
    document,
    Node: window.Node,
    console,
    location: { href: "https://gemini.google.com/app/corpus-test" },
    navigator: { clipboard: { writeText: async () => {} }, userAgent: "node" },
    chrome: undefined,
    setTimeout, clearTimeout, queueMicrotask,
    TextEncoder, TextDecoder, URL, URLSearchParams,
    Blob, DataView, Uint8Array, Uint32Array, JSON,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
  };
  sandbox.window.location = sandbox.location;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const load = (rel, optional = false) => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      if (!optional) throw new Error(`missing module: ${rel}`);
      return;
    }
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: rel });
  };

  // Vendors first (math/code rendering used by html/reader), then libs,
  // the extractor and every exporter (zip.js is among them).
  load("src/vendor/katex.js", true);
  load("src/vendor/highlight.js", true);
  for (const f of [
    "src/lib/texmath.js", "src/lib/links.js", "src/lib/citation.js",
    "src/lib/docmeta.js", "src/lib/toc.js", "src/lib/validator.js",
    "src/lib/ir-filter.js",
  ]) load(f);
  load("src/lib/selectors.js");
  load("src/lib/extractor.js");
  for (const f of fs.readdirSync(path.join(root, "src/exporters")).sort()) {
    if (f.endsWith(".js")) load(`src/exporters/${f}`);
  }

  return sandbox.window.GEP;
}

// ── Pipeline per capture ─────────────────────────────────────────────

// Same pinned options as the Validation Set button: what the shared
// assertions were written against.
const OPTS = {
  flavor: "gfm",
  includeToc: true,
  includeFootnotes: true,
  citationStyle: "numbered",
  meta: { author: "", affiliation: "", keywords: "", abstract: "" },
};

/** Runs one converter, failing a check instead of aborting on throw. */
function gen(fmt, fn) {
  try {
    return fn();
  } catch (err) {
    check(`${fmt}: convert did not throw`, false);
    console.error(`    ${String(err && err.message || err).split("\n")[0]}`);
    return null;
  }
}

async function runReport(file) {
  currentReport = file;
  const content = fs.readFileSync(path.join(reportsDir, file), "utf8");
  const GEP = makeSandbox(content);
  check("modules loaded (extractor + exporters)", !!(GEP && GEP.extractor && GEP.markdown && GEP.zip));
  if (!GEP || !GEP.extractor) return;

  const ir = gen("extract", () => GEP.extractor.extract());
  check("extract returns IR with blocks", !!(ir && Array.isArray(ir.blocks) && ir.blocks.length > 5));
  if (!ir) return;

  const tableCount = ir.blocks.filter((b) => b && b.type === "table").length;
  console.log(`  title: ${JSON.stringify(ir.title).slice(0, 70)}…  blocks: ${ir.blocks.length}, tables: ${tableCount}, footnotes: ${ir.footnotes.length}`);

  // Text formats.
  const md = gen("markdown", () => GEP.markdown.convert(ir, OPTS));
  const txt = gen("txt", () => GEP.txt.convert(ir, OPTS));
  const html = gen("html", () => GEP.html.convert(ir, OPTS));
  const jsonStr = gen("json", () => GEP.json.convert(ir));
  const tex = gen("latex", () => GEP.latex.convert(ir, OPTS));
  const csv = gen("csv", () => GEP.csv.convert(ir));
  const bib = gen("bibtex", () => GEP.bibtex.convert(ir));
  const ris = gen("ris", () => GEP.ris.convert(ir));
  const rtf = gen("rtf", () => GEP.rtf.convert(ir, OPTS));

  // Binary formats (Blob → Buffer).
  const docxBlob = gen("docx", () => GEP.docx.convert(ir, OPTS));
  const docxBuf = docxBlob ? Buffer.from(await docxBlob.arrayBuffer()) : null;
  const epubBlob = gen("epub", () => GEP.epub.convert(ir, OPTS));
  const epubBuf = epubBlob ? Buffer.from(await epubBlob.arrayBuffer()) : null;

  const ctx = makeContext(jsonStr);
  const c = (fmt) => (label, cond) => check(`${fmt}: ${label}`, cond);

  if (md) checkMarkdown(c("md"), md, ctx);
  if (txt) checkTxt(c("txt"), txt, ctx);
  if (html) checkHtml(c("html"), html, ctx);
  if (jsonStr) checkJson(c("json"), jsonStr, ctx);
  if (tex) checkLatex(c("tex"), tex, ctx);
  if (csv) checkCsv(c("csv"), csv, ctx);
  if (bib) checkBib(c("bib"), bib);
  if (ris) checkRis(c("ris"), ris);
  if (rtf) checkRtf(c("rtf"), rtf, ctx);
  if (docxBuf) checkDocx(c("docx"), docxBuf, ctx);
  if (epubBuf) checkEpub(c("epub"), epubBuf, ctx);
  checkCrossFormat(c("cross"), { md, txt, html, csv, bib, ris }, ctx);

  // XLSX: one worksheet per table (deep structure is covered by the
  // synthetic suite in edge-cases; here we assert the real-table wiring).
  if (tableCount > 0) {
    const xlsxBlob = gen("xlsx", () => GEP.xlsx.convert(ir));
    if (xlsxBlob) {
      const names = readZipEntries(Buffer.from(await xlsxBlob.arrayBuffer())).map((e) => e.name);
      check("xlsx: workbook part present", names.includes("xl/workbook.xml"));
      check("xlsx: one worksheet per table",
        names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length === tableCount);
    }
  }

  // Tail completeness: the report must not be truncated on export. Take the
  // longest word of the last text block (ground truth: IR) and require it in
  // the three main text formats.
  const blockText = (b) => {
    if (!b) return "";
    if (Array.isArray(b.runs)) return b.runs.map((r) => r.text || "").join("");
    if (Array.isArray(b.items)) return b.items.map((i) => (i.runs || []).map((r) => r.text || "").join("")).join(" ");
    return "";
  };
  let tailTok = "";
  for (let i = ir.blocks.length - 1; i >= 0 && !tailTok; i--) {
    const words = blockText(ir.blocks[i]).split(/\s+/).filter((w) => /^[\p{L}\p{N}]+$/u.test(w));
    tailTok = words.sort((a, b) => b.length - a.length)[0] || "";
  }
  if (tailTok) {
    if (md) check(`tail completeness in md ("${tailTok}")`, md.includes(tailTok));
    if (txt) check(`tail completeness in txt ("${tailTok}")`, txt.includes(tailTok));
    if (html) check(`tail completeness in html ("${tailTok}")`, html.includes(tailTok));
  }
}

// ── Main ─────────────────────────────────────────────────────────────

if (!fs.existsSync(reportsDir)) {
  console.log("referance/reports/ not found — nothing to do.");
  process.exit(0);
}

const reportFiles = fs.readdirSync(reportsDir)
  .filter((f) => /^report\[\d+\]\.md$/i.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

if (!reportFiles.length) {
  console.log("referance/reports/ holds no report[N].md captures — nothing to do.");
  process.exit(0);
}

for (const file of reportFiles) {
  section(file);
  await runReport(file);
}

console.log("\n" + "═".repeat(62));
console.log(`  ${passed}/${total} corpus checks passed (${reportFiles.length} reports × full pipeline).`);
if (failures.length) {
  console.log(`\n  Failed (${failures.length}):`);
  for (const f of failures) console.log(`    ✗ ${f}`);
}
console.log(ok ? "  All corpus checks passed. ✓" : "  SOME CORPUS CHECKS FAILED ✗");
console.log("═".repeat(62) + "\n");
process.exit(ok ? 0 : 1);
