/**
 * RIS exporter: intermediate representation -> .ris reference file.
 *
 * RIS is the interchange format used by EndNote, Zotero, Mendeley and most
 * reference managers. Exports only the footnotes/sources as ELEC (web page)
 * records. If the report has no sources, produces a file with a comment-like
 * empty record set (RIS has no comment syntax, so we emit nothing but a
 * single informational record).
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  // RIS values are plain text on a single line; strip newlines and the
  // tag-like pattern that could corrupt record parsing.
  function risValue(text) {
    return String(text).replace(/[\r\n]+/g, " ").trim();
  }

  function convert(ir) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const accessDate = `${y}/${m}/${d}`;

    const lines = [];

    if (!ir.footnotes || !ir.footnotes.length) {
      // A single GEN record noting the absence of sources keeps the file
      // importable instead of empty/invalid.
      lines.push(
        "TY  - GEN",
        `TI  - ${risValue(ir.title || "Gemini Deep Research")} (no sources found)`,
        `Y2  - ${accessDate}`,
        "ER  - ",
        ""
      );
      return lines.join("\n");
    }

    ir.footnotes.forEach((fn) => {
      const title = fn.title || fn.domain || `Source ${fn.index}`;
      lines.push("TY  - ELEC");
      lines.push(`TI  - ${risValue(title)}`);
      if (fn.domain) lines.push(`T2  - ${risValue(fn.domain)}`);
      if (fn.url) lines.push(`UR  - ${risValue(fn.url)}`);
      // DOI / ISBN from source hygiene (#20), when detected. RIS uses DO for
      // DOI and SN for ISBN/serial numbers.
      if (fn.doi) lines.push(`DO  - ${risValue(fn.doi)}`);
      if (fn.isbn) lines.push(`SN  - ${risValue(fn.isbn)}`);
      lines.push(`Y2  - ${accessDate}`);
      lines.push(`ID  - source${fn.index}`);
      lines.push("ER  - ");
      lines.push("");
    });

    return lines.join("\n");
  }

  GEP.ris = { convert };
})();
