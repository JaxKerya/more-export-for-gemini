/**
 * Pre-export quality check (#25).
 *
 * Runs entirely on the extracted IR — no network, no broken-link probing — and
 * reports content-quality issues the user may want to fix before exporting:
 * missing/janky heading hierarchy, empty headings, empty or ragged (uneven
 * column count) tables, math formulas that won't render, images without alt
 * text, footnotes referenced but unmatched (and sources never referenced),
 * duplicate source URLs, `[object Object]` leaks, and suspiciously short content.
 *
 * Levels: "error" (likely broken output), "warn" (probably wrong), "info"
 * (worth a glance). `ok` is true when there are no errors or warnings.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  function headingText(block) {
    return (block.runs || []).map((r) => r.text || "").join("").trim();
  }

  function collectReferenced(blocks, referenced) {
    const walkRuns = (runs) =>
      (runs || []).forEach((r) => { if (r.footnoteIndex) referenced.add(r.footnoteIndex); });
    blocks.forEach((b) => {
      if (b.runs) walkRuns(b.runs);
      if (b.type === "list") (b.items || []).forEach((it) => walkRuns(it.runs));
      if (b.type === "table") {
        (b.header || []).forEach(walkRuns);
        (b.rows || []).forEach((row) => (row || []).forEach(walkRuns));
      }
    });
  }

  function textLength(blocks) {
    let n = 0;
    blocks.forEach((b) => {
      if (typeof b.text === "string") n += b.text.length;
      if (b.runs) b.runs.forEach((r) => { if (r.text) n += r.text.length; });
    });
    return n;
  }

  function hasLeak(blocks) {
    let leak = false;
    const scan = (s) => { if (typeof s === "string" && s.includes("[object Object]")) leak = true; };
    blocks.forEach((b) => {
      scan(b.text);
      (b.runs || []).forEach((r) => scan(r.text));
      if (b.type === "table") {
        (b.header || []).forEach((c) => (c || []).forEach((r) => scan(r.text)));
        (b.rows || []).forEach((row) => (row || []).forEach((c) => (c || []).forEach((r) => scan(r.text))));
      }
    });
    return leak;
  }

  /** Gathers every LaTeX math source in the IR (block formulas + inline runs). */
  function collectMath(blocks) {
    const out = [];
    const fromRuns = (runs) =>
      (runs || []).forEach((r) => { if (r && r.math && typeof r.math.tex === "string") out.push(r.math.tex); });
    blocks.forEach((b) => {
      if (b.type === "math" && typeof b.tex === "string") out.push(b.tex);
      if (b.runs) fromRuns(b.runs);
      if (b.type === "list") (b.items || []).forEach((it) => fromRuns(it.runs));
      if (b.type === "table") {
        (b.header || []).forEach((c) => fromRuns(c));
        (b.rows || []).forEach((row) => (row || []).forEach((c) => fromRuns(c)));
      }
    });
    return out;
  }

  /** True when every { has a matching } (escaped \{ \} are ignored). */
  function bracesBalanced(s) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "\\") { i++; continue; } // skip the escaped character
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth < 0) return false; }
    }
    return depth === 0;
  }

  /** Returns a short reason string when a formula likely won't render, else null. */
  function mathProblem(tex) {
    const t = String(tex == null ? "" : tex).trim();
    if (!t) return "empty";
    if (!bracesBalanced(t)) return "unbalanced braces";
    if (GEP.texmath && typeof GEP.texmath.parse === "function") {
      try { GEP.texmath.parse(t); } catch { return "unparseable"; }
    }
    return null;
  }

  /**
   * @param {object} ir
   * @returns {{ ok: boolean, warnings: {level:string,message:string}[], stats: object }}
   */
  function check(ir) {
    const warnings = [];
    const add = (level, message) => warnings.push({ level, message });

    if (!ir || !Array.isArray(ir.blocks)) {
      return {
        ok: false,
        warnings: [{ level: "error", message: "No content could be extracted from the page." }],
        stats: { errors: 1, warnings: 0, infos: 0, blocks: 0, sources: 0 },
      };
    }

    const blocks = ir.blocks;
    const footnotes = ir.footnotes || [];

    if (!blocks.length) add("error", "Document has no content blocks.");

    if (!ir.title || !String(ir.title).trim()) {
      add("warn", "Document has no title.");
    }

    // Heading hierarchy
    const headings = blocks.filter((b) => b.type === "heading");
    if (blocks.length && !headings.length) {
      add("warn", "No headings found - exported document will have no structure.");
    }
    let prev = 0;
    headings.forEach((h) => {
      if (!headingText(h)) add("warn", `Empty heading (H${h.level}) with no text.`);
      if (prev && h.level > prev + 1) {
        add("warn", `Heading level jumps from H${prev} to H${h.level} ("${headingText(h).slice(0, 40)}").`);
      }
      prev = h.level;
    });

    // Empty / ragged tables
    blocks.filter((b) => b.type === "table").forEach((t, i) => {
      const rows = t.rows || [];
      const hasHeader = t.header && t.header.length;
      if (!rows.length && !hasHeader) { add("warn", `Table ${i + 1} is empty.`); return; }
      const cols = hasHeader ? t.header.length : (rows[0] || []).length;
      if (cols && rows.some((row) => (row || []).length !== cols)) {
        add("warn", `Table ${i + 1} has rows with inconsistent column counts (expected ${cols}) - may misalign in CSV/DOCX.`);
      }
    });

    // Math that likely won't render
    collectMath(blocks).forEach((tex) => {
      const problem = mathProblem(tex);
      if (problem) {
        const snippet = String(tex).trim().slice(0, 40);
        add("warn", `Math formula may not render (${problem})${snippet ? `: "${snippet}"` : ""}.`);
      }
    });

    // Images without alt text
    const imgNoAlt = blocks.filter((b) => b.type === "image" && !(b.alt && String(b.alt).trim())).length;
    if (imgNoAlt) add("info", `${imgNoAlt} image(s) missing alt text (affects accessibility).`);

    // Footnote / source matching
    const referenced = new Set();
    collectReferenced(blocks, referenced);
    const fnIndices = new Set(footnotes.map((f) => f.index));
    [...referenced].filter((i) => !fnIndices.has(i)).sort((a, b) => a - b).forEach((i) =>
      add("warn", `Footnote [${i}] is referenced in the text but has no matching source.`)
    );
    const unused = [...fnIndices].filter((i) => !referenced.has(i)).sort((a, b) => a - b);
    if (unused.length) {
      add("info", `${unused.length} source(s) never referenced in the body: [${unused.join(", ")}].`);
    }

    // Duplicate source URLs
    const urlCounts = {};
    footnotes.forEach((f) => { if (f.url) urlCounts[f.url] = (urlCounts[f.url] || 0) + 1; });
    Object.keys(urlCounts).filter((u) => urlCounts[u] > 1).forEach((u) =>
      add("info", `Duplicate source URL (${urlCounts[u]}×): ${u}`)
    );

    // Object leak
    if (hasLeak(blocks)) add("error", "Detected a '[object Object]' leak in the extracted text.");

    // Short content
    const totalText = textLength(blocks);
    if (blocks.length && totalText < 200) {
      add("warn", "Document is very short (<200 characters) - extraction may be incomplete.");
    }

    const counts = warnings.reduce((acc, w) => { acc[w.level] = (acc[w.level] || 0) + 1; return acc; }, {});
    return {
      ok: !warnings.some((w) => w.level === "error" || w.level === "warn"),
      warnings,
      stats: {
        errors: counts.error || 0,
        warnings: counts.warn || 0,
        infos: counts.info || 0,
        blocks: blocks.length,
        sources: footnotes.length,
      },
    };
  }

  GEP.validator = { check };
})();
