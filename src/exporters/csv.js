/**
 * CSV exporter: extracts only tables from the IR and exports as CSV.
 *
 * Multiple tables are separated by a blank line with a "--- Table N ---" marker.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function runsToText(runs) {
    return (runs || []).map((r) => (r.math ? r.math.tex || "" : r.text)).join("").trim();
  }

  function escapeCell(text) {
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function convert(ir) {
    const tables = ir.blocks.filter((b) => b.type === "table");
    if (!tables.length) return "(No tables found in this report)\n";

    let maxCols = 0;
    tables.forEach((table) => {
      if (table.header) maxCols = Math.max(maxCols, table.header.length);
      table.rows.forEach((r) => { maxCols = Math.max(maxCols, r.length); });
    });
    if (maxCols === 0) maxCols = 1;

    function padRow(cells) {
      const row = cells.slice();
      while (row.length < maxCols) row.push("");
      return row.map(escapeCell).join(",");
    }

    const allRows = [];
    tables.forEach((table, idx) => {
      if (tables.length > 1) {
        const marker = [`[Table ${idx + 1}]`];
        allRows.push(padRow(marker));
      }
      if (table.header) allRows.push(padRow(table.header.map(runsToText)));
      table.rows.forEach((r) => allRows.push(padRow(r.map(runsToText))));
    });

    return allRows.join("\n") + "\n";
  }

  GEP.csv = { convert };
})();
