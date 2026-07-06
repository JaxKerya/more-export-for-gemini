/**
 * DOCX exporter: intermediate representation -> a real .docx (OOXML) package.
 *
 * Builds the minimal set of WordprocessingML parts and zips them with the
 * dependency-free ZIP writer (GEP.zip). UTF-8 throughout, so Turkish glyphs
 * (ş, ğ, ı, İ, ç, ö, ü) render correctly.
 *
 * Now includes optional TOC and footnote support.
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

  // A styled run, splitting on newlines into <w:br/> breaks.
  function runXml(run, includeFootnotes) {
    if (run.image) {
      return (
        '<w:r><w:rPr><w:i/><w:color w:val="5F6368"/></w:rPr>' +
        `<w:t xml:space="preserve">[Image: ${xmlEscape(run.image.alt || run.image.src)}]</w:t></w:r>`
      );
    }
    if (run.footnoteIndex) {
      if (!includeFootnotes) return "";
      return (
        '<w:r><w:rPr><w:vertAlign w:val="superscript"/><w:color w:val="1A73E8"/>' +
        `<w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">[${run.footnoteIndex}]</w:t></w:r>`
      );
    }
    if (run.math) {
      // Render real Word math (OMML) from the LaTeX source; fall back to the
      // raw source as italic text if the converter is unavailable.
      if (GEP.texmath && run.math.tex) return GEP.texmath.toOMML(run.math.tex);
      return (
        '<w:r><w:rPr><w:i/></w:rPr>' +
        `<w:t xml:space="preserve">${xmlEscape(run.math.tex || "")}</w:t></w:r>`
      );
    }

    const props = [];
    if (run.bold) props.push("<w:b/>");
    if (run.italic) props.push("<w:i/>");
    if (run.href || run.code) {
      if (run.href) props.push('<w:color w:val="1A73E8"/><w:u w:val="single"/>');
      if (run.code) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
    }
    const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";

    const segments = run.text.split("\n");
    const text = segments
      .map((seg, i) => {
        const t = `<w:t xml:space="preserve">${xmlEscape(seg)}</w:t>`;
        return i < segments.length - 1 ? `${t}<w:br/>` : t;
      })
      .join("");
    return `<w:r>${rPr}${text}</w:r>`;
  }

  function runsXml(runs, includeFootnotes) {
    return (runs || []).map((r) => runXml(r, includeFootnotes)).join("");
  }

  function paragraphXml(runs, styleId, extraPPr = "", includeFootnotes = true) {
    const style = styleId ? `<w:pStyle w:val="${styleId}"/>` : "";
    const pPr = style || extraPPr ? `<w:pPr>${style}${extraPPr}</w:pPr>` : "";
    return `<w:p>${pPr}${runsXml(runs, includeFootnotes)}</w:p>`;
  }

  function listXml(block, includeFootnotes) {
    const counters = {};
    return block.items
      .map((item) => {
        const level = item.level || 0;
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
        const indent = `<w:ind w:left="${(level + 1) * 480}" w:hanging="240"/>`;
        const runs = [{ text: `${marker}\t` }, ...item.runs];
        return paragraphXml(runs, null, indent, includeFootnotes);
      })
      .join("");
  }

  const CELL_BORDER =
    '<w:tcBorders>' +
    '<w:top w:val="single" w:sz="4" w:color="CCCCCC"/>' +
    '<w:left w:val="single" w:sz="4" w:color="CCCCCC"/>' +
    '<w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/>' +
    '<w:right w:val="single" w:sz="4" w:color="CCCCCC"/>' +
    '</w:tcBorders>';

  function cellXml(runs, header, includeFootnotes) {
    const runsCopy = header ? (runs || []).map((r) => ({ ...r, bold: true })) : runs;
    return (
      `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${CELL_BORDER}` +
      (header ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F3F4"/>' : "") +
      `</w:tcPr>${paragraphXml(runsCopy, null, "", includeFootnotes)}</w:tc>`
    );
  }

  function rowXml(cells, header, includeFootnotes) {
    return `<w:tr>${cells.map((c) => cellXml(c, header, includeFootnotes)).join("")}</w:tr>`;
  }

  function tableXml(block, includeFootnotes, rtl) {
    const rows = [];
    if (block.header) rows.push(rowXml(block.header, true, includeFootnotes));
    block.rows.forEach((r) => rows.push(rowXml(r, false, includeFootnotes)));
    return (
      // bidiVisual must precede tblW per the OOXML CT_TblPrBase sequence; it
      // mirrors column order so RTL tables read right-to-left.
      '<w:tbl><w:tblPr>' + (rtl ? '<w:bidiVisual/>' : "") + '<w:tblW w:w="0" w:type="auto"/>' +
      '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:left w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:right w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '</w:tblBorders></w:tblPr>' +
      rows.join("") +
      "</w:tbl>"
    );
  }

  function buildTocXml(ir) {
    if (!GEP.toc) return "";
    const toc = GEP.toc.generate(ir);
    if (!toc.items.length) return "";

    let xml = paragraphXml([{ text: "Table of Contents", bold: true }], "Heading1");
    toc.items.forEach((item) => {
      const indent = `<w:ind w:left="${item.level * 360}"/>`;
      xml += paragraphXml([{ text: item.text }], null, indent);
    });
    xml += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>';
    return xml;
  }

  function buildFootnotesXml(ir, citationStyle) {
    if (!ir.footnotes || !ir.footnotes.length) return "";
    const style = citationStyle || "numbered";
    let xml = '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>';
    xml += paragraphXml([{ text: "Sources", bold: true }], "Heading2");
    ir.footnotes.forEach((fn) => {
      const cite = GEP.citation.format(fn, style);
      if (fn.url) {
        xml += paragraphXml(
          [{ text: `[${fn.index}] ${cite.label} \u2014 ` }, { text: cite.url, href: cite.url }],
          null,
          '<w:ind w:left="240"/>'
        );
      } else {
        xml += paragraphXml(
          [{ text: cite.plain }],
          null,
          '<w:ind w:left="240"/>'
        );
      }
    });
    return xml;
  }

  function bodyXml(ir, opts) {
    const o = opts || {};
    const includeToc = o.includeToc || false;
    const includeFootnotes = o.includeFootnotes !== undefined ? o.includeFootnotes : true;

    const meta = GEP.docmeta ? GEP.docmeta.normalize(o) : { has: false, keywords: [] };

    const parts = [];
    if (ir.title) parts.push(paragraphXml([{ text: ir.title, bold: true }], "Title"));

    if (meta.has) {
      const byline = GEP.docmeta ? GEP.docmeta.byline(meta) : meta.author;
      if (byline) parts.push(paragraphXml([{ text: byline, italic: true }], null, '<w:spacing w:after="120"/>'));
      if (meta.abstract) {
        parts.push(paragraphXml([{ text: "Abstract", bold: true }], "Heading2"));
        parts.push(paragraphXml([{ text: meta.abstract }], "Quote", '<w:ind w:left="480"/>'));
      }
      if (meta.keywords.length) {
        parts.push(paragraphXml([{ text: "Keywords: ", bold: true }, { text: meta.keywords.join(", ") }]));
      }
    }

    if (includeToc) {
      const toc = buildTocXml(ir);
      if (toc) parts.push(toc);
    }

    ir.blocks.forEach((block) => {
      switch (block.type) {
        case "heading": {
          const headingText = (block.runs || []).map((r) => r.text || "").join("").trim();
          if (ir.title && block.level === 1 && headingText === ir.title) break;
          parts.push(paragraphXml(block.runs, `Heading${Math.min(block.level, 6)}`, "", includeFootnotes));
          break;
        }
        case "paragraph":
          parts.push(paragraphXml(block.runs, null, "", includeFootnotes));
          break;
        case "blockquote":
          parts.push(paragraphXml(block.runs, "Quote", '<w:ind w:left="480"/>', includeFootnotes));
          break;
        case "code":
          block.text.split("\n").forEach((line) =>
            parts.push(
              paragraphXml(
                [{ text: line || " ", code: true }],
                null,
                '<w:shd w:val="clear" w:color="auto" w:fill="F1F3F4"/>',
                includeFootnotes
              )
            )
          );
          break;
        case "math":
          parts.push(
            paragraphXml([{ math: { tex: block.tex || "", display: true } }], null, '<w:jc w:val="center"/>')
          );
          break;
        case "list":
          parts.push(listXml(block, includeFootnotes));
          break;
        case "table":
          parts.push(tableXml(block, includeFootnotes, ir.dir === "rtl"));
          parts.push("<w:p/>"); // spacer after table
          break;
        case "image":
          parts.push(
            paragraphXml(
              [{ text: `[Image: ${xmlEscape(block.alt || block.src)}]`, italic: true }],
              null,
              '<w:jc w:val="center"/>'
            )
          );
          break;
        case "hr":
          parts.push(
            '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>'
          );
          break;
      }
    });

    if (includeFootnotes) {
      const fn = buildFootnotesXml(ir, o.citationStyle);
      if (fn) parts.push(fn);
    }

    return parts.join("");
  }

  /**
   * Resolve page/typography layout (#3) into DOCX units. Defaults reproduce the
   * historical hardcoded values (A4, ~20mm margins, 11pt Calibri, 1.15 spacing).
   * Twips: 1440/inch; half-points for font size; w:line auto (240 = single).
   */
  function resolveDocxLayout(opts) {
    const l = (opts && opts.layout) || {};
    const letter = l.paper === "letter";
    const MARGINS = { narrow: 720, normal: 1134, wide: 1440 };
    const LINE = { normal: 276, onehalf: 360, double: 480 };
    return {
      pgW: letter ? 12240 : 11906,
      pgH: letter ? 15840 : 16838,
      margin: MARGINS[l.margins] || MARGINS.normal,
      fontHalf: ([10, 12].includes(Number(l.fontSize)) ? Number(l.fontSize) : 11) * 2,
      line: LINE[l.lineSpacing] || LINE.normal,
      font: l.fontFamily === "serif" ? "Cambria" : "Calibri",
    };
  }

  const DOCUMENT_XML = (body, opts) => {
    const L = resolveDocxLayout(opts);
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' +
      `<w:body>${body}` +
      `<w:sectPr><w:pgSz w:w="${L.pgW}" w:h="${L.pgH}"/>` +
      `<w:pgMar w:top="${L.margin}" w:right="${L.margin}" w:bottom="${L.margin}" w:left="${L.margin}" w:header="720" w:footer="720" w:gutter="0"/>` +
      "</w:sectPr></w:body></w:document>"
    );
  };

  /**
   * Builds styles.xml. When the report's base direction is RTL we flip the
   * document defaults to bidi/rtl so Arabic/Hebrew/Persian/Urdu reports open
   * right-to-left and right-aligned in Word (mixed content isn't perfect, but
   * the document reads correctly).
   * @param {object} ir
   */
  function stylesXml(ir, opts) {
    const rtl = ir && ir.dir === "rtl";
    const L = resolveDocxLayout(opts);
    const bidiPPr = rtl ? "<w:bidi/><w:jc w:val=\"right\"/>" : "";
    const rtlRPr = rtl ? "<w:rtl/>" : "";
    const pPrDefault =
      `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="${L.line}" w:lineRule="auto"/>${bidiPPr}</w:pPr></w:pPrDefault>`;
    const rPrDefault =
      `<w:rPrDefault><w:rPr><w:rFonts w:ascii="${L.font}" w:hAnsi="${L.font}"/><w:sz w:val="${L.fontHalf}"/>${rtlRPr}</w:rPr></w:rPrDefault>`;
    const heading = (id, name, size, color) =>
      `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
      '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
      `<w:pPr><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr>` +
      `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:docDefaults>${rPrDefault}${pPrDefault}</w:docDefaults>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="202124"/><w:sz w:val="48"/></w:rPr></w:style>' +
      heading("Heading1", "heading 1", 36, "202124") +
      heading("Heading2", "heading 2", 30, "202124") +
      heading("Heading3", "heading 3", 26, "3C4043") +
      heading("Heading4", "heading 4", 24, "3C4043") +
      heading("Heading5", "heading 5", 22, "5F6368") +
      heading("Heading6", "heading 6", 22, "5F6368") +
      '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
      '<w:rPr><w:i/><w:color w:val="5F6368"/></w:rPr></w:style>' +
      "</w:styles>"
    );
  }

  const CONTENT_TYPES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>";

  const ROOT_RELS_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>";

  function coreXml(ir, meta) {
    const m = meta || { keywords: [] };
    let props = `<dc:title>${xmlEscape(ir.title || "Gemini Deep Research")}</dc:title>`;
    if (m.author) props += `<dc:creator>${xmlEscape(m.author)}</dc:creator>`;
    if (m.keywords && m.keywords.length) props += `<cp:keywords>${xmlEscape(m.keywords.join(", "))}</cp:keywords>`;
    if (m.abstract) props += `<dc:description>${xmlEscape(m.abstract)}</dc:description>`;
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      props +
      "</cp:coreProperties>"
    );
  }

  const DOC_RELS_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";

  /** @returns {Blob} a Word-openable .docx */
  function convert(ir, opts) {
    const meta = GEP.docmeta ? GEP.docmeta.normalize(opts) : null;
    const entries = [
      { name: "[Content_Types].xml", data: CONTENT_TYPES_XML },
      { name: "_rels/.rels", data: ROOT_RELS_XML },
      { name: "docProps/core.xml", data: coreXml(ir, meta) },
      { name: "word/_rels/document.xml.rels", data: DOC_RELS_XML },
      { name: "word/styles.xml", data: stylesXml(ir, opts) },
      { name: "word/document.xml", data: DOCUMENT_XML(bodyXml(ir, opts), opts) },
    ];
    return GEP.zip.build(entries);
  }

  GEP.docx = { convert };
})();
