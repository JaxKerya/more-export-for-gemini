/**
 * Table of Contents generator.
 *
 * Scans the IR blocks for headings and produces a TOC structure that each
 * exporter can render in its own format. The TOC items include a slug-based
 * anchor ID for formats that support internal links (HTML, PDF, Markdown).
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  /**
   * Creates a URL-safe slug from text.
   * @param {string} text
   * @returns {string}
   */
  function slugify(text) {
    return text
      .toLowerCase()
      // Map chars that have no NFKD decomposition before normalization.
      // Turkish dotless-i (ı U+0131) is the most common case.
      .replace(/ı/g, "i").replace(/İ/g, "i")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics (ğ→g, ş→s, ü→u …)
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "section";
  }

  /**
   * Extracts plain text from an array of runs.
   * @param {Run[]} runs
   * @returns {string}
   */
  function runsToText(runs) {
    return (runs || []).map((r) => r.text || "").join("").trim();
  }

  /**
   * Generates a TOC from the IR.
   * @param {{ blocks: Block[], title?: string }} ir
   * @returns {{ items: { level: number, text: string, id: string }[] }}
   */
  function generate(ir) {
    const items = [];
    const slugCounts = {};

    for (const block of ir.blocks) {
      if (block.type !== "heading") continue;

      const text = runsToText(block.runs);
      if (!text) continue;

      // Exporters skip the level-1 heading that duplicates the document
      // title, so it must not appear in the TOC either (dead anchor).
      if (ir.title && block.level === 1 && text === ir.title) continue;

      let slug = slugify(text);

      // Deduplicate slugs
      if (slugCounts[slug]) {
        slugCounts[slug]++;
        slug = `${slug}-${slugCounts[slug]}`;
      } else {
        slugCounts[slug] = 1;
      }

      items.push({
        level: block.level,
        text,
        id: slug,
      });
    }

    return { items };
  }

  GEP.toc = { generate, slugify, runsToText };
})();
