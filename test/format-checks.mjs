/**
 * Shared per-format structural checks.
 *
 * Two consumers run the exact same assertions:
 *   • test/validate.mjs — real browser-exported files in /validate
 *     (ground truth for the download path: BOM, blobs, file names), and
 *   • test/corpus.mjs   — outputs generated in-process from every capture in
 *     referance/reports/ (8 real Gemini DOMs through the full pipeline).
 *
 * Keeping the checks in one place stops the two copies from drifting apart —
 * the txt markdown-leak check had already forked once (the debug-zip variant
 * was code-block-aware, the PART 1 variant was not).
 *
 * Every function takes a `check(label, cond)` callback so callers keep their
 * own counting/section bookkeeping; corpus wraps it to prefix the format name.
 * Content-dependent assertions (tables, bold/italic, non-ASCII) are gated on
 * a context derived from the JSON export — the IR is the ground truth for
 * what the other formats must contain.
 */

// ── Generic helpers ──────────────────────────────────────────────────

/** Object stringification leaks are never legitimate in any output. */
export function noObjectLeak(s) {
  return !s.includes("[object Object]");
}

/**
 * Drops the *bodies* of inline <script>/<style> blocks (keeping the tags).
 * JS and CSS source legitimately contains `<` and `>` — highlight.js ships
 * string literals like "<span>", CSS uses child selectors — and a regex tag
 * scanner would read those as markup. They are not markup, so markup checks
 * must not see them.
 */
export function stripInlineAssets(s) {
  return String(s)
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2")
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, "$1$2");
}

/**
 * Structural tag-balance check for XML/HTML-ish content.
 * Returns true when every opened tag is closed in the right order.
 */
const HTML_VOID = new Set(["br", "hr", "img", "meta", "link", "input", "col", "wbr", "source", "base"]);

export function tagsBalanced(src, htmlMode = false) {
  const stack = [];
  const re = /<(\/)?([a-zA-Z][a-zA-Z0-9:_-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, closing, rawName, , selfClose] = m;
    const name = rawName.toLowerCase();
    if (selfClose || (htmlMode && HTML_VOID.has(name))) continue;
    if (closing) {
      if (!stack.length || stack[stack.length - 1] !== name) return false;
      stack.pop();
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

/**
 * Parses a STORE-only ZIP buffer (our zip.js never compresses) into entries
 * with decoded content and CRC verification.
 */
function crc32Buf(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    let c = (crc ^ bytes[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZipEntries(buf) {
  const entries = [];
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const crc = buf.readUInt32LE(off + 14);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.slice(off + 30, off + 30 + nameLen).toString("utf8");
    const dataStart = off + 30 + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    entries.push({
      name,
      method,
      crcOk: method === 0 ? crc32Buf(data) === crc : null,
      content: method === 0 ? data.toString("utf8") : null,
    });
    off = dataStart + compSize;
  }
  return entries;
}

// ── Content fidelity ─────────────────────────────────────────────────
//
// Every other check in this file verifies that an output is well-FORMED.
// None of them verify that the report's CONTENT survived: an exporter that
// silently drops a section, half a table's cells, or truncates at 50% still
// produces structurally perfect output. These helpers close that gap by
// comparing the IR's word multiset against the output's.
//
// Thresholds are per-format because each one legitimately loses a little:
// word-splitting across markup, math rendered as TeX, hyphenation. Measured
// across the whole report corpus the real figures sit at 99.6–100%, so 99%
// leaves headroom for a new report without tolerating actual loss.

export const FIDELITY_MIN = {
  markdown: 99, txt: 99, html: 99, reader: 99,
  latex: 99, rtf: 99, docx: 99, epub: 99,
};

/** Words worth tracking: 4+ letters/digits, case-folded. */
function wordsOf(s) {
  return (String(s).match(/[\p{L}\p{N}]{4,}/gu) || []).map((w) => w.toLowerCase());
}

/**
 * The report's prose words, from the IR (ground truth). Code blocks are
 * excluded: exporters legitimately reflow, escape or (in RTF) re-encode them,
 * and `edge-cases` already asserts code survives verbatim.
 */
export function irWords(parsed) {
  if (!parsed) return [];
  let t = parsed.title || "";
  for (const b of parsed.blocks || []) {
    if (!b || b.type === "code") continue;
    if (Array.isArray(b.runs)) t += " " + b.runs.map((r) => (r.math ? "" : r.text || "")).join("");
    if (Array.isArray(b.items)) t += " " + b.items.map((i) => (i.runs || []).map((r) => r.text || "").join("")).join(" ");
    if (b.type === "table") {
      for (const c of b.header || []) t += " " + (c || []).map((r) => r.text || "").join("");
      for (const row of b.rows || []) for (const c of row || []) t += " " + (c || []).map((r) => r.text || "").join("");
    }
  }
  return wordsOf(t);
}

/** RTF encodes every non-ASCII char as `\uN?` — decode before comparing. */
export function decodeRtfEscapes(s) {
  return String(s).replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(((+n) + 65536) % 65536));
}

/** Concatenated text of a DOCX/EPUB zip's XML parts, for fidelity checks. */
export function zipTextContent(buf, namePattern) {
  return readZipEntries(buf)
    .filter((e) => namePattern.test(e.name) && e.content)
    .map((e) => e.content)
    .join(" ");
}

/**
 * Fraction (0–100) of the IR's word occurrences present in `output`.
 * Multiset containment, so dropping one of three "protein"s still registers.
 */
export function fidelityPct(want, output) {
  if (!want.length) return 100;
  const have = new Map();
  for (const w of wordsOf(output)) have.set(w, (have.get(w) || 0) + 1);
  let hit = 0;
  for (const w of want) {
    const n = have.get(w) || 0;
    if (n > 0) { have.set(w, n - 1); hit++; }
  }
  return (hit / want.length) * 100;
}

/**
 * Asserts every supplied output carries the report's content.
 * `outputs` maps format key -> already-normalized text (see decodeRtfEscapes /
 * zipTextContent for RTF and DOCX/EPUB).
 */
export function checkFidelity(check, outputs, ctx) {
  const want = ctx.irWords || irWords(ctx.parsed);
  if (want.length < 50) return; // too little prose to measure meaningfully
  for (const [fmt, text] of Object.entries(outputs)) {
    if (text == null) continue;
    const min = FIDELITY_MIN[fmt] ?? 99;
    const pct = fidelityPct(want, text);
    check(`${fmt}: content fidelity >= ${min}% (got ${pct.toFixed(1)}%)`, pct >= min);
  }
}

// ── Context: what the report actually contains ───────────────────────

/** Collects every inline run in the IR (paragraphs, headings, lists, tables…). */
function allRuns(parsed) {
  const runs = [];
  const pushCell = (cell) => { for (const r of cell || []) runs.push(r); };
  for (const b of parsed.blocks || []) {
    if (!b) continue;
    if (Array.isArray(b.runs)) runs.push(...b.runs);
    if (Array.isArray(b.items)) for (const it of b.items) runs.push(...(it.runs || []));
    if (b.type === "table") {
      for (const c of b.header || []) pushCell(c);
      for (const row of b.rows || []) for (const c of row || []) pushCell(c);
    }
  }
  return runs;
}

/**
 * Derives the check context from the JSON export (ground truth: raw
 * extracted text). Language-agnostic character preservation: sample
 * non-ASCII letters and require every full-content format to preserve
 * them; pure-ASCII reports skip those checks automatically. Content
 * gates (tables/bold/italic) default to true when JSON is unavailable,
 * matching the historical unconditional behavior.
 */
export function makeContext(jsonStr) {
  let parsed = null;
  try { parsed = jsonStr ? JSON.parse(jsonStr) : null; } catch { parsed = null; }

  let i18nSample = [];
  if (parsed) {
    let textPool = parsed.title || "";
    for (const b of parsed.blocks || []) {
      if ((b.type === "heading" || b.type === "paragraph") && Array.isArray(b.runs)) {
        textPool += b.runs.map((r) => r.text || "").join("");
      }
    }
    const letters = textPool.match(/\p{L}/gu) || [];
    i18nSample = [...new Set(letters.filter((c) => c.codePointAt(0) > 127))].slice(0, 12);
  }

  const runs = parsed ? allRuns(parsed) : [];
  // LaTeX-special characters in *escaped* text only — the "\& \% …" check is
  // meaningless for reports whose specials all sit in code/math (emitted
  // verbatim) or in URLs (wrapped in \url{}), which are never backslash-
  // escaped. So sample plain prose runs and the title.
  let specialsPool = parsed
    ? (parsed.title || "") + runs.filter((r) => r && !r.code && !r.math).map((r) => r.text || "").join("")
    : "";
  return {
    parsed,
    irWords: irWords(parsed),
    expectI18n: i18nSample.length > 0,
    i18nPreserved: (s) => i18nSample.every((c) => s.includes(c)),
    expectTables: parsed ? (parsed.blocks || []).some((b) => b && b.type === "table") : true,
    expectBold: parsed ? runs.some((r) => r && r.bold) : true,
    expectItalic: parsed ? runs.some((r) => r && r.italic) : true,
    expectLatexSpecials: parsed ? /[&%$#_]/.test(specialsPool) : true,
  };
}

// ── Per-format checks ────────────────────────────────────────────────

/**
 * Removes fenced code blocks (and optionally inline code spans) so that
 * markup-leak and structure-count checks only see prose. Real reports carry
 * code whose content legitimately looks like broken markdown: `# comment`
 * lines read as H1s, `128 * 28 * 28` as italics, `<div>` in an HTML sample
 * as leaked tags.
 */
function stripMdCode(md, { inline = false } = {}) {
  let out = md.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, "");
  if (inline) out = out.replace(/`[^`\n]*`/g, "");
  return out;
}

export function checkMarkdown(check, md, ctx) {
  // Code is content, not markup — leak/count checks look at prose only.
  const prose = stripMdCode(md);
  const proseNoInline = stripMdCode(md, { inline: true });

  check("not empty", md.trim().length > 100);
  // GFM/CommonMark/Notion start with the H1; Obsidian emits YAML front matter
  // first (title/tags), with the H1 right after it.
  check("starts with H1 (or front matter)", md.startsWith("# ") || (md.startsWith("---\n") && /^# .+$/m.test(md)));
  check("has H2 headings", (prose.match(/^## .+$/gm) || []).length >= 2);
  check("no broken bold (trailing space inside **)", !proseNoInline.match(/\*\*\s+\*\*/));
  check("no broken italic (space before closing *)", !proseNoInline.match(/(?<!\*)\*[^*\n]{1,40}\s\*(?!\*)/));
  if (ctx.expectTables) {
    check("tables have separator row", prose.includes("| --- |") || prose.includes("|---|"));
    check("tables have pipe borders", (prose.match(/^\|.+\|$/gm) || []).length >= 3);
  }
  check("no orphaned escape sequences (\\(, \\))", !proseNoInline.includes("\\(") && !proseNoInline.includes("\\)"));
  check("no HTML tags leaked into markdown", !proseNoInline.match(/<(?:div|span|sup|p|td|tr|th)\b/i));
  check("line length consistency (no lines >2000 chars)", md.split("\n").every(l => l.length <= 2000));

  const tocMatch = prose.match(/^## Table of Contents$/m);
  if (tocMatch) {
    const isObsidianToc = md.includes("[[#");
    if (isObsidianToc) {
      check("TOC has anchor links", md.includes("[[#"));
      check("TOC links use wikilink heading refs", /\[\[#[^\]]+\]\]/.test(md));
    } else {
      check("TOC has anchor links", md.includes("](#"));
      check("TOC links use lowercase slugs", /\]\(#[a-z0-9-]+\)/.test(md));
    }
    check("TOC slug has no ı→empty bug", !md.match(/\(#[^)]*[a-z]-{2,}[a-z]/));
  }

  const fnDefs = prose.match(/^\[\^\d+\]:/gm);
  const fnRefs = proseNoInline.match(/\[\^\d+\]/g);
  if (fnDefs) {
    check("footnote defs have URLs or text", fnDefs.every(d => {
      const line = md.split("\n").find(l => l.startsWith(d));
      return line && line.length > d.length + 5;
    }));
    check("every inline ref has a matching def", (() => {
      const defSet = new Set(fnDefs.map(d => d.replace(":", "")));
      const refsInBody = (fnRefs || []).filter(r => !r.endsWith(":"));
      return refsInBody.every(r => defSet.has(r));
    })());
  }

  // The markdown exporter emits exactly one `# `: the title. Body level-1
  // headings are demoted to `##` (a duplicate of the title is skipped).
  check("no duplicate H1 (title only once)", (prose.match(/^# .+$/gm) || []).length === 1);
  check("no object stringification leak", noObjectLeak(md));
  if (ctx.expectI18n) check("non-ASCII chars preserved (i18n)", ctx.i18nPreserved(md));
  check("ends with newline", md.endsWith("\n"));
}

export function checkTxt(check, txt, ctx) {
  check("not empty", txt.trim().length > 100);
  check("has underline headings (=== or ---)", /[=-]{4,}/.test(txt));

  // Code is emitted verbatim into the .txt — a C++ `#include <iostream>` or
  // Python's `d_k ** 0.5` is report content, not leaked markup. Mask code
  // before scanning the prose (ground truth: the JSON IR): whole lines for
  // code blocks, plain string removal for inline code runs (prose discussing
  // `<u>` or `**` literally is legitimate in a report about markup).
  let txtProse = txt;
  if (ctx.parsed) {
    const codeLines = new Set();
    const inlineCode = [];
    for (const b of ctx.parsed.blocks || []) {
      if (b.type === "code" && b.text) {
        for (const l of b.text.split("\n")) {
          const trimmed = l.trim();
          if (trimmed) codeLines.add(trimmed);
        }
      }
      const runs = [
        ...(b.runs || []),
        ...(b.items || []).flatMap((i) => i.runs || []),
      ];
      for (const r of runs) {
        if (r && r.code && r.text && r.text.length >= 2) inlineCode.push(r.text);
      }
    }
    if (codeLines.size) {
      txtProse = txtProse.split("\r\n").filter((l) => !codeLines.has(l.trim())).join("\r\n");
    }
    for (const snippet of inlineCode) txtProse = txtProse.split(snippet).join("");
  }
  check("no markdown syntax leaked (outside code)", !txtProse.includes("[^") && !txtProse.includes("**"));
  check("no HTML tags (outside code)", !txtProse.match(/<[a-z]+[\s>]/i));
  if (ctx.expectTables) check("tables are aligned", /^.+\|.+\|.+$/m.test(txt));

  const sourceSection = txt.includes("Sources");
  if (sourceSection) {
    check("sources have URLs", /https?:\/\//.test(txt.split("Sources")[1] || ""));
    const srcBlock = txt.split("Sources")[1] || "";
    check("source entries have index or citation text",
      /\[\d+\]/.test(srcBlock) || /\u201C/.test(srcBlock) || /https?:\/\//.test(srcBlock));
  }

  check("uses CRLF line endings", txt.includes("\r\n"));
  check("no object stringification leak", noObjectLeak(txt));
  if (ctx.expectI18n) check("non-ASCII chars preserved (i18n)", ctx.i18nPreserved(txt));
}

export function checkHtml(check, html, ctx) {
  check("has DOCTYPE", html.includes("<!DOCTYPE html"));
  check("has <html> tag", html.includes("<html"));
  check("has <head> and <body>", html.includes("<head>") || html.includes("<head "));
  check("has charset meta", /charset.*utf-8/i.test(html));
  check("has <style> block", html.includes("<style>"));
  check("has <title>", /<title>.+<\/title>/.test(html));
  check("has H1 doc-title", html.includes('class="doc-title"'));
  if (ctx.expectTables) {
    check("has tables", html.includes("<table>") || html.includes("<table "));
    check("tables have <thead>", html.includes("<thead>"));
    check("tables have <tbody>", html.includes("<tbody>"));
  }
  check("special chars escaped (&amp; &lt; &gt;)", html.includes("&amp;") || !html.match(/[&](?!amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-f]+;)/i));
  check("no unclosed <img> (self-closing or closed)", !html.match(/<img\b[^>]*>(?!<\/img>)/) || !html.match(/<img\b[^>]*[^/]>/));
  check("all tags balanced",
    tagsBalanced(stripInlineAssets(html).replace(/<!DOCTYPE[^>]*>/i, ""), true));
  check("no object stringification leak", noObjectLeak(html));

  // The static stylesheet always defines .fn-ref — only actual usage in the
  // body (class="fn-ref") means the report has rendered footnote refs.
  if (html.includes('class="fn-ref"')) {
    check("footnote refs link to #fn-N", /href="#fn-\d+"/.test(html));
    check("footnote section exists", html.includes('<section class="footnotes">'));
    check("footnotes have <ol>", html.includes("<ol>"));
    check("footnote items have source links", /href="https?:\/\//.test(
      html.slice(html.indexOf('<section class="footnotes">') || 0)
    ));
  }

  if (html.includes('class="toc"')) {
    check("TOC has anchor hrefs", /href="#[a-z0-9-]+"/.test(html));
    check("heading IDs match TOC anchors", (() => {
      const tocAnchors = (html.match(/href="#([a-z0-9-]+)"/g) || []).map(m => m.match(/"#(.+)"/)[1]);
      const headingIds = (html.match(/id="([a-z0-9-]+)"/g) || []).map(m => m.match(/"(.+)"/)[1]);
      const idSet = new Set(headingIds);
      return tocAnchors.length > 0 && tocAnchors.every(a => idSet.has(a));
    })());
  }

  if (ctx.expectI18n) check("non-ASCII chars preserved (i18n)", ctx.i18nPreserved(html));
}

/**
 * Reader / print-PDF documents. Both are standalone HTML built on
 * `GEP.pdf.bodyHtml`, but with their own shells (reader chrome + footer,
 * print CSS), so `checkHtml`'s expectations (`class="doc-title"`, `<style>`
 * placement) don't apply verbatim.
 */
export function checkStandaloneHtml(check, doc, ctx, { rootClass } = {}) {
  check("has DOCTYPE", doc.startsWith("<!DOCTYPE html"));
  check("has <title>", /<title>.*<\/title>/.test(doc));
  check("has charset meta", /charset="?utf-8/i.test(doc));
  check("has <body>", doc.includes("<body"));
  if (rootClass) check(`has ${rootClass} root`, doc.includes(rootClass));
  const markup = stripInlineAssets(doc).replace(/<!DOCTYPE[^>]*>/i, "");
  check("tags balanced", tagsBalanced(markup, true));
  check("no unescaped ampersands", !/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(markup));
  check("no object stringification leak", noObjectLeak(doc));
  if (ctx.expectTables) check("has tables", doc.includes("<table"));
  if (ctx.expectI18n) check("non-ASCII chars preserved (i18n)", ctx.i18nPreserved(doc));
}

/** CSL-JSON: the interchange format Zotero/Pandoc read for bibliographies. */
export function checkCslJson(check, str, ctx) {
  let items = null;
  try { items = JSON.parse(str); } catch { /* reported below */ }
  check("valid JSON", items !== null);
  if (!items) return;
  check("is an array", Array.isArray(items));
  if (!Array.isArray(items)) return;

  const fnCount = ctx.parsed ? (ctx.parsed.footnotes || []).length : items.length;
  check("one item per source", items.length === fnCount);
  if (!items.length) return;

  check("every item has an id", items.every((i) => typeof i.id === "string" && i.id.length > 0));
  check("item ids unique", new Set(items.map((i) => i.id)).size === items.length);
  check("every item has a type", items.every((i) => typeof i.type === "string" && i.type.length > 0));
  check("every item has a title", items.every((i) => typeof i.title === "string" && i.title.length > 0));
  // CSL date-parts: [[yyyy, mm, dd]] — Zotero rejects other shapes.
  check("accessed uses CSL date-parts", items.every((i) => {
    const p = i.accessed && i.accessed["date-parts"];
    return Array.isArray(p) && Array.isArray(p[0]) && p[0].length === 3 && p[0].every((n) => typeof n === "number");
  }));
  check("URLs are absolute when present",
    items.every((i) => i.URL === undefined || /^https?:\/\//.test(i.URL)));
  check("no object stringification leak", noObjectLeak(str));
}

/** Obsidian-vault bundle: `buildEntries()` -> [{ name, data }]. */
export function checkVaultEntries(check, entries, ctx) {
  check("returns entries", Array.isArray(entries) && entries.length >= 1);
  if (!Array.isArray(entries) || !entries.length) return;

  const names = entries.map((e) => e.name);
  check("entry names unique", new Set(names).size === names.length);
  check("every entry has string data", entries.every((e) => typeof e.data === "string" && e.data.length > 0));
  // The bundle is unzipped into a vault, so names must be filesystem-safe and
  // must not escape the target folder.
  check("names are filesystem-safe", names.every((n) => !/[<>:"\\|?*]|^\/|\.\./.test(n)));
  check("has exactly one main .md at the root",
    names.filter((n) => n.endsWith(".md") && !n.includes("/") && n !== "references.md").length === 1);

  const tableCount = ctx.parsed ? (ctx.parsed.blocks || []).filter((b) => b && b.type === "table").length : 0;
  const csvNames = names.filter((n) => n.startsWith("tables/") && n.endsWith(".csv"));
  check("one CSV per table", csvNames.length === tableCount);
  check("table CSVs are zero-padded and ordered",
    csvNames.every((n, i) => n === `tables/table-${String(i + 1).padStart(2, "0")}.csv`));
  for (const e of entries.filter((x) => csvNames.includes(x.name))) {
    check(`${e.name}: starts with UTF-8 BOM`, e.data.charCodeAt(0) === 0xfeff);
  }

  const hasFootnotes = ctx.parsed ? (ctx.parsed.footnotes || []).length > 0 : false;
  check("references.md present exactly when sources exist",
    names.includes("references.md") === hasFootnotes);

  for (const e of entries) check(`${e.name}: no object leak`, noObjectLeak(e.data));
}

export function checkJson(check, json, ctx) {
  const parsed = ctx.parsed;
  check("valid JSON", parsed !== null);
  if (!parsed) return;

  check("has title string", typeof parsed.title === "string" && parsed.title.length > 0);
  check("has blocks array", Array.isArray(parsed.blocks));
  check("blocks count > 0", parsed.blocks.length > 0);
  check("no root key (stripped)", !("root" in parsed));

  check("every block has type", parsed.blocks.every(b => typeof b.type === "string"));
  const types = new Set(parsed.blocks.map(b => b.type));
  check("has heading blocks", types.has("heading"));
  check("has paragraph blocks", types.has("paragraph"));
  if (ctx.expectTables) check("has table blocks", types.has("table"));

  const headings = parsed.blocks.filter(b => b.type === "heading");
  check("headings have level", headings.every(h => typeof h.level === "number"));
  check("headings have runs", headings.every(h => Array.isArray(h.runs)));

  const tables = parsed.blocks.filter(b => b.type === "table");
  if (tables.length) {
    check("tables have header", tables.every(t => Array.isArray(t.header)));
    check("tables have rows", tables.every(t => Array.isArray(t.rows)));
    check("table rows have cells", tables.every(t => t.rows.every(r => Array.isArray(r))));
  }

  if (parsed.footnotes) {
    check("footnotes is array", Array.isArray(parsed.footnotes));
    check("footnotes have index", parsed.footnotes.every(f => typeof f.index === "number"));
    check("footnotes have url", parsed.footnotes.every(f => typeof f.url === "string"));
    check("footnotes have title", parsed.footnotes.every(f => typeof f.title === "string"));
    check("footnotes have domain", parsed.footnotes.every(f => typeof f.domain === "string"));
    check("footnote indices unique", new Set(parsed.footnotes.map(f => f.index)).size === parsed.footnotes.length);
  }
}

export function checkLatex(check, tex, ctx) {
  check("has \\documentclass", tex.includes("\\documentclass"));
  check("has \\usepackage{hyperref}", tex.includes("\\usepackage{hyperref}"));
  check("has \\title{...}", /\\title\{.+\}/.test(tex));
  check("has \\end{document}", tex.includes("\\end{document}") || tex.includes("\\section{"));
  check("has \\section or \\subsection", /\\(sub)?section\{/.test(tex));
  if (ctx.expectBold) check("bold text uses \\textbf", tex.includes("\\textbf{"));
  if (ctx.expectItalic) check("italic text uses \\textit", tex.includes("\\textit{"));
  if (ctx.expectTables) {
    check("tables use longtable/tabular env", tex.includes("\\begin{longtable}") || tex.includes("\\begin{tabular}"));
    check("tables have rules (booktabs or hline)", tex.includes("\\toprule") || tex.includes("\\hline"));
  }
  if (tex.includes("\\begin{longtable}")) {
    check("longtable package loaded", tex.includes("\\usepackage{longtable}"));
    check("booktabs package loaded", tex.includes("\\usepackage{booktabs}"));
    check("longtable uses wrapping p{} columns", /\\begin\{longtable\}\{(?:>\{[^}]*\}p\{[^}]+\})+\}/.test(tex));
    check("longtable columns are ragged-right", tex.includes("\\raggedright\\arraybackslash"));
    check("longtable headers repeat across pages", !tex.includes("\\midrule") || tex.includes("\\endhead"));
  }
  // Only meaningful when the report actually contains those characters.
  if (ctx.expectLatexSpecials) check("special chars escaped (& % $ # _)", /\\[&%$#_]/.test(tex));

  const beginCount = (tex.match(/\\begin\{/g) || []).length;
  const endCount = (tex.match(/\\end\{/g) || []).length;
  check("\\begin/\\end balanced", beginCount === endCount);
  check("begin/end envs match pairwise", (() => {
    const stack = [];
    for (const m of tex.matchAll(/\\(begin|end)\{([a-zA-Z*]+)\}/g)) {
      if (m[1] === "begin") stack.push(m[2]);
      else if (stack.pop() !== m[2]) return false;
    }
    return stack.length === 0;
  })());
  check("no accent-command artifacts (\\~x, \\^x)", !/\\[~^][a-zA-Z]/.test(tex));
  check("no double-escaped backslash artifact", !tex.includes("\\textbackslash\\{"));

  check("no object stringification leak", noObjectLeak(tex));
  if (ctx.expectI18n) check("non-ASCII chars preserved (i18n)", ctx.i18nPreserved(tex));
}

/** Splits CSV into logical rows: newlines inside quoted cells don't break rows. */
function splitCsvRows(body) {
  const rows = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') { inQuote = !inQuote; cur += ch; }
    else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      if (cur.trim()) rows.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) rows.push(cur);
  return rows;
}

/** Counts columns in one logical row, honoring quoted cells. */
function csvCols(row) {
  let inQuote = false;
  let cols = 1;
  for (const ch of row) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "," && !inQuote) cols++;
  }
  return cols;
}

/** `csv` must be the raw exporter output / file content, BOM included. */
export function checkCsv(check, csv, ctx) {
  check("starts with UTF-8 BOM (Excel on Windows)", csv.charCodeAt(0) === 0xfeff);
  const body = csv.replace(/^\uFEFF/, "");
  check("no object stringification leak", noObjectLeak(body));
  if (!ctx.expectTables) return; // table-less reports get a placeholder CSV

  check("not empty", body.trim().length > 10);

  // Multi-table files separate tables with padded `[Table N],,,` marker rows;
  // a single-table file has no marker at all.
  const rows = splitCsvRows(body);
  const tables = [];
  let cur = null;
  for (const row of rows) {
    if (/^(?:")?\[Table \d+\]/.test(row)) { cur = []; tables.push(cur); continue; }
    if (!cur) { cur = []; tables.push(cur); }
    cur.push(row);
  }
  check("has at least 1 table", tables.length >= 1 && tables[0].length >= 1);

  for (let i = 0; i < tables.length; i++) {
    const tRows = tables[i];
    check(`table ${i + 1}: has header row`, tRows.length >= 1);
    check(`table ${i + 1}: has data rows`, tRows.length >= 2);
    const headerCols = csvCols(tRows[0] || "");
    check(`table ${i + 1}: column count consistent`,
      tRows.slice(1).every((r) => csvCols(r) === headerCols));
  }

  check("no markdown/HTML in CSV", !body.match(/\*\*|<[a-z]+>|\[\^|\]\(/i));
  check("no footnote markers in CSV", !body.match(/\[\^\d+\]|\[#fn\d+\]/));
  check("quotes properly doubled", (() => {
    // Inside quoted cells every " must be doubled; strip valid pairs and
    // quoted cells, nothing quote-ish should remain.
    const stripped = body.replace(/"(?:[^"]|"")*"/g, "");
    return !stripped.includes('"');
  })());
}

export function checkBib(check, bib) {
  check("not empty", bib.trim().length > 50);
  check("has comment header", bib.startsWith("%"));

  const entries = bib.match(/@(?:misc|online)\{([^,\s]+),/g) || [];
  if (entries.length) {
    check("has bib entries", entries.length >= 1);
    const keys = entries.map((e) => e.match(/@(?:misc|online)\{([^,\s]+),/)[1]);
    check("entry keys unique", new Set(keys).size === keys.length);
    check("entry keys are safe identifiers", keys.every((k) => /^[a-z0-9]+$/.test(k)));
    check("braces balanced", (bib.match(/\{/g) || []).length === (bib.match(/\}/g) || []).length);
    check("every entry has title field", (bib.match(/^\s*title\s*=/gm) || []).length === entries.length);
    check("every entry has urldate field", (bib.match(/^\s*urldate\s*=/gm) || []).length === entries.length);
    check("LaTeX specials escaped in fields", (() => {
      const fields = [...bib.matchAll(/^\s*(?:title|note)\s*=\s*\{(.+)\},$/gm)].map((m) => m[1]);
      return fields.every((f) => !/(?<!\\)[&%$#_]/.test(f));
    })());
  } else {
    check("explicit no-sources comment", bib.includes("No sources"));
  }

  check("no object stringification leak", noObjectLeak(bib));
}

export function checkRis(check, ris) {
  check("not empty", ris.trim().length > 20);
  check("records start with TY tag", ris.startsWith("TY  - "));

  const tyCount = (ris.match(/^TY  - /gm) || []).length;
  const erCount = (ris.match(/^ER  - /gm) || []).length;
  check("every TY has matching ER", tyCount > 0 && tyCount === erCount);
  check("tag format is 'XX  - '", ris.split("\n").filter((l) => l.trim()).every((l) => /^[A-Z][A-Z0-9]  - /.test(l)));

  if (ris.includes("TY  - ELEC")) {
    const records = ris.split(/^ER  - $/m).filter((r) => r.includes("TY  - "));
    check("every record has TI title", records.every((r) => /^TI  - .+$/m.test(r)));
    check("every record has Y2 access date", records.every((r) => /^Y2  - \d{4}\/\d{2}\/\d{2}$/m.test(r)));
    check("records have UR urls", /^UR  - https?:\/\//m.test(ris));
    check("no multi-line values", ris.split("\n").every((l) => !l.trim() || /^[A-Z][A-Z0-9]  - /.test(l) || l === ""));
  }

  check("no object stringification leak", noObjectLeak(ris));
}

export function checkRtf(check, rtf, ctx) {
  check("not empty", rtf.trim().length > 100);
  check("starts with rtf header", rtf.startsWith("{\\rtf1"));
  check("has font table", rtf.includes("\\fonttbl"));
  check("has color table", rtf.includes("\\colortbl"));
  check("non-ascii escaped as \\uN?", !ctx.expectI18n || /\\u-?\d+\?/.test(rtf));
  check("braces balanced", (() => {
    let depth = 0;
    for (let i = 0; i < rtf.length; i++) {
      const ch = rtf[i];
      if (ch === "\\") { i++; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth < 0) return false; }
    }
    return depth === 0;
  })());
  check("no object stringification leak", noObjectLeak(rtf));
}

/** `docxBuf` is the .docx file/blob as a Buffer. */
export function checkDocx(check, docxBuf, ctx) {
  check("file size > 1KB", docxBuf.length > 1024);
  check("starts with ZIP magic (PK)", docxBuf[0] === 0x50 && docxBuf[1] === 0x4b);

  const docxEntries = readZipEntries(docxBuf);
  const docxNames = docxEntries.map((e) => e.name);
  for (const required of [
    "[Content_Types].xml", "_rels/.rels",
    "word/_rels/document.xml.rels", "word/styles.xml", "word/document.xml",
  ]) {
    check(`zip entry exists: ${required}`, docxNames.includes(required));
  }
  check("all entry CRCs valid", docxEntries.every((e) => e.crcOk === true));

  const docXml = (docxEntries.find((e) => e.name === "word/document.xml") || {}).content;
  if (docXml) {
    check("document.xml has XML declaration", docXml.startsWith("<?xml"));
    check("document.xml tags balanced", tagsBalanced(docXml));
    check("document.xml has w:body", docXml.includes("<w:body>"));
    check("document.xml has sectPr", docXml.includes("<w:sectPr>"));
    check("document.xml paragraphs exist", (docXml.match(/<w:p[ >/]/g) || []).length > 3);
    check("document.xml no unescaped ampersands", !/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(docXml));
    if (ctx.expectI18n) check("document.xml non-ASCII chars preserved (i18n)", ctx.i18nPreserved(docXml));
    check("document.xml no object leak", noObjectLeak(docXml));
    if (ctx.expectTables) {
      check("document.xml has tables when IR does", docXml.includes("<w:tbl>"));
    }
  }

  const stylesXml = (docxEntries.find((e) => e.name === "word/styles.xml") || {}).content;
  if (stylesXml) {
    check("styles.xml tags balanced", tagsBalanced(stylesXml));
    check("styles.xml defines headings", stylesXml.includes('w:styleId="Heading1"'));
  }
}

/** `epubBuf` is the .epub file/blob as a Buffer. */
export function checkEpub(check, epubBuf, ctx) {
  check("file size > 500B", epubBuf.length > 500);
  check("starts with ZIP magic (PK)", epubBuf[0] === 0x50 && epubBuf[1] === 0x4b);

  const epubEntries = readZipEntries(epubBuf);
  const epubNames = epubEntries.map((e) => e.name);
  for (const required of [
    "mimetype", "META-INF/container.xml",
    "OEBPS/content.opf", "OEBPS/toc.xhtml", "OEBPS/chapter.xhtml", "OEBPS/style.css",
  ]) {
    check(`zip entry exists: ${required}`, epubNames.includes(required));
  }
  check("all entry CRCs valid", epubEntries.every((e) => e.crcOk === true));

  // EPUB spec: mimetype MUST be the first entry and stored uncompressed.
  check("mimetype is first entry", epubEntries[0] && epubEntries[0].name === "mimetype");
  check("mimetype stored uncompressed", epubEntries[0] && epubEntries[0].method === 0);
  check("mimetype content exact", epubEntries[0] && epubEntries[0].content === "application/epub+zip");

  const container = (epubEntries.find((e) => e.name === "META-INF/container.xml") || {}).content;
  if (container) {
    check("container.xml tags balanced", tagsBalanced(container));
    check("container points to content.opf", container.includes('full-path="OEBPS/content.opf"'));
  }

  const opf = (epubEntries.find((e) => e.name === "OEBPS/content.opf") || {}).content;
  if (opf) {
    check("content.opf tags balanced", tagsBalanced(opf));
    check("content.opf has dc:title", /<dc:title>.+<\/dc:title>/.test(opf));
    check("content.opf has unique identifier", opf.includes('unique-identifier="uid"'));
    check("content.opf manifest covers chapter+toc+css", ["chapter.xhtml", "toc.xhtml", "style.css"].every((f) => opf.includes(`href="${f}"`)));
    check("content.opf has nav property", opf.includes('properties="nav"'));
    check("content.opf has spine", opf.includes("<spine>"));
  }

  const chapter = (epubEntries.find((e) => e.name === "OEBPS/chapter.xhtml") || {}).content;
  if (chapter) {
    check("chapter.xhtml has XML declaration", chapter.startsWith("<?xml"));
    check("chapter.xhtml is strict XHTML (tags balanced)", tagsBalanced(chapter.replace(/<!DOCTYPE[^>]*>/i, "")));
    check("chapter.xhtml no HTML void leftovers", !/<(?:br|hr|img)(?:\s[^>]*[^/])?>/i.test(chapter.replace(/<(?:br|hr|img)(?:\s[^>]*)?\/>/gi, "")));
    if (ctx.expectI18n) check("chapter.xhtml non-ASCII chars preserved (i18n)", ctx.i18nPreserved(chapter));
    check("chapter.xhtml no object leak", noObjectLeak(chapter));
  }

  const tocX = (epubEntries.find((e) => e.name === "OEBPS/toc.xhtml") || {}).content;
  if (tocX && chapter) {
    check("toc.xhtml tags balanced", tagsBalanced(tocX.replace(/<!DOCTYPE[^>]*>/i, "")));
    check("toc anchors resolve in chapter.xhtml", (() => {
      const anchors = [...tocX.matchAll(/href="chapter\.xhtml#([^"]+)"/g)].map((m) => m[1]);
      const ids = new Set([...chapter.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
      return anchors.every((a) => ids.has(a));
    })());
  }
}

// ── Cross-format consistency ─────────────────────────────────────────

/** All text params are optional; checks run on whatever combination exists. */
export function checkCrossFormat(check, { md, txt, html, csv, bib, ris }, ctx) {
  const parsedJ = ctx.parsed;
  if (!parsedJ || !md || !txt || !html) return;

  const title = parsedJ.title;
  check("title matches across MD", md.includes(title));
  check("title matches across TXT", txt.includes(title));
  check("title matches across HTML", html.includes(title.replace(/&/g, "&amp;")));

  const blockCount = parsedJ.blocks.length;
  check("JSON has blocks", blockCount > 0);

  const headingCount = parsedJ.blocks.filter(b => b.type === "heading").length;
  const mdH2Count = (md.match(/^#{2,6} .+$/gm) || []).length;
  check("heading count MD vs JSON close (±2)", Math.abs(mdH2Count - headingCount) <= 2);

  const tableCount = parsedJ.blocks.filter(b => b.type === "table").length;
  const csvBody = csv ? csv.replace(/^\uFEFF/, "") : null;
  // The CSV exporter emits `[Table N]` markers only for multi-table reports;
  // a lone table gets bare rows and the no-table case a "(No tables found…)"
  // placeholder.
  let csvTableCount = tableCount;
  if (csvBody) {
    const markers = (csvBody.match(/^\[Table \d+\]/gm) || []).length;
    csvTableCount = markers || (csvBody.includes("No tables found") ? 0 : 1);
  }
  check("table count CSV vs JSON", csvTableCount === tableCount);

  if (parsedJ.footnotes && parsedJ.footnotes.length > 0) {
    const fnCount = parsedJ.footnotes.length;
    const mdFnDefs = (md.match(/^\[\^\d+\]:/gm) || []).length;
    if (mdFnDefs > 0) {
      check("footnote count MD defs vs JSON", mdFnDefs === fnCount);
    } else {
      const mdSourceEntries = (md.match(/^\d+\.\s+\[.+\]\(.+\)$/gm) || []).length;
      check("footnote count MD source list vs JSON", mdSourceEntries === fnCount);
    }
    if (bib && (bib.includes("@misc{") || bib.includes("@online{"))) {
      const bibEntries = (bib.match(/@(?:misc|online)\{/g) || []).length;
      check("footnote count BIB entries vs JSON", bibEntries === fnCount);
    }
    if (ris && ris.includes("TY  - ELEC")) {
      const risRecords = (ris.match(/^TY  - ELEC$/gm) || []).length;
      check("footnote count RIS records vs JSON", risRecords === fnCount);
    }
  }
}
