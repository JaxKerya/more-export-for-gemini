/**
 * XLSX exporter: extracts the report's tables into a real Excel workbook
 * (OOXML SpreadsheetML), one worksheet per table, zipped with the
 * dependency-free ZIP writer (GEP.zip) — same approach as the DOCX exporter.
 *
 * Compared to the CSV export this gives Excel/Sheets users native niceties:
 * one sheet per table (named after the nearest preceding heading), a bold
 * frozen header row, real numeric cells (so formulas work immediately) and
 * estimated column widths. Text lives in inline strings, so no sharedStrings
 * part is needed and UTF-8 (Turkish, CJK, accents) survives without a BOM.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function xmlEscape(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function runsToText(runs) {
    return (runs || []).map((r) => (r.math ? r.math.tex || "" : r.text)).join("").trim();
  }

  // Excel sheet names: max 31 chars, no : \ / ? * [ ], non-empty, unique.
  function sheetName(raw, index, used) {
    let name = String(raw || "").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) name = `Table ${index + 1}`;
    if (name.length > 31) name = name.slice(0, 31).trim();
    let candidate = name;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      const suffix = ` (${n++})`;
      candidate = name.slice(0, 31 - suffix.length).trim() + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  // Column letter for a 0-based index (0 -> A, 25 -> Z, 26 -> AA …).
  function colLetter(i) {
    let s = "";
    for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
      s = String.fromCharCode(65 + (n % 26)) + s;
    }
    return s;
  }

  // Strictly numeric cells become real numbers so SUM() etc. work out of the
  // box. Conservative on purpose: thousands separators, %, units and locale
  // decimal commas stay text rather than risk silently changing a value.
  const NUMERIC = /^-?\d+(\.\d+)?$/;

  function cellXml(text, ref, styleId) {
    const s = styleId ? ` s="${styleId}"` : "";
    if (text !== "" && NUMERIC.test(text)) {
      return `<c r="${ref}"${s}><v>${text}</v></c>`;
    }
    if (text === "") return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
  }

  /**
   * One worksheet part from a table's text matrix.
   * @param {string[][]} matrix rows of cell texts (first row = header if hasHeader)
   * @param {boolean} hasHeader style row 1 bold + freeze it
   */
  function sheetXml(matrix, hasHeader) {
    const colCount = matrix.reduce((m, r) => Math.max(m, r.length), 1);

    // Column widths from the longest cell (Excel width unit ≈ one character).
    const widths = [];
    for (let c = 0; c < colCount; c++) {
      let w = 0;
      for (const row of matrix) w = Math.max(w, (row[c] || "").length);
      widths.push(Math.min(60, Math.max(10, w + 2)));
    }
    const cols = widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join("");

    const rows = matrix
      .map((cells, r) => {
        const styleId = hasHeader && r === 0 ? 1 : 0;
        const xml = [];
        for (let c = 0; c < colCount; c++) {
          xml.push(cellXml(cells[c] || "", colLetter(c) + (r + 1), styleId));
        }
        return `<row r="${r + 1}">${xml.join("")}</row>`;
      })
      .join("");

    const freeze = hasHeader
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : "";

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      freeze +
      `<cols>${cols}</cols>` +
      `<sheetData>${rows}</sheetData>` +
      "</worksheet>"
    );
  }

  const STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    "</styleSheet>";

  /**
   * @param {{blocks?: any[]}} ir
   * @returns {Blob} a real .xlsx workbook
   */
  function convert(ir) {
    // Pair each table with the nearest preceding heading for its sheet name.
    // A heading names only the FIRST table after it; further tables in the
    // same section fall back to "Table N" instead of "Heading (2)".
    const sheets = [];
    let lastHeading = "";
    for (const b of (ir && ir.blocks) || []) {
      if (!b) continue;
      if (b.type === "heading") lastHeading = runsToText(b.runs);
      else if (b.type === "table") {
        sheets.push({ table: b, heading: lastHeading });
        lastHeading = "";
      }
    }

    const used = new Set();
    const parts = sheets.map(({ table, heading }, i) => {
      const matrix = [];
      if (table.header) matrix.push(table.header.map(runsToText));
      for (const row of table.rows || []) matrix.push((row || []).map(runsToText));
      if (!matrix.length) matrix.push([""]);
      return {
        name: sheetName(heading, i, used),
        xml: sheetXml(matrix, !!table.header),
      };
    });

    if (!parts.length) {
      // Mirrors the CSV exporter's empty-report behavior: a valid file that
      // says why it is empty instead of a silent zero-sheet workbook.
      parts.push({
        name: "Report",
        xml: sheetXml([["(No tables found in this report)"]], false),
      });
    }

    const sheetTags = parts
      .map((p, i) => `<sheet name="${xmlEscape(p.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("");
    const workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${sheetTags}</sheets>` +
      "</workbook>";

    const rels = parts
      .map((p, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("") +
      `<Relationship Id="rId${parts.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    const workbookRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      parts
        .map((_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("") +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>";

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>";

    const entries = [
      { name: "[Content_Types].xml", data: contentTypes },
      { name: "_rels/.rels", data: rootRels },
      { name: "xl/workbook.xml", data: workbook },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
      { name: "xl/styles.xml", data: STYLES_XML },
      ...parts.map((p, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: p.xml })),
    ];

    return new Blob([GEP.zip.build(entries)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  GEP.xlsx = { convert };
})();
