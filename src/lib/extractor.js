/**
 * Content extractor.
 *
 * Reads the rendered Deep Research report from the DOM and converts it into a
 * format-agnostic intermediate representation (IR). Every exporter consumes the
 * same IR, so adding a new format never requires touching the DOM parsing logic.
 *
 * IR shape:
 *   { title: string, blocks: Block[], footnotes: Footnote[],
 *     lang?: string, dir?: 'ltr'|'rtl' }
 *
 * Block =
 *   | { type: 'heading', level: 1..6, runs: Run[] }
 *   | { type: 'paragraph', runs: Run[] }
 *   | { type: 'blockquote', runs: Run[] }
 *   | { type: 'code', text: string, lang?: string }
 *   | { type: 'hr' }
 *   | { type: 'list', ordered: boolean, items: ListItem[] }
 *   | { type: 'table', header: Run[][] | null, rows: Run[][][] }
 *   | { type: 'image', src: string, alt: string }
 *   | { type: 'math', tex: string, mathml: string, html?: string }
 *
 * ListItem = { runs: Run[], level: number }
 * Run      = { text: string, bold?: boolean, italic?: boolean, code?: boolean,
 *              href?: string, footnoteIndex?: number,
 *              image?: { src, alt },
 *              math?: { tex: string, mathml: string, html?: string, display: boolean } }
 * Footnote = { index: number }
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  const MAX_DEPTH = 64;

  // IR schema version, stamped on every extraction. Persisted copies (export
  // history backups, .json exports) carry it so future structural changes can
  // be migrated on load — see GEP.json.migrate(). Keep in sync with
  // SCHEMA_VERSION in src/exporters/json.js.
  const IR_VERSION = 1;

  // All Gemini DOM selectors live in selectors.js — the single source of
  // truth, loaded before this file per the manifest order (tests mirror it).
  const SEL = GEP.selectors;
  const SKIP_CUSTOM = new Set(SEL.SKIP_CUSTOM_TAGS);

  const BLOCK_HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

  // RTL script ranges: Hebrew, Arabic (+ Supplement / Extended-A), Syriac,
  // Thaana, NKo, and the Arabic/Hebrew presentation forms. Used to pick the
  // document base direction so Arabic/Hebrew/Persian/Urdu/Divehi reports render
  // right-to-left instead of being forced LTR.
  const RTL_LETTERS_G = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  // Strong LTR letters (Latin, Greek, Cyrillic, Armenian, Georgian, Hangul,
  // Kana, CJK …). Direction-neutral chars (digits, punctuation, whitespace) are
  // intentionally excluded so they don't dilute the ratio.
  const LTR_LETTERS_G = /[A-Za-z\u00C0-\u024F\u0370-\u052F\u0531-\u058F\u10A0-\u10FF\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g;

  /**
   * Best-effort base text direction from a content sample. Returns "rtl" when
   * RTL letters make up a meaningful share of the strong (directional) letters,
   * otherwise "ltr". Mixed-language reports still get per-block dir="auto"
   * downstream, so this only needs to choose the document's base direction.
   * @param {string} text
   * @returns {"rtl"|"ltr"}
   */
  function detectDir(text) {
    const s = String(text == null ? "" : text);
    const rtl = (s.match(RTL_LETTERS_G) || []).length;
    if (!rtl) return "ltr";
    const ltr = (s.match(LTR_LETTERS_G) || []).length;
    return rtl >= (rtl + ltr) * 0.3 ? "rtl" : "ltr";
  }

  // Tags to skip entirely — footnote-related tags are NOT skipped now.
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

  function findContentRoot() {
    // Try explicit selectors first
    for (const selector of SEL.CONTENT_ROOTS) {
      try {
        const node = document.querySelector(selector);
        if (node && node.textContent.trim().length > 0) {
          console.debug("[GEP] content root matched:", selector);
          return node;
        }
      } catch { /* invalid selector on some pages */ }
    }

    // Heuristic fallback: find the largest [class*="markdown"] element (#26)
    try {
      const candidates = document.querySelectorAll(SEL.CONTENT_HEURISTIC);
      let best = null;
      let bestLen = 0;
      for (const el of candidates) {
        const len = el.textContent.trim().length;
        if (len > bestLen) {
          bestLen = len;
          best = el;
        }
      }
      if (best && bestLen > 100) {
        console.debug("[GEP] content root matched via heuristic fallback, length:", bestLen);
        return best;
      }
    } catch { /* heuristic failed */ }

    return null;
  }

  function findTitle(root) {
    const heading = root.querySelector("h1, h2");
    if (heading && heading.textContent.trim()) return heading.textContent.trim();

    try {
      const toolbarTitle = document.querySelector(SEL.TITLE_FALLBACK);
      if (toolbarTitle && toolbarTitle.textContent.trim()) {
        return toolbarTitle.textContent.trim();
      }
    } catch { /* selector may fail */ }

    return (document.title || "gemini-deep-research").replace(/\s*[-–]\s*Gemini.*$/i, "").trim();
  }

  function mergeRun(runs, run) {
    if (!run.text && !run.footnoteIndex) return;
    const last = runs[runs.length - 1];
    if (
      last &&
      !run.footnoteIndex &&
      !last.footnoteIndex &&
      // Math/image/footnote runs are self-contained inline atoms. Merging text
      // into them would hide the prose, since exporters render only the atom
      // and ignore its .text — so keep the trailing text as its own run.
      !last.math &&
      !last.image &&
      !!last.bold === !!run.bold &&
      !!last.italic === !!run.italic &&
      !!last.code === !!run.code &&
      last.href === run.href
    ) {
      last.text += run.text;
    } else {
      runs.push(run);
    }
  }

  /**
   * Detects a math element (KaTeX wrapper or raw MathML) and returns its
   * source. KaTeX embeds the original LaTeX in <annotation encoding=
   * "application/x-tex"> and the accessible MathML in <math>. We capture both:
   * the tex feeds LaTeX/Markdown, the MathML feeds HTML/EPUB (native
   * rendering). Returns null for non-math elements.
   */
  /** Normalizes a language label/token to a fence-friendly identifier. */
  function normalizeLang(raw) {
    if (!raw) return "";
    let s = String(raw).trim().toLowerCase();
    if (!s) return "";
    const alias = {
      "c++": "cpp", "cplusplus": "cpp",
      "c#": "csharp", "objective-c": "objectivec",
      "js": "javascript", "ts": "typescript",
      "py": "python", "sh": "bash", "shell": "bash",
      "plain text": "", "plaintext": "", "text": "", "none": "", "code": "", "snippet": "", "output": "",
    };
    if (Object.prototype.hasOwnProperty.call(alias, s)) return alias[s];
    // A real fence language is a single token. Multi-word labels are descriptive
    // headers (e.g. Gemini's "Kod Snippeti", "INI / TOML") that would otherwise
    // collapse into a bogus identifier ("kodsnippeti") and trip code
    // highlighters — treat them as "no language".
    if (/\s/.test(s)) return "";
    return s.replace(/[^a-z0-9#+.-]/g, "");
  }

  /**
   * Best-effort programming-language detection for a <pre> code block.
   * Looks at the inner <code> (or the <pre> itself) for `language-xxx`,
   * `lang-xxx`, a bare `highlight-source-xxx` class, or a data attribute;
   * then falls back to the Gemini <code-block> header label.
   * Returns "" when no language hint is present.
   */
  function detectCodeLang(pre) {
    if (!pre) return "";
    const codeEl = pre.querySelector ? pre.querySelector("code") : null;
    const candidates = [
      codeEl && codeEl.getAttribute && codeEl.getAttribute("data-language"),
      pre.getAttribute && pre.getAttribute("data-language"),
      codeEl && codeEl.className,
      pre.className,
    ];
    for (const raw of candidates) {
      if (!raw || typeof raw !== "string") continue;
      const m = raw.match(/(?:language|lang|highlight-source|highlight)-([a-z0-9#+.-]+)/i);
      if (m) return normalizeLang(m[1]);
    }
    // Gemini renders code inside a <code-block> whose header shows the language
    // label in the first <span> of .code-block-decoration (no class on <pre>).
    const cb = pre.closest ? pre.closest(SEL.CODE_BLOCK_HOST) : null;
    if (cb && cb.querySelector) {
      const dec = cb.querySelector(SEL.CODE_BLOCK_LABEL);
      const span = dec && dec.querySelector ? dec.querySelector("span") : null;
      const label = span && span.textContent ? span.textContent.trim() : "";
      const norm = normalizeLang(label);
      if (norm) return norm;
    }
    return "";
  }

  function readMath(el) {
    if (!el || !el.tagName) return null;
    const cl = el.classList;
    const isKatex = cl && (cl.contains("katex") || cl.contains("katex-display"));
    // Gemini wraps formulas in <span class="math-inline"> / <div class="math-block">
    // with the LaTeX source kept in a data-math attribute.
    const isGemMath = cl && (cl.contains("math-inline") || cl.contains("math-block"));
    const isMathMl = el.tagName === "MATH";
    if (!isKatex && !isGemMath && !isMathMl) return null;

    const mathEl = isMathMl ? el : (el.querySelector ? el.querySelector("math") : null);
    let tex = "";
    // 1) Gemini's data-math attribute holds the raw LaTeX.
    if (el.getAttribute) tex = (el.getAttribute("data-math") || "").trim();
    // 2) KaTeX/MathML annotation fallback.
    if (!tex) {
      const scope = mathEl || el;
      const annot = scope.querySelector
        ? scope.querySelector('annotation[encoding="application/x-tex"]')
        : null;
      if (annot) tex = (annot.textContent || "").trim();
    }
    // 3) Legacy data-formula attribute.
    if (!tex && el.getAttribute) tex = (el.getAttribute("data-formula") || "").trim();

    const mathml = mathEl && mathEl.outerHTML ? mathEl.outerHTML : "";
    const display = !!(cl && (cl.contains("katex-display") || cl.contains("math-block")));

    // Capture KaTeX's already-rendered HTML so self-contained exports (HTML/PDF/
    // EPUB) can display the formula exactly as Gemini does — fully offline, no
    // math engine required. Prefer the .katex-display wrapper for block math.
    let html = "";
    if (isKatex) {
      html = el.outerHTML || "";
    } else if (el.querySelector) {
      const katexEl = el.querySelector(".katex-display") || el.querySelector(".katex");
      if (katexEl && katexEl.outerHTML) html = katexEl.outerHTML;
    }

    if (!tex && !mathml && !html) return null;
    return { tex, mathml, html, display };
  }

  /** Set of footnote indices seen during extraction. */
  let _seenFootnotes;

  function collectRuns(node, style, runs, depth) {
    if (depth > MAX_DEPTH) return runs;

    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent.replace(/\s+/g, " ");
        if (text) mergeRun(runs, { ...style, text });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.tagName;

      if (SKIP_TAGS.has(tag)) continue;
      if (child.getAttribute && child.getAttribute("aria-hidden") === "true") continue;

      // Skip carousel UI elements entirely — they are not content.
      if (SKIP_CUSTOM.has(tag)) continue;

      // Elements with hide-from-message-actions are UI buttons, skip them.
      if (child.hasAttribute && child.hasAttribute("hide-from-message-actions")) continue;

      // Math (KaTeX / MathML): capture source and do not descend, otherwise the
      // <annotation> LaTeX and MathML fallback text leak into the prose.
      const math = readMath(child);
      if (math) {
        runs.push({ text: "", math });
        continue;
      }

      if (tag === "BR") {
        mergeRun(runs, { ...style, text: "\n" });
        continue;
      }

      if (tag === "IMG") {
        const src = child.getAttribute("src");
        if (src) {
          runs.push({ text: "", image: { src, alt: child.getAttribute("alt") || "" } });
        }
        continue;
      }

      // Handle source footnotes — extract the source index.
      if (tag === SEL.FOOTNOTE_TAG) {
        const sup = child.querySelector(SEL.FOOTNOTE_SUP);
        if (sup) {
          const idx = parseInt(sup.getAttribute("data-turn-source-index"), 10);
          if (!isNaN(idx)) {
            _seenFootnotes.add(idx);
            runs.push({ text: "", footnoteIndex: idx });
          }
        }
        continue;
      }

      // SUP inside source-footnote is handled above; standalone SUPs are skipped
      // to avoid duplicating footnote markers.
      if (tag === "SUP" && child.classList && child.classList.contains("superscript")) {
        continue;
      }

      // RESPONSE-ELEMENT is a wrapper that contains footnotes inside — traverse it.
      if (tag === SEL.RESPONSE_WRAPPER_TAG) {
        collectRuns(child, style, runs, depth + 1);
        continue;
      }

      const nextStyle = { ...style };
      if (tag === "B" || tag === "STRONG") nextStyle.bold = true;
      if (tag === "I" || tag === "EM") nextStyle.italic = true;
      if (tag === "CODE") nextStyle.code = true;
      if (tag === "A") {
        const href = child.getAttribute("href");
        if (href) nextStyle.href = href;
      }

      collectRuns(child, nextStyle, runs, depth + 1);
    }
    return runs;
  }

  function runsOf(node) {
    return collectRuns(node, {}, [], 0);
  }

  function collectListItems(listEl, ordered, level, items) {
    if (level > MAX_DEPTH) return;
    for (const li of listEl.children) {
      if (li.tagName !== "LI") continue;

      const runs = [];
      for (const child of li.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "UL" || child.tagName === "OL")) {
          continue;
        }
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent.replace(/\s+/g, " ");
          if (text.trim()) mergeRun(runs, { text });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          collectRuns(child, {}, runs, 0);
        }
      }
      if (runs.length) items.push({ runs, level, ordered });
      for (const nested of li.children) {
        if (nested.tagName === "UL") collectListItems(nested, false, level + 1, items);
        if (nested.tagName === "OL") collectListItems(nested, true, level + 1, items);
      }
    }
  }

  function parseList(listEl, ordered, blocks) {
    const items = [];
    collectListItems(listEl, ordered, 0, items);
    if (items.length) blocks.push({ type: "list", ordered, items });
  }

  function parseTable(tableEl, blocks) {
    const rows = [];
    let header = null;

    // Only select direct/first-level <tr>s to avoid nested tables bleeding in.
    const tbody = tableEl.querySelector("tbody") || tableEl;
    const thead = tableEl.querySelector("thead");

    if (thead) {
      for (const tr of thead.querySelectorAll("tr")) {
        const cells = [];
        for (const cell of tr.children) {
          if (cell.tagName === "TH" || cell.tagName === "TD") cells.push(runsOf(cell));
        }
        if (cells.length && !header) header = cells;
      }
    }

    const bodyRows = tbody.querySelectorAll(":scope > tr");
    for (const tr of bodyRows) {
      const cells = [];
      let isHeader = false;
      for (const cell of tr.children) {
        if (cell.tagName !== "TD" && cell.tagName !== "TH") continue;
        if (cell.tagName === "TH") isHeader = true;
        cells.push(runsOf(cell));
      }
      if (!cells.length) continue;
      if (isHeader && !header) header = cells;
      else rows.push(cells);
    }

    if (header || rows.length) blocks.push({ type: "table", header, rows });
  }

  function walk(node, blocks, depth) {
    if (depth > MAX_DEPTH) return blocks;

    for (const child of node.children) {
      const tag = child.tagName;

      // Standalone display math (block-level KaTeX/MathML, not inside a <p>).
      const blockMath = readMath(child);
      if (blockMath && (blockMath.display || tag === "MATH")) {
        blocks.push({ type: "math", tex: blockMath.tex, mathml: blockMath.mathml, html: blockMath.html });
        continue;
      }

      if (BLOCK_HEADINGS.has(tag)) {
        blocks.push({ type: "heading", level: Number(tag[1]), runs: runsOf(child) });
      } else if (tag === "P") {
        const runs = runsOf(child);
        if (runs.length) blocks.push({ type: "paragraph", runs });
      } else if (tag === "UL") {
        parseList(child, false, blocks);
      } else if (tag === "OL") {
        parseList(child, true, blocks);
      } else if (tag === "TABLE") {
        parseTable(child, blocks);
      } else if (tag === "BLOCKQUOTE") {
        const runs = runsOf(child);
        if (runs.length) blocks.push({ type: "blockquote", runs });
      } else if (tag === "PRE") {
        const text = child.textContent.replace(/\s+$/g, "");
        if (text.trim()) blocks.push({ type: "code", text, lang: detectCodeLang(child) });
      } else if (tag === "HR") {
        blocks.push({ type: "hr" });
      } else if (tag === "IMG") {
        const src = child.getAttribute("src");
        if (src) blocks.push({ type: "image", src, alt: child.getAttribute("alt") || "" });
      } else if (tag === "FIGURE") {
        const img = child.querySelector("img");
        if (img && img.getAttribute("src")) {
          const caption = child.querySelector("figcaption");
          blocks.push({
            type: "image",
            src: img.getAttribute("src"),
            alt: caption ? caption.textContent.trim() : (img.getAttribute("alt") || ""),
          });
        } else {
          walk(child, blocks, depth + 1);
        }
      } else {
        walk(child, blocks, depth + 1);
      }
    }
    return blocks;
  }

  /**
   * Collects source URL/title metadata from Gemini's source panel.
   *
   * The source panel is a separate DOM section (typically a sibling of the
   * report content) with the structure:
   *
   *   div.source-list.used-sources
   *     browse-web-item  (repeated, 1-indexed)
   *       a[href][data-test-id="browse-web-item-link"]
   *         div.title-container
   *           img.favicon
   *           div.display-name  -> "windowsforum.com"
   *           div.sub-title     -> "Best AI Browsers in 2026..."
   *
   * The items are ordered: the 1st browse-web-item = source [1], etc.
   * We match each source-footnote index to its position in this list.
   */
  function collectFootnotes(root, seenIndices) {
    const sourceMap = new Map();

    try {
      // --- Strategy 1: Find the dedicated source panel ---
      const sourceItems = findSourcePanelItems();

      if (sourceItems.length > 0) {
        // Items are 1-indexed in display order.
        sourceItems.forEach((item, i) => {
          const idx = i + 1;
          sourceMap.set(idx, item);
        });
        console.debug("[GEP] source panel: found " + sourceItems.length + " sources");
      }
    } catch (err) {
      console.debug("[GEP] footnote collection error:", err);
    }

    // Build the final footnotes array, sorted by index.
    const footnotes = Array.from(seenIndices)
      .sort((a, b) => a - b)
      .map((idx) => {
        const data = sourceMap.get(idx);
        if (data) {
          return { index: idx, url: data.url, title: data.title, domain: data.domain };
        }
        return { index: idx };
      });

    return footnotes;
  }

  /**
   * Finds all source items from Gemini's source panel.
   * Returns an ordered array of { url, title, domain }.
   */
  function findSourcePanelItems() {
    const items = [];

    // Selector chain from most specific to broadest.
    let panel = null;
    for (const sel of SEL.SOURCE_PANELS) {
      try {
        panel = document.querySelector(sel);
        if (panel) break;
      } catch { /* selector may fail */ }
    }

    // Find browse-web-item elements.
    // If we found a panel, search within it; otherwise search the whole doc.
    const browseItems = panel
      ? panel.querySelectorAll(SEL.SOURCE_ITEM)
      : document.querySelectorAll(SEL.SOURCE_ITEM);

    if (browseItems.length === 0) return items;

    for (const browseItem of browseItems) {
      const a = browseItem.querySelector(SEL.SOURCE_LINK);
      if (!a) continue;

      const href = a.getAttribute("href");
      if (!href || !href.startsWith("http")) continue;

      // Extract domain from .display-name element or from the URL.
      const displayNameEl = browseItem.querySelector(SEL.SOURCE_DOMAIN);
      let domain = "";
      if (displayNameEl) {
        domain = displayNameEl.textContent.trim();
      }
      if (!domain) {
        try { domain = new URL(href).hostname.replace(/^www\./, ""); } catch {}
      }

      // Extract title from .sub-title element.
      const subTitleEl = browseItem.querySelector(SEL.SOURCE_TITLE);
      let title = "";
      if (subTitleEl) {
        title = subTitleEl.textContent.trim();
      }
      if (!title) {
        // Fallback: use text content minus domain and accessibility text.
        title = a.textContent.replace(/\s+/g, " ").trim();
        if (domain && title.startsWith(domain)) {
          title = title.substring(domain.length).trim();
        }
        title = title
          .replace(/Yeni pencerede açılır$/i, "")
          .replace(/Opens in new (?:window|tab)$/i, "")
          .trim();
      }
      if (!title) title = domain || href;

      items.push({ url: href, title, domain });
    }

    return items;
  }

  function extract() {
    const root = findContentRoot();
    if (!root) return null;

    // Reset footnote tracking for this extraction.
    _seenFootnotes = new Set();

    const blocks = walk(root, [], 0);
    const title = findTitle(root);

    // Collect footnotes with URL/title metadata.
    const footnotes = collectFootnotes(root, _seenFootnotes);

    // Document language + base direction so every display format renders
    // non-Latin and RTL reports correctly (not forced to en/ltr).
    let lang = "";
    try {
      const docEl = document.documentElement;
      // `.lang` is the standard reflection in browsers; fall back to the raw
      // attribute for DOM implementations that don't reflect it as a property.
      lang = ((docEl && (docEl.lang || (docEl.getAttribute && docEl.getAttribute("lang")))) || "").trim();
    } catch { /* no document (e.g. node sandbox) */ }
    const sample = `${title || ""} ${root.textContent || ""}`.slice(0, 4000);
    const dir = detectDir(sample);

    return { v: IR_VERSION, title, blocks, footnotes, lang, dir, root };
  }

  /**
   * Resolves the content root and reports HOW it was resolved (which selector
   * matched, or whether the heuristic fallback was used). Mirrors
   * findContentRoot but returns metadata instead of just the node.
   */
  function resolveRootWithMethod() {
    for (const selector of SEL.CONTENT_ROOTS) {
      try {
        const node = document.querySelector(selector);
        if (node && node.textContent.trim().length > 0) {
          return { node, method: "selector", detail: selector };
        }
      } catch { /* invalid selector */ }
    }
    try {
      const candidates = document.querySelectorAll(SEL.CONTENT_HEURISTIC);
      let best = null;
      let bestLen = 0;
      for (const el of candidates) {
        const len = el.textContent.trim().length;
        if (len > bestLen) { bestLen = len; best = el; }
      }
      if (best && bestLen > 100) {
        return { node: best, method: "heuristic-fallback", detail: `length=${bestLen}` };
      }
    } catch { /* heuristic failed */ }
    return { node: null, method: "none", detail: "no content root found" };
  }

  /**
   * Maintainer diagnostic. Never throws; returns a structured report describing
   * how robustly the current page maps onto our selectors and IR. Useful when
   * Gemini changes its DOM and extraction silently degrades.
   */
  function diagnose() {
    const report = {
      timestamp: new Date().toISOString(),
      url: (typeof location !== "undefined" && location.href) || "",
      version: "",
    };
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
        report.version = chrome.runtime.getManifest().version || "";
      }
    } catch { /* not in extension context */ }

    try {
      const rootInfo = resolveRootWithMethod();
      report.contentRoot = {
        found: !!rootInfo.node,
        method: rootInfo.method,
        detail: rootInfo.detail,
        textLength: rootInfo.node ? rootInfo.node.textContent.trim().length : 0,
      };

      if (!rootInfo.node) {
        report.ok = false;
        return report;
      }

      _seenFootnotes = new Set();
      const blocks = walk(rootInfo.node, [], 0);

      const blockCounts = {};
      blocks.forEach((b) => { blockCounts[b.type] = (blockCounts[b.type] || 0) + 1; });
      report.blockCounts = blockCounts;
      report.blockTotal = blocks.length;

      report.title = { value: findTitle(rootInfo.node) };

      const seen = Array.from(_seenFootnotes).sort((a, b) => a - b);
      const panelItems = findSourcePanelItems();
      report.footnotes = {
        seenIndices: seen,
        seenCount: seen.length,
        panelItemCount: panelItems.length,
        matched: seen.filter((i) => i >= 1 && i <= panelItems.length).length,
        unmatched: seen.filter((i) => i < 1 || i > panelItems.length),
      };

      report.math = {
        runCount: blocks.reduce(
          (n, b) => n + ((b.runs || []).filter((r) => r.math).length),
          0
        ),
        blockCount: blockCounts.math || 0,
      };

      report.ok =
        report.contentRoot.found &&
        report.blockTotal > 0 &&
        report.footnotes.unmatched.length === 0;
    } catch (err) {
      report.ok = false;
      report.error = String((err && err.stack) || err);
    }
    return report;
  }

  GEP.extractor = { extract, findContentRoot, findTitle, diagnose, detectDir, IR_VERSION };
})();
