/**
 * EPUB 3 exporter: intermediate representation -> .epub package.
 *
 * An EPUB file is a ZIP archive containing XHTML content, CSS styles, and
 * metadata files. This exporter reuses the HTML builder from the PDF module
 * and the dependency-free ZIP writer.
 *
 * Structure:
 *   mimetype                    (uncompressed, first entry)
 *   META-INF/container.xml      (points to content.opf)
 *   OEBPS/content.opf           (package metadata + manifest + spine)
 *   OEBPS/toc.xhtml             (navigation document)
 *   OEBPS/chapter.xhtml         (report content)
 *   OEBPS/style.css             (e-reader styles)
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  const MIMETYPE = "application/epub+zip";

  const CONTAINER_XML =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
    '</container>';

  const STYLE_CSS = `
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #1a1a1a;
      line-height: 1.7;
      margin: 1em;
      max-width: 40em;
    }
    h1 { font-size: 1.8em; margin: 0.5em 0; color: #111; }
    .doc-byline { color: #555; font-style: italic; margin: 0 0 1em; }
    .abstract { margin: 0 0 1.2em; padding: 0.6em 1em; background: #f5f5f5; border-radius: 6px; }
    .abstract h2 { font-size: 1.1em; margin: 0 0 0.3em; border: none; }
    .abstract p { margin: 0; }
    .doc-keywords { font-size: 0.9em; color: #444; margin: 0 0 1.2em; }
    h2 { font-size: 1.4em; margin: 1em 0 0.5em; color: #222; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 1.2em; margin: 0.8em 0 0.4em; color: #333; }
    h4, h5, h6 { font-size: 1em; margin: 0.6em 0 0.3em; color: #444; }
    p { margin: 0 0 0.8em; text-align: justify; }
    a { color: #1565c0; }
    ul, ol { margin: 0 0 0.8em; padding-inline-start: 1.5em; }
    li { margin: 0.2em 0; }
    blockquote { margin: 0 0 0.8em; padding: 0.5em 1em; border-inline-start: 3px solid #ccc; color: #555; font-style: italic; }
    code { font-family: Consolas, monospace; background: #f5f5f5; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 1em; font-size: 0.9em; }
    th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; text-align: start; }
    th { background: #f0f0f0; font-weight: bold; }
    hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
    .math-display { text-align: center; margin: 1em 0; overflow-x: auto; }
    figure { margin: 1em 0; text-align: center; }
    figcaption { font-size: 0.85em; color: #666; margin-top: 0.3em; }
    .toc { margin: 1em 0 2em; }
    .toc h2 { border: none; }
    .toc ul { list-style: none; padding-inline-start: 1em; }
    .toc a { text-decoration: none; }
    .fn-ref { font-size: 0.75em; vertical-align: super; }
    .footnotes { margin-top: 2em; padding-top: 1em; border-top: 1px solid #ccc; font-size: 0.85em; color: #555; }
    .fn-back { color: #1565c0; text-decoration: none; margin-inline-start: 4px; }
  `;

  function xmlEscape(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** BCP-47 language tag for the IR, defaulting to "en" when undetected. */
  function epubLang(ir) {
    const lang = ir && typeof ir.lang === "string" ? ir.lang.trim() : "";
    return lang || "en";
  }

  /** Base text direction for the IR ("rtl"|"ltr", default "ltr"). */
  function epubDir(ir) {
    return ir && ir.dir === "rtl" ? "rtl" : "ltr";
  }

  /** Builds the `xml:lang lang dir` attribute string for an XHTML root. */
  function xhtmlLangDirAttrs(ir) {
    const lang = epubLang(ir);
    return ` xml:lang="${xmlEscape(lang)}" lang="${xmlEscape(lang)}" dir="${epubDir(ir)}"`;
  }

  function buildContentOpf(ir, meta, chapterProps) {
    const safeTitle = xmlEscape((ir && ir.title) || "Gemini Deep Research");
    const date = new Date().toISOString().split("T")[0];
    const uid = `gemini-dr-${date}-${Math.random().toString(36).slice(2, 8)}`;
    const m = meta || { keywords: [] };
    let metaExtra = "";
    if (m.author) metaExtra += `<dc:creator>${xmlEscape(m.author)}</dc:creator>`;
    if (m.abstract) metaExtra += `<dc:description>${xmlEscape(m.abstract)}</dc:description>`;
    if (m.affiliation) metaExtra += `<dc:publisher>${xmlEscape(m.affiliation)}</dc:publisher>`;
    (m.keywords || []).forEach((k) => {
      metaExtra += `<dc:subject>${xmlEscape(k)}</dc:subject>`;
    });
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      `<dc:identifier id="uid">${uid}</dc:identifier>` +
      `<dc:title>${safeTitle}</dc:title>` +
      `<dc:language>${xmlEscape(epubLang(ir))}</dc:language>` +
      metaExtra +
      `<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z/, "Z")}</meta>` +
      '</metadata>' +
      '<manifest>' +
      `<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"${chapterProps ? ` properties="${chapterProps}"` : ""}/>` +
      '<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      '<item id="style" href="style.css" media-type="text/css"/>' +
      '</manifest>' +
      '<spine><itemref idref="chapter"/></spine>' +
      '</package>'
    );
  }

  function buildTocXhtml(ir) {
    const toc = GEP.toc ? GEP.toc.generate(ir) : { items: [] };
    const safeTitle = xmlEscape(ir.title || "Gemini Deep Research");

    let navItems = "";
    if (toc.items.length) {
      navItems = '<ol>';
      toc.items.forEach((item) => {
        navItems += `<li><a href="chapter.xhtml#${item.id}">${xmlEscape(item.text)}</a></li>`;
      });
      navItems += '</ol>';
    } else {
      navItems = `<ol><li><a href="chapter.xhtml">${safeTitle}</a></li></ol>`;
    }

    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<!DOCTYPE html>' +
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${xhtmlLangDirAttrs(ir)}>` +
      `<head><meta charset="utf-8"/><title>Table of Contents</title>` +
      '<link rel="stylesheet" href="style.css"/></head>' +
      `<body dir="${epubDir(ir)}">` +
      `<nav epub:type="toc"><h1>Table of Contents</h1>${navItems}</nav>` +
      '</body></html>'
    );
  }

  // XHTML only predeclares the five XML entities. Any other named entity
  // (notably &nbsp;, which Gemini's rendered KaTeX HTML emits) is undeclared
  // and makes EPUBCheck reject the whole file with a fatal parse error — which
  // in turn cascades into "fragment identifier not defined" for every TOC link.
  // Map the common named entities to numeric references so the XML stays valid.
  const NAMED_ENTITIES = {
    nbsp: 160, ensp: 8194, emsp: 8195, thinsp: 8201, hairsp: 8202,
    zwnj: 8204, zwj: 8205, shy: 173, ndash: 8211, mdash: 8212,
    hellip: 8230, lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221,
    sbquo: 8218, bdquo: 8222, copy: 169, reg: 174, trade: 8482, deg: 176,
    times: 215, divide: 247, middot: 183, bull: 8226, dagger: 8224,
    Dagger: 8225, prime: 8242, Prime: 8243, laquo: 171, raquo: 187,
    larr: 8592, rarr: 8594, harr: 8596, minus: 8722, plusmn: 177,
  };

  function normalizeEntities(html) {
    return html.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) => {
      if (name === "amp" || name === "lt" || name === "gt" || name === "quot" || name === "apos") {
        return m;
      }
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) {
        return `&#${NAMED_ENTITIES[name]};`;
      }
      return m;
    });
  }

  /**
   * Convert HTML5 void elements to self-closing XHTML form and replace
   * undeclared named entities with numeric references.
   * EPUB readers use strict XML parsers that reject unclosed tags.
   */
  function toXhtml(html) {
    return normalizeEntities(html)
      .replace(/<(br|hr|img|meta|link)(\s[^>]*)?\s*>/gi, (_, tag, attrs) =>
        `<${tag.toLowerCase()}${attrs || ""}/>`)
      .replace(/<\/(br|hr|img|meta|link)>/gi, "");
  }

  function buildChapterXhtml(ir, opts) {
    const bodyContent = toXhtml(GEP.pdf.bodyHtml(ir, opts));
    const safeTitle = xmlEscape(ir.title || "Gemini Deep Research");

    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<!DOCTYPE html>' +
      `<html xmlns="http://www.w3.org/1999/xhtml"${xhtmlLangDirAttrs(ir)}>` +
      `<head><meta charset="utf-8"/><title>${safeTitle}</title>` +
      '<link rel="stylesheet" href="style.css"/></head>' +
      `<body dir="${epubDir(ir)}">${bodyContent}</body></html>`
    );
  }

  /**
   * @param {object} ir - Intermediate representation
   * @param {{ includeToc?: boolean, includeFootnotes?: boolean }} [opts]
   * @returns {Blob} application/epub+zip blob
   */
  function convert(ir, opts) {
    // Append the bundled KaTeX stylesheet (fonts inlined) so rendered formulas
    // display offline in e-readers exactly as on the source page.
    let styleCss = STYLE_CSS;
    const hasMathHtml = GEP.pdf && GEP.pdf.irHasKatexHtml && GEP.pdf.irHasKatexHtml(ir);
    if (hasMathHtml && GEP.katex && GEP.katex.css) {
      styleCss += "\n" + GEP.katex.css;
    }

    // Build the chapter first so the manifest can declare the EPUB 3 content
    // properties it actually uses. KaTeX math is re-inlined as <svg> (and may
    // emit <math> MathML); without `properties="svg"`/`"mathml"` on the item,
    // EPUBCheck rejects the package with OPF-014.
    const chapterXhtml = buildChapterXhtml(ir, opts);
    let chapterProps = "";
    if (/<svg[\s>]/i.test(chapterXhtml)) chapterProps += "svg";
    if (/<math[\s>]/i.test(chapterXhtml)) chapterProps += (chapterProps ? " " : "") + "mathml";

    const entries = [
      // mimetype MUST be the first entry and uncompressed
      { name: "mimetype", data: MIMETYPE },
      { name: "META-INF/container.xml", data: CONTAINER_XML },
      { name: "OEBPS/content.opf", data: buildContentOpf(ir, GEP.docmeta ? GEP.docmeta.normalize(opts) : null, chapterProps) },
      { name: "OEBPS/toc.xhtml", data: buildTocXhtml(ir) },
      { name: "OEBPS/chapter.xhtml", data: chapterXhtml },
      { name: "OEBPS/style.css", data: styleCss },
    ];

    return GEP.zip.build(entries);
  }

  GEP.epub = { convert };
})();
