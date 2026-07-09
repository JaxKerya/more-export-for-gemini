/**
 * Vault bundle exporter: intermediate representation -> a set of files suitable
 * for a knowledge base (Obsidian / Notion / Logseq).
 *
 * Produces, as an array of { name, data } entries (zipped by the caller):
 *   - <title>.md       the full report as Markdown (links/footnotes intact)
 *   - references.md    the sources list (only when footnotes exist)
 *   - tables/table-NN.csv   one CSV per table in the report
 *
 * Returns plain objects only, so it is unit-testable without a DOM or ZIP layer.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function safeName(title) {
    const raw = String(title || "report")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return raw.slice(0, 80) || "report";
  }

  function runsToPlain(runs) {
    return (runs || []).map((r) => r.text || "").join("");
  }

  function csvField(value) {
    const v = String(value == null ? "" : value);
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  function tableToCsv(block) {
    const rows = [];
    if (block.header && block.header.length) rows.push(block.header);
    (block.rows || []).forEach((r) => rows.push(r));
    // UTF-8 BOM so Excel decodes non-ASCII text correctly (see csv.js).
    return "\uFEFF" + rows
      .map((row) => (row || []).map((cell) => csvField(runsToPlain(cell))).join(","))
      .join("\r\n");
  }

  function referencesMd(ir, citationStyle) {
    if (!ir.footnotes || !ir.footnotes.length) return "";
    const style = citationStyle || "numbered";
    const lines = ["# References", ""];
    ir.footnotes.forEach((fn) => {
      const cite = GEP.citation ? GEP.citation.format(fn, style) : { label: fn.text || "", url: fn.url };
      if (cite.url) lines.push(`${fn.index}. [${cite.label}](${cite.url})`);
      else lines.push(`${fn.index}. ${cite.label}`);
    });
    return lines.join("\n") + "\n";
  }

  /**
   * @returns {Array<{ name: string, data: string }>}
   */
  function buildEntries(ir, opts) {
    const o = opts || {};
    const base = safeName(ir.title);
    const entries = [];

    const mainMd = GEP.markdown.convert(ir, {
      ...o,
      flavor: o.flavor || "gfm",
      includeToc: o.includeToc !== undefined ? o.includeToc : true,
      includeFootnotes: o.includeFootnotes !== undefined ? o.includeFootnotes : true,
    });
    entries.push({ name: `${base}.md`, data: mainMd });

    const refs = referencesMd(ir, o.citationStyle);
    if (refs) entries.push({ name: "references.md", data: refs });

    const tables = (ir.blocks || []).filter((b) => b.type === "table");
    tables.forEach((tbl, i) => {
      const n = String(i + 1).padStart(2, "0");
      entries.push({ name: `tables/table-${n}.csv`, data: tableToCsv(tbl) });
    });

    return entries;
  }

  GEP.vault = { buildEntries, tableToCsv };
})();
