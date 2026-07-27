/**
 * LaTeX exporter: intermediate representation -> LaTeX document (.tex).
 * Now includes optional TOC and footnote support.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function esc(text) {
    // Backslash goes through a placeholder so the braces in \textbackslash{}
    // are not re-escaped by the following replacements. ~ and ^ need text
    // commands: \~ and \^ are accent commands that would modify the next char.
    return String(text)
      .replace(/\\/g, "\u0000")
      .replace(/([&%$#_{}])/g, "\\$1")
      .replace(/~/g, "\\textasciitilde{}")
      .replace(/\^/g, "\\textasciicircum{}")
      .replace(/\u0000/g, "\\textbackslash{}");
  }

  function runToTex(run, includeFootnotes) {
    if (run.image) return `% image: ${run.image.src}\n`;
    if (run.math) {
      // Do NOT escape: tex is raw math source consumed by the math engine.
      const tex = run.math.tex || "";
      return run.math.display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
    }
    if (run.footnoteIndex) return includeFootnotes ? `\\textsuperscript{[${run.footnoteIndex}]}` : "";
    let t = esc(run.text);
    if (run.code) t = `\\texttt{${t}}`;
    if (run.bold) t = `\\textbf{${t}}`;
    if (run.italic) t = `\\textit{${t}}`;
    if (run.href) t = `\\href{${run.href}}{${t}}`;
    return t;
  }

  function runsToTex(runs, includeFootnotes) {
    return (runs || []).map((r) => runToTex(r, includeFootnotes)).join("").trim();
  }

  const HEADING_CMDS = [
    "section", "subsection", "subsubsection",
    "paragraph", "subparagraph", "subparagraph",
  ];

  /**
   * Detect the dominant CJK script in the report so the preamble can load a
   * matching font package. Kana implies Japanese and Hangul implies Korean;
   * Han-only text falls back to ir.lang, defaulting to Chinese.
   * @returns {"ja"|"ko"|"zh"|null}
   */
  function detectCjkScript(ir) {
    const text = JSON.stringify(ir) || "";
    if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(text)) return "ja";
    if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text)) return "ko";
    if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(text)) {
      const lang = String(ir.lang || "").toLowerCase();
      if (lang.startsWith("ja")) return "ja";
      if (lang.startsWith("ko")) return "ko";
      return "zh";
    }
    return null;
  }

  const RTL_RANGES = {
    // Arabic script, which also covers Persian, Urdu and Pashto.
    ar: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g,
    he: /[\u0590-\u05FF\uFB1D-\uFB4F]/g,
  };
  const LTR_LETTERS = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/g;

  /** Collects the report's prose (titles, runs, cells) — not URLs or IR keys. */
  function harvestText(node, out) {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      node.forEach((n) => harvestText(n, out));
      return out;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "href" || key === "url" || key === "src") continue;
      if (typeof value === "string") {
        if (key === "text" || key === "title") out.push(value);
      } else harvestText(value, out);
    }
    return out;
  }

  /**
   * Detect right-to-left content and how much of the report it makes up.
   * `dominant` reports are typeset RTL end to end (main language); a report
   * that merely quotes an RTL passage keeps its LTR layout and only needs the
   * script's font, so flipping the document direction there would be wrong.
   * @returns {{script: "ar"|"he", secondary: "ar"|"he"|null, dominant: boolean}|null}
   */
  function detectRtlScript(ir) {
    const text = harvestText(ir, [ir && ir.title ? String(ir.title) : ""]).join(" ");
    const counts = {
      ar: (text.match(RTL_RANGES.ar) || []).length,
      he: (text.match(RTL_RANGES.he) || []).length,
    };
    const rtl = counts.ar + counts.he;
    if (!rtl) return null;

    const script = counts.ar >= counts.he ? "ar" : "he";
    const other = script === "ar" ? "he" : "ar";
    const ltr = (text.match(LTR_LETTERS) || []).length;
    return {
      script,
      secondary: counts[other] ? other : null,
      // Source titles and bibliography entries in an otherwise Arabic report
      // are often English, so the bar sits well below half.
      dominant: rtl / (rtl + ltr) > 0.3,
    };
  }

  const RTL_LANG = { ar: "arabic", he: "hebrew" };
  // Both ship with TeX Live / MiKTeX (the amiri and culmus packages); the
  // alternatives are tried in case a system only has the Noto families.
  const RTL_FONTS = {
    ar: ["Amiri", "Noto Naskh Arabic", "Scheherazade New"],
    he: ["David CLM", "Noto Serif Hebrew", "FreeSerif"],
  };

  const FALLBACK_ID = "gepRtlFallback";

  /** `\IfFontExistsTF{A}{use A}{\IfFontExistsTF{B}{use B}{}}`, nested. */
  function fontFallback(fonts, use) {
    return fonts.reduceRight((rest, font) => `\\IfFontExistsTF{${font}}{${use(font)}}{${rest}}`, "");
  }

  /**
   * Preamble lines that make right-to-left scripts readable. Three things have
   * to line up or the text comes out as unjoined letters in reversed order:
   * the bidi algorithm, per-script font switching, and Arabic shaping.
   *
   * LuaTeX gets all three from babel — `bidi=basic` runs the Unicode bidi
   * algorithm (without it nothing is reordered at all) and `onchar=ids fonts`
   * switches language and font per character, so an Arabic quote inside a
   * Turkish paragraph is handled with no markup in the body.
   *
   * XeTeX has no `onchar` equivalent, so polyglossia can only set the document
   * language: an RTL-dominant report typesets correctly, but RTL quotes inside
   * an LTR report would need explicit \textarabic{} wrapping. LuaLaTeX is
   * therefore the recommended engine, as the generated header comment says.
   */
  function rtlSetup(rtl) {
    const langs = [rtl.script, ...(rtl.secondary ? [rtl.secondary] : [])];
    const lines = [
      "  \\ifLuaTeX",
      "    \\usepackage[bidi=basic]{babel}",
      // Punctuation and list bullets are typeset in the active language's font,
      // and the RTL faces do not all carry them (David CLM has no U+2022), so
      // borrow anything they lack from Latin Modern instead of dropping it.
      `    \\directlua{luaotfload.add_fallback("${FALLBACK_ID}", {"LatinModernRoman:mode=node;"})}`,
    ];
    langs.forEach((s, i) => {
      const main = i === 0 && rtl.dominant ? "main, " : "";
      lines.push(`    \\babelprovide[import, ${main}onchar=ids fonts]{${RTL_LANG[s]}}`);
    });
    langs.forEach((s) => {
      // All three families, scoped to the language: `onchar=fonts` switches
      // within whichever one is current, so a Latin code span keeps its
      // monospace font while the Arabic characters inside it still render.
      lines.push(`    ${fontFallback(RTL_FONTS[s], (f) => ["rm", "sf", "tt"]
        .map((fam) => `\\babelfont[${RTL_LANG[s]}]{${fam}}{${f}}[RawFeature={fallback=${FALLBACK_ID}}]`).join(""))}`);
    });
    lines.push("  \\else", "    \\usepackage{polyglossia}");
    if (rtl.dominant) {
      lines.push(`    \\setmainlanguage{${RTL_LANG[rtl.script]}}`, "    \\setotherlanguage{english}");
    } else {
      langs.forEach((s) => lines.push(`    \\setotherlanguage{${RTL_LANG[s]}}`));
    }
    langs.forEach((s) => {
      const cmd = `\\${RTL_LANG[s]}font`;
      lines.push(`    ${fontFallback(RTL_FONTS[s], (f) => `\\newfontfamily${cmd}{${f}}[Script=${s === "ar" ? "Arabic" : "Hebrew"}]`)}`);
    });
    lines.push("  \\fi");
    return lines;
  }

  /**
   * Preamble lines (inside the non-pdfTeX branch, after fontspec) that load a
   * CJK-capable font automatically. All referenced fonts ship with TeX Live /
   * Overleaf: Harano Aji via luatexja-preset, Fandol via xeCJK's defaults,
   * UnBatang via luatexko. Noto is used on XeLaTeX only when installed.
   */
  const CJK_FONT_SETUP = {
    ja: [
      "  \\ifLuaTeX",
      "    \\usepackage[haranoaji]{luatexja-preset}% Japanese fonts bundled with TeX Live",
      "  \\else",
      "    \\usepackage{xeCJK}",
      "    \\IfFontExistsTF{Noto Serif CJK JP}{\\setCJKmainfont{Noto Serif CJK JP}}{}",
      "  \\fi",
    ],
    ko: [
      "  \\ifLuaTeX",
      "    \\usepackage{luatexko}% Korean fonts bundled with TeX Live",
      "  \\else",
      "    \\usepackage{xeCJK}",
      "    \\IfFontExistsTF{Noto Serif CJK KR}{\\setCJKmainfont{Noto Serif CJK KR}}{}",
      "  \\fi",
    ],
    zh: [
      "  \\ifLuaTeX",
      "    \\usepackage[fandol]{luatexja-preset}% Chinese fonts bundled with TeX Live",
      "  \\else",
      "    \\usepackage{xeCJK}% defaults to the bundled Fandol fonts",
      "  \\fi",
    ],
  };

  function listToTex(block, includeFootnotes) {
    const rootEnv = block.ordered ? "enumerate" : "itemize";
    const envStack = [rootEnv];
    const lines = [`\\begin{${rootEnv}}`];
    let currentLevel = 0;
    block.items.forEach((item) => {
      const level = item.level || 0;
      while (currentLevel < level) {
        const sub = (item.ordered ?? block.ordered) ? "enumerate" : "itemize";
        lines.push(`\\begin{${sub}}`);
        envStack.push(sub);
        currentLevel++;
      }
      while (currentLevel > level) {
        lines.push(`\\end{${envStack.pop()}}`);
        currentLevel--;
      }
      lines.push(`  \\item ${runsToTex(item.runs, includeFootnotes)}`);
    });
    while (currentLevel-- > 0) lines.push(`\\end{${envStack.pop()}}`);
    lines.push(`\\end{${envStack.pop()}}`);
    return lines.join("\n");
  }

  function tableToTex(block, includeFootnotes) {
    const colCount = Math.max(
      block.header ? block.header.length : 0,
      ...block.rows.map((r) => r.length),
      1
    );
    // Academic-style table: longtable breaks across pages, booktabs rules,
    // equal-width wrapping p{} columns that always fit \textwidth. Ragged-right
    // avoids the justification underfull \hbox warnings (and the "infinite glue
    // shrinkage" longtable error) that narrow justified columns produce.
    const colSpec = `>{\\raggedright\\arraybackslash}p{\\dimexpr${(1 / colCount).toFixed(4)}\\textwidth-2\\tabcolsep}`;
    const lines = [`\\begin{longtable}{${colSpec.repeat(colCount)}}`, "\\toprule"];
    if (block.header) {
      lines.push(
        block.header.map((c) => `\\textbf{${runsToTex(c, includeFootnotes)}}`).join(" & ") + " \\\\",
        "\\midrule",
        "\\endhead"
      );
    }
    block.rows.forEach((row) => {
      lines.push(row.map((c) => runsToTex(c, includeFootnotes)).join(" & ") + " \\\\");
    });
    lines.push("\\bottomrule", "\\end{longtable}");
    return lines.join("\n");
  }

  function buildFootnotesTex(ir, citationStyle) {
    if (!ir.footnotes || !ir.footnotes.length) return "";
    const style = citationStyle || "numbered";
    const lines = [
      "",
      "\\bigskip",
      "\\noindent\\rule{\\textwidth}{0.4pt}",
      "\\subsection*{Sources}",
      "\\addcontentsline{toc}{subsection}{Sources}",
    ];
    ir.footnotes.forEach((fn) => {
      const cite = GEP.citation.format(fn, style);
      if (fn.url) {
        lines.push(`\\noindent [${fn.index}] ${esc(cite.label)} --- \\url{${fn.url}}\\\\`);
      } else {
        lines.push(`\\noindent ${esc(cite.plain)}\\\\`);
      }
    });
    return lines.join("\n");
  }

  function convert(ir, opts) {
    const o = opts || {};
    const includeToc = o.includeToc || false;
    const includeFootnotes = o.includeFootnotes !== undefined ? o.includeFootnotes : true;

    // Page / typography layout (#3). fontSize is a number; paper maps to the
    // documentclass option. Margins/line-spacing/font-family are injected below.
    const layout = o.layout || {};
    const fontSize = [10, 12].includes(Number(layout.fontSize)) ? Number(layout.fontSize) : 11;
    const paper = layout.paper === "letter" ? "letterpaper" : "a4paper";

    const cjk = detectCjkScript(ir);
    const rtl = detectRtlScript(ir);

    const out = [
      `\\documentclass[${fontSize}pt,${paper}]{article}`,
      // Compile with ANY engine: pdfLaTeX uses inputenc/fontenc, while
      // LuaLaTeX/XeLaTeX use fontspec so arbitrary Unicode (Greek, Cyrillic,
      // CJK, emoji) degrades to a "missing glyph" warning instead of a fatal
      // error. LuaLaTeX/XeLaTeX is recommended for multilingual reports.
      "\\usepackage{iftex}",
      ...(cjk ? [
        `% This report contains CJK (${cjk}) text. pdfLaTeX cannot render CJK`,
        "% glyphs -- compile with LuaLaTeX (recommended) or XeLaTeX instead.",
        "% The font setup below is applied automatically on those engines.",
      ] : []),
      ...(rtl ? [
        `% This report contains right-to-left (${rtl.script}) text. pdfLaTeX can`,
        "% render neither the glyphs nor the reading direction -- compile with",
        "% LuaLaTeX, which sets up bidi, fonts and Arabic shaping automatically.",
        ...(rtl.dominant ? [] : [
          "% The RTL text here is quoted inside a left-to-right report. XeLaTeX",
          "% cannot switch fonts per script, so it needs LuaLaTeX to render it.",
        ]),
      ] : []),
      "\\ifPDFTeX",
      "  \\usepackage[utf8]{inputenc}",
      "  \\usepackage[T1]{fontenc}",
      "  \\usepackage{lmodern}",
      "  \\usepackage{textcomp}",
      "  \\usepackage{newunicodechar}",
      // Common Unicode prose symbols pdfLaTeX doesn't set up by default
      // (sub/superscripts, operators, arrows). LuaLaTeX/XeLaTeX render these
      // natively, so these mappings are pdfTeX-only.
      "  \\newunicodechar{\u2070}{\\textsuperscript{0}}",
      "  \\newunicodechar{\u2074}{\\textsuperscript{4}}",
      "  \\newunicodechar{\u2075}{\\textsuperscript{5}}",
      "  \\newunicodechar{\u2076}{\\textsuperscript{6}}",
      "  \\newunicodechar{\u2077}{\\textsuperscript{7}}",
      "  \\newunicodechar{\u2078}{\\textsuperscript{8}}",
      "  \\newunicodechar{\u2079}{\\textsuperscript{9}}",
      "  \\newunicodechar{\u207A}{\\textsuperscript{+}}",
      "  \\newunicodechar{\u207B}{\\textsuperscript{\\textendash}}",
      "  \\newunicodechar{\u207F}{\\textsuperscript{n}}",
      "  \\newunicodechar{\u2071}{\\textsuperscript{i}}",
      "  \\newunicodechar{\u2080}{\\textsubscript{0}}",
      "  \\newunicodechar{\u2081}{\\textsubscript{1}}",
      "  \\newunicodechar{\u2082}{\\textsubscript{2}}",
      "  \\newunicodechar{\u2083}{\\textsubscript{3}}",
      "  \\newunicodechar{\u2084}{\\textsubscript{4}}",
      "  \\newunicodechar{\u2085}{\\textsubscript{5}}",
      "  \\newunicodechar{\u2086}{\\textsubscript{6}}",
      "  \\newunicodechar{\u2087}{\\textsubscript{7}}",
      "  \\newunicodechar{\u2088}{\\textsubscript{8}}",
      "  \\newunicodechar{\u2089}{\\textsubscript{9}}",
      "  \\newunicodechar{\u208A}{\\textsubscript{+}}",
      "  \\newunicodechar{\u208B}{\\textsubscript{\\textendash}}",
      "  \\newunicodechar{\u221A}{\\ensuremath{\\surd}}",
      "  \\newunicodechar{\u221E}{\\ensuremath{\\infty}}",
      "  \\newunicodechar{\u2211}{\\ensuremath{\\sum}}",
      "  \\newunicodechar{\u220F}{\\ensuremath{\\prod}}",
      "  \\newunicodechar{\u222B}{\\ensuremath{\\int}}",
      "  \\newunicodechar{\u2202}{\\ensuremath{\\partial}}",
      "  \\newunicodechar{\u2207}{\\ensuremath{\\nabla}}",
      "  \\newunicodechar{\u2248}{\\ensuremath{\\approx}}",
      "  \\newunicodechar{\u2260}{\\ensuremath{\\neq}}",
      "  \\newunicodechar{\u2264}{\\ensuremath{\\leq}}",
      "  \\newunicodechar{\u2265}{\\ensuremath{\\geq}}",
      "  \\newunicodechar{\u2261}{\\ensuremath{\\equiv}}",
      "  \\newunicodechar{\u2192}{\\ensuremath{\\rightarrow}}",
      "  \\newunicodechar{\u21D2}{\\ensuremath{\\Rightarrow}}",
      "  \\newunicodechar{\u0394}{\\ensuremath{\\Delta}}",
      "  \\newunicodechar{\u03A9}{\\ensuremath{\\Omega}}",
      "  \\newunicodechar{\u00B5}{\\ensuremath{\\mu}}",
      "  \\newunicodechar{\u20AC}{\\texteuro{}}",
      "\\else",
      "  \\usepackage{fontspec}",
      ...(cjk ? CJK_FONT_SETUP[cjk] : []),
      // babel has to be loaded before hyperref, which follows below.
      ...(rtl ? rtlSetup(rtl) : []),
      "\\fi",
      "\\usepackage{amsmath}",
      "\\usepackage{amssymb}",
      "\\usepackage[hyphens,spaces]{url}",
      "\\usepackage{hyperref}",
      "\\usepackage{graphicx}",
      "\\usepackage{array}",
      "\\usepackage{longtable}",
      "\\usepackage{booktabs}",
      "\\usepackage{fvextra}",
      "\\usepackage{microtype}",
      "",
    ];

    // Layout: font family (sans is the default, matching the other formats;
    // pick Serif for the classic LaTeX/lmodern roman look), margins via
    // geometry, and line spacing via setspace. "normal" margins/spacing add
    // nothing so the article defaults are preserved.
    if (layout.fontFamily !== "serif") {
      out.push("\\renewcommand{\\familydefault}{\\sfdefault}");
    }
    if (layout.margins === "narrow") out.push("\\usepackage[margin=1.5cm]{geometry}");
    else if (layout.margins === "wide") out.push("\\usepackage[margin=3cm]{geometry}");
    if (layout.lineSpacing === "onehalf") out.push("\\usepackage{setspace}", "\\onehalfspacing");
    else if (layout.lineSpacing === "double") out.push("\\usepackage{setspace}", "\\doublespacing");

    out.push("\\begin{document}");
    out.push("\\emergencystretch=3em", "");

    const meta = GEP.docmeta ? GEP.docmeta.normalize(o) : { keywords: [], hasByline: false };

    if (ir.title || meta.hasByline) {
      out.push(`\\title{${esc(ir.title || "")}}`);
      if (meta.hasByline) {
        const authorLine = meta.affiliation
          ? `${esc(meta.author)} \\\\ \\small ${esc(meta.affiliation)}`
          : esc(meta.author);
        out.push(`\\author{${authorLine}}`);
      } else {
        out.push("\\author{}");
      }
      out.push("\\date{}", "\\maketitle", "");
    }

    if (meta.abstract) {
      out.push("\\begin{abstract}", esc(meta.abstract), "\\end{abstract}", "");
    }
    if (meta.keywords && meta.keywords.length) {
      out.push(`\\noindent\\textbf{Keywords:} ${meta.keywords.map(esc).join(", ")}`, "");
    }

    if (includeToc) {
      out.push("\\tableofcontents", "\\newpage", "");
    }

    ir.blocks.forEach((block) => {
      switch (block.type) {
        case "heading": {
          const headingText = (block.runs || []).map((r) => r.text || "").join("").trim();
          if (ir.title && block.level === 1 && headingText === ir.title) break;
          const cmd = HEADING_CMDS[Math.min(block.level - 1, 5)];
          out.push(`\\${cmd}{${runsToTex(block.runs, includeFootnotes)}}`);
          break;
        }
        case "paragraph":
          out.push(runsToTex(block.runs, includeFootnotes) + "\n");
          break;
        case "blockquote":
          out.push(`\\begin{quote}\n${runsToTex(block.runs, includeFootnotes)}\n\\end{quote}`);
          break;
        case "code":
          // fvextra's Verbatim wraps long lines (breakanywhere covers tokens
          // with no spaces, e.g. URLs or minified code) so they never run past
          // the page margin as plain {verbatim} did.
          out.push(
            "\\begin{Verbatim}[breaklines=true,breakanywhere=true,fontsize=\\small]\n" +
            `${block.text}\n\\end{Verbatim}`
          );
          break;
        case "math":
          out.push(`\\[\n${block.tex || ""}\n\\]`);
          break;
        case "list":
          out.push(listToTex(block, includeFootnotes));
          break;
        case "table":
          out.push(tableToTex(block, includeFootnotes));
          break;
        case "image":
          out.push(`% [Image: ${block.alt || block.src}]`);
          break;
        case "hr":
          out.push("\\noindent\\rule{\\textwidth}{0.4pt}");
          break;
      }
    });

    if (includeFootnotes) {
      const fn = buildFootnotesTex(ir, o.citationStyle);
      if (fn) out.push(fn);
    }

    out.push("", "\\end{document}", "");
    return out.join("\n");
  }

  GEP.latex = { convert };
})();
