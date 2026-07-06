/**
 * BibTeX exporter: intermediate representation -> .bib reference file.
 *
 * Exports only the footnotes/sources as BibTeX @online entries. If the report
 * has no sources, produces an empty file with a comment header.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function bibEscape(text) {
    // Escape every LaTeX-special character so the .bib compiles when used.
    // Backslash goes through a placeholder to avoid re-escaping braces.
    return String(text)
      .replace(/\\/g, "\u0000")
      .replace(/([{}&%$#_])/g, "\\$1")
      .replace(/[~^]/g, "")
      .replace(/\u0000/g, "\\textbackslash{}");
  }

  function makeKey(fn) {
    let key = (fn.domain || "source").replace(/[^a-zA-Z0-9]/g, "");
    return key.toLowerCase() + fn.index;
  }

  function convert(ir) {
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `% BibTeX references exported from Gemini Deep Research`,
      `% Title: ${ir.title || "Untitled"}`,
      `% Date:  ${date}`,
      "",
    ];

    if (!ir.footnotes || !ir.footnotes.length) {
      lines.push("% No sources found in this report.");
      return lines.join("\n") + "\n";
    }

    ir.footnotes.forEach((fn) => {
      const key = makeKey(fn);
      const entry = [`@misc{${key},`];

      const title = fn.title || fn.domain || `Source ${fn.index}`;
      entry.push(`  title        = {${bibEscape(title)}},`);

      if (fn.url) {
        entry.push(`  howpublished = {\\url{${fn.url}}},`);
        entry.push(`  url          = {${fn.url}},`);
      }

      entry.push(`  urldate      = {${date}},`);

      // DOI / ISBN added by source hygiene (#20), when detected. Only emitted
      // if present on the footnote.
      if (fn.doi) entry.push(`  doi          = {${bibEscape(fn.doi)}},`);
      if (fn.isbn) entry.push(`  isbn         = {${bibEscape(fn.isbn)}},`);

      if (fn.domain) {
        entry.push(`  note         = {${bibEscape(fn.domain)}},`);
      }

      entry.push("}");
      lines.push(entry.join("\n"));
      lines.push("");
    });

    return lines.join("\n").trim() + "\n";
  }

  GEP.bibtex = { convert };
})();
