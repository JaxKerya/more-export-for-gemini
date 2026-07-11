/**
 * IR filters for selective / partial export.
 *
 * Each function returns a NEW shallow-cloned IR; the original (which may be the
 * cached extraction) is never mutated.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  /** Keep only table blocks; drops everything else and the sources list. */
  function tablesOnly(ir) {
    const blocks = (ir.blocks || []).filter((b) => b.type === "table");
    return { ...ir, blocks, footnotes: [] };
  }

  /** Plain text of a runs array (for section titles). */
  function runsText(runs) {
    return (runs || []).map((r) => r.text || "").join("").trim();
  }

  /**
   * Lists the report's sections for a picker UI. Each entry describes one
   * heading block: { blockIndex, level, title }.
   */
  function sectionList(ir) {
    const out = [];
    (ir.blocks || []).forEach((b, i) => {
      if (b.type === "heading") {
        out.push({ blockIndex: i, level: b.level || 1, title: runsText(b.runs) });
      }
    });
    return out;
  }

  /**
   * Keeps only the chosen sections. `keepIndices` holds heading BLOCK indices
   * (as returned by sectionList); each section spans from its heading to the
   * next heading of the same or higher level. Footnotes are reduced to the
   * ones still referenced (original index numbers are preserved so markers
   * keep matching the sources list).
   */
  function sections(ir, keepIndices) {
    const all = ir.blocks || [];
    const keepSet = new Set(keepIndices);
    const keep = new Array(all.length).fill(false);

    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (b.type !== "heading" || !keepSet.has(i)) continue;
      keep[i] = true;
      for (let j = i + 1; j < all.length; j++) {
        const nb = all[j];
        if (nb.type === "heading" && (nb.level || 1) <= (b.level || 1)) break;
        keep[j] = true;
      }
    }

    const blocks = all.filter((_, i) => keep[i]);

    // Collect footnote indices still referenced in the kept blocks.
    const used = new Set();
    const scanRuns = (runs) => (runs || []).forEach((r) => {
      if (r.footnoteIndex) used.add(r.footnoteIndex);
    });
    for (const b of blocks) {
      scanRuns(b.runs);
      (b.items || []).forEach((it) => scanRuns(it.runs));
      (b.header || []).forEach(scanRuns);
      (b.rows || []).forEach((row) => (row || []).forEach(scanRuns));
    }
    const footnotes = (ir.footnotes || []).filter((f) => used.has(f.index));

    return { ...ir, blocks, footnotes };
  }

  /** Strip footnote references and the sources list, keeping the body text. */
  function withoutSources(ir) {
    const strip = (runs) => (runs || []).filter((r) => !r.footnoteIndex);
    const blocks = (ir.blocks || []).map((b) => {
      const nb = { ...b };
      if (nb.runs) nb.runs = strip(nb.runs);
      if (nb.items) nb.items = nb.items.map((it) => ({ ...it, runs: strip(it.runs) }));
      return nb;
    });
    return { ...ir, blocks, footnotes: [] };
  }

  /** Resolve a scope keyword to a filter; unknown scopes return the IR as-is. */
  function apply(ir, scope) {
    if (scope === "tables") return tablesOnly(ir);
    if (scope === "nosrc") return withoutSources(ir);
    // "sections:3,7" → keep the sections whose heading block index is listed.
    if (typeof scope === "string" && scope.startsWith("sections:")) {
      const indices = scope.slice("sections:".length)
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n >= 0);
      if (indices.length) return sections(ir, indices);
    }
    return ir;
  }

  GEP.irFilter = { tablesOnly, withoutSources, sectionList, sections, apply };
})();
