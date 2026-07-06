/**
 * PDF exporter: intermediate representation -> print-ready HTML -> native print.
 *
 * We render the report into a hidden, isolated iframe with print CSS and invoke
 * the browser's print dialog ("Save as PDF"). This guarantees correct rendering
 * of Turkish characters and rich layout without bundling a heavy PDF engine.
 *
 * Now includes optional TOC and footnote rendering.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  function htmlEscape(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function decodeSvgEntities(s) {
    return String(s)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  // KaTeX renders stretchy glyphs (surds, big delimiters, arrows, accents) as
  // <img class="katex-svg" src="data:image/svg+xml;utf8,<svg …>">. Two problems:
  //   1. An <img> is a replaced element, so the SVG's default (black) fill cannot
  //      inherit the page's currentColor — the glyph stays black even in a dark
  //      theme, while the surrounding text turns white (visible as a stray black
  //      bar/surd on dark backgrounds).
  //   2. The raw "<"/quotes left in that data URI are an illegal URL that the
  //      W3C HTML checker and EPUBCheck reject, and the <img> carries no alt.
  // Re-inline the SVG with fill="currentColor" (carrying the <img>'s geometry
  // styles, since the bundled KaTeX CSS has no `.katex svg` sizing/fill rule) so
  // the glyph tracks the text color in light *and* dark — matching the source
  // page — and ships as valid inline SVG in every self-contained export
  // (HTML, Reader, PDF, EPUB). Idempotent: re-inlined SVGs no longer match.
  function sanitizeMathHtml(html) {
    if (!html || (html.indexOf("data:image/svg") === -1 && html.indexOf("<img") === -1)) {
      return html;
    }
    // Match a full <img> tag treating quoted values as opaque units — the
    // data-URI src can legally contain literal "<"/">" (linkedom serializes the
    // captured DOM that way), so a naive [^>]* would stop inside the src.
    let out = html.replace(/<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi, function (img) {
      if (!/\bclass="katex-svg"/i.test(img) || img.indexOf("data:image/svg") === -1) return img;
      const srcMatch = img.match(/\bsrc="([^"]*)"/i);
      if (!srcMatch) return img;
      const src = srcMatch[1];
      let svg = "";
      if (/^data:image\/svg\+xml;utf8,/i.test(src)) {
        svg = decodeSvgEntities(src.replace(/^data:image\/svg\+xml;utf8,/i, ""));
      } else if (/^data:image\/svg\+xml,/i.test(src)) {
        try { svg = decodeURIComponent(src.replace(/^data:image\/svg\+xml,/i, "")); }
        catch (e) { svg = ""; }
      }
      // Could not recover a usable <svg> — leave the <img> untouched.
      if (!/^\s*<svg[\s>]/i.test(svg)) return img;
      const styleMatch = img.match(/\bstyle="([^"]*)"/i);
      const imgStyle = styleMatch ? styleMatch[1] : "display:block;position:absolute;width:100%;height:inherit;";
      // Fold the <img>'s geometry + fill into the <svg> opening tag WITHOUT
      // emitting a second style/fill attribute: KaTeX's own <svg> already
      // carries style="width:…" (and the renderer keeps the first of two
      // duplicate style attrs), which the W3C checker and EPUBCheck reject.
      // Append the <img> styles after the svg's own so they still win (as the
      // duplicate-attribute behaviour did before), and only add fill if absent.
      return svg.replace(/^(\s*)<svg\b([^>]*)>/i, function (_m, lead, attrs) {
        let a = attrs;
        if (/\bstyle="/i.test(a)) {
          a = a.replace(/\bstyle="([^"]*)"/i, function (_s, v) {
            const sep = v && !/;\s*$/.test(v) ? ";" : "";
            return 'style="' + v + sep + imgStyle + '"';
          });
        } else {
          a = ' style="' + imgStyle + '"' + a;
        }
        if (!/\bfill=/i.test(a)) a += ' fill="currentColor"';
        return lead + "<svg" + a + ">";
      });
    });
    // Any remaining ;utf8, data URIs (non-KaTeX) → percent-encode so the raw
    // "<"/quotes don't form an invalid URL that W3C/EPUBCheck reject.
    out = out.replace(/data:image\/svg\+xml;utf8,([^"']*)/g, function (_m, payload) {
      return "data:image/svg+xml," + encodeURIComponent(decodeSvgEntities(payload));
    });
    // Any remaining <img> without alt → add an empty alt for validity.
    out = out.replace(/<img\b(?![^>]*\balt=)([^>]*?)(\/?)>/gi, '<img$1 alt=""$2>');
    return out;
  }

  function runHtml(run, includeFootnotes, state) {
    if (run.image) {
      return `<img src="${htmlEscape(run.image.src)}" alt="${htmlEscape(run.image.alt || "")}" style="max-width:100%;height:auto;">`;
    }
    if (run.footnoteIndex) {
      if (!includeFootnotes) return "";
      const n = run.footnoteIndex;
      let idAttr = "";
      if (state && state.fnRefCounts) {
        state.fnRefCounts[n] = (state.fnRefCounts[n] || 0) + 1;
        idAttr = ` id="fnref-${n}-${state.fnRefCounts[n]}"`;
      }
      return `<sup class="fn-ref"${idAttr}><a href="#fn-${n}">[${n}]</a></sup>`;
    }
    if (run.math) {
      // Gemini's already-rendered KaTeX HTML displays offline with the bundled
      // KaTeX stylesheet — no math engine, identical to the source page.
      if (run.math.html) return sanitizeMathHtml(run.math.html);
      // Native MathML renders in Chrome/EPUB readers with zero dependencies.
      if (run.math.mathml) return run.math.mathml;
      const tex = htmlEscape(run.math.tex || "");
      return run.math.display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
    }
    let html = htmlEscape(run.text).replace(/\n/g, "<br>");
    if (run.code) html = `<code>${html}</code>`;
    if (run.bold) html = `<strong>${html}</strong>`;
    if (run.italic) html = `<em>${html}</em>`;
    if (run.href) html = `<a href="${htmlEscape(run.href)}">${html}</a>`;
    return html;
  }

  function runsHtml(runs, includeFootnotes, state) {
    return (runs || []).map((r) => runHtml(r, includeFootnotes, state)).join("");
  }

  function listHtml(block, includeFootnotes, state) {
    const tag = block.ordered ? "ol" : "ul";
    let html = "";
    let depth = 0;

    block.items.forEach((item) => {
      const td = (item.level || 0) + 1;
      if (td > depth) {
        while (depth < td) {
          html += `<${tag}>`;
          depth++;
          if (depth < td) html += '<li dir="auto">';
        }
        html += '<li dir="auto">';
      } else if (td < depth) {
        while (depth > td) { html += `</li></${tag}>`; depth--; }
        html += '</li><li dir="auto">';
      } else {
        html += '</li><li dir="auto">';
      }
      html += runsHtml(item.runs, includeFootnotes, state);
    });

    while (depth > 0) { html += `</li></${tag}>`; depth--; }
    return html;
  }

  function tableHtml(block, includeFootnotes, state) {
    let html = "<table>";
    if (block.header) {
      html += "<thead><tr>";
      block.header.forEach((c) => (html += `<th dir="auto">${runsHtml(c, includeFootnotes, state)}</th>`));
      html += "</tr></thead>";
    }
    html += "<tbody>";
    block.rows.forEach((row) => {
      html += "<tr>";
      row.forEach((c) => (html += `<td dir="auto">${runsHtml(c, includeFootnotes, state)}</td>`));
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function buildTocHtml(ir) {
    if (!GEP.toc) return "";
    const toc = GEP.toc.generate(ir);
    if (!toc.items.length) return "";

    const minLevel = Math.min(...toc.items.map((i) => i.level));
    let html = '<nav class="toc"><h2>Table of Contents</h2>';
    let depth = 0;

    toc.items.forEach((item) => {
      const td = item.level - minLevel + 1;
      if (td > depth) {
        while (depth < td) {
          html += "<ul>";
          depth++;
          if (depth < td) html += "<li>";
        }
        html += "<li>";
      } else if (td < depth) {
        while (depth > td) { html += "</li></ul>"; depth--; }
        html += "</li><li>";
      } else {
        html += "</li><li>";
      }
      html += `<a href="#${item.id}">${htmlEscape(item.text)}</a>`;
    });

    while (depth > 0) { html += "</li></ul>"; depth--; }
    html += "</nav>";
    return html;
  }

  function buildFootnotesHtml(ir, citationStyle) {
    if (!ir.footnotes || !ir.footnotes.length) return "";
    const style = citationStyle || "numbered";
    let html = '<section class="footnotes"><hr><h3>Sources</h3><ol>';
    ir.footnotes.forEach((fn) => {
      const cite = GEP.citation.format(fn, style);
      const back = ` <a class="fn-back" href="#fnref-${fn.index}-1" title="Back to text">\u21A9</a>`;
      if (fn.url) {
        html += `<li id="fn-${fn.index}" class="footnote-item"><a href="${htmlEscape(cite.url)}" target="_blank" rel="noopener">${htmlEscape(cite.label)}</a>${back}</li>`;
      } else {
        html += `<li id="fn-${fn.index}" class="footnote-item">${htmlEscape(cite.plain)}${back}</li>`;
      }
    });
    html += "</ol></section>";
    return html;
  }

  function bodyHtml(ir, opts) {
    const o = opts || {};
    const includeToc = o.includeToc || false;
    const includeFootnotes = o.includeFootnotes !== undefined ? o.includeFootnotes : true;

    const meta = GEP.docmeta ? GEP.docmeta.normalize(o) : { has: false, keywords: [] };
    // Per-document counter so each footnote reference gets a unique anchor id
    // (fnref-N-k), letting the sources list link back to the first occurrence.
    const state = { fnRefCounts: {} };

    const parts = [];
    if (ir.title) parts.push(`<h1 class="doc-title" dir="auto">${htmlEscape(ir.title)}</h1>`);

    if (meta.has) {
      const byline = GEP.docmeta ? GEP.docmeta.byline(meta) : meta.author;
      if (byline) parts.push(`<p class="doc-byline">${htmlEscape(byline)}</p>`);
      if (meta.abstract) {
        parts.push(
          `<section class="abstract"><h2>Abstract</h2><p>${htmlEscape(meta.abstract)}</p></section>`
        );
      }
      if (meta.keywords.length) {
        parts.push(
          `<p class="doc-keywords"><strong>Keywords:</strong> ${htmlEscape(meta.keywords.join(", "))}</p>`
        );
      }
    }

    if (includeToc) {
      const toc = buildTocHtml(ir);
      if (toc) parts.push(toc);
    }

    // Normalize heading depth so rendered levels stay contiguous (W3C/accessibility
    // forbids skipping a level, e.g. h1 → h3 or h3 → h5). A stack maps each source
    // heading to "nearest shallower parent + 1", which both anchors the shallowest
    // content heading under the <h1> title and collapses any internal jumps.
    const headingBase = ir.title ? 2 : 1;
    const headingStack = [];
    // Heading anchor ids must be unique (W3C / EPUBCheck reject duplicate IDs)
    // and match GEP.toc.generate so the TOC links resolve. Non-Latin headings
    // (Arabic, CJK, …) slugify to the "section" fallback, so without this
    // dedup every heading would collapse to id="section". Mirrors toc.js.
    const headingSlugCounts = {};
    const renderedHeadingLevel = (orig) => {
      while (headingStack.length && headingStack[headingStack.length - 1].orig >= orig) {
        headingStack.pop();
      }
      const parent = headingStack.length ? headingStack[headingStack.length - 1].rendered : headingBase - 1;
      const rendered = Math.min(parent + 1, 6);
      headingStack.push({ orig, rendered });
      return rendered;
    };

    ir.blocks.forEach((block) => {
      switch (block.type) {
        case "heading": {
          const headingText = (block.runs || []).map((r) => r.text || "").join("").trim();
          if (ir.title && block.level === 1 && headingText === ir.title) break;
          const level = renderedHeadingLevel(block.level);
          // Match toc.js: only non-empty headings get an id, deduplicated with
          // a `-N` suffix so repeated/non-Latin slugs stay unique.
          let idAttr = "";
          if (headingText && GEP.toc) {
            let slug = GEP.toc.slugify(headingText);
            if (headingSlugCounts[slug]) {
              headingSlugCounts[slug]++;
              slug = `${slug}-${headingSlugCounts[slug]}`;
            } else {
              headingSlugCounts[slug] = 1;
            }
            idAttr = ` id="${slug}"`;
          }
          parts.push(`<h${level}${idAttr} dir="auto">${runsHtml(block.runs, includeFootnotes, state)}</h${level}>`);
          break;
        }
        case "paragraph":
          parts.push(`<p dir="auto">${runsHtml(block.runs, includeFootnotes, state)}</p>`);
          break;
        case "blockquote":
          parts.push(`<blockquote dir="auto">${runsHtml(block.runs, includeFootnotes, state)}</blockquote>`);
          break;
        case "code": {
          const langAttr = block.lang ? ` class="language-${htmlEscape(block.lang)}"` : "";
          parts.push(`<pre><code${langAttr}>${htmlEscape(block.text)}</code></pre>`);
          break;
        }
        case "math": {
          const inner = block.html
            ? sanitizeMathHtml(block.html)
            : block.mathml
              ? block.mathml
              : `\\[${htmlEscape(block.tex || "")}\\]`;
          parts.push(`<div class="math-display">${inner}</div>`);
          break;
        }
        case "list":
          parts.push(listHtml(block, includeFootnotes, state));
          break;
        case "table":
          parts.push(tableHtml(block, includeFootnotes, state));
          break;
        case "image":
          parts.push(
            `<figure><img src="${htmlEscape(block.src)}" alt="${htmlEscape(block.alt)}" style="max-width:100%;height:auto;">` +
            (block.alt ? `<figcaption dir="auto">${htmlEscape(block.alt)}</figcaption>` : "") +
            "</figure>"
          );
          break;
        case "hr":
          parts.push("<hr>");
          break;
      }
    });

    if (includeFootnotes) {
      const fn = buildFootnotesHtml(ir, o.citationStyle);
      if (fn) parts.push(fn);
    }

    return parts.join("\n");
  }

  // Page / typography layout maps. The "normal"/default branch reproduces the
  // historical hardcoded values exactly (backward compatible).
  const PAGE_SIZE = { a4: "A4", letter: "Letter" };
  const PAGE_MARGIN = { narrow: "12mm 12mm", normal: "18mm 16mm", wide: "25mm 24mm" };
  const BODY_LINE_HEIGHT = { normal: "1.6", onehalf: "1.9", double: "2.4" };
  const SANS_STACK = '"Google Sans Text", "Segoe UI", Roboto, Arial, sans-serif';
  const SERIF_STACK = 'Georgia, "Times New Roman", Times, serif';

  /** Resolve a (possibly missing) layout object to concrete CSS values. */
  function resolveLayout(layout) {
    const l = layout || {};
    return {
      size: PAGE_SIZE[l.paper] || PAGE_SIZE.a4,
      margin: PAGE_MARGIN[l.margins] || PAGE_MARGIN.normal,
      fontSize: `${[10, 12].includes(Number(l.fontSize)) ? Number(l.fontSize) : 11}pt`,
      lineHeight: BODY_LINE_HEIGHT[l.lineSpacing] || BODY_LINE_HEIGHT.normal,
      fontFamily: l.fontFamily === "serif" ? SERIF_STACK : SANS_STACK,
    };
  }

  /** Build the print stylesheet for the given layout (PDF / HTML share this). */
  function printCss(layout) {
    const v = resolveLayout(layout);
    return `
    @page { size: ${v.size}; margin: ${v.margin}; }
    * { box-sizing: border-box; }
    html, body { orphans: 3; widows: 3; }
    body {
      font-family: ${v.fontFamily};
      color: #202124; line-height: ${v.lineHeight}; font-size: ${v.fontSize}; margin: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      word-wrap: break-word; overflow-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #202124; line-height: 1.25;
      page-break-after: avoid; break-after: avoid;
      page-break-inside: avoid; break-inside: avoid;
    }
    .doc-title { font-size: 22pt; margin: 0 0 8px; }
    .doc-byline { font-size: 11pt; color: #5f6368; font-style: italic; margin: 0 0 14px; }
    .abstract { margin: 0 0 16px; padding: 12px 16px; background: #f8f9fa; border-radius: 8px; page-break-inside: avoid; break-inside: avoid; }
    .abstract h2 { font-size: 12pt; margin: 0 0 6px; border: none; }
    .abstract p { margin: 0; text-align: justify; }
    .doc-keywords { font-size: 10pt; color: #3c4043; margin: 0 0 16px; }
    h2 { font-size: 16pt; margin: 22px 0 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
    h3 { font-size: 13pt; margin: 18px 0 6px; }
    h4, h5, h6 { font-size: 11.5pt; margin: 14px 0 6px; color: #3c4043; }
    p { margin: 0 0 10px; text-align: justify; orphans: 3; widows: 3; }
    a { color: #1a73e8; text-decoration: none; word-break: break-word; }
    ul, ol { margin: 0 0 10px; padding-inline-start: 22px; }
    li { margin: 2px 0; page-break-inside: avoid; break-inside: avoid; }
    blockquote { margin: 0 0 10px; padding: 4px 14px; border-inline-start: 3px solid #dadce0; color: #5f6368; page-break-inside: avoid; break-inside: avoid; }
    code { font-family: Consolas, "SF Mono", monospace; background: #f1f3f4; padding: 1px 4px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #f1f3f4; padding: 12px; border-radius: 6px; overflow: auto; white-space: pre-wrap; word-wrap: break-word; page-break-inside: avoid; break-inside: avoid; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 12px; font-size: 10pt; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: start; vertical-align: top; }
    th { background: #f1f3f4; }
    hr { border: none; border-top: 1px solid #dadce0; margin: 16px 0; }
    .math-display { text-align: center; margin: 12px 0; overflow-x: auto; page-break-inside: avoid; break-inside: avoid; }
    math { font-size: 1.05em; }
    figure { margin: 12px 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }
    figcaption { font-size: 9pt; color: #5f6368; margin-top: 4px; }
    img { max-width: 100%; height: auto; }
    .toc { margin: 0 0 20px; padding: 16px; background: #f8f9fa; border-radius: 8px; page-break-after: avoid; break-after: avoid; }
    .toc h2 { font-size: 14pt; margin: 0 0 8px; border: none; }
    .toc ul { list-style: none; padding-inline-start: 16px; margin: 4px 0; }
    .toc li { margin: 2px 0; }
    .toc a { color: #1a73e8; }
    .fn-ref { font-size: 0.75em; vertical-align: super; }
    .fn-ref a { color: #1a73e8; text-decoration: none; }
    .footnotes { margin-top: 24px; font-size: 9pt; color: #5f6368; page-break-before: auto; }
    .footnotes h3 { font-size: 11pt; color: #202124; page-break-after: avoid; break-after: avoid; }
    .footnotes ol { padding-inline-start: 20px; }
    .footnote-item { margin: 2px 0; page-break-inside: avoid; break-inside: avoid; }
    .fn-back { color: #1a73e8; text-decoration: none; margin-inline-start: 4px; font-size: 0.9em; }
  `;
  }

  function headMetaTags(opts) {
    const meta = GEP.docmeta ? GEP.docmeta.normalize(opts) : { has: false, keywords: [] };
    if (!meta.has) return "";
    let tags = "";
    if (meta.author) tags += `<meta name="author" content="${htmlEscape(meta.author)}">`;
    if (meta.keywords.length) {
      tags += `<meta name="keywords" content="${htmlEscape(meta.keywords.join(", "))}">`;
    }
    if (meta.abstract) tags += `<meta name="description" content="${htmlEscape(meta.abstract)}">`;
    return tags;
  }

  /** True when any block or run carries Gemini's rendered KaTeX HTML. */
  function irHasKatexHtml(ir) {
    const runsHaveMath = (runs) =>
      (runs || []).some((r) => r.math && r.math.html);
    const itemsHaveMath = (items) =>
      (items || []).some((it) => runsHaveMath(it.runs));
    return (ir.blocks || []).some((b) => {
      if (b.type === "math" && b.html) return true;
      if (runsHaveMath(b.runs)) return true;
      if (b.type === "list" && itemsHaveMath(b.items)) return true;
      if (b.type === "table") {
        if ((b.header || []).some((cell) => runsHaveMath(cell))) return true;
        if ((b.rows || []).some((row) => row.some((cell) => runsHaveMath(cell)))) return true;
      }
      return false;
    });
  }

  /** Bundled KaTeX stylesheet (fonts inlined) for offline math rendering. */
  function katexStyle(ir) {
    if (!irHasKatexHtml(ir)) return "";
    const css = GEP.katex && GEP.katex.css;
    return css ? `<style>${css}</style>` : "";
  }

  /** Builds the `lang="…" dir="…"` attributes for the root <html> from the IR. */
  function htmlLangDirAttrs(ir) {
    const lang = ir && typeof ir.lang === "string" ? ir.lang.trim() : "";
    const dir = ir && ir.dir === "rtl" ? "rtl" : "ltr";
    return (lang ? ` lang="${htmlEscape(lang)}"` : "") + ` dir="${dir}"`;
  }

  function buildDocument(ir, opts) {
    return (
      `<!DOCTYPE html><html${htmlLangDirAttrs(ir)}><head><meta charset="utf-8">` +
      `<title>${htmlEscape(ir.title || "Gemini Deep Research")}</title>` +
      headMetaTags(opts) +
      `<style>${printCss(opts && opts.layout)}</style>` +
      katexStyle(ir) +
      `</head><body>${bodyHtml(ir, opts)}</body></html>`
    );
  }

  const PDF_TIMEOUT = 90000;

  function exportPdf(ir, opts) {
    return new Promise((resolve, reject) => {
      let cleaned = false;
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      Object.assign(iframe.style, {
        position: "fixed",
        right: "0",
        bottom: "0",
        width: "0",
        height: "0",
        border: "0",
        visibility: "hidden",
      });

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        setTimeout(() => { try { iframe.remove(); } catch {} }, 500);
      };

      const failTimer = setTimeout(() => {
        cleanup();
        reject(new Error("PDF print timed out"));
      }, PDF_TIMEOUT);

      iframe.onerror = () => {
        clearTimeout(failTimer);
        cleanup();
        reject(new Error("PDF iframe failed to load"));
      };

      iframe.onload = () => {
        const win = iframe.contentWindow;
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch (e) {
            clearTimeout(failTimer);
            cleanup();
            reject(e);
            return;
          }
          win.addEventListener("afterprint", () => {
            clearTimeout(failTimer);
            cleanup();
          }, { once: true });
          clearTimeout(failTimer);
          resolve();
        }, 250);
      };

      (document.body || document.documentElement).appendChild(iframe);

      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(buildDocument(ir, opts));
        doc.close();
      } catch (e) {
        clearTimeout(failTimer);
        cleanup();
        reject(e);
      }
    });
  }

  GEP.pdf = { exportPdf, buildDocument, bodyHtml, htmlEscape, runsHtml, irHasKatexHtml, sanitizeMathHtml, htmlLangDirAttrs };
})();
