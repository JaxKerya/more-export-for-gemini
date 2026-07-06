/**
 * Plain-text exporter: intermediate representation -> readable .txt.
 *
 * Produces lightly structured text (underlined headings, bullet/number markers,
 * aligned-ish tables) without any markup noise.
 * Includes optional TOC and footnote rendering.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function runsToText(runs, includeFootnotes) {
    return (runs || [])
      .map((r) => {
        if (r.footnoteIndex) return includeFootnotes ? `[${r.footnoteIndex}]` : "";
        if (r.math) return r.math.tex || "";
        return r.text;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  function headingToText(block, includeFootnotes) {
    const text = runsToText(block.runs, includeFootnotes);
    if (block.level === 1) return `${text}\n${"=".repeat(Math.min(text.length, 80))}`;
    if (block.level === 2) return `${text}\n${"-".repeat(Math.min(text.length, 80))}`;
    return text;
  }

  function listToText(block, includeFootnotes) {
    const counters = {};
    return block.items
      .map((item) => {
        const level = item.level || 0;
        const indent = "  ".repeat(level);
        const ordered = item.ordered ?? block.ordered;
        let marker;
        if (ordered) {
          counters[level] = (counters[level] || 0) + 1;
          marker = `${counters[level]}.`;
        } else {
          marker = "•";
        }
        Object.keys(counters).forEach((k) => {
          if (Number(k) > level) delete counters[k];
        });
        return `${indent}${marker} ${runsToText(item.runs, includeFootnotes)}`;
      })
      .join("\n");
  }

  function tableToText(block, includeFootnotes) {
    const rows = [];
    if (block.header) rows.push(block.header.map((c) => runsToText(c, includeFootnotes)));
    block.rows.forEach((row) => rows.push(row.map((c) => runsToText(c, includeFootnotes))));
    if (!rows.length) return "";

    const colCount = Math.max(...rows.map((r) => r.length));
    const widths = new Array(colCount).fill(0);
    rows.forEach((row) => {
      row.forEach((cell, i) => {
        widths[i] = Math.max(widths[i], cell.length);
      });
    });

    const renderRow = (row) =>
      row.map((cell, i) => cell.padEnd(widths[i])).join("  |  ").trimEnd();

    const lines = [];
    if (block.header) {
      lines.push(renderRow(rows[0]));
      lines.push(widths.map((w) => "-".repeat(w)).join("--+--"));
      rows.slice(1).forEach((r) => lines.push(renderRow(r)));
    } else {
      rows.forEach((r) => lines.push(renderRow(r)));
    }
    return lines.join("\n");
  }

  function buildTocText(ir) {
    if (!GEP.toc) return "";
    const toc = GEP.toc.generate(ir);
    if (!toc.items.length) return "";

    const lines = ["Table of Contents", "-".repeat(17), ""];
    toc.items.forEach((item) => {
      const indent = "  ".repeat(Math.max(0, item.level - 1));
      lines.push(`${indent}• ${item.text}`);
    });
    return lines.join("\n");
  }

  function buildFootnotesText(ir, citationStyle) {
    if (!ir.footnotes || !ir.footnotes.length) return "";
    const style = citationStyle || "numbered";
    const lines = ["\n" + "\u2014".repeat(40), "Sources", "\u2014".repeat(40)];
    ir.footnotes.forEach((fn) => {
      lines.push(GEP.citation.format(fn, style).plain);
    });
    return lines.join("\n");
  }

  function convert(ir, opts) {
    const o = opts || {};
    const includeToc = o.includeToc || false;
    const includeFootnotes = o.includeFootnotes !== undefined ? o.includeFootnotes : true;

    const out = [];
    if (ir.title) out.push(`${ir.title}\n${"=".repeat(Math.min(ir.title.length, 80))}`);

    if (includeToc) {
      const toc = buildTocText(ir);
      if (toc) out.push(toc);
    }

    ir.blocks.forEach((block) => {
      switch (block.type) {
        case "heading": {
          const headingText = (block.runs || []).map((r) => r.text || "").join("").trim();
          if (ir.title && block.level === 1 && headingText === ir.title) break;
          out.push(headingToText(block, includeFootnotes));
          break;
        }
        case "paragraph":
          out.push(runsToText(block.runs, includeFootnotes));
          break;
        case "blockquote":
          out.push(
            runsToText(block.runs, includeFootnotes)
              .split("\n")
              .map((l) => `    ${l}`)
              .join("\n")
          );
          break;
        case "code":
          out.push(block.text);
          break;
        case "math":
          out.push(block.tex || "");
          break;
        case "list":
          out.push(listToText(block, includeFootnotes));
          break;
        case "table":
          out.push(tableToText(block, includeFootnotes));
          break;
        case "image":
          out.push(`[Image: ${block.alt || block.src}]`);
          break;
        case "hr":
          out.push("\u2014".repeat(40));
          break;
      }
    });

    if (includeFootnotes) {
      const fnBlock = buildFootnotesText(ir, o.citationStyle);
      if (fnBlock) out.push(fnBlock);
    }

    return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim().replace(/\n/g, "\r\n") + "\r\n";
  }

  GEP.txt = { convert };
})();
