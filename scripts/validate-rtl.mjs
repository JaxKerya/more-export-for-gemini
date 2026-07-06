/**
 * Multilingual & RTL validator.
 *
 * Companion to scripts/external-validate.mjs, but focused on the language +
 * writing-direction feature (lang / dir / bidi). It does three things:
 *
 *   1. detectDir() unit matrix  — many scripts (Arabic/Hebrew/Persian/Urdu/
 *      Syriac/Thaana/NKo vs Latin/CJK/Cyrillic/Greek/Turkish) map to rtl/ltr.
 *   2. extract() end-to-end     — synthetic Gemini DOMs (with <html lang> and
 *      RTL/LTR/mixed content) produce the right ir.lang / ir.dir.
 *   3. Exporter markers         — a representative RTL IR (and LTR/mixed/bare
 *      counterparts) is run through every *display* exporter (HTML, Reader,
 *      PDF-print HTML, EPUB, DOCX) and the emitted lang/dir/bidi markers are
 *      asserted. Backward compatibility (IR without lang/dir) is checked too.
 *
 * It also writes real sample files (Arabic, Hebrew, mixed) for each display
 * format into an output dir so you can OPEN them and eyeball the rendering:
 *   - *.html / *.reader.html / *.pdf-print.html → open in a browser
 *   - *.epub                                     → open in an e-reader / EPUBCheck
 *   - *.docx                                     → open in Word / LibreOffice
 *
 * Usage:
 *   node scripts/validate-rtl.mjs [--out=dir] [--no-write]
 *   npm run validate:rtl
 *
 *   --out=dir    where to write sample artifacts (default: validate/rtl)
 *   --no-write   only run assertions, don't write sample files
 *
 * Exit code is non-zero if any assertion FAILs.
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
const write = !argv.includes("--no-write");
const outDir = path.resolve(root, outArg ? outArg.slice("--out=".length) : "validate/rtl");

// ── sandbox (browser-like, linkedom-backed) ─────────────────────────────────
const initial = parseHTML("<!DOCTYPE html><html><body></body></html>");

const sandbox = {
  window: initial.window,
  document: initial.document,
  Node: initial.window.Node,
  console,
  location: { href: "https://gemini.google.com/app/harness" },
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
if (!GEP || !GEP.extractor || !GEP.html) {
  console.error("extractor/exporters failed to load into sandbox");
  process.exit(2);
}

// ── assertion harness ───────────────────────────────────────────────────────
let total = 0, passed = 0, failed = 0, warned = 0;
function check(label, cond) {
  total++;
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}
function warn(label, cond) {
  total++;
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { warned++; console.log(`  WARN  ${label}`); }
}
function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

// linkedom stores zip entries uncompressed (STORE); read entry text by name.
function readZip(buf) {
  const out = {};
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.slice(off + 30, off + 30 + nameLen).toString("utf8");
    const dataStart = off + 30 + nameLen + extraLen;
    out[name] = buf.slice(dataStart, dataStart + compSize).toString("utf8");
    off = dataStart + compSize;
  }
  return out;
}

const opts = { includeToc: true, includeFootnotes: true, citationStyle: "numbered" };

// ── sample text per language ────────────────────────────────────────────────
const TEXT = {
  ar: { lead: "هذا تقرير بحثي عميق حول الذكاء الاصطناعي.", head: "مقدمة", quote: "اقتباس مهم", li: "عنصر القائمة", th: "العمود", td: "القيمة" },
  he: { lead: "זהו דוח מחקר מעמיק על בינה מלאכותית.", head: "מבוא", quote: "ציטוט חשוב", li: "פריט רשימה", th: "טור", td: "ערך" },
  fa: { lead: "این یک گزارش تحقیقاتی عمیق درباره هوش مصنوعی است.", head: "مقدمه", quote: "نقل قول مهم", li: "مورد فهرست", th: "ستون", td: "مقدار" },
  zh: { lead: "这是一份关于人工智能的深度研究报告。", head: "引言", quote: "重要引述", li: "列表项", th: "列", td: "值" },
  en: { lead: "This is a deep research report about AI.", head: "Introduction", quote: "An important quote", li: "List item", th: "Column", td: "Value" },
};

function buildIR({ title, lang, dir, t, extraParagraph }) {
  const blocks = [
    { type: "heading", level: 1, runs: [{ text: t.head }] },
    { type: "paragraph", runs: [{ text: t.lead }] },
  ];
  if (extraParagraph) blocks.push({ type: "paragraph", runs: [{ text: extraParagraph }] });
  blocks.push(
    { type: "blockquote", runs: [{ text: t.quote }] },
    { type: "list", ordered: false, items: [{ runs: [{ text: t.li + " 1" }], level: 0 }, { runs: [{ text: t.li + " 2" }], level: 0 }] },
    { type: "table", header: [[{ text: t.th + " A" }], [{ text: t.th + " B" }]], rows: [[[{ text: t.td + " 1" }], [{ text: t.td + " 2" }]]] },
  );
  return { title, lang, dir, blocks, footnotes: [] };
}

const arIR = buildIR({ title: "تقرير البحث العميق", lang: "ar", dir: "rtl", t: TEXT.ar });
const heIR = buildIR({ title: "דוח מחקר מעמיק", lang: "he", dir: "rtl", t: TEXT.he });
const mixedIR = buildIR({ title: "تقرير مع English", lang: "ar", dir: "rtl", t: TEXT.ar, extraParagraph: "This paragraph is written in English inside an Arabic report." });
const zhIR = buildIR({ title: "深度研究报告", lang: "zh", dir: "ltr", t: TEXT.zh });
const enIR = buildIR({ title: "Deep Research Report", lang: "en", dir: "ltr", t: TEXT.en });
const bareIR = { title: "Bare", blocks: [{ type: "paragraph", runs: [{ text: "Hello world" }] }], footnotes: [] };

// ════════════════════════════════════════════════════════════════════════════
// 1. detectDir() unit matrix
// ════════════════════════════════════════════════════════════════════════════
section("detectDir() language matrix");
const detectDir = GEP.extractor.detectDir;
const RTL_SAMPLES = {
  Arabic: "هذا تقرير بحثي عميق حول الذكاء الاصطناعي والتعلم الآلي",
  Hebrew: "זהו דוח מחקר מעמיק על בינה מלאכותית ולמידת מכונה",
  Persian: "این یک گزارش تحقیقاتی عمیق درباره هوش مصنوعی است",
  Urdu: "یہ مصنوعی ذہانت کے بارے میں ایک گہری تحقیقی رپورٹ ہے",
  Syriac: "ܗܢܐ ܟܬܒܐ ܕܒܘܚܢܐ ܥܡܝܩܐ",
  Thaana: "މިއީ ފުން ދިރާސާ ރިޕޯޓެކެވެ",
};
const LTR_SAMPLES = {
  English: "This is a deep research report about artificial intelligence",
  Turkish: "Bu yapay zeka hakkında derin bir araştırma raporudur",
  Chinese: "这是一份关于人工智能的深度研究报告",
  Japanese: "これは人工知能に関する詳細な調査レポートです",
  Russian: "Это глубокий исследовательский отчёт об искусственном интеллекте",
  Greek: "Αυτή είναι μια εις βάθος ερευνητική έκθεση",
};
for (const [name, txt] of Object.entries(RTL_SAMPLES)) check(`detectDir: ${name} → rtl`, detectDir(txt) === "rtl");
for (const [name, txt] of Object.entries(LTR_SAMPLES)) check(`detectDir: ${name} → ltr`, detectDir(txt) === "ltr");
check("detectDir: empty → ltr", detectDir("") === "ltr");
check("detectDir: null safe → ltr", detectDir(null) === "ltr");
check("detectDir: digits/punct only → ltr", detectDir("12.34 (55%) — #@!") === "ltr");
check("detectDir: mostly-Latin with a few Arabic words → ltr",
  detectDir("The city of القاهرة (Cairo) is large and this sentence is mostly English prose by far.") === "ltr");
check("detectDir: mostly-Arabic with a few Latin words → rtl",
  detectDir("هذا التقرير يذكر مصطلح AI و GPU عدة مرات لكنه عربي في الغالب تماما") === "rtl");

// ════════════════════════════════════════════════════════════════════════════
// 2. extract() end-to-end (synthetic Gemini DOM, real lang/dir detection)
// ════════════════════════════════════════════════════════════════════════════
section("extract() end-to-end (DOM → ir.lang / ir.dir)");
function extractFrom(langAttr, bodyHtml) {
  const docHtml = `<!DOCTYPE html><html${langAttr ? ` lang="${langAttr}"` : ""}><head><title>T</title></head><body>${bodyHtml}</body></html>`;
  const { window, document } = parseHTML(docHtml);
  // Swap only the document (window stays stable so GEP keeps its bindings).
  sandbox.document = document;
  sandbox.Node = window.Node;
  try {
    return GEP.extractor.extract();
  } finally {
    sandbox.document = initial.document;
    sandbox.Node = initial.window.Node;
  }
}
const REPORT = (paras) => `<div id="extended-response-markdown-content" class="markdown">${paras}</div>`;

const exAr = extractFrom("ar", REPORT(`<h1>${TEXT.ar.head}</h1><p>${TEXT.ar.lead}</p>`));
check("extract: Arabic DOM → ir != null", !!exAr);
warn("extract: Arabic DOM → ir.lang = 'ar'", exAr && exAr.lang === "ar");
check("extract: Arabic DOM → ir.dir = 'rtl'", exAr && exAr.dir === "rtl");

const exHe = extractFrom("he", REPORT(`<h1>${TEXT.he.head}</h1><p>${TEXT.he.lead}</p>`));
check("extract: Hebrew DOM → ir.dir = 'rtl'", exHe && exHe.dir === "rtl");

const exEn = extractFrom("en-US", REPORT(`<h1>${TEXT.en.head}</h1><p>${TEXT.en.lead}</p>`));
check("extract: English DOM → ir.dir = 'ltr'", exEn && exEn.dir === "ltr");
warn("extract: English DOM → ir.lang = 'en-US'", exEn && exEn.lang === "en-US");

const exZh = extractFrom("zh", REPORT(`<h1>${TEXT.zh.head}</h1><p>${TEXT.zh.lead}</p>`));
check("extract: Chinese DOM → ir.dir = 'ltr'", exZh && exZh.dir === "ltr");

const exNoLang = extractFrom("", REPORT(`<h1>${TEXT.en.head}</h1><p>${TEXT.en.lead}</p>`));
check("extract: no <html lang> → ir.lang empty", exNoLang && exNoLang.lang === "");
check("extract: no <html lang> → ir.dir = 'ltr'", exNoLang && exNoLang.dir === "ltr");

const exMixed = extractFrom("ar", REPORT(`<h1>${TEXT.ar.head}</h1><p>${TEXT.ar.lead}</p><p>Short English note.</p>`));
check("extract: Arabic-dominant mixed DOM → ir.dir = 'rtl'", exMixed && exMixed.dir === "rtl");

// ════════════════════════════════════════════════════════════════════════════
// 3. Exporter markers (display formats)
// ════════════════════════════════════════════════════════════════════════════
section("HTML / Reader / PDF-print markers");
const arHtml = GEP.html.convert(arIR, opts);
check("html: <html lang=ar>", /<html[^>]*\slang="ar"/.test(arHtml));
check("html: <html dir=rtl>", /<html[^>]*\sdir="rtl"/.test(arHtml));
check("html: paragraph dir=auto", arHtml.includes('<p dir="auto">'));
check("html: heading dir=auto", /<h1[^>]*\sdir="auto"/.test(arHtml));
check("html: blockquote dir=auto", arHtml.includes('<blockquote dir="auto">'));
check("html: list item dir=auto", arHtml.includes('<li dir="auto">'));
check("html: table cell dir=auto", arHtml.includes('<td dir="auto">') && arHtml.includes('<th dir="auto">'));
check("html: logical CSS (no physical padding-left)", arHtml.includes("padding-inline-start") && !/padding-left:\s*22px/.test(arHtml));

const arReader = GEP.reader.convert(arIR, opts);
check("reader: <html lang=ar dir=rtl>", /<html[^>]*\slang="ar"/.test(arReader) && /<html[^>]*\sdir="rtl"/.test(arReader));
check("reader: no hardcoded lang=en", !arReader.includes('lang="en"'));
check("reader: blocks carry dir=auto", arReader.includes('<p dir="auto">'));

const arPdf = GEP.pdf.buildDocument(arIR, opts);
check("pdf-print: <html lang=ar dir=rtl>", /<html[^>]*\slang="ar"/.test(arPdf) && /<html[^>]*\sdir="rtl"/.test(arPdf));
check("pdf-print: blocks carry dir=auto", arPdf.includes('<p dir="auto">'));

// LTR negation + backward compatibility
const enHtml = GEP.html.convert(enIR, opts);
check("html(LTR): <html dir=ltr>", /<html[^>]*\sdir="ltr"/.test(enHtml));
check("html(LTR): lang=en", /<html[^>]*\slang="en"/.test(enHtml));
const bareHtml = GEP.html.convert(bareIR, opts);
check("html(bare): defaults to dir=ltr", /<html[^>]*\sdir="ltr"/.test(bareHtml));
check("html(bare): no lang attribute when undetected", !/<html[^>]*\slang=/.test(bareHtml));

section("EPUB markers");
async function epubParts(ir) { return readZip(Buffer.from(await GEP.epub.convert(ir, opts).arrayBuffer())); }
const arEpub = await epubParts(arIR);
check("epub(ar): <dc:language>ar", (arEpub["OEBPS/content.opf"] || "").includes("<dc:language>ar</dc:language>"));
check("epub(ar): chapter <html dir=rtl>", /<html[^>]*\sdir="rtl"/.test(arEpub["OEBPS/chapter.xhtml"] || ""));
check("epub(ar): chapter xml:lang=ar", (arEpub["OEBPS/chapter.xhtml"] || "").includes('xml:lang="ar"'));
check("epub(ar): <body dir=rtl>", (arEpub["OEBPS/chapter.xhtml"] || "").includes('<body dir="rtl">'));
check("epub(ar): toc <html dir=rtl>", /<html[^>]*\sdir="rtl"/.test(arEpub["OEBPS/toc.xhtml"] || ""));
const enEpub = await epubParts(enIR);
check("epub(en): <dc:language>en", (enEpub["OEBPS/content.opf"] || "").includes("<dc:language>en</dc:language>"));
check("epub(en): chapter <html dir=ltr>", /<html[^>]*\sdir="ltr"/.test(enEpub["OEBPS/chapter.xhtml"] || ""));
const bareEpub = await epubParts(bareIR);
check("epub(bare): defaults <dc:language>en", (bareEpub["OEBPS/content.opf"] || "").includes("<dc:language>en</dc:language>"));

section("DOCX markers");
async function docxParts(ir) { return readZip(Buffer.from(await GEP.docx.convert(ir, opts).arrayBuffer())); }
const arDocx = await docxParts(arIR);
const arStyles = arDocx["word/styles.xml"] || "";
check("docx(ar): docDefaults <w:bidi/>", arStyles.includes("<w:bidi/>"));
check("docx(ar): docDefaults <w:rtl/>", arStyles.includes("<w:rtl/>"));
check("docx(ar): right-aligned default", arStyles.includes('<w:jc w:val="right"/>'));
check("docx(ar): table <w:bidiVisual/>", (arDocx["word/document.xml"] || "").includes("<w:bidiVisual/>"));
const enDocx = await docxParts(enIR);
const enStyles = enDocx["word/styles.xml"] || "";
check("docx(en): no bidi/rtl in defaults", !enStyles.includes("<w:bidi/>") && !enStyles.includes("<w:rtl/>"));
check("docx(en): no table bidiVisual", !(enDocx["word/document.xml"] || "").includes("<w:bidiVisual/>"));

// ════════════════════════════════════════════════════════════════════════════
// 4. Sample artifacts for manual visual inspection
// ════════════════════════════════════════════════════════════════════════════
if (write) {
  section(`Writing sample artifacts → ${path.relative(root, outDir)}`);
  fs.mkdirSync(outDir, { recursive: true });
  const samples = [
    { name: "arabic", ir: arIR },
    { name: "hebrew", ir: heIR },
    { name: "mixed-ar-en", ir: mixedIR },
    { name: "chinese", ir: zhIR },
  ];
  for (const { name, ir } of samples) {
    fs.writeFileSync(path.join(outDir, `${name}.html`), GEP.html.convert(ir, opts), "utf8");
    fs.writeFileSync(path.join(outDir, `${name}.reader.html`), GEP.reader.convert(ir, opts), "utf8");
    fs.writeFileSync(path.join(outDir, `${name}.pdf-print.html`), GEP.pdf.buildDocument(ir, opts), "utf8");
    fs.writeFileSync(path.join(outDir, `${name}.epub`), Buffer.from(await GEP.epub.convert(ir, opts).arrayBuffer()));
    fs.writeFileSync(path.join(outDir, `${name}.docx`), Buffer.from(await GEP.docx.convert(ir, opts).arrayBuffer()));
    console.log(`  wrote ${name}.{html,reader.html,pdf-print.html,epub,docx}`);
  }
  console.log("\n  Open the .html files in a browser; .epub in an e-reader; .docx in Word/LibreOffice.");
  console.log("  Tip: validate the .epub with EPUBCheck if installed.");
}

// ── summary ───────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(62)}`);
console.log(`  ${passed}/${total} checks passed` + (warned ? `, ${warned} warned` : "") + (failed ? `, ${failed} FAILED` : "") + ".");
console.log(failed ? "  Some RTL/multilingual checks FAILED. ✗" : "  All RTL/multilingual checks passed. ✓");
console.log("═".repeat(62));
process.exitCode = failed ? 1 : 0;
