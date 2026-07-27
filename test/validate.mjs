/**
 * Heavy-duty validation against real exported output files.
 *
 * Expects output files in /validate folder:
 *   output.md, output.txt, output.html, output.json,
 *   output.tex, output.csv, output.bib, output.ris,
 *   output.rtf,
 *   output.docx, output.epub
 *
 * Also runs internal exporter sanity checks and manifest integrity.
 *
 * Usage: node test/validate.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firefoxManifest, FIREFOX_BACKGROUND_SCRIPTS } from "../scripts/build.mjs";
import {
  noObjectLeak, tagsBalanced, readZipEntries, makeContext,
  checkMarkdown, checkTxt, checkHtml, checkJson, checkLatex, checkCsv,
  checkBib, checkRis, checkRtf, checkDocx, checkEpub, checkCrossFormat,
} from "./format-checks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const validateDir = path.join(root, "validate");

// ── Helpers ──────────────────────────────────────────────────────────

let ok = true;
let total = 0;
let passed = 0;
let sectionName = "";
const failures = [];

function section(name) {
  sectionName = name;
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}`);
}

function check(label, cond) {
  total++;
  if (!cond) {
    const full = sectionName ? `[${sectionName}] ${label}` : label;
    console.error(`  ✗ ${full}`);
    failures.push(full);
    ok = false;
  } else {
    passed++;
  }
}

function readFile(name) {
  const p = path.join(validateDir, name);
  if (!fs.existsSync(p)) return null;
  // Strip a leading UTF-8 BOM (the CSV export intentionally starts with one
  // for Excel-on-Windows) so ^-anchored assertions see the logical first line.
  // Section 1.6 checks the BOM's presence on the raw bytes separately.
  return fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
}

function fileExists(name) {
  return fs.existsSync(path.join(validateDir, name));
}

// Structural helpers (tagsBalanced, readZipEntries, noObjectLeak) and the
// per-format check functions live in test/format-checks.mjs, shared with the
// report-corpus pipeline test (test/corpus.mjs).

// ── Bootstrap sandbox for internal tests ─────────────────────────────

const sandbox = {
  window: {},
  document: {
    createElementNS: () => ({ setAttribute() {}, appendChild() {}, classList: { add() {} } }),
  },
  chrome: {
    storage: {
      sync: { get: async (d) => d, set: async () => {} },
      onChanged: { addListener() {} },
    },
  },
  Blob, TextEncoder, DataView, Uint8Array, Uint32Array,
  Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
  console, JSON,
};
vm.createContext(sandbox);

for (const f of [
  "src/vendor/katex.js",
  "src/lib/texmath.js",
  "src/lib/docmeta.js",
  "src/lib/export-opts.js",
  "src/lib/source-hygiene.js",
  "src/exporters/zip.js",
  "src/exporters/markdown.js",
  "src/exporters/txt.js",
  "src/exporters/docx.js",
  "src/exporters/pdf.js",
  "src/exporters/html.js",
  "src/exporters/json.js",
  "src/exporters/latex.js",
  "src/exporters/csv.js",
  "src/exporters/xlsx.js",
  "src/exporters/epub.js",
  "src/exporters/bibtex.js",
  "src/exporters/ris.js",
  "src/exporters/csljson.js",
  "src/exporters/rtf.js",
  "src/exporters/vault.js",
  "src/lib/download.js",
  "src/lib/settings.js",
  "src/lib/citation.js",
  "src/lib/toc.js",
  "src/lib/ir-filter.js",
  "src/lib/validator.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const GEP = sandbox.window.GEP;

// =====================================================================
// PART 1 — OUTPUT FILE VALIDATION (real exported files)
// =====================================================================

const md   = readFile("output.md");
const txt  = readFile("output.txt");
const html = readFile("output.html");
const json = readFile("output.json");
const tex  = readFile("output.tex");
const csv  = readFile("output.csv");
const bib  = readFile("output.bib");
const ris  = readFile("output.ris");
const rtf  = readFile("output.rtf");
const hasDocx = fileExists("output.docx");
const hasEpub = fileExists("output.epub");

const missingFiles = [];
for (const [name, data] of [
  ["output.md", md], ["output.txt", txt], ["output.html", html],
  ["output.json", json], ["output.tex", tex],
  ["output.csv", csv],
  ["output.bib", bib], ["output.ris", ris],
  ["output.rtf", rtf],
]) {
  if (!data) missingFiles.push(name);
}
if (!hasDocx) missingFiles.push("output.docx");
if (!hasEpub) missingFiles.push("output.epub");

if (missingFiles.length) {
  console.log(`\n⚠  Missing files in /validate: ${missingFiles.join(", ")}`);
  console.log("   Place exported output files to enable full validation.\n");
}

// The check context (i18n sample, table/bold/italic gates) is derived from
// the JSON export — ground truth for what the other formats must contain.
const ctx = makeContext(json);

// ── 1.1 Markdown (.md) ──────────────────────────────────────────────

if (md) {
  section("Markdown (output.md)");
  checkMarkdown(check, md, ctx);
}

// ── 1.2 Plain Text (.txt) ───────────────────────────────────────────

if (txt) {
  section("Plain Text (output.txt)");
  checkTxt(check, txt, ctx);
}

// ── 1.3 HTML (.html) ────────────────────────────────────────────────

if (html) {
  section("HTML (output.html)");
  checkHtml(check, html, ctx);
}

// ── 1.4 JSON (.json) ────────────────────────────────────────────────

if (json) {
  section("JSON (output.json)");
  checkJson(check, json, ctx);
}

// ── 1.5 LaTeX (.tex) ────────────────────────────────────────────────

if (tex) {
  section("LaTeX (output.tex)");
  checkLatex(check, tex, ctx);
}

// ── 1.7 CSV (.csv) ──────────────────────────────────────────────────

if (csv) {
  section("CSV (output.csv)");
  // checkCsv wants the raw content, BOM included (readFile strips it).
  checkCsv(check, fs.readFileSync(path.join(validateDir, "output.csv"), "utf8"), ctx);
}

// ── 1.11 BibTeX (.bib) ──────────────────────────────────────────────

if (bib) {
  section("BibTeX (output.bib)");
  checkBib(check, bib);
}

// ── 1.12 RIS (.ris) ─────────────────────────────────────────────────

if (ris) {
  section("RIS (output.ris)");
  checkRis(check, ris);
}

// ── 1.13 RTF (.rtf) ─────────────────────────────────────────────────

if (rtf) {
  section("RTF (output.rtf)");
  checkRtf(check, rtf, ctx);
}

// ── 1.14 DOCX ───────────────────────────────────────────────────────

if (hasDocx) {
  section("DOCX (output.docx)");
  checkDocx(check, fs.readFileSync(path.join(validateDir, "output.docx")), ctx);
}

// ── 1.15 EPUB ───────────────────────────────────────────────────────

if (hasEpub) {
  section("EPUB (output.epub)");
  checkEpub(check, fs.readFileSync(path.join(validateDir, "output.epub")), ctx);
}

// =====================================================================
// PART 2 — CROSS-FORMAT CONSISTENCY
// =====================================================================

section("Cross-format consistency");

checkCrossFormat(check, { md, txt, html, csv, bib, ris }, ctx);

// =====================================================================
// PART 3 — INTERNAL EXPORTER SANITY (synthetic IR)
// =====================================================================

section("Internal exporter sanity");

const ir = {
  title: "Synthetic Test",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Synthetic Test" }] },
    { type: "heading", level: 2, runs: [{ text: "Sub" }] },
    { type: "paragraph", runs: [
      { text: "Bold ", bold: true }, { text: "and " }, { text: "italic", italic: true },
      { text: "", footnoteIndex: 1 },
    ]},
    { type: "table", header: [[{ text: "A" }], [{ text: "B" }]], rows: [[[{ text: "1" }], [{ text: "2" }]]] },
    { type: "list", ordered: false, items: [{ runs: [{ text: "item" }], level: 0 }] },
    { type: "code", text: "console.log('hi');" },
    { type: "blockquote", runs: [{ text: "A quote" }] },
    { type: "image", src: "https://img.example.com/a.png", alt: "photo" },
    { type: "hr" },
  ],
  footnotes: [{ index: 1, url: "https://example.com", title: "Example", domain: "example.com" }],
  root: {},
};

const optsOn = { includeToc: true, includeFootnotes: true, flavor: "gfm" };
const optsOff = { includeToc: false, includeFootnotes: false };

// ── IR schema version round-trip ──
// extract() stamps v=1 (checked in test/extractor.mjs); here: the JSON
// envelope carries it as schemaVersion, and migrate() upgrades legacy
// (pre-versioning) IRs so old backups / .json exports keep loading.
{
  const parsed = JSON.parse(GEP.json.convert({ ...ir, v: 1 }));
  check("json envelope: schemaVersion from ir.v", parsed.schemaVersion === 1);
  check("json envelope: no duplicate v field", !("v" in parsed));
  const legacy = GEP.json.migrate({ title: "old", blocks: [], footnotes: [] });
  check("migrate: stamps current version on legacy IR", legacy.v === GEP.json.SCHEMA_VERSION);
  const fromEnvelope = GEP.json.migrate(parsed);
  check("migrate: envelope schemaVersion folded into v",
    fromEnvelope.v === 1 && !("schemaVersion" in fromEnvelope));
}

// ── Conditional vendor loading (#10): needs detection ──
// The content script imports KaTeX / highlight.js only when vendorNeeds()
// flags the report; these pin the detection rules.
{
  const vn = GEP.exportOpts.vendorNeeds;
  const p = (runs) => ({ type: "paragraph", runs });
  check("vendorNeeds: plain prose needs no vendors", (() => {
    const n = vn({ blocks: [p([{ text: "hello" }, { text: "inline", code: true }])] });
    return n.math === false && n.code === false;
  })());
  check("vendorNeeds: code block flags code only", (() => {
    const n = vn({ blocks: [{ type: "code", text: "x = 1" }] });
    return n.code === true && n.math === false;
  })());
  check("vendorNeeds: math block flags math", (() => {
    const n = vn({ blocks: [{ type: "math", tex: "x^2" }] });
    return n.math === true && n.code === false;
  })());
  check("vendorNeeds: inline math run flags math",
    vn({ blocks: [p([{ text: "", math: { tex: "a" } }])] }).math === true);
  check("vendorNeeds: math inside a table cell detected",
    vn({ blocks: [{ type: "table", header: null, rows: [[[{ text: "", math: { tex: "b" } }]]] }] }).math === true);
  check("vendorNeeds: math inside a list item detected",
    vn({ blocks: [{ type: "list", ordered: false, items: [{ runs: [{ text: "", math: { tex: "c" } }], level: 0 }] }] }).math === true);
}

for (const [name, convertFn, fnMarker, srcMarker] of [
  ["markdown", () => GEP.markdown.convert(ir, optsOn), "[^1]", "[^1]:"],
  ["txt", () => GEP.txt.convert(ir, optsOn), "[1]", "Sources"],
  ["latex", () => GEP.latex.convert(ir, optsOn), "\\textsuperscript{[1]}", "Sources"],
  ["rtf", () => GEP.rtf.convert(ir, optsOn), "{\\super [1]}", "Sources"],
]) {
  const out = convertFn();
  check(`${name}: produces string`, typeof out === "string" && out.length > 50);
  check(`${name}: fn marker present when on`, out.includes(fnMarker));
  if (srcMarker) check(`${name}: source section present when on`, out.includes(srcMarker));
}

for (const [name, convertFn, fnMarker, srcMarker] of [
  ["markdown", () => GEP.markdown.convert(ir, optsOff), "[^1]", "[^1]:"],
  ["txt", () => GEP.txt.convert(ir, optsOff), "[1]", "Sources"],
  ["latex", () => GEP.latex.convert(ir, optsOff), "\\textsuperscript{[", "Sources"],
  ["rtf", () => GEP.rtf.convert(ir, optsOff), "{\\super [", "Sources"],
]) {
  const out = convertFn();
  check(`${name}: fn marker ABSENT when off`, !out.includes(fnMarker));
  if (srcMarker) check(`${name}: source section ABSENT when off`, !out.includes(srcMarker));
}

const htmlOn = GEP.html.convert(ir, optsOn);
check("html: fn ref present when on", htmlOn.includes('href="#fn-1"'));
check("html: footnotes section present when on", htmlOn.includes('<section class="footnotes">'));

const htmlOff = GEP.html.convert(ir, optsOff);
check("html: fn ref ABSENT when off", !htmlOff.includes('href="#fn-1"'));
check("html: footnotes section ABSENT when off", !htmlOff.includes('<section class="footnotes">'));

const docxBlob = GEP.docx.convert(ir, optsOn);
check("docx: produces Blob", docxBlob instanceof Blob);
check("docx: size > 100", docxBlob.size > 100);

const epubBlob = GEP.epub.convert(ir, optsOn);
check("epub: produces Blob", epubBlob instanceof Blob);
check("epub: size > 100", epubBlob.size > 100);

const csvOut = GEP.csv.convert(ir);
check("csv: has header A", csvOut.includes("A"));
check("csv: has data 1,2", csvOut.includes("1,2"));
check("csv: no footnote markers", !csvOut.includes("[^") && !csvOut.includes("[1]"));

const bibtexOut = GEP.bibtex.convert(ir);
check("bibtex: produces string", typeof bibtexOut === "string" && bibtexOut.length > 30);
check("bibtex: has @misc entry", bibtexOut.includes("@misc{"));
check("bibtex: has url field", bibtexOut.includes("url          = {https://example.com}"));
check("bibtex: has urldate", bibtexOut.includes("urldate"));

const risOut = GEP.ris.convert(ir);
check("ris: produces string", typeof risOut === "string" && risOut.length > 30);
check("ris: has ELEC record", risOut.includes("TY  - ELEC"));
check("ris: has title tag", risOut.includes("TI  - Example"));
check("ris: has url tag", risOut.includes("UR  - https://example.com"));
check("ris: has access date", /Y2  - \d{4}\/\d{2}\/\d{2}/.test(risOut));
check("ris: record closed with ER", /ER  - /.test(risOut));
check("ris: TY/ER counts match", (risOut.match(/^TY  - /gm) || []).length === (risOut.match(/^ER  - /gm) || []).length);

const rtfOut = GEP.rtf.convert(ir, optsOn);
check("rtf: produces string", typeof rtfOut === "string" && rtfOut.length > 50);
check("rtf: starts with rtf header", rtfOut.startsWith("{\\rtf1"));
check("rtf: has font + color tables", rtfOut.includes("\\fonttbl") && rtfOut.includes("\\colortbl"));
check("rtf: has title", rtfOut.includes("Synthetic Test"));
check("rtf: has table rows", rtfOut.includes("\\trowd"));
check("rtf: has code monospace font", rtfOut.includes("\\f1"));
check("rtf: footnote sources hyperlink", rtfOut.includes("HYPERLINK"));

// ── Torture IR: hostile input must not crash or corrupt any exporter ──

const tortureIR = {
  title: 'Hostile <Title> & "Quotes" #1 100% _under_ {brace} [bracket] \\back',
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "H1 with | pipe & <tag>" }] },
    { type: "paragraph", runs: [
      { text: "Specials: # $ % & _ { } ~ ^ \\ ` * [ ] < > | \" '" },
      { text: "", footnoteIndex: 7 },
      { text: "", image: { src: "https://img.example.com/x.png", alt: "inline ]img[" } },
    ]},
    { type: "paragraph", runs: [] },
    { type: "table", header: null, rows: [
      [[{ text: "no|header" }], [{ text: 'cell "quoted", comma' }]],
      [[{ text: "second" }], [{ text: "row" }]],
    ]},
    { type: "list", ordered: true, items: [
      { runs: [{ text: "deep" }], level: 0 },
      { runs: [{ text: "deeper [x]" }], level: 3 },
    ]},
    { type: "code", text: "if (a < b && c > d) { run(\"#$%\"); }" },
    { type: "blockquote", runs: [{ text: "quote with * and _" }] },
    { type: "hr" },
  ],
  footnotes: [
    { index: 7, url: "https://example.com/p?a=1&b=2#frag", title: 'Source & "Title" 100%_x', domain: "example.com" },
    { index: 9 }, // no URL
  ],
  root: {},
};

const tortureOuts = {};
for (const [name, fn] of [
  ["markdown", () => GEP.markdown.convert(tortureIR, optsOn)],
  ["txt", () => GEP.txt.convert(tortureIR, optsOn)],
  ["html", () => GEP.html.convert(tortureIR, optsOn)],
  ["json", () => GEP.json.convert(tortureIR)],
  ["latex", () => GEP.latex.convert(tortureIR, optsOn)],
  ["csv", () => GEP.csv.convert(tortureIR)],
  ["bibtex", () => GEP.bibtex.convert(tortureIR)],
  ["ris", () => GEP.ris.convert(tortureIR)],
  ["rtf", () => GEP.rtf.convert(tortureIR, optsOn)],
]) {
  let out = null, threw = false;
  try { out = fn(); } catch { threw = true; }
  tortureOuts[name] = out;
  check(`torture ${name}: does not throw`, !threw);
  check(`torture ${name}: returns non-empty string`, typeof out === "string" && out.length > 20);
  if (typeof out === "string") {
    check(`torture ${name}: no undefined/object leak`, !out.includes("[object Object]") && !/\bundefined\b/.test(out));
  }
}
let tortureThrew = false;
try {
  check("torture docx: produces Blob", GEP.docx.convert(tortureIR, optsOn) instanceof Blob);
  check("torture epub: produces Blob", GEP.epub.convert(tortureIR, optsOn) instanceof Blob);
} catch { tortureThrew = true; }
check("torture docx/epub: does not throw", !tortureThrew);

// ── Multilingual IR: every script must survive every text exporter ──

const i18nIR = {
  title: "World Languages 世界 Мир العالم 세계 Κόσμος",
  blocks: [
    { type: "heading", level: 2, runs: [{ text: "中文标题 — Çince" }] },
    { type: "paragraph", runs: [{ text: "Русский текст с кириллицей." }] },
    { type: "paragraph", runs: [{ text: "نص عربي مع علامات التشكيل" }] },
    { type: "paragraph", runs: [{ text: "한국어 텍스트와 日本語のテキスト" }] },
    { type: "paragraph", runs: [{ text: "Ελληνικά, Türkçe (şğıİçöü), Tiếng Việt (ắễộ), emoji 🌍" }] },
    { type: "table", header: [[{ text: "語言" }], [{ text: "Язык" }]], rows: [[[{ text: "中文" }], [{ text: "русский" }]]] },
  ],
  footnotes: [{ index: 1, url: "https://example.com", title: "多语言来源 — Многоязычный", domain: "example.com" }],
};

const I18N_PROBES = ["世界", "Мир", "العالم", "세계", "Κόσμος", "中文标题", "кириллицей", "日本語", "şğıİçöü", "ắễộ", "🌍", "語言"];

for (const [name, fn] of [
  ["markdown", () => GEP.markdown.convert(i18nIR, optsOn)],
  ["txt", () => GEP.txt.convert(i18nIR, optsOn)],
  ["html", () => GEP.html.convert(i18nIR, optsOn)],
  ["json", () => GEP.json.convert(i18nIR)],
  ["latex", () => GEP.latex.convert(i18nIR, optsOn)],
]) {
  let out = "";
  try { out = fn(); } catch { /* counted below */ }
  check(`i18n ${name}: all scripts preserved`, I18N_PROBES.every((p) => out.includes(p)));
}
// RTF escapes non-ASCII as \uN?, so probes won't appear literally; assert the
// escape sequences for a few representative scripts instead.
check("i18n rtf: non-ascii escaped, no raw leak", (() => {
  const out = GEP.rtf.convert(i18nIR, optsOn);
  return out.includes("\\u") && !out.includes("[object Object]");
})());
check("i18n csv: table scripts preserved", (() => {
  const out = GEP.csv.convert(i18nIR);
  return ["語言", "Язык", "中文", "русский"].every((p) => out.includes(p));
})());
// Excel on Windows needs a UTF-8 BOM to decode non-ASCII CSV correctly.
check("csv: starts with UTF-8 BOM", GEP.csv.convert(i18nIR).charCodeAt(0) === 0xFEFF);
check("csv: no-tables output also has BOM", GEP.csv.convert({ title: "x", blocks: [], footnotes: [] }).charCodeAt(0) === 0xFEFF);
check("vault csv: starts with UTF-8 BOM", GEP.vault.tableToCsv({ header: [[{ text: "語" }]], rows: [] }).charCodeAt(0) === 0xFEFF);

// CJK reports get an automatic engine-conditional font setup in the preamble.
check("latex cjk: japanese report loads luatexja-preset", (() => {
  const out = GEP.latex.convert({ title: "レポート", blocks: [{ type: "paragraph", runs: [{ text: "日本語のテキスト" }] }], footnotes: [] }, optsOn);
  return out.includes("luatexja-preset") && out.includes("xeCJK") && out.includes("Noto Serif CJK JP");
})());
check("latex cjk: korean report loads luatexko", (() => {
  const out = GEP.latex.convert({ title: "보고서", blocks: [{ type: "paragraph", runs: [{ text: "한국어 텍스트" }] }], footnotes: [] }, optsOn);
  return out.includes("luatexko") && out.includes("Noto Serif CJK KR");
})());
check("latex cjk: han-only report defaults to chinese fandol", (() => {
  const out = GEP.latex.convert({ title: "报告", blocks: [{ type: "paragraph", runs: [{ text: "中文文本" }] }], footnotes: [] }, optsOn);
  return out.includes("[fandol]{luatexja-preset}");
})());
check("latex cjk: han-only report with ir.lang=ja treated as japanese", (() => {
  const out = GEP.latex.convert({ title: "漢字", lang: "ja", blocks: [{ type: "paragraph", runs: [{ text: "漢字体" }] }], footnotes: [] }, optsOn);
  return out.includes("[haranoaji]{luatexja-preset}");
})());
check("latex cjk: latin-only report has no CJK packages", (() => {
  const out = GEP.latex.convert({ title: "Report", blocks: [{ type: "paragraph", runs: [{ text: "Plain English text." }] }], footnotes: [] }, optsOn);
  return !out.includes("xeCJK") && !out.includes("luatexja") && !out.includes("luatexko");
})());
check("i18n bibtex: source title preserved", GEP.bibtex.convert(i18nIR).includes("多语言来源"));
check("i18n ris: source title preserved", GEP.ris.convert(i18nIR).includes("多语言来源"));
check("i18n docx: produces Blob", GEP.docx.convert(i18nIR, optsOn) instanceof Blob);
check("i18n epub: produces Blob", GEP.epub.convert(i18nIR, optsOn) instanceof Blob);

// Format-specific integrity under hostile input.
check("torture html: tags balanced", tagsBalanced((tortureOuts.html || "").replace(/<!DOCTYPE[^>]*>/i, ""), true));
check("torture json: still parses", (() => { try { JSON.parse(tortureOuts.json); return true; } catch { return false; } })());
check("torture latex: no accent artifacts", !/\\[~^][a-zA-Z]/.test(tortureOuts.latex || ""));
check("torture md: headerless table keeps first row", (tortureOuts.markdown || "").includes("header"));
check("torture rtf: starts with header and balanced braces", (() => {
  const out = tortureOuts.rtf || "";
  if (!out.startsWith("{\\rtf1")) return false;
  let depth = 0;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
})());
check("torture bibtex: specials escaped", !/(?<!\\)[&%](?!.*=)/.test(((tortureOuts.bibtex || "").split("\n").filter(l => /^\s*(title|note)\s*=/.test(l)).join("\n")).replace(/^\s*(title|note)\s*=\s*/gm, "")));
check("torture csv: quoted cell intact", (tortureOuts.csv || "").includes('"cell ""quoted"", comma"'));

// ── Citation module ─────────────────────────────────────────────

section("Citation module");

check("citation: STYLES array exists", Array.isArray(GEP.citation.STYLES));
check("citation: 9 styles", GEP.citation.STYLES.length === 9);

const testFn = { index: 1, url: "https://example.com", title: "Example Page", domain: "example.com" };
const testFnNoUrl = { index: 2 };

for (const style of GEP.citation.STYLES) {
  const result = GEP.citation.format(testFn, style);
  check(`citation ${style}: has plain`, typeof result.plain === "string" && result.plain.length > 5);
  check(`citation ${style}: has label`, typeof result.label === "string");
  check(`citation ${style}: has url`, result.url === "https://example.com");
}

const noUrlResult = GEP.citation.format(testFnNoUrl, "apa");
check("citation no-url: fallback to Source N", noUrlResult.plain.includes("Source 2"));

const apaResult = GEP.citation.format(testFn, "apa");
check("citation apa: includes domain", apaResult.plain.includes("example.com"));

const mlaResult = GEP.citation.format(testFn, "mla");
check("citation mla: uses curly quotes", mlaResult.plain.includes("\u201C"));

const chicagoResult = GEP.citation.format(testFn, "chicago");
check("citation chicago: includes Accessed", chicagoResult.plain.includes("Accessed"));

const ieeeResult = GEP.citation.format(testFn, "ieee");
check("citation ieee: includes [1]", ieeeResult.plain.includes("[1]"));
check("citation ieee: includes Available:", ieeeResult.plain.includes("Available:"));

const vancouverResult = GEP.citation.format(testFn, "vancouver");
check("citation vancouver: includes [Internet]", vancouverResult.plain.includes("[Internet]"));
check("citation vancouver: includes Available from:", vancouverResult.plain.includes("Available from:"));

const harvardResult = GEP.citation.format(testFn, "harvard");
check("citation harvard: includes Available at:", harvardResult.plain.includes("Available at:"));
check("citation harvard: includes Accessed:", harvardResult.plain.includes("Accessed:"));

const acsResult = GEP.citation.format(testFn, "acs");
check("citation acs: includes accessed", acsResult.plain.includes("(accessed"));

const amaResult = GEP.citation.format(testFn, "ama");
check("citation ama: numbered prefix", amaResult.plain.startsWith("1."));
check("citation ama: includes Accessed", amaResult.plain.includes("Accessed"));

// ── Quality validator ──────────────────────────────────────────────

section("Quality validator");

check("validator: module present", typeof GEP.validator.check === "function");
const vClean = GEP.validator.check({
  title: "Doc",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "H" }] },
    { type: "paragraph", runs: [{ text: "Z".repeat(250) }, { footnoteIndex: 1 }] },
  ],
  footnotes: [{ index: 1, url: "https://x.example" }],
});
check("validator: clean → ok", vClean.ok === true);
check("validator: stats shape", typeof vClean.stats.blocks === "number" && Array.isArray(vClean.warnings));
const vBad = GEP.validator.check(null);
check("validator: null → not ok", vBad.ok === false);

const hasWarn = (rep, sub) => rep.warnings.some((w) => w.message.includes(sub));

// Empty heading (no text) — breaks TOC / structure.
const vEmptyHead = GEP.validator.check({
  title: "Doc",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "" }] },
    { type: "paragraph", runs: [{ text: "Z".repeat(250) }] },
  ],
  footnotes: [],
});
check("validator: empty heading flagged", hasWarn(vEmptyHead, "Empty heading"));

// Ragged table — header says 2 columns, a body row has only 1 cell.
const vRagged = GEP.validator.check({
  title: "Doc",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "H" }] },
    { type: "table", header: [[{ text: "A" }], [{ text: "B" }]], rows: [[[{ text: "1" }]]] },
    { type: "paragraph", runs: [{ text: "Z".repeat(250) }] },
  ],
  footnotes: [],
});
check("validator: ragged table flagged", hasWarn(vRagged, "inconsistent column counts"));

const vEvenTable = GEP.validator.check({
  title: "Doc",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "H" }] },
    { type: "table", header: [[{ text: "A" }], [{ text: "B" }]], rows: [[[{ text: "1" }], [{ text: "2" }]]] },
    { type: "paragraph", runs: [{ text: "Z".repeat(250) }] },
  ],
  footnotes: [],
});
check("validator: even table not flagged", !hasWarn(vEvenTable, "inconsistent column counts"));

// Broken math — unbalanced braces (block) and empty (inline run).
const vBadMath = GEP.validator.check({
  title: "Doc",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "H" }] },
    { type: "math", tex: "\\frac{a}{b" },
    { type: "paragraph", runs: [{ text: "Z".repeat(250) }, { text: "", math: { tex: "   " } }] },
  ],
  footnotes: [],
});
check("validator: unbalanced math flagged", hasWarn(vBadMath, "unbalanced braces"));
check("validator: empty inline math flagged", hasWarn(vBadMath, "(empty)"));

const vGoodMath = GEP.validator.check({
  title: "Doc",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "H" }] },
    { type: "math", tex: "\\frac{a}{b} + x^2" },
    { type: "paragraph", runs: [{ text: "Z".repeat(250) }] },
  ],
  footnotes: [],
});
check("validator: valid math not flagged", !hasWarn(vGoodMath, "may not render"));

// ── TOC slugify edge cases ──────────────────────────────────────────

section("TOC slugify");

check("basic", GEP.toc.slugify("Hello World") === "hello-world");
check("Turkish ı→i", GEP.toc.slugify("Tanımı") === "tanimi");
check("Turkish İ→i", GEP.toc.slugify("İstanbul") === "istanbul");
check("accented chars", GEP.toc.slugify("Müziğin Ünlü Şarkıları") === "muzigin-unlu-sarkilari");
check("special chars stripped", GEP.toc.slugify("What? (Really!)") === "what-really");
check("long slug truncated", GEP.toc.slugify("A".repeat(200)).length <= 80);
check("empty → section", GEP.toc.slugify("") === "section");

// ── Duplicate slug dedup ────────────────────────────────────────────

const dupIR = {
  title: "Test", blocks: [
    { type: "heading", level: 1, runs: [{ text: "Same" }] },
    { type: "heading", level: 1, runs: [{ text: "Same" }] },
  ], footnotes: [],
};
const dupToc = GEP.toc.generate(dupIR);
check("duplicate slugs deduped", dupToc.items[0].id !== dupToc.items[1].id);

// ── Markdown flavor variations ──────────────────────────────────────

section("Markdown flavors");

const obsidian = GEP.markdown.convert(ir, { ...optsOn, flavor: "obsidian" });
check("obsidian: TOC uses [[# wikilinks", obsidian.includes("[[#"));
check("obsidian: has footnotes", obsidian.includes("[^1]"));

const commonmark = GEP.markdown.convert(ir, { ...optsOn, flavor: "commonmark" });
check("commonmark: no [^N] footnotes", !commonmark.includes("[^1]"));
check("commonmark: has Sources section instead", commonmark.includes("Sources"));

const notion = GEP.markdown.convert(ir, { ...optsOn, flavor: "notion" });
check("notion: no [^N] footnotes", !notion.includes("[^1]"));

// ── Download helpers ────────────────────────────────────────────────

section("Download helpers");

check("safeFileName strips comma", !GEP.download.safeFileName("A, B").includes(","));
check("safeFileName strips semicolon", !GEP.download.safeFileName("A; B").includes(";"));
check("safeFileName max 80 + ellipsis", GEP.download.safeFileName("X".repeat(200)).length <= 83);
check("safeFileName ellipsis on long", GEP.download.safeFileName("X".repeat(200)).endsWith("..."));
check("safeFileName short no ellipsis", !GEP.download.safeFileName("Short").endsWith("..."));
check("datedFileName has date", GEP.download.datedFileName("Test", ".md").includes(" - 20"));
check("datedFileName has extension", GEP.download.datedFileName("Test", ".md").endsWith(".md"));

const tplIr = { title: "Test", blocks: [{ type: "paragraph", runs: [{ text: "hello world foo" }] }], footnotes: [] };
const tplResult = GEP.download.templateFileName("Test", ".md", "markdown", "{title} - {date}", tplIr);
check("templateFileName default pattern", tplResult.includes("Test") && tplResult.includes(" - 20") && tplResult.endsWith(".md"));

const tplFormat = GEP.download.templateFileName("Test", ".tex", "latex", "{format}_{YYYY}", tplIr);
check("templateFileName format token", tplFormat.includes("latex_20"));

const tplWordcount = GEP.download.templateFileName("Test", ".md", "markdown", "{title}_{wordcount}", tplIr);
check("templateFileName wordcount token", tplWordcount.includes("_3.md"));

const tplFallback = GEP.download.templateFileName("Test", ".md", "markdown", "", tplIr);
check("templateFileName empty fallback", tplFallback.includes("Test") && tplFallback.includes(" - 20"));

const tplTimestamp = GEP.download.templateFileName("Test", ".md", "markdown", "{timestamp}", tplIr);
check("templateFileName timestamp is numeric", /^\d+\.md$/.test(tplTimestamp));

// ── Settings module ─────────────────────────────────────────────────

section("Settings module");

check("DEFAULTS object exists", typeof GEP.settings.DEFAULTS === "object");
check("22 format keys", Object.keys(GEP.settings.DEFAULTS).length === 22);
check("OPTION_DEFAULTS exists", typeof GEP.settings.OPTION_DEFAULTS === "object");
check("markdown_flavor default = gfm", GEP.settings.OPTION_DEFAULTS.markdown_flavor === "gfm");
check("include_toc default = false", GEP.settings.OPTION_DEFAULTS.include_toc === false);
check("include_footnotes default = true", GEP.settings.OPTION_DEFAULTS.include_footnotes === true);
check("citation_style default = numbered", GEP.settings.OPTION_DEFAULTS.citation_style === "numbered");
check("filename_template default", GEP.settings.OPTION_DEFAULTS.filename_template === "{title} - {date}");
check("no auto_export keys", !("auto_export_enabled" in GEP.settings.OPTION_DEFAULTS));

const onCount = Object.values(GEP.settings.DEFAULTS).filter(Boolean).length;
check("6 formats on by default", onCount === 6);
for (const k of ["clipboard_md", "markdown", "reader", "docx", "pdf", "sections_pick"]) {
  check(`default ON: ${k}`, GEP.settings.DEFAULTS[k] === true);
}
for (const k of ["clipboard_txt", "clipboard_html", "clipboard_json", "txt", "html", "json", "latex", "csv", "bibtex", "ris", "csljson", "rtf", "epub", "vault", "zip_all"]) {
  check(`default OFF: ${k}`, GEP.settings.DEFAULTS[k] === false);
}
check("OVERRIDABLE_FORMATS includes reader", GEP.settings.OVERRIDABLE_FORMATS.includes("reader"));
check(
  "sanitizeOverrides drops unknown formats",
  Object.keys(GEP.settings.sanitizeOverrides({
    reader: { include_toc: true },
    bogus: { include_toc: true },
  })).length === 1
);

// ── Layout / hygiene / re-export ─────────────────────────────────────

section("Layout, source hygiene & offline re-export");

check("exportOpts module present", typeof GEP.exportOpts === "object" && typeof GEP.exportOpts.build === "function");
check("sourceHygiene module present", typeof GEP.sourceHygiene === "object" && typeof GEP.sourceHygiene.apply === "function");
check("EXPORTABLE lists IR-consuming formats", GEP.exportOpts.EXPORTABLE.includes("markdown") && GEP.exportOpts.EXPORTABLE.includes("pdf") && GEP.exportOpts.EXPORTABLE.includes("vault"));

// New settings keys are present with backward-compatible defaults.
for (const [k, v] of Object.entries({
  doc_paper: "a4", doc_margins: "normal", doc_font_size: "11",
  doc_line_spacing: "normal", doc_font_family: "sans",
  source_sort: "appearance", source_enrich_ids: true, source_dedupe: false,
})) {
  check(`settings default: ${k}`, GEP.settings.OPTION_DEFAULTS[k] === v);
}
check("settings enum: doc_paper", JSON.stringify(GEP.settings.OPTION_ENUMS.doc_paper) === JSON.stringify(["a4", "letter"]));
check("settings enum: source_sort", JSON.stringify(GEP.settings.OPTION_ENUMS.source_sort) === JSON.stringify(["appearance", "alpha", "domain"]));

// Bibliography exporters emit doi/isbn when present (and only then).
const biblioIR = {
  title: "Bib", blocks: [],
  footnotes: [
    { index: 1, url: "https://doi.org/10.5555/xyz", title: "Paper", domain: "doi.org", doi: "10.5555/xyz" },
    { index: 2, url: "https://b.example", title: "Book", domain: "b.example", isbn: "9781234567897" },
    { index: 3, url: "https://c.example", title: "Plain", domain: "c.example" },
  ],
};
check("bibtex doi field", /doi\s*=\s*\{10\.5555\/xyz\}/.test(GEP.bibtex.convert(biblioIR)));
check("bibtex isbn field", /isbn\s*=\s*\{9781234567897\}/.test(GEP.bibtex.convert(biblioIR)));
check("ris DO + SN", GEP.ris.convert(biblioIR).includes("DO  - 10.5555/xyz") && GEP.ris.convert(biblioIR).includes("SN  - 9781234567897"));
{
  const csl = JSON.parse(GEP.csljson.convert(biblioIR));
  check("csljson DOI/ISBN", csl[0].DOI === "10.5555/xyz" && csl[1].ISBN === "9781234567897" && !csl[2].DOI);
}

// JSON round-trip → re-export with built opts is consistent.
{
  const ir = {
    title: "RT", lang: "en", dir: "ltr",
    blocks: [{ type: "heading", level: 1, runs: [{ text: "H" }] }, { type: "paragraph", runs: [{ text: "p", footnoteIndex: 1 }] }],
    footnotes: [{ index: 1, url: "https://example.com", title: "E", domain: "example.com" }],
  };
  const parsed = JSON.parse(GEP.json.convert(ir));
  const reIR = { title: parsed.title, blocks: parsed.blocks, footnotes: parsed.footnotes, lang: parsed.lang, dir: parsed.dir };
  const o = GEP.exportOpts.build({}, "markdown");
  check("json round-trip markdown stable", GEP.markdown.convert(ir, o) === GEP.markdown.convert(GEP.sourceHygiene.apply(reIR, o), o));
}

// ── Manifest integrity ──────────────────────────────────────────────

section("Manifest integrity");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
check("manifest_version = 3", manifest.manifest_version === 3);
check("name is correct", manifest.name === "More Export for Gemini");
check("has version", /^\d+\.\d+\.\d+$/.test(manifest.version));
// Description is localized (i18n); the placeholder must resolve in en.json.
check("has description", (() => {
  const m = /^__MSG_([a-zA-Z0-9_]+)__$/.exec(manifest.description);
  if (!m) return manifest.description.length > 20;
  const en = JSON.parse(fs.readFileSync(path.join(root, "_locales/en/messages.json"), "utf8"));
  return !!en[m[1]] && en[m[1]].message.length > 20;
})());
check("permissions include storage", manifest.permissions.includes("storage"));
check("permissions include contextMenus", manifest.permissions.includes("contextMenus"));
// The broad "tabs" permission triggers Chrome's scary "Read your browsing
// history" install warning. URL-filtered tabs.query only needs a host
// permission for gemini.google.com, so the manifest must never regress to it.
check("permissions do NOT include tabs", !manifest.permissions.includes("tabs"));
check("host_permissions limited to gemini", (manifest.host_permissions || []).length === 1
  && manifest.host_permissions[0] === "https://gemini.google.com/*");
check("has background service worker", typeof manifest.background.service_worker === "string");

// ── Cross-browser background (Firefox port, #15) ──
// The repo manifest is Chrome/Edge-flavored: MV3 Chrome shows an install
// warning ("'background.scripts' requires manifest version of 2 or lower")
// if the Firefox event-page key is present, so build.mjs swaps it in only
// for the AMO package. The list must mirror the worker's importScripts
// order: i18n → settings → background.js.
check("chrome: no background.scripts in repo manifest (MV3 install warning)",
  !("scripts" in manifest.background));
const ffManifest = firefoxManifest(manifest);
check("firefox build: background.scripts order mirrors importScripts",
  JSON.stringify(ffManifest.background.scripts) ===
  JSON.stringify(["src/lib/i18n.js", "src/lib/settings.js", "src/background.js"]));
check("firefox build: no service_worker key (event page only)",
  !("service_worker" in ffManifest.background));
check("firefox build: rest of the manifest untouched",
  JSON.stringify({ ...ffManifest, background: null }) ===
  JSON.stringify({ ...manifest, background: null }));
for (const f of FIREFOX_BACKGROUND_SCRIPTS) {
  check(`firefox: background script exists: ${f}`, fs.existsSync(path.join(root, f)));
}
check("firefox: gecko id present",
  !!(manifest.browser_specific_settings
    && manifest.browser_specific_settings.gecko
    && /@/.test(manifest.browser_specific_settings.gecko.id || "")));
check("firefox: strict_min_version present",
  /^\d+\.\d+$/.test((manifest.browser_specific_settings.gecko || {}).strict_min_version || ""));
check("firefox: data_collection_permissions declared (required by AMO)",
  JSON.stringify((manifest.browser_specific_settings.gecko || {}).data_collection_permissions)
    === JSON.stringify({ required: ["none"] }));
// background.js must guard importScripts (absent on Firefox event pages).
check("firefox: importScripts guarded in background.js",
  /typeof importScripts === "function"/.test(
    fs.readFileSync(path.join(root, "src/background.js"), "utf8")));
check("has popup", typeof manifest.action.default_popup === "string");
check("has options_ui", typeof manifest.options_ui.page === "string");
check("content_scripts match gemini.google.com", manifest.content_scripts[0].matches[0].includes("gemini.google.com"));

const warResources = (manifest.web_accessible_resources || []).flatMap((w) => w.resources || []);
for (const f of [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, ...warResources]) {
  if (f.includes("*")) continue; // glob entries (e.g. _locales/*/messages.json) checked below
  check(`file exists: ${f}`, fs.existsSync(path.join(root, f)));
}
// The locale catalogs must be web-accessible: a pinned UI language is loaded
// by fetch() from content scripts, which only works for WAR-listed resources.
check("war: locale catalogs exposed", warResources.includes("_locales/*/messages.json"));
check("background file exists", fs.existsSync(path.join(root, manifest.background.service_worker)));
check("popup file exists", fs.existsSync(path.join(root, manifest.action.default_popup)));
check("options file exists", fs.existsSync(path.join(root, manifest.options_ui.page)));

check("no auto-export.js in manifest", !manifest.content_scripts[0].js.includes("src/lib/auto-export.js"));
check("export-opts.js in static core", manifest.content_scripts[0].js.includes("src/lib/export-opts.js"));
check("settings.js in static core", manifest.content_scripts[0].js.includes("src/lib/settings.js"));
// selectors.js is the single source of truth for Gemini DOM selectors and
// must load before every consumer (extractor, menu-injector, content.js).
check("selectors.js loads before extractor.js",
  manifest.content_scripts[0].js.indexOf("src/lib/selectors.js") !== -1 &&
  manifest.content_scripts[0].js.indexOf("src/lib/selectors.js") <
    manifest.content_scripts[0].js.indexOf("src/lib/extractor.js"));
check("content.js loads last in static core", manifest.content_scripts[0].js.at(-1) === "src/content.js");

// Lazy stack integrity: no file may be in both lists, and everything the
// export pipeline needs must be in exactly one of them.
check("web_accessible_resources matches gemini", (manifest.web_accessible_resources || [])[0].matches[0].includes("gemini.google.com"));
const staticSet = new Set(manifest.content_scripts[0].js);
check("no overlap between static core and lazy stack", warResources.every((f) => !staticSet.has(f)));
for (const f of [
  "src/vendor/katex.js", "src/vendor/highlight.js",
  "src/lib/texmath.js", "src/lib/docmeta.js", "src/lib/citation.js",
  "src/lib/toc.js", "src/lib/source-hygiene.js", "src/lib/history.js",
  "src/exporters/zip.js", "src/exporters/markdown.js", "src/exporters/txt.js",
  "src/exporters/docx.js", "src/exporters/pdf.js", "src/exporters/html.js",
  "src/exporters/reader.js", "src/exporters/json.js", "src/exporters/latex.js",
  "src/exporters/csv.js", "src/exporters/xlsx.js", "src/exporters/epub.js",
  "src/exporters/bibtex.js", "src/exporters/ris.js", "src/exporters/csljson.js",
  "src/exporters/rtf.js", "src/exporters/vault.js",
]) {
  check(`lazy stack includes ${f}`, warResources.includes(f));
}

// =====================================================================
// PART 5 — DEBUG OUTPUT VALIDATION (all format × citation × flavor)
// =====================================================================

const FLAVORS = ["gfm", "commonmark", "obsidian", "notion"];
const CITATIONS = ["numbered", "apa", "mla", "chicago", "ieee", "vancouver", "harvard", "acs", "ama"];
const debugDir = path.join(validateDir, "debug");
const hasDebugDir = fs.existsSync(debugDir);

if (hasDebugDir) {
  section("Debug outputs (validate/debug)");

  function readDebug(name) {
    const p = path.join(debugDir, name);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  }

  let debugParsedJ = null;
  const debugJson = readDebug("json.json");
  if (debugJson) {
    try { debugParsedJ = JSON.parse(debugJson); } catch { /* */ }
    check("debug json.json: valid JSON", debugParsedJ !== null);
    if (debugParsedJ) {
      check("debug json.json: has title", typeof debugParsedJ.title === "string" && debugParsedJ.title.length > 0);
      check("debug json.json: has blocks", Array.isArray(debugParsedJ.blocks) && debugParsedJ.blocks.length > 0);
    }
  }

  const fnCount = debugParsedJ?.footnotes?.length || 0;

  // ── Tail completeness: the real report must not be truncated on export ──
  // Truncation surfaces first at the very end, so we pull a distinctive word
  // from the LAST text-bearing block (and the last source) of the canonical
  // JSON IR and confirm it survived into the txt / markdown / html exports.
  if (debugParsedJ && Array.isArray(debugParsedJ.blocks)) {
    const blockText = (b) => {
      if (!b) return "";
      if (b.runs) return b.runs.map((r) => r.text || "").join("");
      if (b.type === "list" && b.items) return b.items.map((i) => (i.runs || []).map((r) => r.text || "").join("")).join(" ");
      if (b.type === "table") return [...(b.header || []), ...[].concat(...(b.rows || []))].map((c) => (c || []).map((r) => r.text || "").join("")).join(" ");
      if (b.type === "code") return b.text || "";
      return "";
    };
    // longest alphabetic word (>=5 letters) is unlikely to be escaped/altered.
    const lastToken = (txt) => {
      const words = (txt.match(/[A-Za-zÀ-ÿĀ-ſ]{5,}/g) || []);
      return words.sort((a, b) => b.length - a.length)[0] || "";
    };
    let tailTok = "";
    for (let i = debugParsedJ.blocks.length - 1; i >= 0 && !tailTok; i--) {
      tailTok = lastToken(blockText(debugParsedJ.blocks[i]));
    }
    const txtTail = readDebug("txt-numbered.txt");
    const mdTail = readDebug("markdown-gfm-numbered.md");
    const htmlTail = readDebug("html-numbered.html");
    if (tailTok) {
      if (txtTail) check(`tail completeness: last block in txt ("${tailTok}")`, txtTail.includes(tailTok));
      if (mdTail) check(`tail completeness: last block in markdown ("${tailTok}")`, mdTail.includes(tailTok));
      if (htmlTail) check(`tail completeness: last block in html ("${tailTok}")`, htmlTail.includes(tailTok));
    }
    // Last source must also survive (sources are appended at the very end).
    const fns = debugParsedJ.footnotes || [];
    if (fns.length) {
      const lastFn = fns[fns.length - 1];
      const fnTok = lastToken(lastFn.title || "") || lastToken(lastFn.url || "");
      if (fnTok && txtTail) check(`tail completeness: last source in txt ("${fnTok}")`, txtTail.includes(fnTok));
    }
  }

  for (const flavor of FLAVORS) {
    for (const cite of CITATIONS) {
      const fname = `markdown-${flavor}-${cite}.md`;
      const content = readDebug(fname);
      if (!content) continue;
      check(`debug ${fname}: not empty`, content.trim().length > 50);
      if (flavor === "obsidian") {
        // Obsidian emits YAML front matter first; the H1 title follows it.
        check(`debug ${fname}: starts with front matter`, content.startsWith("---\n"));
        check(`debug ${fname}: has H1 after front matter`, /^# .+$/m.test(content));
      } else {
        check(`debug ${fname}: starts with H1`, content.startsWith("# "));
      }
      check(`debug ${fname}: has H2`, (content.match(/^## .+$/gm) || []).length >= 1);
      check(`debug ${fname}: no object leak`, noObjectLeak(content));

      const hasToc = content.match(/^## Table of Contents$/m);
      if (hasToc) {
        if (flavor === "obsidian") {
          check(`debug ${fname}: TOC uses wikilinks`, content.includes("[[#"));
        } else {
          check(`debug ${fname}: TOC has anchor links`, content.includes("](#"));
        }
      }

      if (flavor === "gfm" || flavor === "obsidian") {
        if (fnCount > 0) {
          const defs = (content.match(/^\[\^\d+\]:/gm) || []).length;
          check(`debug ${fname}: footnote defs match JSON (${defs}/${fnCount})`, defs === fnCount);
        }
      } else {
        check(`debug ${fname}: no [^N] footnotes (${flavor})`, !content.includes("[^1]"));
        if (fnCount > 0) {
          check(`debug ${fname}: has Sources section`, content.includes("### Sources"));
        }
      }
    }
  }

  for (const cite of CITATIONS) {
    const txtF = readDebug(`txt-${cite}.txt`);
    if (txtF) {
      check(`debug txt-${cite}: not empty`, txtF.trim().length > 50);
      // Only prose (non-indented) lines should be markdown-free; code blocks are
      // indented in the plain-text layout and may legitimately contain "**"
      // (Python power operator) or "##" (comments), which aren't leaked markdown.
      const proseLines = txtF.split("\n").filter((l) => !/^\s/.test(l));
      const mdLeak = proseLines.some((l) => /\*\*[^\s*][^*]*\*\*/.test(l) || /^#{1,6}\s/.test(l));
      check(`debug txt-${cite}: no markdown`, !mdLeak);
      check(`debug txt-${cite}: no object leak`, noObjectLeak(txtF));
    }

    const htmlF = readDebug(`html-${cite}.html`);
    if (htmlF) {
      check(`debug html-${cite}: not empty`, htmlF.trim().length > 100);
      check(`debug html-${cite}: has <html> tag`, htmlF.includes("<html"));
      check(`debug html-${cite}: tags balanced`, tagsBalanced(htmlF.replace(/<!DOCTYPE[^>]*>/i, ""), true));
      check(`debug html-${cite}: no object leak`, noObjectLeak(htmlF));
    }

    const texF = readDebug(`latex-${cite}.tex`);
    if (texF) {
      check(`debug latex-${cite}: not empty`, texF.trim().length > 100);
      check(`debug latex-${cite}: has \\documentclass`, texF.includes("\\documentclass"));
      check(`debug latex-${cite}: has \\begin{document}`, texF.includes("\\begin{document}"));
      check(`debug latex-${cite}: has \\end{document}`, texF.includes("\\end{document}"));
      check(`debug latex-${cite}: no object leak`, noObjectLeak(texF));
    }

    const rtfF = readDebug(`rtf-${cite}.rtf`);
    if (rtfF) {
      check(`debug rtf-${cite}: not empty`, rtfF.trim().length > 50);
      check(`debug rtf-${cite}: starts with rtf header`, rtfF.startsWith("{\\rtf1"));
      check(`debug rtf-${cite}: no object leak`, noObjectLeak(rtfF));
    }
  }

  const csvF = readDebug("csv.csv");
  if (csvF) {
    check("debug csv: not empty", csvF.trim().length > 5);
    check("debug csv: no object leak", noObjectLeak(csvF));
  }
  // A report can legitimately have zero sources (no citations), in which case
  // the bibliographic exporters emit an empty/placeholder file rather than any
  // entries — so the "has entry" assertions only apply when sources exist.
  const bibF = readDebug("bibtex.bib");
  const reportHasSources = !!bibF && !/No sources found/i.test(bibF);
  if (bibF) {
    if (reportHasSources) check("debug bibtex: has @misc", bibF.includes("@misc{"));
    check("debug bibtex: no object leak", noObjectLeak(bibF));
  }
  const risF = readDebug("ris.ris");
  if (risF) {
    if (reportHasSources) check("debug ris: has TY tag", risF.includes("TY  - "));
    check("debug ris: TY/ER match", (risF.match(/^TY  - /gm) || []).length === (risF.match(/^ER  - /gm) || []).length);
    check("debug ris: no object leak", noObjectLeak(risF));
  }
  const cslF = readDebug("csljson.json");
  if (cslF) {
    let csl = null;
    try { csl = JSON.parse(cslF); } catch { /* */ }
    check("debug csljson: valid JSON array", Array.isArray(csl));
    if (Array.isArray(csl) && csl.length) {
      check("debug csljson: items are webpage type", csl.every((i) => i.type === "webpage"));
      check("debug csljson: items have id + title", csl.every((i) => i.id && typeof i.title === "string"));
    }
    check("debug csljson: no object leak", noObjectLeak(cslF));
  }

  const vaultDir = path.join(debugDir, "vault");
  if (fs.existsSync(vaultDir) && fs.statSync(vaultDir).isDirectory()) {
    const vaultFiles = fs.readdirSync(vaultDir);
    check("debug vault: has a markdown note", vaultFiles.some((f) => f.endsWith(".md")));
  }

  for (const cite of CITATIONS) {
    const dPath = path.join(debugDir, `docx-${cite}.docx`);
    if (fs.existsSync(dPath)) {
      const buf = fs.readFileSync(dPath);
      check(`debug docx-${cite}: valid ZIP (size > 100)`, buf.length > 100);
      const dEntries = readZipEntries(buf);
      check(`debug docx-${cite}: has entries`, dEntries.length > 0);
      const dDoc = (dEntries.find(e => e.name === "word/document.xml") || {}).content;
      if (dDoc) check(`debug docx-${cite}: document.xml balanced`, tagsBalanced(dDoc));
    }
    const ePath = path.join(debugDir, `epub-${cite}.epub`);
    if (fs.existsSync(ePath)) {
      const buf = fs.readFileSync(ePath);
      check(`debug epub-${cite}: valid ZIP (size > 100)`, buf.length > 100);
      const eEntries = readZipEntries(buf);
      check(`debug epub-${cite}: has entries`, eEntries.length > 0);
      const eChap = (eEntries.find(e => e.name === "OEBPS/chapter.xhtml") || {}).content;
      if (eChap) check(`debug epub-${cite}: chapter.xhtml balanced`, tagsBalanced(eChap.replace(/<!DOCTYPE[^>]*>/i, "")));
    }
  }
} else {
  console.log("\n⚠  No validate/debug/ folder. Run debug export to enable full matrix validation.");
}

// =====================================================================
// PART 6 — INTERNAL DEBUG MATRIX (sandbox-generated, all combinations)
// =====================================================================

section("Internal debug matrix (all combinations)");

{
  const dbgIR = {
    title: "Debug Matrix Test",
    blocks: [
      { type: "heading", level: 1, runs: [{ text: "Debug Matrix Test" }] },
      { type: "heading", level: 2, runs: [{ text: "Introduction" }] },
      { type: "paragraph", runs: [
        { text: "This tests all combinations." },
        { text: "", footnoteIndex: 1 },
      ]},
      { type: "table", header: [[{ text: "Col A" }], [{ text: "Col B" }]], rows: [[[{ text: "r1" }], [{ text: "r2" }]]] },
      { type: "list", ordered: false, items: [{ runs: [{ text: "item" }], level: 0 }] },
      { type: "blockquote", runs: [{ text: "A blockquote" }] },
      { type: "code", text: "let x = 1;" },
      { type: "paragraph", runs: [
        { text: "Euler's identity: " },
        { text: "", math: { tex: "e^{i\\pi}+1=0", mathml: "<math><mi>e</mi></math>", display: false } },
      ]},
      { type: "math", tex: "\\int_0^1 x^2\\,dx = \\frac{1}{3}", mathml: "<math><mn>1</mn></math>" },
    ],
    footnotes: [
      { index: 1, url: "https://example.com/source", title: "Debug Source", domain: "example.com" },
    ],
    root: {},
  };

  const dbgBaseOpts = { includeToc: true, includeFootnotes: true };

  let dbgCount = 0;
  let dbgFail = 0;

  for (const flavor of FLAVORS) {
    for (const cite of CITATIONS) {
      const opts = { ...dbgBaseOpts, flavor, citationStyle: cite };
      let out;
      try { out = GEP.markdown.convert(dbgIR, opts); } catch (e) { out = null; }
      const tag = `md/${flavor}/${cite}`;
      dbgCount++;
      if (!out || out.length < 30) { dbgFail++; check(`${tag}: produces output`, false); continue; }
      if (out.includes("[object Object]")) { dbgFail++; check(`${tag}: no object leak`, false); continue; }

      if (flavor === "obsidian") {
        if (!out.includes("[[#")) { dbgFail++; check(`${tag}: obsidian TOC`, false); }
      }
      if (flavor === "commonmark" || flavor === "notion") {
        if (out.includes("[^1]")) { dbgFail++; check(`${tag}: no [^N] for ${flavor}`, false); }
      }
    }
  }

  const TEXT_EXPORTERS = [
    ["txt", (ir, opts) => GEP.txt.convert(ir, opts), ".txt"],
    ["html", (ir, opts) => GEP.html.convert(ir, opts), ".html"],
    ["latex", (ir, opts) => GEP.latex.convert(ir, opts), ".tex"],
    ["rtf", (ir, opts) => GEP.rtf.convert(ir, opts), ".rtf"],
  ];

  for (const [name, fn] of TEXT_EXPORTERS) {
    for (const cite of CITATIONS) {
      const opts = { ...dbgBaseOpts, citationStyle: cite };
      let out;
      try { out = fn(dbgIR, opts); } catch { out = null; }
      const tag = `${name}/${cite}`;
      dbgCount++;
      if (!out || out.length < 30) { dbgFail++; check(`${tag}: produces output`, false); continue; }
      if (out.includes("[object Object]")) { dbgFail++; check(`${tag}: no object leak`, false); }
      if (name === "rtf" && !out.startsWith("{\\rtf1")) {
        dbgFail++; check(`${tag}: valid rtf header`, false);
      }
    }
  }

  for (const [name, fn] of [
    ["json", () => GEP.json.convert(dbgIR)],
    ["csv", () => GEP.csv.convert(dbgIR)],
    ["bibtex", () => GEP.bibtex.convert(dbgIR)],
    ["ris", () => GEP.ris.convert(dbgIR)],
    ["csljson", () => GEP.csljson.convert(dbgIR)],
  ]) {
    let out;
    try { out = fn(); } catch { out = null; }
    dbgCount++;
    if (!out || out.length < 10) { dbgFail++; check(`${name}: produces output`, false); continue; }
    if (out.includes("[object Object]")) { dbgFail++; check(`${name}: no object leak`, false); }
  }

  {
    let vaultEntries;
    try { vaultEntries = GEP.vault.buildEntries(dbgIR, dbgBaseOpts); } catch { vaultEntries = null; }
    dbgCount++;
    const vaultOk = Array.isArray(vaultEntries) &&
      vaultEntries.some((e) => e.name.endsWith(".md")) &&
      vaultEntries.every((e) => typeof e.data === "string" && !e.data.includes("[object Object]"));
    if (!vaultOk) { dbgFail++; check(`vault: produces valid entries`, false); }
  }

  for (const cite of CITATIONS) {
    const opts = { ...dbgBaseOpts, citationStyle: cite };
    let dBlob, eBlob;
    try { dBlob = GEP.docx.convert(dbgIR, opts); } catch { dBlob = null; }
    try { eBlob = GEP.epub.convert(dbgIR, opts); } catch { eBlob = null; }
    dbgCount += 2;
    if (!dBlob || !(dBlob instanceof Blob) || dBlob.size < 100) {
      dbgFail++; check(`docx/${cite}: produces Blob`, false);
    }
    if (!eBlob || !(eBlob instanceof Blob) || eBlob.size < 100) {
      dbgFail++; check(`epub/${cite}: produces Blob`, false);
    }
  }

  const C = CITATIONS.length;
  const expectedCount = (FLAVORS.length * C) + (4 * C) + 5 + 1 + (2 * C);
  check(`debug matrix: all ${expectedCount} combinations produced`, dbgCount === expectedCount && dbgFail === 0);
}

// =====================================================================
// SUMMARY
// =====================================================================

console.log(`\n${"═".repeat(62)}`);
console.log(`  ${passed}/${total} checks passed.`);
if (failures.length) {
  console.log(`\n  Failed (${failures.length}):`);
  failures.forEach(f => console.log(`    ✗ ${f}`));
}
console.log(ok ? "\n  All checks passed. ✓" : "\n  Some checks FAILED. ✗");
console.log(`${"═".repeat(62)}\n`);
process.exitCode = ok ? 0 : 1;
