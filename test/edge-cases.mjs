/**
 * Edge-case tests for exporters (#25).
 *
 * Covers: empty reports, Turkish characters, long titles, deeply nested lists,
 * large tables, and footnote-only paragraphs.
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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
  "src/vendor/highlight.js",
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
  "src/exporters/reader.js",
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
  "src/lib/selectors.js",
  "src/lib/extractor.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
}

const GEP = sandbox.window.GEP;
let ok = true;
let total = 0;
let passed = 0;

function check(label, cond) {
  total++;
  if (!cond) { console.error("FAIL:", label); ok = false; }
  else { passed++; }
}

const opts = { includeToc: true, includeFootnotes: true };

// ============================================================
// 1. Empty report (no blocks)
// ============================================================
const emptyIR = { title: "Empty", blocks: [], footnotes: [] };

check("md: empty report", typeof GEP.markdown.convert(emptyIR, opts) === "string");
check("txt: empty report", typeof GEP.txt.convert(emptyIR, opts) === "string");
check("html: empty report", GEP.html.convert(emptyIR, opts).includes("Empty"));
check("reader: empty report", GEP.reader.convert(emptyIR, opts).includes('<main class="reader" id="reader-content"'));
check("reader: standalone modern shell", (() => {
  const h = GEP.reader.convert(emptyIR, opts);
  return h.startsWith("<!DOCTYPE html>") && h.includes("prefers-color-scheme") &&
    h.includes('name="viewport"') && h.includes("</html>");
})());
check("reader: progress + scrollspy + outline wired (no in-file controls)", (() => {
  const h = GEP.reader.convert(emptyIR, opts);
  return h.includes("reader-progress") && h.includes("reader-sidebar") && h.includes("highlightAll") &&
    // presentation is baked at export time, not toggled in the file
    !h.includes("reader-controls") && !h.includes("reader-theme") && !h.includes("reader-width");
})());
check("reader: app shell (topbar, default outline, skip link, drawer)", (() => {
  const h = GEP.reader.convert(emptyIR, opts);
  return h.includes('<header class="reader-topbar">') && h.includes('<aside class="reader-sidebar"') &&
    h.includes('href="#reader-content"') && h.includes('<div class="reader-scrim"') &&
    h.includes('reader-icon-btn reader-menu"');
})());
check("reader: baked theme/width settings -> <html> attrs + color-scheme", (() => {
  const def = GEP.reader.convert(emptyIR, opts);
  const dark = GEP.reader.convert(emptyIR, { ...opts, readerTheme: "dark", readerWidth: "wide" });
  return (
    // default: auto theme (no data-theme), comfortable width (no data-width)
    !/<html[^>]*data-theme=/.test(def) && !/<html[^>]*data-width=/.test(def) &&
    def.includes('content="light dark"') &&
    // pinned: data-theme + data-width baked onto <html>, color-scheme narrowed
    /<html[^>]*data-theme="dark"/.test(dark) && /<html[^>]*data-width="wide"/.test(dark) &&
    dark.includes('content="dark"')
  );
})());
check("reader: typography / accent / justify / progress baked into <html>", (() => {
  const def = GEP.reader.convert(emptyIR, opts);
  const custom = GEP.reader.convert(emptyIR, {
    ...opts, readerFont: "serif", readerSize: "large", readerSpacing: "relaxed",
    readerAccent: "teal", readerJustify: true, readerProgress: false,
  });
  const bad = GEP.reader.convert(emptyIR, { ...opts, readerAccent: "neon", readerSize: "huge" });
  return (
    // defaults emit no extra presentation attributes
    !/<html[^>]*data-font=/.test(def) && !/<html[^>]*data-size=/.test(def) &&
    !/<html[^>]*data-accent=/.test(def) && !/<html[^>]*data-progress=/.test(def) &&
    // each custom choice is baked onto <html>
    /<html[^>]*data-font="serif"/.test(custom) && /<html[^>]*data-size="large"/.test(custom) &&
    /<html[^>]*data-spacing="relaxed"/.test(custom) && /<html[^>]*data-accent="teal"/.test(custom) &&
    /<html[^>]*data-justify="on"/.test(custom) && /<html[^>]*data-progress="off"/.test(custom) &&
    // invalid values fall back to defaults (no attribute emitted)
    !/<html[^>]*data-accent=/.test(bad) && !/<html[^>]*data-size=/.test(bad)
  );
})());
check("reader: outline can be disabled (no sidebar / drawer)", (() => {
  const h = GEP.reader.convert(emptyIR, { ...opts, readerOutline: false });
  return !h.includes('<aside class="reader-sidebar"') && !h.includes('<div class="reader-scrim"') &&
    !h.includes('reader-icon-btn reader-menu"') && h.includes('<header class="reader-topbar">');
})());
check("reader: footer credits extension + reading time", (() => {
  const h = GEP.reader.convert(emptyIR, opts);
  return h.includes("reader-footer") && h.includes("More Export for Gemini") && /~\d+ min read/.test(h);
})());
check("reader: no code => no highlight.js payload", (() =>
  !GEP.reader.convert(emptyIR, opts).includes("code.hljs{background:transparent"))());
check("reader: code => highlight.js payload inlined", (() => {
  const codeIR = { title: "Code", blocks: [{ type: "code", lang: "js", text: "const x = 1;" }], footnotes: [] };
  const h = GEP.reader.convert(codeIR, opts);
  return h.includes("code.hljs{background:transparent") && h.includes("hljs.highlightAll");
})());
check("pdf: sanitizeMathHtml re-inlines KaTeX svg with currentColor (theme-safe, idempotent)", (() => {
  const dirty = '<span class="katex"><img class="katex-svg" src="data:image/svg+xml;utf8,&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot;&gt;&lt;/svg&gt;"></span>';
  const clean = GEP.pdf.sanitizeMathHtml(dirty);
  return clean.includes('<svg') && clean.includes('fill="currentColor"') &&
    !clean.includes("<img") && !clean.includes("data:image/svg") &&
    !clean.includes("utf8,&lt;") && GEP.pdf.sanitizeMathHtml(clean) === clean;
})());
check("pdf: sanitizeMathHtml still encodes non-KaTeX data-uri + adds alt", (() => {
  const dirty = '<img src="data:image/svg+xml;utf8,&lt;svg xmlns=&quot;http://www.w3.org/2000/svg&quot;&gt;&lt;/svg&gt;">';
  const clean = GEP.pdf.sanitizeMathHtml(dirty);
  return clean.includes("data:image/svg+xml,%3Csvg") && /<img[^>]*\salt=""/.test(clean) &&
    !clean.includes("utf8,&lt;") && GEP.pdf.sanitizeMathHtml(clean) === clean;
})());
check("pdf: heading levels stay contiguous (no skipped levels)", (() => {
  const ir = { title: "T", blocks: [
    { type: "heading", level: 2, runs: [{ text: "A" }] },
    { type: "heading", level: 5, runs: [{ text: "B" }] },
    { type: "heading", level: 3, runs: [{ text: "C" }] },
  ], footnotes: [] };
  const h = GEP.pdf.bodyHtml(ir, { includeToc: false, includeFootnotes: false });
  return /<h2[^>]*>A<\/h2>/.test(h) && /<h3[^>]*>B<\/h3>/.test(h) &&
    /<h3[^>]*>C<\/h3>/.test(h) && !/<h[456]\b/.test(h);
})());
check("json: empty report", JSON.parse(GEP.json.convert(emptyIR)).blocks.length === 0);
check("json: schemaVersion present", JSON.parse(GEP.json.convert(emptyIR)).schemaVersion === 1);
check("json: generator + exportedAt", (() => { const j = JSON.parse(GEP.json.convert(emptyIR)); return j.generator === "More Export for Gemini" && typeof j.exportedAt === "string"; })());
check("json: root stripped", !("root" in JSON.parse(GEP.json.convert({ title: "x", blocks: [], footnotes: [], root: {} }))));
check("latex: empty report", GEP.latex.convert(emptyIR, opts).includes("\\end{document}"));
check("bibtex: empty report", GEP.bibtex.convert(emptyIR).includes("No sources"));
check("ris: empty report has GEN record", GEP.ris.convert(emptyIR).includes("TY  - GEN"));
check("docx: empty report", GEP.docx.convert(emptyIR, opts) instanceof Blob);
check("epub: empty report", GEP.epub.convert(emptyIR, opts) instanceof Blob);
check("rtf: empty report", typeof GEP.rtf.convert(emptyIR, opts) === "string" && GEP.rtf.convert(emptyIR, opts).startsWith("{\\rtf1"));
check("vault: empty report has main md", GEP.vault.buildEntries(emptyIR, opts).some((e) => e.name.endsWith(".md")));

// ============================================================
// 2. Turkish special characters: ş ğ ı İ ç ö ü Ş Ğ
// ============================================================
const turkishIR = {
  title: "Türkçe Özel Karakterler: şğıİçöüŞĞ",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Başlık: şğıİçöüŞĞ" }] },
    { type: "paragraph", runs: [
      { text: "Çalışıyorum, güzel göründüğünü düşünüyorum." },
      { text: "", footnoteIndex: 1 },
    ]},
    { type: "table", header: [[{ text: "Ölçü" }], [{ text: "Değer" }]], rows: [[[{ text: "Sıcaklık" }], [{ text: "25°C" }]]] },
  ],
  footnotes: [{ index: 1 }],
};

const turkMd = GEP.markdown.convert(turkishIR, opts);
check("turkish md has ş", turkMd.includes("ş"));
check("turkish md has İ", turkMd.includes("İ"));
check("turkish md has ğ", turkMd.includes("ğ"));
check("turkish md has ö", turkMd.includes("ö"));

const turkTxt = GEP.txt.convert(turkishIR, opts);
check("turkish txt has Çalışıyorum", turkTxt.includes("Çalışıyorum"));

const turkHtml = GEP.html.convert(turkishIR, opts);
check("turkish html has title", turkHtml.includes("Türkçe"));

const turkTex = GEP.latex.convert(turkishIR, opts);
check("turkish latex exists", turkTex.length > 0);

const turkDocx = GEP.docx.convert(turkishIR, opts);
check("turkish docx is blob", turkDocx instanceof Blob);

const turkEpub = GEP.epub.convert(turkishIR, opts);
check("turkish epub is blob", turkEpub instanceof Blob);

const turkRtf = GEP.rtf.convert(turkishIR, opts);
check("turkish rtf escapes ş as unicode", turkRtf.includes("\\u351?"));
check("turkish rtf escapes İ as unicode", turkRtf.includes("\\u304?"));

// ============================================================
// 3. Very long title (500+ chars)
// ============================================================
const longTitle = "A".repeat(600);
const longIR = {
  title: longTitle,
  blocks: [{ type: "paragraph", runs: [{ text: "content" }] }],
  footnotes: [],
};

check("long title md", GEP.markdown.convert(longIR, opts).includes("AAAAAA"));
check("long title txt", GEP.txt.convert(longIR, opts).includes("AAAAAA"));
check("long title html", GEP.html.convert(longIR, opts).includes("AAAAAA"));
check("long title docx", GEP.docx.convert(longIR, opts) instanceof Blob);
check("long title epub", GEP.epub.convert(longIR, opts) instanceof Blob);
check("long title rtf", GEP.rtf.convert(longIR, opts).includes("AAAAAA"));

// ============================================================
// 4. Deeply nested lists (5+ levels)
// ============================================================
const deepListIR = {
  title: "Deep Lists",
  blocks: [{
    type: "list",
    ordered: false,
    items: [
      { runs: [{ text: "Level 0" }], level: 0 },
      { runs: [{ text: "Level 1" }], level: 1 },
      { runs: [{ text: "Level 2" }], level: 2 },
      { runs: [{ text: "Level 3" }], level: 3 },
      { runs: [{ text: "Level 4" }], level: 4 },
      { runs: [{ text: "Level 5" }], level: 5 },
    ],
  }],
  footnotes: [],
};

const deepMd = GEP.markdown.convert(deepListIR, opts);
check("deep list md has Level 5", deepMd.includes("Level 5"));
check("deep list md has indent", deepMd.includes("          -")); // 5 * 2 spaces

const deepTxt = GEP.txt.convert(deepListIR, opts);
check("deep list txt has Level 5", deepTxt.includes("Level 5"));

const deepTex = GEP.latex.convert(deepListIR, opts);
check("deep list latex has Level 5", deepTex.includes("Level 5"));

const deepRtf = GEP.rtf.convert(deepListIR, opts);
check("deep list rtf has Level 5", deepRtf.includes("Level 5"));

// ============================================================
// 5. Large table (100 rows)
// ============================================================
const bigRows = [];
for (let i = 0; i < 100; i++) {
  bigRows.push([[{ text: `Row ${i}` }], [{ text: `Val ${i}` }]]);
}
const bigTableIR = {
  title: "Big Table",
  blocks: [{
    type: "table",
    header: [[{ text: "ID" }], [{ text: "Value" }]],
    rows: bigRows,
  }],
  footnotes: [],
};

const bigMd = GEP.markdown.convert(bigTableIR, opts);
check("big table md has Row 99", bigMd.includes("Row 99"));

const bigCsv = GEP.csv.convert(bigTableIR);
check("big table csv has Row 99", bigCsv.includes("Row 99"));

const bigDocx = GEP.docx.convert(bigTableIR, opts);
check("big table docx is blob", bigDocx instanceof Blob);

const bigRtf = GEP.rtf.convert(bigTableIR, opts);
check("big table rtf has Row 99", bigRtf.includes("Row 99"));
check("big table rtf has table rows", bigRtf.includes("\\trowd"));

// ============================================================
// 6. Footnote-only paragraph (no text, just footnote refs)
// ============================================================
const fnOnlyIR = {
  title: "Footnote Only",
  blocks: [{
    type: "paragraph",
    runs: [
      { text: "", footnoteIndex: 1 },
      { text: "", footnoteIndex: 3 },
      { text: "", footnoteIndex: 5 },
    ],
  }],
  footnotes: [{ index: 1 }, { index: 3 }, { index: 5 }],
};

const fnMd = GEP.markdown.convert(fnOnlyIR, opts);
check("fn-only md has [^1]", fnMd.includes("[^1]"));
check("fn-only md has [^5]", fnMd.includes("[^5]"));
check("fn-only md has definition", fnMd.includes("[^3]: Source 3"));

const fnTxt = GEP.txt.convert(fnOnlyIR, opts);
check("fn-only txt has [1]", fnTxt.includes("[1]"));

const fnHtml = GEP.html.convert(fnOnlyIR, opts);
check("fn-only html has fn-5 anchor", fnHtml.includes("fn-5"));

// ============================================================
// 7. Blockquote and code block edge cases
// ============================================================
const miscIR = {
  title: "Misc",
  blocks: [
    { type: "blockquote", runs: [{ text: "A quote with special chars: <>&\"'" }] },
    { type: "code", text: "function foo() {\n  return 'bar';\n}" },
    { type: "hr" },
  ],
  footnotes: [],
};

const miscMd = GEP.markdown.convert(miscIR, opts);
check("blockquote md has >", miscMd.includes("> "));
check("code md has fence", miscMd.includes("```"));

const miscHtml = GEP.html.convert(miscIR, opts);
check("html escapes <", miscHtml.includes("&lt;"));
check("html escapes >", miscHtml.includes("&gt;"));
check("html has <pre>", miscHtml.includes("<pre>"));

const miscTex = GEP.latex.convert(miscIR, opts);
check("latex code uses wrapping Verbatim", miscTex.includes("\\begin{Verbatim}[breaklines=true"));
check("latex loads fvextra for code wrapping", miscTex.includes("\\usepackage{fvextra}"));

// ============================================================
// 8. TOC edge cases
// ============================================================
const tocIR = {
  title: "TOC Test",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Same Name" }] },
    { type: "heading", level: 1, runs: [{ text: "Same Name" }] },
    { type: "heading", level: 2, runs: [{ text: "" }] }, // empty heading
    { type: "heading", level: 3, runs: [{ text: "Sub-heading (with parens)" }] },
  ],
  footnotes: [],
};

const toc = GEP.toc.generate(tocIR);
check("toc duplicate slugs are unique", toc.items[0].id !== toc.items[1].id);
check("toc empty heading skipped", toc.items.length === 3); // 2 "Same Name" + 1 "Sub-heading"
check("toc parens in slug handled", toc.items[2].id.includes("sub-heading"));

// The level-1 heading duplicating the document title is skipped by exporters,
// so the TOC must not contain a dead anchor for it.
const tocDupTitle = GEP.toc.generate({
  title: "Doc Title",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Doc Title" }] },
    { type: "heading", level: 2, runs: [{ text: "Section" }] },
  ],
});
check("toc skips title-duplicate heading", tocDupTitle.items.length === 1 && tocDupTitle.items[0].text === "Section");

// ============================================================
// 11. BibTeX edge cases
// ============================================================
const bibNoSrc = GEP.bibtex.convert({ title: "No Refs", blocks: [], footnotes: [] });
check("bibtex no sources: comment header", bibNoSrc.includes("No sources"));
check("bibtex no sources: no @misc", !bibNoSrc.includes("@misc"));

const bibWithSrc = GEP.bibtex.convert({
  title: "Test",
  blocks: [],
  footnotes: [
    { index: 1, url: "https://example.com/test?q=1&b=2", title: "Test {Page}", domain: "example.com" },
  ],
});
check("bibtex escapes braces in title", bibWithSrc.includes("\\{Page\\}"));
check("bibtex has @misc entry", bibWithSrc.includes("@misc{"));

// ============================================================
// 11b. RIS edge cases
// ============================================================
const risWithSrc = GEP.ris.convert({
  title: "Test",
  blocks: [],
  footnotes: [
    { index: 1, url: "https://example.com/a", title: "Line\nBreak Title", domain: "example.com" },
    { index: 4 }, // no url, no title
  ],
});
check("ris: newlines stripped from values", risWithSrc.includes("TI  - Line Break Title"));
check("ris: no-url source still gets record", risWithSrc.includes("TI  - Source 4"));
check("ris: T2 carries domain", risWithSrc.includes("T2  - example.com"));
check("ris: 2 records for 2 sources", (risWithSrc.match(/^TY  - ELEC$/gm) || []).length === 2);
check("ris: every line is tagged or blank", risWithSrc.split("\n").every((l) => !l.trim() || /^[A-Z][A-Z0-9]  - /.test(l)));

// ============================================================
// 13. Citation styles with all exporters
// ============================================================
const citIR = {
  title: "Citation Test",
  blocks: [{ type: "paragraph", runs: [{ text: "Text", }, { text: "", footnoteIndex: 1 }] }],
  footnotes: [{ index: 1, url: "https://example.com", title: "Example", domain: "example.com" }],
};

for (const style of ["numbered", "apa", "mla", "chicago", "ieee"]) {
  const citOpts = { ...opts, citationStyle: style };
  const mdOut = GEP.markdown.convert(citIR, citOpts);
  check(`citation ${style}: md produces output`, mdOut.length > 30);
  const txtOut = GEP.txt.convert(citIR, citOpts);
  check(`citation ${style}: txt produces output`, txtOut.length > 20);
  const texOut = GEP.latex.convert(citIR, citOpts);
  check(`citation ${style}: latex produces output`, texOut.includes("Sources"));
  const rtfOut = GEP.rtf.convert(citIR, citOpts);
  check(`citation ${style}: rtf produces output`, rtfOut.length > 100);
  check(`citation ${style}: rtf has Sources`, rtfOut.includes("Sources"));
}

// ============================================================
// 14. Filename template edge cases
// ============================================================
const tplIr = { title: "Test", blocks: [{ type: "paragraph", runs: [{ text: "one two three" }] }], footnotes: [] };

const tplAll = GEP.download.templateFileName("My Report", ".md", "markdown", "{title}_{date}_{YYYY}_{MM}_{DD}_{HH}_{mm}_{ss}_{format}_{wordcount}_{timestamp}", tplIr);
check("tpl: all tokens replaced", !tplAll.includes("{"));
check("tpl: has extension", tplAll.endsWith(".md"));

const tplEmpty = GEP.download.templateFileName("Test", ".md", "markdown", null, tplIr);
check("tpl: null template uses default", tplEmpty.includes("Test") && tplEmpty.includes(" - "));

const tplNoIr = GEP.download.templateFileName("Test", ".md", "markdown", "{wordcount}", null);
check("tpl: null ir gives 0 wordcount", tplNoIr === "0.md");

// ============================================================
// 15. Escaping correctness (regression tests)
// ============================================================

// LaTeX: backslash, tilde and caret must not produce broken commands.
const texSpecialIR = {
  title: "Tex",
  blocks: [{ type: "paragraph", runs: [{ text: "back\\slash ~tilde ^caret 100%" }] }],
  footnotes: [],
};
const texSpecial = GEP.latex.convert(texSpecialIR, opts);
check("latex: backslash escaped cleanly", texSpecial.includes("\\textbackslash{}") && !texSpecial.includes("\\textbackslash\\{"));
check("latex: tilde uses text command", texSpecial.includes("\\textasciitilde{}"));
check("latex: caret uses text command", texSpecial.includes("\\textasciicircum{}"));
check("latex: percent escaped", texSpecial.includes("100\\%"));

// Markdown: headerless tables must not lose the first row.
const headerlessTableIR = {
  title: "T",
  blocks: [{
    type: "table",
    header: null,
    rows: [
      [[{ text: "FirstA" }], [{ text: "FirstB" }]],
      [[{ text: "SecondA" }], [{ text: "SecondB" }]],
    ],
  }],
  footnotes: [],
};
const headerlessMd = GEP.markdown.convert(headerlessTableIR, opts);
check("md: headerless table keeps first row", headerlessMd.includes("FirstA"));
check("md: headerless table keeps second row", headerlessMd.includes("SecondA"));

// BibTeX: LaTeX specials in titles must be escaped.
const bibSpecial = GEP.bibtex.convert({
  title: "B",
  blocks: [],
  footnotes: [{ index: 1, url: "https://e.com", title: "Music & Brain 100% #1_test", domain: "e.com" }],
});
check("bibtex: ampersand escaped", bibSpecial.includes("\\&"));
check("bibtex: percent escaped", bibSpecial.includes("\\%"));
check("bibtex: underscore escaped", bibSpecial.includes("\\_"));

// Title dedup: an H1 identical to the document title must not repeat.
const dupTitleIR = {
  title: "Unique Doc Title",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Unique Doc Title" }] },
    { type: "paragraph", runs: [{ text: "Body text" }] },
  ],
  footnotes: [],
};
// TOC disabled so the title is not also counted as a TOC entry.
// HTML legitimately carries the title twice: document metadata + visible heading.
const noTocOpts = { includeToc: false, includeFootnotes: true };
for (const [name, out, expected] of [
  ["md", GEP.markdown.convert(dupTitleIR, noTocOpts), 1],
  ["txt", GEP.txt.convert(dupTitleIR, noTocOpts), 1],
  ["latex", GEP.latex.convert(dupTitleIR, noTocOpts), 1],
  ["html", GEP.html.convert(dupTitleIR, noTocOpts), 2],
  ["rtf", GEP.rtf.convert(dupTitleIR, noTocOpts), 1],
]) {
  const count = out.split("Unique Doc Title").length - 1;
  check(`${name}: no duplicate title heading`, count === expected);
}

// ============================================================
// 17. Vault bundle
// ============================================================
const vaultIR = {
  title: "Vault Test",
  blocks: [
    { type: "paragraph", runs: [{ text: "Body" }, { text: "", footnoteIndex: 1 }] },
    { type: "table", header: [[{ text: "H1" }], [{ text: "H2" }]], rows: [[[{ text: "a,b" }], [{ text: 'c"d' }]]] },
    { type: "table", header: [[{ text: "X" }]], rows: [[[{ text: "y" }]]] },
  ],
  footnotes: [{ index: 1, url: "https://e.com", title: "Source", domain: "e.com" }],
};
const vEntries = GEP.vault.buildEntries(vaultIR, opts);
check("vault: has main markdown", vEntries.some((e) => e.name.endsWith(".md") && e.name !== "references.md"));
check("vault: has references.md", vEntries.some((e) => e.name === "references.md"));
check("vault: one csv per table", vEntries.filter((e) => e.name.startsWith("tables/") && e.name.endsWith(".csv")).length === 2);
const vCsv = vEntries.find((e) => e.name.startsWith("tables/")).data;
check("vault: csv quotes comma field", vCsv.includes('"a,b"'));
check("vault: csv escapes quote", vCsv.includes('"c""d"'));
check("vault: references list has source", vEntries.find((e) => e.name === "references.md").data.includes("Source"));
check("vault: no references when no footnotes", !GEP.vault.buildEntries({ title: "X", blocks: [], footnotes: [] }, opts).some((e) => e.name === "references.md"));

// ============================================================
// 18. IR filters (selective export)
// ============================================================
const filterIR = {
  title: "Filter",
  blocks: [
    { type: "paragraph", runs: [{ text: "Intro" }, { text: "", footnoteIndex: 1 }] },
    { type: "table", header: [[{ text: "A" }]], rows: [[[{ text: "1" }]]] },
    { type: "list", items: [{ runs: [{ text: "item" }, { text: "", footnoteIndex: 2 }] }] },
  ],
  footnotes: [{ index: 1 }, { index: 2 }],
};
const onlyTables = GEP.irFilter.tablesOnly(filterIR);
check("irFilter: tablesOnly keeps only tables", onlyTables.blocks.length === 1 && onlyTables.blocks[0].type === "table");
check("irFilter: tablesOnly drops footnotes", onlyTables.footnotes.length === 0);
check("irFilter: original IR not mutated", filterIR.blocks.length === 3 && filterIR.footnotes.length === 2);
const noSrc = GEP.irFilter.withoutSources(filterIR);
check("irFilter: withoutSources keeps blocks", noSrc.blocks.length === 3);
check("irFilter: withoutSources strips footnote refs in paragraph", !noSrc.blocks[0].runs.some((r) => r.footnoteIndex));
check("irFilter: withoutSources strips refs in list items", !noSrc.blocks[2].items[0].runs.some((r) => r.footnoteIndex));
check("irFilter: withoutSources drops footnotes", noSrc.footnotes.length === 0);
check("irFilter: apply unknown scope returns same ir", GEP.irFilter.apply(filterIR, "bogus") === filterIR);

// ── Section-scoped export (#9) ──
const sectionIR = {
  title: "Sectioned",
  blocks: [
    /* 0 */ { type: "heading", level: 1, runs: [{ text: "Doc Title" }] },
    /* 1 */ { type: "paragraph", runs: [{ text: "intro" }, { text: "", footnoteIndex: 1 }] },
    /* 2 */ { type: "heading", level: 2, runs: [{ text: "Alpha" }] },
    /* 3 */ { type: "paragraph", runs: [{ text: "alpha body" }, { text: "", footnoteIndex: 2 }] },
    /* 4 */ { type: "heading", level: 3, runs: [{ text: "Alpha sub" }] },
    /* 5 */ { type: "list", ordered: false, items: [{ runs: [{ text: "item" }, { text: "", footnoteIndex: 3 }], level: 0 }] },
    /* 6 */ { type: "heading", level: 2, runs: [{ text: "Beta" }] },
    /* 7 */ { type: "table", header: [[{ text: "H" }]], rows: [[[{ text: "cell" }, { text: "", footnoteIndex: 4 }]]] },
  ],
  footnotes: [{ index: 1 }, { index: 2 }, { index: 3 }, { index: 4 }],
};

const secList = GEP.irFilter.sectionList(sectionIR);
check("irFilter: sectionList finds all headings", secList.length === 4);
check("irFilter: sectionList carries index/level/title",
  secList[1].blockIndex === 2 && secList[1].level === 2 && secList[1].title === "Alpha");

// Selecting "Alpha" (h2 @2) spans its sub-heading but stops before "Beta".
const alpha = GEP.irFilter.apply(sectionIR, "sections:2");
check("irFilter: section spans until next same-level heading",
  alpha.blocks.length === 4 && alpha.blocks[0].runs[0].text === "Alpha" && alpha.blocks[3].type === "list");
check("irFilter: section footnotes reduced to referenced ones",
  alpha.footnotes.length === 2 && alpha.footnotes.every((f) => f.index === 2 || f.index === 3));
check("irFilter: sections does not mutate original", sectionIR.blocks.length === 8 && sectionIR.footnotes.length === 4);

// Multiple selections, including a table cell footnote.
const multi = GEP.irFilter.apply(sectionIR, "sections:6,2");
check("irFilter: multi-section keeps both sections in document order",
  multi.blocks.length === 6 && multi.blocks[4].runs[0].text === "Beta");
check("irFilter: table-cell footnote survives the scan",
  multi.footnotes.some((f) => f.index === 4));

// The h1 spans everything below it (no other h1 in the report).
const whole = GEP.irFilter.apply(sectionIR, "sections:0");
check("irFilter: top-level heading keeps the whole report", whole.blocks.length === 8);

// Sub-section only: "Alpha sub" (h3 @4) ends at the h2 "Beta".
const sub = GEP.irFilter.apply(sectionIR, "sections:4");
check("irFilter: sub-section stops at higher-level heading",
  sub.blocks.length === 2 && sub.blocks[1].type === "list");

// Bad input degrades safely.
check("irFilter: non-heading index yields empty blocks",
  GEP.irFilter.apply(sectionIR, "sections:1").blocks.length === 0);
check("irFilter: malformed sections scope returns same ir",
  GEP.irFilter.apply(sectionIR, "sections:") === sectionIR
  && GEP.irFilter.apply(sectionIR, "sections:x,-1") === sectionIR);

// ============================================================
// 19. New formats: CSL-JSON, RTF
// ============================================================
const pubIR = {
  title: "Publishing Test",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Publishing Test" }] },
    { type: "heading", level: 2, runs: [{ text: "Section A — Türkçe ş" }] },
    { type: "paragraph", runs: [{ text: "Body with " }, { text: "bold", bold: true }, { text: " and a ref" }, { text: "", footnoteIndex: 1 }] },
    { type: "heading", level: 2, runs: [{ text: "Section B" }] },
    { type: "table", header: [[{ text: "H1" }], [{ text: "H2" }]], rows: [[[{ text: "a,b" }], [{ text: "x" }]]] },
    { type: "list", ordered: false, items: [{ runs: [{ text: "one" }], level: 0 }, { runs: [{ text: "sub" }], level: 1 }] },
    { type: "code", text: "let y = 2;" },
  ],
  footnotes: [{ index: 1, url: "https://src.example.com/a", title: "Source A", domain: "src.example.com" }],
};

// CSL-JSON
const cslStr = GEP.csljson.convert(pubIR);
let csl;
check("csljson: valid JSON", (() => { try { csl = JSON.parse(cslStr); return true; } catch { return false; } })());
check("csljson: is array of one item", Array.isArray(csl) && csl.length === 1);
check("csljson: item is webpage", csl && csl[0].type === "webpage");
check("csljson: has URL", csl && csl[0].URL === "https://src.example.com/a");
check("csljson: has title", csl && csl[0].title === "Source A");
check("csljson: has accessed date-parts", csl && Array.isArray(csl[0].accessed["date-parts"]));
check("csljson: empty when no footnotes", JSON.parse(GEP.csljson.convert({ title: "x", blocks: [], footnotes: [] })).length === 0);

// RTF
const rtfPub = GEP.rtf.convert(pubIR, opts);
check("rtf: starts with rtf header", rtfPub.startsWith("{\\rtf1"));
check("rtf: has font table", rtfPub.includes("\\fonttbl"));
check("rtf: section heading bold", rtfPub.includes("Section A"));
check("rtf: turkish escaped", rtfPub.includes("\\u351?"));
check("rtf: table rows present", rtfPub.includes("\\trowd"));
check("rtf: hyperlink field for source", rtfPub.includes("HYPERLINK"));
check("rtf: no object leak", !rtfPub.includes("[object Object]"));
check("rtf: balanced braces", (() => {
  let depth = 0;
  for (let i = 0; i < rtfPub.length; i++) {
    const ch = rtfPub[i];
    if (ch === "\\") { i++; continue; } // skip escaped char
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
})());

// ============================================================
// 20. Math / equations across formats
// ============================================================
const mathIR = {
  title: "Math Test",
  blocks: [
    { type: "paragraph", runs: [
      { text: "Inline " },
      { text: "", math: { tex: "a^2 + b^2 = c^2", mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi></math>', display: false } },
      { text: " end." },
    ]},
    { type: "math", tex: "\\int_0^\\infty e^{-x}\\,dx = 1", mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>1</mn></math>' },
  ],
  footnotes: [],
};

const mMd = GEP.markdown.convert(mathIR, opts);
check("math md: inline $...$", mMd.includes("$a^2 + b^2 = c^2$"));
check("math md: display $$...$$", /\$\$\n\\int_0\^\\infty/.test(mMd));

const mTex = GEP.latex.convert(mathIR, opts);
check("math latex: inline \\(...\\)", mTex.includes("\\(a^2 + b^2 = c^2\\)"));
check("math latex: display \\[...\\]", mTex.includes("\\[\n\\int_0^\\infty e^{-x}\\,dx = 1\n\\]"));
check("math latex: tex not escaped", !mTex.includes("\\textbackslash"));
// amsmath/amssymb are required so \text{…}, \mathbb{…} etc. from Gemini math compile.
check("math latex: amsmath loaded", mTex.includes("\\usepackage{amsmath}"));
check("math latex: amssymb loaded", mTex.includes("\\usepackage{amssymb}"));
const texTextMath = GEP.latex.convert(
  { title: "T", blocks: [{ type: "math", tex: "k \\quad \\text{için} \\geq 0" }], footnotes: [] },
  opts
);
check("math latex: \\text passes through with amsmath", texTextMath.includes("\\text{için}") && texTextMath.includes("\\usepackage{amsmath}"));

const mHtml = GEP.html.convert(mathIR, opts);
check("math html: embeds inline mathml", mHtml.includes("<math xmlns=\"http://www.w3.org/1998/Math/MathML\"><mi>a</mi></math>"));
check("math html: display wrapped in math-display", mHtml.includes('class="math-display"'));

const mTxt = GEP.txt.convert(mathIR, opts);
check("math txt: plain tex inline", mTxt.includes("a^2 + b^2 = c^2"));

const mRtf = GEP.rtf.convert(mathIR, opts);
check("math rtf: inline math → unicode (a²)", mRtf.includes("a\\u178?"));
check("math rtf: block math present", mRtf.includes("\\u8747?")); // ∫
check("math rtf: no raw latex \\int leaked", !mRtf.includes("\\\\int"));

const mJson = JSON.parse(GEP.json.convert(mathIR));
check("math json: math run preserved", mJson.blocks[0].runs.some((r) => r.math && r.math.tex === "a^2 + b^2 = c^2"));
check("math json: math block preserved", mJson.blocks.some((b) => b.type === "math"));

const mDocx = GEP.docx.convert(mathIR, opts);
check("math docx: returns a Blob", mDocx instanceof Blob && mDocx.size > 200);

const mEpub = GEP.epub.convert(mathIR, opts);
check("math epub: returns a Blob", mEpub instanceof Blob && mEpub.size > 200);

// ============================================================
// 20a-katex. Rendered KaTeX HTML for offline HTML/PDF/EPUB
// ============================================================
const katexIR = {
  title: "KaTeX Test",
  blocks: [
    {
      type: "paragraph",
      runs: [
        { text: "Inline " },
        { text: "", math: { tex: "x^2", mathml: "", html: '<span class="katex"><span class="katex-html">x²</span></span>', display: false } },
        { text: " done." },
      ],
    },
    {
      type: "math",
      tex: "X[k] = \\sum",
      mathml: "",
      html: '<span class="katex-display"><span class="katex"><span class="katex-html">X[k]=∑</span></span></span>',
    },
  ],
  footnotes: [],
};
const kHtml = GEP.html.convert(katexIR, opts);
check("katex html: inline render embedded", kHtml.includes('<span class="katex"><span class="katex-html">x²'));
check("katex html: block render embedded", kHtml.includes('class="katex-display"'));
check("katex html: raw latex fallback not used", !kHtml.includes("\\[X[k]"));
check("katex html: KaTeX stylesheet inlined", /@font-face/.test(kHtml) && kHtml.includes("data:font/woff2;base64,"));

// Math-free reports must NOT carry the heavy KaTeX stylesheet.
const noMathHtml = GEP.html.convert(codeBlockMathFree(), opts);
check("katex html: not inlined when no math html", !noMathHtml.includes("data:font/woff2;base64,"));

const kEpub = GEP.epub.convert(katexIR, opts);
check("katex epub: returns a Blob", kEpub instanceof Blob && kEpub.size > 200);
check("katex epub: larger than math-free epub (css bundled)",
  kEpub.size > GEP.epub.convert(codeBlockMathFree(), opts).size);

function codeBlockMathFree() {
  return { title: "No Math", blocks: [{ type: "paragraph", runs: [{ text: "hello" }] }], footnotes: [] };
}

// ============================================================
// 20a-mv. Manual-validation regressions (EPUB entities, adoc/rst structure)
// ============================================================

// EPUB: Gemini's rendered KaTeX HTML carries &nbsp;, which is undeclared in
// XHTML and makes EPUBCheck reject the file (fatal), cascading into bogus
// "fragment identifier not defined" TOC errors. It must become numeric.
const nbspIR = {
  title: "Entity Test",
  blocks: [
    { type: "heading", level: 2, runs: [{ text: "Section One" }] },
    {
      type: "paragraph",
      runs: [
        { text: "value " },
        { text: "", math: { tex: "n", html: '<span class="mord">in&nbsp;</span>', display: false } },
      ],
    },
  ],
  footnotes: [],
};
const nbspChap = readZipText(Buffer.from(await GEP.epub.convert(nbspIR, opts).arrayBuffer()))["OEBPS/chapter.xhtml"] || "";
check("epub entity: no bare &nbsp;", !nbspChap.includes("&nbsp;"));
check("epub entity: &nbsp; → numeric &#160;", nbspChap.includes("&#160;"));
check("epub entity: heading id present for TOC anchor", nbspChap.includes('id="section-one"'));

// ============================================================
// 20b. Code block language tag (#54)
// ============================================================
const codeIR = {
  title: "Code Test",
  blocks: [
    { type: "code", text: "const x = 1;", lang: "javascript" },
    { type: "code", text: "plain code", lang: "" },
  ],
  footnotes: [],
};
const cMd = GEP.markdown.convert(codeIR, opts);
check("code md: fenced with lang", cMd.includes("```javascript\nconst x = 1;\n```"));
check("code md: no lang → bare fence", cMd.includes("```\nplain code\n```"));
const cHtml = GEP.html.convert(codeIR, opts);
check("code html: language class", cHtml.includes('<code class="language-javascript">'));
const cRtf = GEP.rtf.convert(codeIR, opts);
check("code rtf: monospace font for code", cRtf.includes("\\f1"));
check("code rtf: code content preserved", cRtf.includes("const x = 1;"));

// ============================================================
// 20c. Footnote backlinks (#51)
// ============================================================
const backIR = {
  title: "Footnote Test",
  blocks: [
    { type: "paragraph", runs: [{ text: "First claim" }, { footnoteIndex: 1 }, { text: " and again" }, { footnoteIndex: 1 }] },
    { type: "paragraph", runs: [{ text: "Second" }, { footnoteIndex: 2 }] },
  ],
  footnotes: [
    { index: 1, url: "https://a.example", title: "A", domain: "a.example" },
    { index: 2, url: "https://b.example", title: "B", domain: "b.example" },
  ],
};
const backHtml = GEP.html.convert(backIR, opts);
check("fn backlink: unique ref id first occurrence", backHtml.includes('id="fnref-1-1"'));
check("fn backlink: unique ref id second occurrence", backHtml.includes('id="fnref-1-2"'));
check("fn backlink: source links back to first ref", backHtml.includes('href="#fnref-1-1"'));
check("fn backlink: back arrow present", backHtml.includes('class="fn-back"'));
check("fn backlink: ref still links to source", backHtml.includes('href="#fn-1"'));
const backEpub = GEP.epub.convert(backIR, opts);
check("fn backlink: epub builds", backEpub instanceof Blob && backEpub.size > 200);

// ============================================================
// 20d. Quality check validator (#25)
// ============================================================
check("validator: module present", typeof GEP.validator.check === "function");

const cleanIR = {
  title: "Clean Doc",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Intro" }] },
    { type: "paragraph", runs: [{ text: "A".repeat(250) }, { footnoteIndex: 1 }] },
    { type: "table", header: [[{ text: "h" }]], rows: [[[{ text: "v" }]]] },
  ],
  footnotes: [{ index: 1, url: "https://x.example", title: "X", domain: "x.example" }],
};
const cleanRes = GEP.validator.check(cleanIR);
check("validator: clean doc ok", cleanRes.ok === true);
check("validator: clean doc no errors/warnings", cleanRes.stats.errors === 0 && cleanRes.stats.warnings === 0);

const nullRes = GEP.validator.check(null);
check("validator: null IR → not ok", nullRes.ok === false && nullRes.stats.errors >= 1);

const jumpIR = {
  title: "Jumpy",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "Top" }] },
    { type: "heading", level: 4, runs: [{ text: "Deep" }] },
    { type: "paragraph", runs: [{ text: "short" }] },
  ],
  footnotes: [],
};
const jumpRes = GEP.validator.check(jumpIR);
check("validator: heading jump warns", jumpRes.warnings.some((w) => /jumps from H1 to H4/.test(w.message)));
check("validator: short content warns", jumpRes.warnings.some((w) => /very short/.test(w.message)));

const fnMissIR = {
  title: "FN Mismatch",
  blocks: [{ type: "paragraph", runs: [{ text: "B".repeat(250) }, { footnoteIndex: 5 }] }],
  footnotes: [{ index: 1, url: "https://a.example" }],
};
const fnMissRes = GEP.validator.check(fnMissIR);
check("validator: unmatched footnote warns", fnMissRes.warnings.some((w) => /Footnote \[5\]/.test(w.message)));
check("validator: unused source info", fnMissRes.warnings.some((w) => /never referenced/.test(w.message)));

const dupIR = {
  title: "Dup",
  blocks: [{ type: "paragraph", runs: [{ text: "C".repeat(250) }] }],
  footnotes: [
    { index: 1, url: "https://same.example" },
    { index: 2, url: "https://same.example" },
  ],
};
check("validator: duplicate URL info", GEP.validator.check(dupIR).warnings.some((w) => /Duplicate source URL/.test(w.message)));

const leakIR = {
  title: "Leak",
  blocks: [{ type: "paragraph", runs: [{ text: "value is [object Object] here padded".padEnd(250, ".") }] }],
  footnotes: [],
};
check("validator: object leak errors", GEP.validator.check(leakIR).warnings.some((w) => w.level === "error" && /\[object Object\]/.test(w.message)));

const noAltIR = {
  title: "Img",
  blocks: [
    { type: "paragraph", runs: [{ text: "D".repeat(250) }] },
    { type: "image", src: "x.png", alt: "" },
  ],
  footnotes: [],
};
check("validator: missing alt info", GEP.validator.check(noAltIR).warnings.some((w) => /missing alt text/.test(w.message)));

// ============================================================
// 20e. Per-format overrides sanitize (#50)
// ============================================================
check("overrides: sanitize fn present", typeof GEP.settings.sanitizeOverrides === "function");
const ovIn = {
  markdown: { include_toc: true, citation_style: "apa" },
  pdf: { include_footnotes: false },
  bogus_format: { include_toc: true },          // unknown format dropped
  html: { citation_style: "not-a-style" },      // invalid enum dropped → empty entry dropped
  latex: { include_toc: "yes" },                // wrong type dropped → empty entry dropped
};
const ovOut = GEP.settings.sanitizeOverrides(ovIn);
check("overrides: keeps valid markdown entry", ovOut.markdown.include_toc === true && ovOut.markdown.citation_style === "apa");
check("overrides: keeps valid pdf entry", ovOut.pdf.include_footnotes === false);
check("overrides: drops unknown format", !("bogus_format" in ovOut));
check("overrides: drops invalid enum (empty entry)", !("html" in ovOut));
check("overrides: drops wrong-typed field (empty entry)", !("latex" in ovOut));

// ============================================================
// 21. Document metadata (#2): author / affiliation / keywords / abstract
// ============================================================
const metaIR = {
  title: "Metadata Report",
  blocks: [{ type: "paragraph", runs: [{ text: "Body text." }] }],
  footnotes: [],
};
const metaOpts = {
  ...opts,
  meta: {
    author: "Jane Doe",
    affiliation: "Example University",
    keywords: "alpha, beta; gamma",
    abstract: "This is the abstract.",
  },
};

// normalize helper
const norm = GEP.docmeta.normalize(metaOpts);
check("docmeta: keywords split", norm.keywords.length === 3 && norm.keywords[2] === "gamma");
check("docmeta: has flag", norm.has === true);
check("docmeta: byline joins author + affiliation", GEP.docmeta.byline(norm).includes("Jane Doe") && GEP.docmeta.byline(norm).includes("Example University"));
check("docmeta: empty opts → has false", GEP.docmeta.normalize({}).has === false);

// markdown (gfm) inline metadata block
const metaMd = GEP.markdown.convert(metaIR, metaOpts);
check("meta md: byline present", metaMd.includes("*Jane Doe") && metaMd.includes("Example University*"));
check("meta md: abstract present", metaMd.includes("> **Abstract.** This is the abstract."));
check("meta md: keywords present", metaMd.includes("**Keywords:** alpha, beta, gamma"));

// markdown without metadata → nothing leaks
const noMetaMd = GEP.markdown.convert(metaIR, opts);
check("meta md: omitted when blank", !noMetaMd.includes("Abstract.") && !noMetaMd.includes("Keywords:"));

// obsidian frontmatter
const metaObs = GEP.markdown.convert(metaIR, { ...metaOpts, flavor: "obsidian" });
check("meta md(obsidian): frontmatter author", metaObs.startsWith("---") && metaObs.includes('author: "Jane Doe"'));
check("meta md(obsidian): tags from keywords", metaObs.includes('tags: ["alpha", "beta", "gamma"]'));

// latex
const metaTex = GEP.latex.convert(metaIR, metaOpts);
check("meta latex: author + affiliation", metaTex.includes("\\author{Jane Doe \\\\ \\small Example University}"));
check("meta latex: abstract env", metaTex.includes("\\begin{abstract}") && metaTex.includes("This is the abstract."));
check("meta latex: keywords line", metaTex.includes("\\noindent\\textbf{Keywords:} alpha, beta, gamma"));

// html / pdf head + body
const metaHtml = GEP.html.convert(metaIR, metaOpts);
check("meta html: author meta tag", metaHtml.includes('<meta name="author" content="Jane Doe">'));
check("meta html: keywords meta tag", metaHtml.includes('<meta name="keywords" content="alpha, beta, gamma">'));
check("meta html: description meta tag", metaHtml.includes('<meta name="description" content="This is the abstract.">'));
check("meta html: byline + abstract section", metaHtml.includes('class="doc-byline"') && metaHtml.includes('class="abstract"'));

// ── Binary packages (unzip and inspect metadata parts) ──
function readZipText(buf) {
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

const docxBuf = Buffer.from(await GEP.docx.convert(metaIR, metaOpts).arrayBuffer());
const docxParts = readZipText(docxBuf);
check("meta docx: core.xml present", "docProps/core.xml" in docxParts);
check("meta docx: dc:creator", (docxParts["docProps/core.xml"] || "").includes("<dc:creator>Jane Doe</dc:creator>"));
check("meta docx: cp:keywords", (docxParts["docProps/core.xml"] || "").includes("<cp:keywords>alpha, beta, gamma</cp:keywords>"));
check("meta docx: dc:description", (docxParts["docProps/core.xml"] || "").includes("<dc:description>This is the abstract.</dc:description>"));
check("meta docx: content-types registers core", (docxParts["[Content_Types].xml"] || "").includes("/docProps/core.xml"));

const epubBuf = Buffer.from(await GEP.epub.convert(metaIR, metaOpts).arrayBuffer());
const epubParts = readZipText(epubBuf);
check("meta epub: dc:creator", (epubParts["OEBPS/content.opf"] || "").includes("<dc:creator>Jane Doe</dc:creator>"));
check("meta epub: dc:subject keyword", (epubParts["OEBPS/content.opf"] || "").includes("<dc:subject>alpha</dc:subject>"));
check("meta epub: dc:description", (epubParts["OEBPS/content.opf"] || "").includes("<dc:description>This is the abstract.</dc:description>"));

// ── XLSX exporter (#12): real Excel workbook, one sheet per table ──
{
  const r = (text) => [{ text }];
  const xlsxIR = {
    title: "Workbook test",
    blocks: [
      { type: "heading", level: 2, runs: r("Yıllık Satış: A/B [test]") },
      { type: "table", header: [r("Ürün"), r("Adet"), r("Fiyat")], rows: [
        [r("Kalem <&> \"ş\""), r("120"), r("3.5")],
        [r("Defter"), r("80"), r("12%")],
      ] },
      { type: "paragraph", runs: r("prose between tables") },
      { type: "table", header: null, rows: [[r("no header"), r("-42")]] },
      { type: "heading", level: 2, runs: r("Yıllık Satış: A/B [test]") },
      { type: "table", header: [r("k")], rows: [[r("v")]] },
    ],
  };
  const parts = readZipText(Buffer.from(await GEP.xlsx.convert(xlsxIR).arrayBuffer()));

  check("xlsx: required package parts present",
    "[Content_Types].xml" in parts && "_rels/.rels" in parts
    && "xl/workbook.xml" in parts && "xl/_rels/workbook.xml.rels" in parts
    && "xl/styles.xml" in parts);
  check("xlsx: one worksheet per table",
    "xl/worksheets/sheet1.xml" in parts && "xl/worksheets/sheet2.xml" in parts
    && "xl/worksheets/sheet3.xml" in parts && !("xl/worksheets/sheet4.xml" in parts));
  check("xlsx: content types register every sheet",
    (parts["[Content_Types].xml"].match(/worksheet\+xml/g) || []).length === 3);

  const wb = parts["xl/workbook.xml"];
  check("xlsx: sheet named after nearest heading (illegal chars stripped)",
    wb.includes('name="Yıllık Satış A B test"') && !/name="[^"]*[:\\/?*[\]]/.test(wb));
  check("xlsx: duplicate heading names deduped", wb.includes('name="Yıllık Satış A B test (2)"'));
  check("xlsx: headingless table falls back to Table N", wb.includes('name="Table 2"'));

  const s1 = parts["xl/worksheets/sheet1.xml"];
  check("xlsx: header row uses the bold style", s1.includes('<row r="1"><c r="A1" s="1"'));
  check("xlsx: header row frozen", s1.includes('state="frozen"'));
  check("xlsx: xml-escaped inline string with unicode",
    s1.includes("<t xml:space=\"preserve\">Kalem &lt;&amp;&gt; &quot;ş&quot;</t>"));
  check("xlsx: plain integers become numeric cells", s1.includes("<v>120</v>") && s1.includes("<v>3.5</v>"));
  check("xlsx: units/percent stay text", s1.includes(">12%</t>") && !s1.includes("<v>12%</v>"));

  const s2 = parts["xl/worksheets/sheet2.xml"];
  check("xlsx: negative number typed as number", s2.includes("<v>-42</v>"));
  check("xlsx: headerless sheet has no freeze pane", !s2.includes('state="frozen"'));

  // No tables at all → a valid single-sheet workbook explaining why.
  const empty = readZipText(Buffer.from(await GEP.xlsx.convert({ title: "x", blocks: [
    { type: "paragraph", runs: r("just prose") },
  ] }).arrayBuffer()));
  check("xlsx: table-less report yields one explanatory sheet",
    empty["xl/workbook.xml"].includes('name="Report"')
    && empty["xl/worksheets/sheet1.xml"].includes("(No tables found in this report)"));

  // Sheet-name length cap (Excel hard limit: 31 chars).
  const longIR = { title: "t", blocks: [
    { type: "heading", level: 2, runs: r("This heading is far far longer than thirty-one characters") },
    { type: "table", header: [r("a")], rows: [[r("b")]] },
  ] };
  const longWb = readZipText(Buffer.from(await GEP.xlsx.convert(longIR).arrayBuffer()))["xl/workbook.xml"];
  const nameMatch = /<sheet name="([^"]+)"/.exec(longWb);
  check("xlsx: sheet name capped at 31 chars", !!nameMatch && nameMatch[1].length <= 31);
}

// ============================================================
// 30. texmath converter (LaTeX → MathML / OMML)
// ============================================================
const TM = GEP.texmath;
check("texmath: module present", !!TM);

const tmMmlSum = TM.toMathML(String.raw`\sum_{n=0}^{N-1} x_n`, true);
check("texmath mathml: math root + display", tmMmlSum.startsWith('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">'));
check("texmath mathml: sum is munderover ∑", tmMmlSum.includes("<munderover><mo>\u2211</mo>"));
check("texmath mathml: subscript", tmMmlSum.includes("<msub><mi>x</mi><mi>n</mi></msub>"));

const tmMmlFrac = TM.toMathML(String.raw`\frac{2\pi}{N}`);
check("texmath mathml: fraction", tmMmlFrac.includes("<mfrac>"));
check("texmath mathml: \\pi → π", tmMmlFrac.includes("<mi>\u03c0</mi>"));

const tmMmlRel = TM.toMathML(String.raw`f \geq 2B`);
check("texmath mathml: \\geq → ≥ operator", tmMmlRel.includes("<mo>\u2265</mo>"));
check("texmath mathml: no leaked backslash command", !/geq/.test(tmMmlRel));

const tmMmlFn = TM.toMathML(String.raw`\cos(\theta)`);
check("texmath mathml: function name upright", tmMmlFn.includes('<mi mathvariant="normal">cos</mi>'));
check("texmath mathml: \\theta → θ", tmMmlFn.includes("<mi>\u03b8</mi>"));

const tmMmlText = TM.toMathML(String.raw`k \quad \text{için } n`);
check("texmath mathml: \\text keeps unicode + space", tmMmlText.includes("<mtext>için </mtext>"));

const tmMmlInt = TM.toMathML(String.raw`\int_0^1 x^2 dx`);
check("texmath mathml: integral is msubsup ∫", tmMmlInt.includes("<msubsup><mo>\u222b</mo>"));

const tmMmlSqrt = TM.toMathML(String.raw`\sqrt{x+1}`);
check("texmath mathml: sqrt", tmMmlSqrt.includes("<msqrt>"));

// Matrix / cases environments → mtable (no leaked \begin{...})
const tmMmlMat = TM.toMathML(String.raw`\begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}`);
check("texmath mathml: matrix → mtable", tmMmlMat.includes("<mtable>") && tmMmlMat.includes("<mtr><mtd>"));
check("texmath mathml: bmatrix brackets", tmMmlMat.includes("<mo>[</mo>") && tmMmlMat.includes("<mo>]</mo>"));
check("texmath mathml: matrix two rows", (tmMmlMat.match(/<mtr>/g) || []).length === 2);
check("texmath mathml: no leaked begin/bmatrix", !/begin/i.test(tmMmlMat) && !/bmatrix/i.test(tmMmlMat));

const tmMmlCases = TM.toMathML(String.raw`f(x)=\begin{cases} x & x \geq 0 \\ -x & x<0 \end{cases}`);
check("texmath mathml: cases → left brace", tmMmlCases.includes("<mo>{</mo>"));
check("texmath mathml: cases left-aligned table", tmMmlCases.includes('<mtable columnalign="left">'));
check("texmath mathml: cases no leaked begin", !/begin/i.test(tmMmlCases));

const tmOmmlMat = TM.toOMML(String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`);
check("texmath omml: matrix m:m", tmOmmlMat.includes("<m:m>") && tmOmmlMat.includes("<m:mr>"));
check("texmath omml: matrix parens via m:d", tmOmmlMat.includes('<m:begChr m:val="("/>'));
check("texmath omml: matrix no leaked begin", !/begin/i.test(tmOmmlMat));

// OMML
const tmOmml = TM.toOMML(String.raw`\frac{a}{b} + \sum_{i=1}^{n} x_i`);
check("texmath omml: oMath wrapper", tmOmml.startsWith("<m:oMath>") && tmOmml.endsWith("</m:oMath>"));
check("texmath omml: fraction m:f", tmOmml.includes("<m:f><m:num>"));
// Large operators render as a scripted glyph (no empty <m:nary> operand box).
check("texmath omml: sum glyph with stacked limits", tmOmml.includes("\u2211") && tmOmml.includes("<m:limLow>") && tmOmml.includes("<m:limUpp>"));
check("texmath omml: no empty nary operand box", !tmOmml.includes("<m:e></m:e>") && !tmOmml.includes("<m:nary>"));
check("texmath omml: no leaked backslash", !tmOmml.includes("\\"));

// Integral: side limits via sSubSup, and again no empty operand box (□).
const tmOmmlInt = TM.toOMML(String.raw`\int_{-\infty}^{\infty} f(x)\,dx`);
check("texmath omml: integral glyph with side limits", tmOmmlInt.includes("\u222b") && tmOmmlInt.includes("<m:sSubSup>"));
check("texmath omml: integral no empty nary box", !tmOmmlInt.includes("<m:e></m:e>") && !tmOmmlInt.includes("<m:nary>"));

// Unicode (plain-text math for RTF and other layerless formats)
const tmUni = TM.toUnicode(String.raw`\sum_{n=0}^{N-1} \frac{2\pi}{N} \cdot x \geq 0`);
check("texmath unicode: sum ∑ rendered", tmUni.includes("\u2211"));
check("texmath unicode: relation ≥ rendered", tmUni.includes("\u2265"));
check("texmath unicode: no leaked backslash command", !/\\[a-zA-Z]/.test(tmUni));

// malformed input never throws
check("texmath: malformed input safe", typeof TM.toMathML(String.raw`\frac{a`) === "string" && typeof TM.toUnicode(String.raw`x^`) === "string");

// ============================================================
// 31. Native math in DOCX / RTF exporters
// ============================================================
const realMathIR = {
  title: "Math Doc",
  blocks: [
    { type: "paragraph", runs: [
      { text: "Sampling: " },
      { text: "", math: { tex: "f_s \\geq 2B", display: false } },
    ] },
    { type: "math", tex: "X[k] = \\sum_{n=0}^{N-1} x[n] e^{-i \\frac{2\\pi}{N} k n}" },
  ],
  footnotes: [],
};

// RTF (Unicode math, string output)
const rmRtf = GEP.rtf.convert(realMathIR, opts);
check("rtf math: subscript fₛ rendered", rmRtf.includes("f\\u8347?")); // f + ₛ
check("rtf math: relation ≥ rendered", rmRtf.includes("\\u8805?"));    // ≥
check("rtf math: block sum ∑ rendered", rmRtf.includes("\\u8721?"));   // ∑
check("rtf math: no raw \\sum leaked", !rmRtf.includes("\\\\sum"));

// DOCX (OMML inside document.xml)
const rmDocxBuf = Buffer.from(await GEP.docx.convert(realMathIR, opts).arrayBuffer());
const rmDocxParts = readZipText(rmDocxBuf);
const docXml = rmDocxParts["word/document.xml"] || "";
check("docx math: m namespace declared", docXml.includes('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'));
check("docx math: inline oMath present", docXml.includes("<m:oMath>"));
check("docx math: relation rendered (≥)", docXml.includes("\u2265"));
check("docx math: block sum glyph (no empty nary box)", docXml.includes("\u2211") && !docXml.includes("<m:e></m:e>") && !docXml.includes("<m:nary>"));
check("docx math: no raw latex leaked", !docXml.includes("\\sum") && !docXml.includes("\\geq"));

// Matrices survive the full IR → DOCX path as real OMML matrices (no leaked \begin).
const matIR = { title: "M", blocks: [{ type: "math", tex: "\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}" }], footnotes: [] };
const matDocXml = readZipText(Buffer.from(await GEP.docx.convert(matIR, opts).arrayBuffer()))["word/document.xml"] || "";
check("docx matrix: OMML m:m matrix present", matDocXml.includes("<m:m>") && matDocXml.includes("<m:mr>"));
check("docx matrix: no leaked begin/bmatrix", !/begin/i.test(matDocXml) && !/bmatrix/i.test(matDocXml));

// ============================================================
// 32. Multilingual & RTL support (lang + dir)
// ============================================================
const detectDir = GEP.extractor.detectDir;

// detectDir unit tests
check("detectDir: Arabic -> rtl", detectDir("هذا تقرير بحثي عميق حول الذكاء الاصطناعي") === "rtl");
check("detectDir: Hebrew -> rtl", detectDir("זהו דוח מחקר מעמיק על בינה מלאכותית") === "rtl");
check("detectDir: Persian -> rtl", detectDir("این یک گزارش تحقیقاتی عمیق است") === "rtl");
check("detectDir: English -> ltr", detectDir("This is a deep research report.") === "ltr");
check("detectDir: Chinese -> ltr", detectDir("这是一份深度研究报告。") === "ltr");
check("detectDir: Turkish -> ltr", detectDir("Bu derin bir araştırma raporudur.") === "ltr");
check("detectDir: empty -> ltr", detectDir("") === "ltr");
check("detectDir: null safe -> ltr", detectDir(null) === "ltr");
check("detectDir: mostly Latin with few Arabic words -> ltr",
  detectDir("This report mentions القاهرة and Cairo many times in English prose throughout the document.") === "ltr");

const rtlIR = {
  title: "تقرير البحث",
  lang: "ar",
  dir: "rtl",
  blocks: [
    { type: "heading", level: 1, runs: [{ text: "مقدمة" }] },
    { type: "paragraph", runs: [{ text: "هذا نص عربي يمين إلى يسار." }] },
    { type: "blockquote", runs: [{ text: "اقتباس مهم" }] },
    { type: "list", ordered: false, items: [{ runs: [{ text: "عنصر أول" }], level: 0 }] },
    { type: "table", header: [[{ text: "اسم" }], [{ text: "قيمة" }]], rows: [[[{ text: "أ" }], [{ text: "ب" }]]] },
  ],
  footnotes: [],
};

// HTML family (html/reader/pdf share buildDocument + bodyHtml)
const rtlHtml = GEP.html.convert(rtlIR, opts);
check("rtl html: <html dir=rtl>", /<html[^>]*\sdir="rtl"/.test(rtlHtml));
check("rtl html: lang=ar on <html>", /<html[^>]*\slang="ar"/.test(rtlHtml));
check("rtl html: paragraph dir=auto", rtlHtml.includes('<p dir="auto">'));
check("rtl html: heading dir=auto", /<h1[^>]*dir="auto"/.test(rtlHtml));
check("rtl html: list item dir=auto", rtlHtml.includes('<li dir="auto">'));
check("rtl html: table cell dir=auto", rtlHtml.includes('dir="auto"') && rtlHtml.includes("<td"));

const ltrIR = { title: "Report", lang: "en", dir: "ltr", blocks: [{ type: "paragraph", runs: [{ text: "Hello" }] }], footnotes: [] };
const ltrHtml = GEP.html.convert(ltrIR, opts);
check("ltr html: <html dir=ltr>", /<html[^>]*\sdir="ltr"/.test(ltrHtml));
check("ltr html: lang=en", /<html[^>]*\slang="en"/.test(ltrHtml));

// IR without lang/dir stays backward compatible (ltr, no lang attribute)
const bareIR = { title: "Bare", blocks: [{ type: "paragraph", runs: [{ text: "Hi" }] }], footnotes: [] };
const bareHtml = GEP.html.convert(bareIR, opts);
check("bare html: defaults to dir=ltr", /<html[^>]*\sdir="ltr"/.test(bareHtml));
check("bare html: no lang attribute when undetected", !/<html[^>]*\slang=/.test(bareHtml));

// Reader uses the same lang/dir wiring
const rtlReader = GEP.reader.convert(rtlIR, opts);
check("rtl reader: <html dir=rtl>", /<html[^>]*\sdir="rtl"/.test(rtlReader));
check("rtl reader: lang=ar", /<html[^>]*\slang="ar"/.test(rtlReader));
check("rtl reader: no hardcoded lang=en", !rtlReader.includes('lang="en"'));

// EPUB
const rtlEpubParts = readZipText(Buffer.from(await GEP.epub.convert(rtlIR, opts).arrayBuffer()));
check("rtl epub: dc:language ar", (rtlEpubParts["OEBPS/content.opf"] || "").includes("<dc:language>ar</dc:language>"));
check("rtl epub: chapter html dir=rtl", /<html[^>]*\sdir="rtl"/.test(rtlEpubParts["OEBPS/chapter.xhtml"] || ""));
check("rtl epub: chapter xml:lang ar", (rtlEpubParts["OEBPS/chapter.xhtml"] || "").includes('xml:lang="ar"'));
check("rtl epub: body dir=rtl", (rtlEpubParts["OEBPS/chapter.xhtml"] || "").includes('<body dir="rtl">'));
const ltrEpubParts = readZipText(Buffer.from(await GEP.epub.convert(ltrIR, opts).arrayBuffer()));
check("ltr epub: dc:language en", (ltrEpubParts["OEBPS/content.opf"] || "").includes("<dc:language>en</dc:language>"));
check("epub default lang when undetected -> en", (readZipText(Buffer.from(await GEP.epub.convert(bareIR, opts).arrayBuffer()))["OEBPS/content.opf"] || "").includes("<dc:language>en</dc:language>"));

// DOCX
const rtlDocxParts = readZipText(Buffer.from(await GEP.docx.convert(rtlIR, opts).arrayBuffer()));
const rtlStyles = rtlDocxParts["word/styles.xml"] || "";
check("rtl docx: docDefaults <w:bidi/>", rtlStyles.includes("<w:bidi/>"));
check("rtl docx: docDefaults <w:rtl/>", rtlStyles.includes("<w:rtl/>"));
check("rtl docx: right alignment default", rtlStyles.includes('<w:jc w:val="right"/>'));
check("rtl docx: table bidiVisual", (rtlDocxParts["word/document.xml"] || "").includes("<w:bidiVisual/>"));
const ltrStyles = readZipText(Buffer.from(await GEP.docx.convert(ltrIR, opts).arrayBuffer()))["word/styles.xml"] || "";
check("ltr docx: no bidi in defaults", !ltrStyles.includes("<w:bidi/>") && !ltrStyles.includes("<w:rtl/>"));

// ============================================================
// 33. Export options builder (GEP.exportOpts)
// ============================================================
{
  const eo = GEP.exportOpts;
  check("exportOpts: module present", !!eo && typeof eo.build === "function");
  check("exportOpts: MIME/EXT/EXPORTABLE present", !!eo.MIME && !!eo.EXT && Array.isArray(eo.EXPORTABLE));

  // Defaults reproduce the historical opts (no layout/hygiene churn).
  const def = eo.build({}, "markdown");
  check("exportOpts: default flavor gfm", def.flavor === "gfm");
  check("exportOpts: default layout a4/normal/11/normal/sans",
    def.layout.paper === "a4" && def.layout.margins === "normal" &&
    def.layout.fontSize === 11 && def.layout.lineSpacing === "normal" &&
    def.layout.fontFamily === "sans");
  check("exportOpts: default hygiene (no dedupe, appearance, enrich on)",
    def.sourceDedupe === false && def.sourceSort === "appearance" && def.sourceEnrichIds === true);

  const custom = eo.build({
    doc_paper: "letter", doc_margins: "wide", doc_font_size: "12",
    doc_line_spacing: "double", doc_font_family: "serif",
    source_dedupe: true, source_sort: "alpha", source_enrich_ids: false,
  }, "pdf");
  check("exportOpts: custom layout mapped",
    custom.layout.paper === "letter" && custom.layout.margins === "wide" &&
    custom.layout.fontSize === 12 && custom.layout.lineSpacing === "double" &&
    custom.layout.fontFamily === "serif");
  check("exportOpts: custom hygiene mapped",
    custom.sourceDedupe === true && custom.sourceSort === "alpha" && custom.sourceEnrichIds === false);
  check("exportOpts: invalid sort falls back to appearance",
    eo.build({ source_sort: "bogus" }).sourceSort === "appearance");
  check("exportOpts: per-format override honored",
    eo.build({ include_toc: false, overrides: { pdf: { include_toc: true } } }, "pdf").includeToc === true);
}

// ============================================================
// 34. Source hygiene (GEP.sourceHygiene)
// ============================================================
{
  const sh = GEP.sourceHygiene;
  check("hygiene: module present", !!sh && typeof sh.apply === "function");

  // normalizeUrl
  check("hygiene: normalizeUrl strips www + trailing slash",
    sh.normalizeUrl("https://www.Example.com/path/") === "https://example.com/path");
  check("hygiene: normalizeUrl http→https + drops fragment",
    sh.normalizeUrl("http://example.com/a#frag") === "https://example.com/a");
  check("hygiene: normalizeUrl drops tracking params, sorts rest",
    sh.normalizeUrl("https://x.com/p?utm_source=z&b=2&a=1") === "https://x.com/p?a=1&b=2");
  check("hygiene: normalizeUrl empty safe", sh.normalizeUrl("") === "" && sh.normalizeUrl(null) === "");

  // dedupe: two footnotes share a normalized URL → merged + refs remapped + 1..N
  const dupIR = {
    title: "Dup",
    blocks: [
      { type: "paragraph", runs: [
        { text: "a", footnoteIndex: 1 },
        { text: "b", footnoteIndex: 2 },
        { text: "c", footnoteIndex: 3 },
      ] },
    ],
    footnotes: [
      { index: 1, url: "https://www.site.com/x/", title: "X", domain: "site.com" },
      { index: 2, url: "https://site.com/x", title: "X dup", domain: "site.com" },
      { index: 3, url: "https://other.com/y", title: "Y", domain: "other.com" },
    ],
  };
  const deduped = sh.dedupe(dupIR);
  check("hygiene: dedupe merges duplicate URL", deduped.footnotes.length === 2);
  check("hygiene: dedupe renumbers 1..N",
    deduped.footnotes.map((f) => f.index).join(",") === "1,2");
  const dRuns = deduped.blocks[0].runs.map((r) => r.footnoteIndex);
  check("hygiene: dedupe remaps refs (1,2→1; 3→2)", dRuns.join(",") === "1,1,2");
  check("hygiene: dedupe does not mutate input", dupIR.footnotes.length === 3);

  // sortSources: alpha by title + renumber, refs follow
  const sortIR = {
    title: "Sort",
    blocks: [{ type: "paragraph", runs: [
      { text: "x", footnoteIndex: 1 }, { text: "y", footnoteIndex: 2 },
    ] }],
    footnotes: [
      { index: 1, url: "https://b.com", title: "Zebra", domain: "b.com" },
      { index: 2, url: "https://a.com", title: "Apple", domain: "a.com" },
    ],
  };
  const sorted = sh.sortSources(sortIR, "alpha");
  check("hygiene: sort alpha reorders by title",
    sorted.footnotes[0].title === "Apple" && sorted.footnotes[1].title === "Zebra");
  check("hygiene: sort alpha renumbers + remaps refs",
    sorted.footnotes[0].index === 1 &&
    sorted.blocks[0].runs[0].footnoteIndex === 2 &&
    sorted.blocks[0].runs[1].footnoteIndex === 1);
  check("hygiene: sort appearance is a no-op",
    sh.sortSources(sortIR, "appearance") === sortIR);

  // enrichIds: DOI + ISBN extraction (additive)
  const enrichIR = {
    title: "Ids",
    blocks: [],
    footnotes: [
      { index: 1, url: "https://doi.org/10.1000/xyz123", title: "Paper" },
      { index: 2, url: "https://books.example/p", title: "Book ISBN 978-3-16-148410-0" },
      { index: 3, url: "https://news.example/a", title: "No identifiers" },
    ],
  };
  const enriched = sh.enrichIds(enrichIR);
  check("hygiene: enrich detects DOI", enriched.footnotes[0].doi === "10.1000/xyz123");
  check("hygiene: enrich detects ISBN-13", enriched.footnotes[1].isbn === "9783161484100");
  check("hygiene: enrich leaves plain source untouched",
    !enriched.footnotes[2].doi && !enriched.footnotes[2].isbn);

  // apply pipeline: enrich on by default, dedupe off → no merge but ids added
  const applied = sh.apply(dupIR, { sourceEnrichIds: true, sourceDedupe: false, sourceSort: "appearance" });
  check("hygiene: apply default keeps all footnotes", applied.footnotes.length === 3);
}

// ============================================================
// 35. Bibliography DOI / ISBN emission
// ============================================================
{
  const bIR = {
    title: "Biblio",
    blocks: [],
    footnotes: [
      { index: 1, url: "https://doi.org/10.1000/abc", title: "Paper", domain: "doi.org", doi: "10.1000/abc" },
      { index: 2, url: "https://books.example", title: "Book", domain: "books.example", isbn: "9783161484100" },
      { index: 3, url: "https://x.com", title: "Plain", domain: "x.com" },
    ],
  };
  const bib = GEP.bibtex.convert(bIR);
  check("bibtex: emits doi field", /doi\s*=\s*\{10\.1000\/abc\}/.test(bib));
  check("bibtex: emits isbn field", /isbn\s*=\s*\{9783161484100\}/.test(bib));
  check("bibtex: no doi for plain source", (bib.match(/doi\s*=/g) || []).length === 1);

  const ris = GEP.ris.convert(bIR);
  check("ris: emits DO (doi)", ris.includes("DO  - 10.1000/abc"));
  check("ris: emits SN (isbn)", ris.includes("SN  - 9783161484100"));

  const csl = JSON.parse(GEP.csljson.convert(bIR));
  check("csljson: emits DOI", csl[0].DOI === "10.1000/abc");
  check("csljson: emits ISBN", csl[1].ISBN === "9783161484100");
  check("csljson: omits ids for plain source", !csl[2].DOI && !csl[2].ISBN);
}

// ============================================================
// 36. Layout markers (PDF / DOCX / LaTeX)
// ============================================================
{
  const layoutIR = { title: "Layout", blocks: [{ type: "paragraph", runs: [{ text: "Body text" }] }], footnotes: [] };

  // PDF/HTML print CSS via buildDocument
  const pdfDefault = GEP.pdf.buildDocument(layoutIR, GEP.exportOpts.build({}, "pdf"));
  check("pdf: default @page A4", pdfDefault.includes("size: A4"));
  check("pdf: default 11pt body", /font-size:\s*11pt/.test(pdfDefault));
  const pdfCustom = GEP.pdf.buildDocument(layoutIR, GEP.exportOpts.build({
    doc_paper: "letter", doc_margins: "wide", doc_font_size: "12",
    doc_line_spacing: "double", doc_font_family: "serif",
  }, "pdf"));
  check("pdf: letter @page", pdfCustom.includes("size: Letter"));
  check("pdf: wide margin 25mm", pdfCustom.includes("25mm"));
  check("pdf: 12pt body", /font-size:\s*12pt/.test(pdfCustom));
  check("pdf: serif stack", pdfCustom.includes("Georgia"));

  // DOCX
  const docxDefault = readZipText(Buffer.from(await GEP.docx.convert(layoutIR, GEP.exportOpts.build({}, "docx")).arrayBuffer()));
  check("docx: default A4 pgSz", (docxDefault["word/document.xml"] || "").includes('w:w="11906"'));
  check("docx: default Calibri", (docxDefault["word/styles.xml"] || "").includes('w:ascii="Calibri"'));
  check("docx: default sz 22", (docxDefault["word/styles.xml"] || "").includes('w:sz w:val="22"'));
  const docxCustom = readZipText(Buffer.from(await GEP.docx.convert(layoutIR, GEP.exportOpts.build({
    doc_paper: "letter", doc_margins: "narrow", doc_font_size: "12",
    doc_line_spacing: "onehalf", doc_font_family: "serif",
  }, "docx")).arrayBuffer()));
  check("docx: letter pgSz", (docxCustom["word/document.xml"] || "").includes('w:w="12240"'));
  check("docx: narrow margin twips", (docxCustom["word/document.xml"] || "").includes('w:top="720"'));
  check("docx: Cambria serif", (docxCustom["word/styles.xml"] || "").includes('w:ascii="Cambria"'));
  check("docx: sz 24 (12pt)", (docxCustom["word/styles.xml"] || "").includes('w:sz w:val="24"'));
  check("docx: onehalf line 360", (docxCustom["word/styles.xml"] || "").includes('w:line="360"'));

  // LaTeX
  const texDefault = GEP.latex.convert(layoutIR, GEP.exportOpts.build({}, "latex"));
  check("latex: default documentclass 11pt a4", texDefault.includes("\\documentclass[11pt,a4paper]{article}"));
  check("latex: default sans familydefault", texDefault.includes("\\renewcommand{\\familydefault}{\\sfdefault}"));
  const texCustom = GEP.latex.convert(layoutIR, GEP.exportOpts.build({
    doc_paper: "letter", doc_margins: "wide", doc_font_size: "12",
    doc_line_spacing: "double", doc_font_family: "serif",
  }, "latex"));
  check("latex: 12pt letterpaper", texCustom.includes("\\documentclass[12pt,letterpaper]{article}"));
  check("latex: geometry wide", texCustom.includes("\\usepackage[margin=3cm]{geometry}"));
  check("latex: doublespacing", texCustom.includes("\\doublespacing"));
  check("latex: serif keeps roman default (no sfdefault)", !texCustom.includes("\\sfdefault"));
}

// ============================================================
// 37. JSON round-trip → re-export consistency
// ============================================================
{
  const rtIR = {
    title: "Round Trip",
    lang: "en", dir: "ltr",
    blocks: [
      { type: "heading", level: 1, runs: [{ text: "Intro" }] },
      { type: "paragraph", runs: [{ text: "Body with ref", footnoteIndex: 1 }] },
    ],
    footnotes: [{ index: 1, url: "https://example.com/a", title: "A", domain: "example.com" }],
  };
  const json = GEP.json.convert(rtIR);
  const parsed = JSON.parse(json);
  check("roundtrip: json has blocks at top level", Array.isArray(parsed.blocks));
  const reIR = { title: parsed.title, blocks: parsed.blocks, footnotes: parsed.footnotes, lang: parsed.lang, dir: parsed.dir };
  const optsRT = GEP.exportOpts.build({}, "markdown");
  const md1 = GEP.markdown.convert(rtIR, optsRT);
  const md2 = GEP.markdown.convert(GEP.sourceHygiene.apply(reIR, optsRT), optsRT);
  check("roundtrip: markdown identical after JSON re-export", md1 === md2);
  const html2 = GEP.html.convert(reIR, optsRT);
  check("roundtrip: html re-export keeps title", html2.includes("Round Trip"));
}

// ============================================================
// 38. Unique heading anchor ids (non-Latin / repeated headings)
//     Regression: Arabic/CJK headings slugify to the "section"
//     fallback; without dedup every <hN> collapsed to id="section",
//     which vnu (HTML) and EPUBCheck (EPUB) reject as duplicate IDs.
// ============================================================
{
  const headingIds = (html) => {
    const ids = [];
    const re = /<h[1-6][^>]*\sid="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) ids.push(m[1]);
    return ids;
  };
  const uniqueOk = (ids) => ids.length > 0 && new Set(ids).size === ids.length;

  // All-Arabic headings: each slugifies to "section" → must be disambiguated.
  const arHeadIR = {
    title: "تقرير", lang: "ar", dir: "rtl",
    blocks: [
      { type: "heading", level: 1, runs: [{ text: "المقدمة" }] },
      { type: "paragraph", runs: [{ text: "نص" }] },
      { type: "heading", level: 2, runs: [{ text: "الخلفية" }] },
      { type: "paragraph", runs: [{ text: "نص" }] },
      { type: "heading", level: 2, runs: [{ text: "المنهجية" }] },
      { type: "paragraph", runs: [{ text: "نص" }] },
    ],
    footnotes: [],
  };
  const arHtml = GEP.html.convert(arHeadIR, opts);
  const arIds = headingIds(arHtml);
  check("heading ids: 3 Arabic headings emit 3 ids", arIds.length === 3);
  check("heading ids: Arabic ids unique (no duplicate 'section')", uniqueOk(arIds));
  check("heading ids: dedup uses -N suffix", arIds.includes("section") && arIds.includes("section-2") && arIds.includes("section-3"));

  // Same through Reader and EPUB chapter (all share GEP.pdf.bodyHtml).
  check("heading ids: reader unique", uniqueOk(headingIds(GEP.reader.convert(arHeadIR, opts))));
  const arEpub = readZipText(Buffer.from(await GEP.epub.convert(arHeadIR, opts).arrayBuffer()));
  check("heading ids: epub chapter unique", uniqueOk(headingIds(arEpub["OEBPS/chapter.xhtml"] || "")));

  // Repeated Latin headings must also stay unique and match the TOC anchors.
  const dupHeadIR = {
    title: "Doc",
    blocks: [
      { type: "heading", level: 2, runs: [{ text: "Overview" }] },
      { type: "heading", level: 2, runs: [{ text: "Overview" }] },
      { type: "heading", level: 2, runs: [{ text: "Overview" }] },
    ],
    footnotes: [],
  };
  const dupHtml = GEP.html.convert(dupHeadIR, opts);
  const dupIds = headingIds(dupHtml);
  check("heading ids: repeated Latin headings unique", uniqueOk(dupIds));
  const tocIds = GEP.toc.generate(dupHeadIR).items.map((i) => i.id);
  check("heading ids: body ids match toc anchors", JSON.stringify(dupIds) === JSON.stringify(tocIds));
}

// ============================================================
// 39. EPUB declares svg/mathml content properties (OPF-014)
//     KaTeX math is re-inlined as <svg>, and MathML emits <math>;
//     EPUBCheck rejects the package unless the chapter manifest
//     item declares properties="svg"/"mathml".
// ============================================================
{
  const svgIR = {
    title: "Math",
    blocks: [{
      type: "paragraph",
      runs: [
        { text: "E=" },
        { type: "math", math: { html: '<span class="katex"><img class="katex-svg" style="height:1em" src="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M0 0\'/></svg>"></span>' } },
      ],
    }],
    footnotes: [],
  };
  const svgEpub = readZipText(Buffer.from(await GEP.epub.convert(svgIR, opts).arrayBuffer()));
  const svgChapter = svgEpub["OEBPS/chapter.xhtml"] || "";
  const svgOpf = svgEpub["OEBPS/content.opf"] || "";
  check("epub opf: chapter has inline <svg> from katex", /<svg[\s>]/i.test(svgChapter));
  check("epub opf: declares properties=\"svg\"", /id="chapter"[^>]*properties="[^"]*\bsvg\b/.test(svgOpf));

  const mmlIR = {
    title: "Math",
    blocks: [{
      type: "math",
      mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
    }],
    footnotes: [],
  };
  const mmlEpub = readZipText(Buffer.from(await GEP.epub.convert(mmlIR, opts).arrayBuffer()));
  check("epub opf: declares properties=\"mathml\"", /id="chapter"[^>]*properties="[^"]*\bmathml\b/.test(mmlEpub["OEBPS/content.opf"] || ""));

  // Plain report (no math) must NOT gain a bogus svg/mathml property.
  const plainEpub = readZipText(Buffer.from(await GEP.epub.convert({ title: "Plain", blocks: [{ type: "paragraph", runs: [{ text: "hi" }] }], footnotes: [] }, opts).arrayBuffer()));
  check("epub opf: no spurious properties when no math", !/id="chapter"[^>]*properties=/.test(plainEpub["OEBPS/content.opf"] || ""));
}

// ============================================================
// 40. Content completeness / no truncation
//     Every text-bearing block (and the very LAST block, where
//     truncation would show first) must survive into every export.
//     Sentinels are plain uppercase ASCII, which no format escapes.
// ============================================================
{
  const completeIR = {
    title: "Completeness SENTINELTITLE",
    blocks: [
      { type: "heading", level: 1, runs: [{ text: "Completeness SENTINELTITLE" }] },
      { type: "heading", level: 2, runs: [{ text: "Section SENTINELHEAD" }] },
      { type: "paragraph", runs: [{ text: "Intro " }, { text: "SENTINELPARA", bold: true }, { text: " outro." }] },
      { type: "blockquote", runs: [{ text: "Quote SENTINELQUOTE here." }] },
      { type: "list", ordered: false, items: [
        { runs: [{ text: "First SENTINELLISTA" }], level: 0 },
        { runs: [{ text: "Second SENTINELLISTB" }], level: 0 },
      ] },
      { type: "table",
        header: [[{ text: "H SENTINELCELLH" }], [{ text: "K" }]],
        rows: [[[{ text: "V SENTINELCELLV" }], [{ text: "W" }]]] },
      { type: "code", text: "const x = 'SENTINELCODE';" },
      // The final block: tail truncation would drop exactly this one.
      { type: "paragraph", runs: [{ text: "The conclusion ends with SENTINELTAIL." }] },
    ],
    footnotes: [{ index: 1, url: "https://sentinel.example.com/ref", title: "Ref SENTINELSOURCE", domain: "sentinel.example.com" }],
  };

  const bodySentinels = [
    "SENTINELHEAD", "SENTINELPARA", "SENTINELQUOTE", "SENTINELLISTA",
    "SENTINELLISTB", "SENTINELCELLH", "SENTINELCELLV", "SENTINELCODE", "SENTINELTAIL",
  ];

  const stringFormats = {
    markdown: GEP.markdown.convert(completeIR, opts),
    txt: GEP.txt.convert(completeIR, opts),
    html: GEP.html.convert(completeIR, opts),
    reader: GEP.reader.convert(completeIR, opts),
    latex: GEP.latex.convert(completeIR, opts),
    rtf: GEP.rtf.convert(completeIR, opts),
  };
  for (const [fmt, out] of Object.entries(stringFormats)) {
    const missing = bodySentinels.filter((s) => !out.includes(s));
    check(`completeness ${fmt}: all blocks present (missing: ${missing.join(",") || "none"})`, missing.length === 0);
    check(`completeness ${fmt}: tail block not truncated`, out.includes("SENTINELTAIL"));
  }

  // Binary formats: unzip and check the main content part.
  const docxXml = readZipText(Buffer.from(await GEP.docx.convert(completeIR, opts).arrayBuffer()))["word/document.xml"] || "";
  const docxMissing = bodySentinels.filter((s) => !docxXml.includes(s));
  check(`completeness docx: all blocks present (missing: ${docxMissing.join(",") || "none"})`, docxMissing.length === 0);

  const epubXhtml = readZipText(Buffer.from(await GEP.epub.convert(completeIR, opts).arrayBuffer()))["OEBPS/chapter.xhtml"] || "";
  const epubMissing = bodySentinels.filter((s) => !epubXhtml.includes(s));
  check(`completeness epub: all blocks present (missing: ${epubMissing.join(",") || "none"})`, epubMissing.length === 0);

  // Sources/footnote text must survive too (formats that render a source list).
  for (const fmt of ["markdown", "txt", "html", "reader"]) {
    check(`completeness ${fmt}: source text present`, stringFormats[fmt].includes("SENTINELSOURCE"));
  }
}

console.log(`\n${passed}/${total} edge-case checks passed.`);
console.log(ok ? "All edge-case checks passed. ✓" : "Some edge-case checks FAILED. ✗");
process.exitCode = ok ? 0 : 1;
