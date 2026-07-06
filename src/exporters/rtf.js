/**
 * RTF exporter: intermediate representation -> .rtf (Rich Text Format).
 *
 * RTF is a universal rich-text container that pastes/opens cleanly into Word,
 * Pages, TextEdit, WordPad, LibreOffice and most email clients. Output is pure
 * ASCII: every non-ASCII character is emitted as a \uN? escape so the file is
 * safe regardless of the reader's code page.
 *
 * Reference: RTF 1.9.1 specification.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  const BODY_FS = 24; // 12pt (half-points)

  /** Escape arbitrary text for RTF body content. */
  function esc(text) {
    let out = "";
    for (const ch of String(text == null ? "" : text)) {
      const code = ch.codePointAt(0);
      if (ch === "\\") { out += "\\\\"; continue; }
      if (ch === "{") { out += "\\{"; continue; }
      if (ch === "}") { out += "\\}"; continue; }
      if (ch === "\n") { out += "\\line "; continue; }
      if (ch === "\t") { out += "\\tab "; continue; }
      if (code < 128) { out += ch; continue; }
      if (code > 0xffff) {
        // Astral plane: emit the UTF-16 surrogate pair.
        const c = code - 0x10000;
        const hi = 0xd800 + (c >> 10);
        const lo = 0xdc00 + (c & 0x3ff);
        out += `\\u${hi}?\\u${lo}?`;
      } else {
        // RTF \uN takes a signed 16-bit value.
        const signed = code > 32767 ? code - 65536 : code;
        out += `\\u${signed}?`;
      }
    }
    return out;
  }

  /** Escape a URL for use inside a HYPERLINK field instruction. */
  function urlEsc(url) {
    return String(url == null ? "" : url)
      .replace(/\\/g, "\\\\")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}")
      .replace(/"/g, "\\\"");
  }

  /** Render math TeX to readable Unicode (RTF has no native math layer). */
  function mathText(tex) {
    if (GEP.texmath && GEP.texmath.toUnicode) return GEP.texmath.toUnicode(tex || "");
    return tex || "";
  }

  function hyperlink(target, innerRtf) {
    return (
      `{\\field{\\*\\fldinst{HYPERLINK "${urlEsc(target)}"}}` +
      `{\\fldrslt{\\ul\\cf1 ${innerRtf}}}}`
    );
  }

  function runToRtf(run, includeFootnotes) {
    if (!run) return "";
    if (run.image) {
      return run.image.alt ? `{\\i ${esc("[Image: " + run.image.alt + "]")}}` : "";
    }
    if (run.math) {
      return esc(mathText(run.math.tex || ""));
    }
    if (run.footnoteIndex) {
      if (!includeFootnotes) return "";
      return `{\\super ${esc("[" + run.footnoteIndex + "]")}}`;
    }
    if (run.text === "\n") return "\\line ";

    let inner = esc(run.text || "");
    if (run.code) {
      inner = `{\\f1 ${inner}}`;
    } else {
      let prefix = "";
      let suffix = "";
      if (run.bold) { prefix += "\\b "; suffix = "\\b0 " + suffix; }
      if (run.italic) { prefix += "\\i "; suffix = "\\i0 " + suffix; }
      if (prefix) inner = `${prefix}${inner}${suffix}`;
    }
    if (run.href) inner = hyperlink(run.href, inner);
    return inner;
  }

  function runsToRtf(runs, includeFootnotes) {
    return (runs || []).map((r) => runToRtf(r, includeFootnotes)).join("");
  }

  function para(content, extra) {
    return `\\pard\\sa180${extra || ""} ${content}\\par`;
  }

  function hr() {
    return "\\pard\\brdrb\\brdrs\\brdrw10\\brsp20\\sa120\\par\\pard";
  }

  const HEADING_FS = { 1: 40, 2: 34, 3: 28, 4: 26, 5: 24, 6: 24 };

  function headingToRtf(block, includeFootnotes) {
    const level = Math.min(Math.max(block.level || 1, 1), 6);
    const fs = HEADING_FS[level] || BODY_FS;
    return (
      `\\pard\\sb240\\sa120\\keepn\\b\\fs${fs} ` +
      `${runsToRtf(block.runs, includeFootnotes)}\\b0\\fs${BODY_FS}\\par`
    );
  }

  function listToRtf(block, includeFootnotes) {
    const lines = [];
    const counters = {};
    (block.items || []).forEach((item) => {
      const level = item.level || 0;
      const ordered = item.ordered ?? block.ordered;
      let marker;
      if (ordered) {
        counters[level] = (counters[level] || 0) + 1;
        marker = `${counters[level]}.`;
      } else {
        marker = "\u2022";
      }
      Object.keys(counters).forEach((k) => {
        if (Number(k) > level) delete counters[k];
      });
      const li = 360 * (level + 1);
      lines.push(
        `\\pard\\fi-360\\li${li}\\sa60 ${esc(marker)}\\tab ` +
        `${runsToRtf(item.runs, includeFootnotes)}\\par`
      );
    });
    return lines.join("\n");
  }

  function tableToRtf(block, includeFootnotes) {
    const headerSrc = block.header || (block.rows.length ? block.rows[0] : []);
    const body = block.header ? block.rows : block.rows.slice(1);
    const colCount = Math.max(headerSrc.length, ...body.map((r) => r.length), 1);
    const totalW = 9360;
    const cellW = Math.floor(totalW / colCount);

    function row(cells, bold) {
      let head = "\\trowd\\trgaph108\\trleft0";
      for (let i = 0; i < colCount; i++) head += `\\cellx${cellW * (i + 1)}`;
      let cellsStr = "";
      for (let i = 0; i < colCount; i++) {
        const c = cells && cells[i] ? runsToRtf(cells[i], includeFootnotes) : "";
        cellsStr +=
          `\\pard\\intbl ${bold ? "\\b " : ""}${c}${bold ? "\\b0" : ""}\\cell `;
      }
      return head + cellsStr + "\\row";
    }

    const out = [row(headerSrc, true)];
    body.forEach((r) => out.push(row(r, false)));
    return out.join("\n") + "\n\\pard\\sa180\\par";
  }

  function codeToRtf(block) {
    const lines = String(block.text || "").split("\n").map(esc).join("\\line ");
    return `\\pard\\f1\\fs20\\li360\\sa120 ${lines}\\par\\f0\\fs${BODY_FS}`;
  }

  function buildTocRtf(ir) {
    if (!GEP.toc) return [];
    const toc = GEP.toc.generate(ir);
    if (!toc.items.length) return [];
    const out = [
      `\\pard\\sb120\\sa120\\b\\fs28 ${esc("Table of Contents")}\\b0\\fs${BODY_FS}\\par`,
    ];
    toc.items.forEach((item) => {
      const indent = 360 * Math.max(0, item.level - 1);
      out.push(`\\pard\\li${indent}\\sa40 ${esc(item.text)}\\par`);
    });
    return out;
  }

  function buildFootnotesRtf(ir, style) {
    if (!ir.footnotes || !ir.footnotes.length) return [];
    const out = [
      hr(),
      `\\pard\\sb120\\sa120\\b\\fs28 ${esc("Sources")}\\b0\\fs${BODY_FS}\\par`,
    ];
    ir.footnotes.forEach((fn) => {
      const cite = GEP.citation.format(fn, style || "numbered");
      const num = `${fn.index}. `;
      let content;
      if (cite.url) {
        const linkText = esc(cite.label || cite.url);
        content = `${esc(num)}${hyperlink(cite.url, linkText)}`;
      } else {
        content = esc(num + (cite.plain || cite.label || ""));
      }
      out.push(`\\pard\\fi-360\\li360\\sa60 ${content}\\par`);
    });
    return out;
  }

  /**
   * @param {object} ir
   * @param {{ includeToc?: boolean, includeFootnotes?: boolean, citationStyle?: string }} [opts]
   */
  function convert(ir, opts) {
    const o = opts || {};
    const includeToc = o.includeToc !== undefined ? o.includeToc : false;
    const includeFootnotes = o.includeFootnotes !== undefined ? o.includeFootnotes : true;
    const meta = GEP.docmeta ? GEP.docmeta.normalize(o) : { has: false, keywords: [] };
    const suppressMeta = !!o.suppressMeta;

    const body = [];

    if (ir.title) {
      body.push(`\\pard\\sa240\\b\\fs48 ${esc(ir.title)}\\b0\\fs${BODY_FS}\\par`);
    }

    if (!suppressMeta && meta.has) {
      const by = GEP.docmeta ? GEP.docmeta.byline(meta) : meta.author;
      if (by) body.push(para(`\\i ${esc(by)}\\i0`));
      if (meta.abstract) {
        body.push(para(`\\b ${esc("Abstract. ")}\\b0 ${esc(meta.abstract)}`, "\\li360"));
      }
      if (meta.keywords && meta.keywords.length) {
        body.push(para(`\\b ${esc("Keywords: ")}\\b0 ${esc(meta.keywords.join(", "))}`));
      }
    }

    if (includeToc) buildTocRtf(ir).forEach((l) => body.push(l));

    (ir.blocks || []).forEach((block) => {
      switch (block.type) {
        case "heading": {
          const headingText = (block.runs || []).map((r) => r.text || "").join("").trim();
          if (ir.title && block.level === 1 && headingText === ir.title) break;
          body.push(headingToRtf(block, includeFootnotes));
          break;
        }
        case "paragraph":
          body.push(para(runsToRtf(block.runs, includeFootnotes)));
          break;
        case "blockquote":
          body.push(`\\pard\\li720\\sa180\\i ${runsToRtf(block.runs, includeFootnotes)}\\i0\\par`);
          break;
        case "code":
          body.push(codeToRtf(block));
          break;
        case "math":
          body.push(`\\pard\\qc\\sa120 ${esc(mathText(block.tex || ""))}\\par`);
          break;
        case "list":
          body.push(listToRtf(block, includeFootnotes));
          break;
        case "table":
          body.push(tableToRtf(block, includeFootnotes));
          break;
        case "image":
          if (block.alt) body.push(para(`\\i ${esc("[Image: " + block.alt + "]")}\\i0`));
          break;
        case "hr":
          body.push(hr());
          break;
      }
    });

    if (includeFootnotes) buildFootnotesRtf(ir, o.citationStyle).forEach((l) => body.push(l));

    const header =
      "{\\rtf1\\ansi\\ansicpg1252\\deff0\n" +
      "{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}" +
      "{\\f1\\fmodern\\fcharset0 Consolas;}" +
      "{\\f2\\fswiss\\fcharset0 Arial;}}\n" +
      "{\\colortbl;\\red0\\green0\\blue238;}\n" +
      `\\f0\\fs${BODY_FS}\n`;

    return header + body.join("\n") + "\n}\n";
  }

  GEP.rtf = { convert };
})();
