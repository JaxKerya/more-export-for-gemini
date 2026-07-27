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
 * Four layers of protection, in increasing strictness:
 *   1. structure   — is the output well-formed? (shared format-checks)
 *   2. fidelity    — did the report's CONTENT survive? (word-multiset ≥99%)
 *   3. baseline    — did the numbers drift? (test/corpus-baseline.json)
 *   4. budgets     — is any format suddenly huge or slow?
 * Plus an option matrix: the largest report is re-exported across every
 * markdown flavor, citation style and TOC/footnote combination, because the
 * per-report pass above pins one option set.
 *
 * Corpus files are raw outerHTML pastes named report[N].md; any number of
 * captures is picked up automatically.
 *
 * Usage:
 *   node test/corpus.mjs                  run every check
 *   node test/corpus.mjs --update         rewrite the baseline from this run
 *   node test/corpus.mjs --out[=dir]      also write outputs to disk, for
 *                                         scripts/external-validate.mjs
 *                                         (defaults to validate/corpus)
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import {
  makeContext, readZipEntries, checkFidelity, decodeRtfEscapes, zipTextContent,
  checkMarkdown, checkTxt, checkHtml, checkJson, checkLatex, checkCsv,
  checkBib, checkRis, checkRtf, checkDocx, checkEpub, checkCrossFormat,
  checkStandaloneHtml, checkCslJson, checkVaultEntries,
} from "./format-checks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportsDir = path.join(root, "referance", "reports");
const baselinePath = path.join(__dirname, "corpus-baseline.json");

// ── CLI ──────────────────────────────────────────────────────────────

const UPDATE = process.argv.includes("--update");
const outFlag = process.argv.find((a) => a === "--out" || a.startsWith("--out="));
const DEFAULT_OUT = "validate/corpus";
let OUT_DIR = null;
if (outFlag) {
  const raw = outFlag.includes("=") ? outFlag.split("=").slice(1).join("=").trim() : "";
  OUT_DIR = path.resolve(root, raw || DEFAULT_OUT);
  // The directory is wiped before writing, so refuse anything that isn't a
  // dedicated subfolder inside the repo — an empty `--out=` must never
  // resolve to the repo root and delete the working tree.
  const rel = path.relative(root, OUT_DIR);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || path.dirname(rel) === ".") {
    console.error(`--out must name a nested folder inside the repo (got "${rel || "."}"); default is ${DEFAULT_OUT}`);
    process.exit(2);
  }
}

// ── Budgets ──────────────────────────────────────────────────────────
//
// Tripwires, not targets: they exist to catch an exporter that suddenly
// emits a runaway document (a self-referential loop, an unbounded style
// block) or grinds to a halt. Set well above the corpus's real maxima
// (largest report ≈ 2.5k words), so a normal report never approaches them.

const SIZE_BUDGET_KB = {
  markdown: 512, txt: 512, json: 2048, csv: 256,
  html: 4096, reader: 4096,
  latex: 512, rtf: 4096, bibtex: 128, ris: 128, csljson: 128,
  docx: 4096, epub: 4096, xlsx: 1024, vault: 1024,
};
const PIPELINE_BUDGET_MS = 20000;

// ── Harness ──────────────────────────────────────────────────────────

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
// assertions were written against. The option matrix at the end varies them.
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

/** Byte length of a text or binary output. */
function byteLen(v) {
  if (v == null) return 0;
  if (Buffer.isBuffer(v)) return v.length;
  if (Array.isArray(v)) return v.reduce((n, e) => n + Buffer.byteLength(String(e.data || ""), "utf8"), 0);
  return Buffer.byteLength(String(v), "utf8");
}

async function runReport(file) {
  currentReport = file;
  const started = Date.now();
  const content = fs.readFileSync(path.join(reportsDir, file), "utf8");
  const GEP = makeSandbox(content);
  check("modules loaded (extractor + exporters)", !!(GEP && GEP.extractor && GEP.markdown && GEP.zip));
  if (!GEP || !GEP.extractor) return null;

  const ir = gen("extract", () => GEP.extractor.extract());
  check("extract returns IR with blocks", !!(ir && Array.isArray(ir.blocks) && ir.blocks.length > 5));
  if (!ir) return null;

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
  // Previously synthetic-only: reader, CSL-JSON and the Obsidian vault bundle
  // now see real reports too. The print-PDF document needs no separate pass —
  // `GEP.html.convert` *is* `GEP.pdf.buildDocument`, so `html` above already
  // validates it; what's PDF-specific is the print `layout`, exercised by the
  // option matrix below.
  const reader = gen("reader", () => GEP.reader.convert(ir, OPTS));
  const csl = gen("csljson", () => GEP.csljson.convert(ir));
  const vault = gen("vault", () => GEP.vault.buildEntries(ir, OPTS));

  // Binary formats (Blob → Buffer).
  const docxBlob = gen("docx", () => GEP.docx.convert(ir, OPTS));
  const docxBuf = docxBlob ? Buffer.from(await docxBlob.arrayBuffer()) : null;
  const epubBlob = gen("epub", () => GEP.epub.convert(ir, OPTS));
  const epubBuf = epubBlob ? Buffer.from(await epubBlob.arrayBuffer()) : null;
  const xlsxBlob = tableCount > 0 ? gen("xlsx", () => GEP.xlsx.convert(ir)) : null;
  const xlsxBuf = xlsxBlob ? Buffer.from(await xlsxBlob.arrayBuffer()) : null;

  const elapsed = Date.now() - started;

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
  if (reader) checkStandaloneHtml(c("reader"), reader, ctx, { rootClass: 'class="reader"' });
  if (csl) checkCslJson(c("csljson"), csl, ctx);
  if (vault) checkVaultEntries(c("vault"), vault, ctx);
  if (docxBuf) checkDocx(c("docx"), docxBuf, ctx);
  if (epubBuf) checkEpub(c("epub"), epubBuf, ctx);
  checkCrossFormat(c("cross"), { md, txt, html, csv, bib, ris }, ctx);

  // Did the report's *content* survive, not just its structure? RTF's \uN?
  // escapes and the DOCX/EPUB XML parts are decoded first.
  checkFidelity(check, {
    markdown: md, txt, html, latex: tex, reader,
    rtf: rtf && decodeRtfEscapes(rtf),
    docx: docxBuf && zipTextContent(docxBuf, /^word\/document\.xml$/),
    epub: epubBuf && zipTextContent(epubBuf, /^OEBPS\/chapter\.xhtml$/),
  }, ctx);

  // XLSX: one worksheet per table (deep structure is covered by the
  // synthetic suite in edge-cases; here we assert the real-table wiring).
  if (xlsxBuf) {
    const names = readZipEntries(xlsxBuf).map((e) => e.name);
    check("xlsx: workbook part present", names.includes("xl/workbook.xml"));
    check("xlsx: one worksheet per table",
      names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length === tableCount);
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

  // ── Budgets ──
  const outputs = {
    markdown: md, txt, html, json: jsonStr, latex: tex, csv, bibtex: bib,
    ris, rtf, reader, csljson: csl, vault,
    docx: docxBuf, epub: epubBuf, xlsx: xlsxBuf,
  };
  const sizes = {};
  for (const [fmt, val] of Object.entries(outputs)) {
    if (val == null) continue;
    sizes[fmt] = byteLen(val);
    const budget = (SIZE_BUDGET_KB[fmt] ?? 4096) * 1024;
    check(`${fmt}: within size budget (${Math.round(sizes[fmt] / 1024)} KB / ${SIZE_BUDGET_KB[fmt] ?? 4096} KB)`,
      sizes[fmt] <= budget);
  }
  check(`pipeline within ${PIPELINE_BUDGET_MS} ms budget (${elapsed} ms)`, elapsed <= PIPELINE_BUDGET_MS);

  // ── Fingerprint, for the regression baseline ──
  const blockTypes = {};
  for (const b of ir.blocks) blockTypes[b.type] = (blockTypes[b.type] || 0) + 1;
  const fingerprint = {
    title: ir.title,
    blockTotal: ir.blocks.length,
    blockTypes: Object.fromEntries(Object.entries(blockTypes).sort()),
    tables: tableCount,
    footnotes: ir.footnotes.length,
    footnotesWithUrl: ir.footnotes.filter((f) => f.url).length,
    inlineMath: ir.blocks.reduce((n, b) => n + (b.runs || []).filter((r) => r.math).length, 0),
    sizes: Object.fromEntries(Object.entries(sizes).sort()),
  };

  if (OUT_DIR) writeOutputs(file, outputs);
  return { ir, GEP, fingerprint };
}

// ── Disk output (feeds scripts/external-validate.mjs) ────────────────

const OUT_EXT = {
  markdown: "md", txt: "txt", html: "html", json: "json", latex: "tex",
  csv: "csv", bibtex: "bib", ris: "ris", rtf: "rtf", reader: "reader.html",
  csljson: "csl.json", docx: "docx", epub: "epub", xlsx: "xlsx",
};

function writeOutputs(file, outputs) {
  // report[3].md -> validate/corpus/report-03/
  const n = String(Number(file.match(/\d+/)[0])).padStart(2, "0");
  const dir = path.join(OUT_DIR, `report-${n}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [fmt, val] of Object.entries(outputs)) {
    if (val == null) continue;
    if (fmt === "vault") {
      for (const e of val) {
        const p = path.join(dir, "vault", e.name);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, e.data, "utf8");
      }
      continue;
    }
    const ext = OUT_EXT[fmt];
    if (!ext) continue;
    const p = path.join(dir, `output.${ext}`);
    if (Buffer.isBuffer(val)) fs.writeFileSync(p, val);
    else fs.writeFileSync(p, String(val), "utf8");
  }
}

// ── Option matrix (one report, every option combination) ─────────────
//
// The per-report pass pins one option set, so a bug that only shows up in
// Obsidian flavor or APA citations would never surface. Re-export the
// richest capture across every flavor, every citation style and the
// TOC/footnote combinations.

const FLAVORS = ["gfm", "commonmark", "obsidian", "notion"];
const CITATION_STYLES = ["numbered", "apa", "mla", "chicago", "ieee", "vancouver", "harvard", "acs", "ama"];
// Print/typography layout (PDF, HTML, DOCX, LaTeX). Defaults are covered by
// every pass above; these are the non-default extremes.
const LAYOUTS = [
  { paper: "letter", margins: "wide", fontSize: 12, lineSpacing: "double", fontFamily: "serif" },
  { paper: "a4", margins: "narrow", fontSize: 10, lineSpacing: "onehalf", fontFamily: "sans" },
];

async function runOptionMatrix(label, ir, GEP) {
  currentReport = `${label} (option matrix)`;
  const ctx = makeContext(GEP.json.convert(ir));
  let configs = 0;

  const run = async (name, opts, { docx = false } = {}) => {
    configs++;
    const c = (fmt) => (l, cond) => check(`${name} ${fmt}: ${l}`, cond);
    const md = gen(`${name} markdown`, () => GEP.markdown.convert(ir, opts));
    const html = gen(`${name} html`, () => GEP.html.convert(ir, opts));
    const tex = gen(`${name} latex`, () => GEP.latex.convert(ir, opts));
    const txt = gen(`${name} txt`, () => GEP.txt.convert(ir, opts));
    // Obsidian/Notion reshape markdown (front matter, wikilinks) — the
    // markdown checks understand both.
    if (md) checkMarkdown(c("md"), md, ctx);
    if (html) checkHtml(c("html"), html, ctx);
    if (tex) checkLatex(c("tex"), tex, ctx);
    if (txt) checkTxt(c("txt"), txt, ctx);

    let docxText = null;
    if (docx) {
      const blob = gen(`${name} docx`, () => GEP.docx.convert(ir, opts));
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        checkDocx(c("docx"), buf, ctx);
        docxText = zipTextContent(buf, /^word\/document\.xml$/);
      }
    }

    // Content must survive every option combination, not just the default.
    checkFidelity((l, cond) => check(`${name} ${l}`, cond),
      { markdown: md, html, latex: tex, txt, docx: docxText }, ctx);
  };

  for (const flavor of FLAVORS) await run(`flavor=${flavor}`, { ...OPTS, flavor });
  for (const citationStyle of CITATION_STYLES) await run(`cite=${citationStyle}`, { ...OPTS, citationStyle });
  for (const includeToc of [true, false]) {
    for (const includeFootnotes of [true, false]) {
      await run(`toc=${includeToc},fn=${includeFootnotes}`, { ...OPTS, includeToc, includeFootnotes });
    }
  }
  // Layout reaches HTML/PDF (shared builder), LaTeX and DOCX.
  for (const layout of LAYOUTS) {
    const tag = `${layout.paper}/${layout.margins}/${layout.fontSize}pt/${layout.lineSpacing}/${layout.fontFamily}`;
    await run(`layout=${tag}`, { ...OPTS, layout }, { docx: true });
  }
  console.log(`  ${configs} option configurations exercised on ${label}`);
}

// ── Regression baseline ──────────────────────────────────────────────
//
// Every check above is threshold-based ("more than 5 blocks", "≥99%"), so a
// change that quietly halves what the extractor finds still passes. The
// baseline pins the exact numbers per report; structural counts must match
// exactly, output sizes within a band (small formatting/CSS tweaks are
// legitimate, a vanished section is not).

const SIZE_TOLERANCE = 0.1; // ±10%

function checkBaseline(file, fp, base) {
  currentReport = file;
  if (!base) {
    console.log(`  (no baseline for ${file} — run \`npm run test:corpus -- --update\` to record one)`);
    return;
  }
  check("baseline: title unchanged", fp.title === base.title);
  check(`baseline: block total unchanged (${fp.blockTotal} vs ${base.blockTotal})`,
    fp.blockTotal === base.blockTotal);
  check("baseline: block types unchanged",
    JSON.stringify(fp.blockTypes) === JSON.stringify(base.blockTypes));
  check(`baseline: tables unchanged (${fp.tables} vs ${base.tables})`, fp.tables === base.tables);
  check(`baseline: footnotes unchanged (${fp.footnotes} vs ${base.footnotes})`,
    fp.footnotes === base.footnotes);
  check(`baseline: footnotes with URL unchanged (${fp.footnotesWithUrl} vs ${base.footnotesWithUrl})`,
    fp.footnotesWithUrl === base.footnotesWithUrl);
  check(`baseline: inline math unchanged (${fp.inlineMath} vs ${base.inlineMath})`,
    fp.inlineMath === base.inlineMath);

  for (const [fmt, size] of Object.entries(fp.sizes)) {
    const was = base.sizes ? base.sizes[fmt] : undefined;
    if (was === undefined) {
      console.log(`  (new format in baseline: ${fmt} — run --update)`);
      continue;
    }
    const drift = was ? Math.abs(size - was) / was : 0;
    check(`baseline: ${fmt} size within ±10% (${size} vs ${was}, ${(drift * 100).toFixed(1)}%)`,
      drift <= SIZE_TOLERANCE);
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

let baseline = {};
if (!UPDATE && fs.existsSync(baselinePath)) {
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).reports || {};
  } catch {
    console.error("  ✗ corpus-baseline.json is not valid JSON");
    ok = false;
  }
}

if (OUT_DIR) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  console.log(`Writing outputs to ${path.relative(root, OUT_DIR)}`);
}

const fingerprints = {};
let richest = null;

for (const file of reportFiles) {
  section(file);
  const res = await runReport(file);
  if (!res) continue;
  fingerprints[file] = res.fingerprint;
  if (!UPDATE) checkBaseline(file, res.fingerprint, baseline[file]);
  // Keep the capture with the most blocks around for the option matrix.
  if (!richest || res.fingerprint.blockTotal > richest.fingerprint.blockTotal) {
    richest = { file, ...res };
  }
}

if (richest) {
  section(`Option matrix (${richest.file})`);
  await runOptionMatrix(richest.file, richest.ir, richest.GEP);
}

if (UPDATE) {
  fs.writeFileSync(baselinePath, JSON.stringify({
    note: "Regression baseline for test/corpus.mjs. Regenerate with `npm run test:corpus -- --update` and review the diff: structural counts must only change when extraction genuinely improves.",
    reports: fingerprints,
  }, null, 2) + "\n");
  console.log(`\nBaseline written: ${path.relative(root, baselinePath)} (${Object.keys(fingerprints).length} reports)`);
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
