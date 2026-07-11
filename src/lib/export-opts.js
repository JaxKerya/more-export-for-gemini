/**
 * Shared export-options builder + format metadata.
 *
 * `GEP.exportOpts.build(settings, format)` turns the flat settings object
 * (as returned by GEP.settings.load()) into the `opts` object every exporter
 * consumes. It is the single source of truth for export options so that both
 * the content script (live Gemini export) and the Options page (offline
 * re-export from a saved JSON IR) produce identical output for the same
 * settings.
 *
 * It also centralizes the MIME / extension tables and the list of formats that
 * consume an IR (EXPORTABLE), so the offline re-export UI and content script
 * agree on routing.
 */
(function () {
  "use strict";
  /** @type {Record<string, any>} */
  const GEP = (window.GEP = window.GEP || {});

  const MIME = {
    markdown: "text/markdown;charset=utf-8",
    txt: "text/plain;charset=utf-8",
    html: "text/html;charset=utf-8",
    reader: "text/html;charset=utf-8",
    json: "application/json;charset=utf-8",
    latex: "application/x-latex;charset=utf-8",
    csv: "text/csv;charset=utf-8",
    bibtex: "application/x-bibtex;charset=utf-8",
    ris: "application/x-research-info-systems;charset=utf-8",
    csljson: "application/vnd.citationstyles.csl+json;charset=utf-8",
    rtf: "application/rtf;charset=utf-8",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
    zip: "application/zip",
    vault: "application/zip",
  };

  const EXT = {
    markdown: ".md", txt: ".txt", html: ".html", reader: ".reader.html", json: ".json",
    latex: ".tex", csv: ".csv", bibtex: ".bib", ris: ".ris",
    csljson: ".json", rtf: ".rtf",
    docx: ".docx", pdf: ".pdf", epub: ".epub", vault: ".zip",
  };

  /**
   * Formats that can be produced from an IR (used by the offline re-export UI).
   * `pdf` opens the print dialog; `vault` and the rest download a file.
   */
  const EXPORTABLE = [
    "markdown", "txt", "html", "reader", "json", "latex",
    "csv", "bibtex", "ris", "csljson", "rtf",
    "docx", "pdf", "epub", "vault",
  ];

  // Human labels for the re-export format picker.
  const LABELS = {
    markdown: "Markdown (.md)", txt: "Plain text (.txt)", html: "HTML (.html)",
    reader: "Reader HTML (.reader.html)", json: "JSON (.json)", latex: "LaTeX (.tex)",
    csv: "CSV (.csv)", bibtex: "BibTeX (.bib)", ris: "RIS (.ris)",
    csljson: "CSL-JSON (.json)", rtf: "RTF (.rtf)", docx: "Word (.docx)",
    pdf: "PDF (print)", epub: "EPUB (.epub)", vault: "Vault bundle (.zip)",
  };

  /**
   * Page / typography layout, shared by PDF, HTML, DOCX and LaTeX.
   * Default values reproduce the historical hardcoded output exactly.
   * @param {object} s flat settings
   * @returns {{paper:string, margins:string, fontSize:number, lineSpacing:string, fontFamily:string}}
   */
  function layoutFrom(s) {
    const paper = s.doc_paper === "letter" ? "letter" : "a4";
    const margins = ["narrow", "wide"].includes(s.doc_margins) ? s.doc_margins : "normal";
    const fontSize = [10, 12].includes(Number(s.doc_font_size)) ? Number(s.doc_font_size) : 11;
    const lineSpacing = ["onehalf", "double"].includes(s.doc_line_spacing) ? s.doc_line_spacing : "normal";
    const fontFamily = s.doc_font_family === "serif" ? "serif" : "sans";
    return { paper, margins, fontSize, lineSpacing, fontFamily };
  }

  /**
   * Build the exporter options object from flat settings for a given format.
   * @param {object} settings flat settings (formats + options + overrides)
   * @param {string} [format] target format key (for per-format overrides)
   */
  function build(settings, format) {
    const s = settings || {};
    const ov = (format && s.overrides && s.overrides[format]) || {};
    const includeToc = ov.include_toc !== undefined ? ov.include_toc : !!s.include_toc;
    const includeFootnotes = ov.include_footnotes !== undefined
      ? ov.include_footnotes
      : s.include_footnotes !== false;
    const citationStyle = ov.citation_style || s.citation_style || "numbered";

    return {
      flavor: s.markdown_flavor || "gfm",
      includeToc,
      includeFootnotes,
      citationStyle,
      meta: {
        author: s.meta_author || "",
        affiliation: s.meta_affiliation || "",
        keywords: s.meta_keywords || "",
        abstract: s.meta_abstract || "",
      },
      // Page / typography layout (PDF / HTML / DOCX / LaTeX).
      layout: layoutFrom(s),
      // Source hygiene (applied as a pre-export IR transform).
      sourceDedupe: s.source_dedupe === true,
      sourceSort: ["alpha", "domain"].includes(s.source_sort) ? s.source_sort : "appearance",
      sourceEnrichIds: s.source_enrich_ids !== false,
      // Reader HTML presentation, baked into the export (see exporters/reader.js).
      readerTheme: s.reader_theme || "auto",
      readerWidth: s.reader_width || "comfort",
      readerOutline: s.reader_outline !== false,
      readerFont: s.reader_font || "sans",
      readerSize: s.reader_size || "medium",
      readerSpacing: s.reader_spacing || "normal",
      readerAccent: s.reader_accent || "blue",
      readerJustify: s.reader_justify === true,
      readerProgress: s.reader_progress !== false,
    };
  }

  /**
   * Which heavyweight vendors does this report actually need?
   * KaTeX (~360 KB) only matters when the report contains math; highlight.js
   * (~136 KB) only when it contains code BLOCKS (inline code is never
   * highlighted — mirrors irHasCode in exporters/reader.js). The content
   * script uses this to skip vendor imports for typical prose reports.
   * @param {{blocks?: any[]}} ir
   * @returns {{math: boolean, code: boolean}}
   */
  function vendorNeeds(ir) {
    let math = false;
    let code = false;
    const scanRuns = (runs) => {
      if (!math) math = (runs || []).some((r) => r && r.math);
    };
    for (const b of (ir && ir.blocks) || []) {
      if (!b) continue;
      if (b.type === "math") math = true;
      else if (b.type === "code") code = true;
      scanRuns(b.runs);
      (b.items || []).forEach((it) => scanRuns(it && it.runs));
      (b.header || []).forEach(scanRuns);
      (b.rows || []).forEach((row) => (row || []).forEach(scanRuns));
      if (math && code) break;
    }
    return { math, code };
  }

  GEP.exportOpts = { build, layoutFrom, MIME, EXT, EXPORTABLE, LABELS, vendorNeeds };
})();
