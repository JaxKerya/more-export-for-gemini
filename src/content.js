/**
 * Content entry point.
 *
 * Watches the page for the Deep Research export menu opening and injects extra
 * export options. The MutationObserver keeps working across Gemini's SPA
 * re-renders because each freshly opened menu is a new DOM node we process.
 *
 * Format visibility is driven by user settings stored in chrome.storage.sync.
 * v2.0.0: Added EPUB, footnotes, TOC, markdown flavors, auto-export, error retry.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  // MIME / extension tables live in GEP.exportOpts (single source of truth,
  // shared with the offline re-export UI in the Options page).
  const MIME = GEP.exportOpts.MIME;
  const EXT = GEP.exportOpts.EXT;

  /** Simple text-format converters keyed by format name. */
  const TEXT_CONVERTERS = {
    markdown: () => GEP.markdown,
    txt:      () => GEP.txt,
    html:     () => GEP.html,
    reader:   () => GEP.reader,
    json:     () => GEP.json,
    latex:    () => GEP.latex,
    csv:      () => GEP.csv,
    bibtex:   () => GEP.bibtex,
    ris:      () => GEP.ris,
    csljson:  () => GEP.csljson,
    rtf:      () => GEP.rtf,
  };

  // --- Lazy exporter stack -------------------------------------------------
  // Only the core (extraction, menu injection, settings) loads on every Gemini
  // page; the heavy conversion stack (KaTeX/highlight vendors + 16 exporters)
  // is imported on demand at the first export. The files are side-effectful
  // IIFEs that register themselves on window.GEP, so importing them as
  // modules in the isolated world is enough — no exports needed.

  let exportersReady = null;

  function loadExporters() {
    // Already present (options-page sandbox and tests preload the full stack).
    if (GEP.vault && GEP.texmath) return Promise.resolve();
    if (!exportersReady) {
      const war = chrome.runtime.getManifest().web_accessible_resources || [];
      const files = (war[0] && war[0].resources) || [];
      const t0 = Date.now();
      exportersReady = (async () => {
        for (const f of files) {
          await import(chrome.runtime.getURL(f));
        }
        console.debug(`[GEP] exporter stack loaded (${files.length} files, ${Date.now() - t0}ms)`);
      })().catch((err) => {
        exportersReady = null; // allow retry on the next export attempt
        throw err;
      });
    }
    return exportersReady;
  }

  let enabledFormats = null;
  let settingsReady = null;

  function loadSettings() {
    if (!settingsReady) {
      settingsReady = GEP.settings.load().then((f) => { enabledFormats = f; });
    }
    return settingsReady;
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.formats || changes.options) {
      settingsReady = null;
      enabledFormats = null;
      loadSettings();
    }
  });

  /** Build export options from current settings (delegates to GEP.exportOpts). */
  function getExportOpts(format) {
    if (!enabledFormats) return {};
    return GEP.exportOpts.build(enabledFormats, format);
  }

  // --- Toast with retry support (#23), isolated in a Shadow DOM so Gemini's
  // global styles can never bleed into or override our feedback UI. ---

  const TOAST_CSS = `
    .gep-toast {
      position: fixed; bottom: 24px; left: 50%;
      transform: translateX(-50%) translateY(16px);
      background: #1f1f1f; color: #e3e3e3;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 12px 18px; border-radius: 10px;
      font-family: "Google Sans Text", "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 14px; line-height: 1.3;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
      opacity: 0; pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
      max-width: 80vw; display: flex; align-items: center; gap: 12px;
    }
    .gep-toast.gep-toast-visible { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
    .gep-toast.gep-toast-error { border-color: #f28b82; color: #f6aea9; }
    .gep-toast-retry {
      background: rgba(255, 255, 255, 0.12); color: #8ab4f8;
      border: 1px solid rgba(138, 180, 248, 0.3); border-radius: 6px;
      padding: 4px 12px; font-size: 12px; font-weight: 500; font-family: inherit;
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
      transition: background 0.15s, border-color 0.15s;
    }
    .gep-toast-retry:hover { background: rgba(138, 180, 248, 0.15); border-color: rgba(138, 180, 248, 0.5); }
    .gep-progress-track { width: 120px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.15); overflow: hidden; flex-shrink: 0; }
    .gep-progress-bar { height: 100%; width: 0%; background: #8ab4f8; transition: width 0.2s ease; }
  `;

  let toastTimer = null;
  let toastShadow = null;

  function getToastRoot() {
    if (toastShadow && toastShadow.host && toastShadow.host.isConnected) return toastShadow;
    const host = document.createElement("div");
    host.id = "gep-toast-host";
    host.style.cssText = "position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0;";
    const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    const style = document.createElement("style");
    style.textContent = TOAST_CSS;
    root.appendChild(style);
    (document.body || document.documentElement).appendChild(host);
    toastShadow = root;
    return root;
  }

  function getToastEl() {
    const root = getToastRoot();
    let el = root.querySelector(".gep-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "gep-toast";
      root.appendChild(el);
    }
    return el;
  }

  function toast(message, opts) {
    const options = typeof opts === "boolean" ? { isError: opts } : (opts || {});
    const { isError = false, retryFn, actionLabel, actionFn } = options;

    const el = getToastEl();
    el.textContent = "";

    const textSpan = document.createElement("span");
    textSpan.textContent = message;
    el.appendChild(textSpan);

    const addButton = (label, fn) => {
      const btn = document.createElement("button");
      btn.className = "gep-toast-retry";
      btn.textContent = label;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        el.classList.remove("gep-toast-visible");
        Promise.resolve()
          .then(() => fn())
          .catch((err) => console.error("[GEP] toast action failed", err));
      });
      el.appendChild(btn);
    };

    if (retryFn) addButton("Retry", retryFn);
    if (actionFn) addButton(actionLabel || "Details", actionFn);
    const hasButton = !!(retryFn || actionFn);

    el.classList.toggle("gep-toast-error", isError);
    el.classList.add("gep-toast-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("gep-toast-visible"), hasButton ? 8000 : 3200);
  }

  /** Show a sticky progress toast (no auto-dismiss). */
  function progress(done, total, label) {
    const el = getToastEl();
    clearTimeout(toastTimer);
    el.classList.remove("gep-toast-error");
    el.textContent = "";

    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const textSpan = document.createElement("span");
    textSpan.textContent = label || `Exporting… ${pct}%`;
    el.appendChild(textSpan);

    const track = document.createElement("div");
    track.className = "gep-progress-track";
    const bar = document.createElement("div");
    bar.className = "gep-progress-bar";
    bar.style.width = pct + "%";
    track.appendChild(bar);
    el.appendChild(track);

    el.classList.add("gep-toast-visible");
  }

  /** Yield control to the event loop so the page stays responsive. */
  const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

  // --- In-memory IR cache: exporting the same report in several formats
  // should not re-scan the DOM each time. We key the cache on the content
  // root node identity plus a cheap content signature for invalidation. ---

  let cachedIR = null;
  let cachedRoot = null;
  let cachedSig = "";

  function contentSignature(root) {
    if (!root) return "";
    return `${(root.textContent || "").length}:${root.childElementCount}`;
  }

  /**
   * Generates and downloads the diagnostics report. Shared by the Options-page
   * "Run Diagnostics" tool (GEP_DIAGNOSE) and the extraction-failure toast, so
   * users can attach the report to a bug form when the Gemini DOM changes.
   */
  function downloadDiagnostics() {
    const report = GEP.extractor.diagnose();
    const text = formatDiagnostics(report);
    GEP.download.downloadBlob(text, "gep-diagnostics.txt", "text/plain;charset=utf-8");
    return report;
  }

  /** Failure toast that offers a one-click diagnostics download. */
  function extractionFailedToast(message) {
    toast(message, {
      isError: true,
      actionLabel: "Get diagnostics",
      actionFn: () => {
        downloadDiagnostics();
        toast("Diagnostics report downloaded. You can attach it to a bug report from Settings.");
      },
    });
  }

  function getIR() {
    try {
      let root = null;
      try { root = GEP.extractor.findContentRoot(); } catch { root = null; }

      if (root && cachedIR && cachedRoot === root && cachedSig === contentSignature(root)) {
        return cachedIR;
      }

      const ir = GEP.extractor.extract();
      if (!ir || !ir.blocks.length) {
        extractionFailedToast("No Deep Research content found to export.");
        return null;
      }

      cachedIR = ir;
      cachedRoot = root;
      cachedSig = root ? contentSignature(root) : "";
      return ir;
    } catch (err) {
      console.error("[GEP] extraction failed", err);
      extractionFailedToast("Failed to read page content.");
      return null;
    }
  }

  async function onExport(rawFormat) {
    try {
      await loadExporters();
    } catch (err) {
      console.error("[GEP] failed to load exporter modules", err);
      toast("Failed to load export modules.", { isError: true, retryFn: () => onExport(rawFormat) });
      return;
    }

    // Selective export: "markdown@tables", "csv@tables", "markdown@nosrc", …
    let format = rawFormat;
    let scope = null;
    if (typeof rawFormat === "string" && rawFormat.includes("@")) {
      [format, scope] = rawFormat.split("@");
    }

    let ir = getIR();
    if (!ir) return;
    // Auto-backup (#13): snapshot the full IR so the report can be re-exported
    // from Options later, even after the Gemini conversation is deleted.
    // Fire-and-forget — a backup failure must never block the export itself.
    if (GEP.history) {
      GEP.history.add(ir, { format: rawFormat }).catch((err) => {
        console.debug("[GEP] history backup skipped", err);
      });
    }
    if (scope && GEP.irFilter) ir = GEP.irFilter.apply(ir, scope);

    const exportOpts = getExportOpts(format);
    // Source hygiene (#16/#17/#20): dedupe / sort / DOI-ISBN enrichment. These
    // are global (not per-format), so applying once here covers single-format
    // and bundle exports that reuse this IR. Defaults are a no-op.
    if (GEP.sourceHygiene) ir = GEP.sourceHygiene.apply(ir, exportOpts);
    const tpl = enabledFormats ? enabledFormats.filename_template : null;
    const fmtToken = scope ? `${format}-${scope}` : format;
    const fname = (title, ext, fmt) =>
      GEP.download.templateFileName(title, ext, fmt || fmtToken, tpl, ir);

    try {
      if (TEXT_CONVERTERS[format]) {
        const converter = TEXT_CONVERTERS[format]();
        if (!converter || typeof converter.convert !== "function") {
          toast(`Exporter "${format}" is not available.`, { isError: true });
          return;
        }
        const result = converter.convert(ir, exportOpts);
        const fileName = fname(ir.title, EXT[format]);
        GEP.download.downloadBlob(result, fileName, MIME[format]);
        toast(`Downloading: ${fileName}`);
        return;
      }

      switch (format) {
        case "docx": {
          const blob = GEP.docx.convert(ir, exportOpts);
          const fileName = fname(ir.title, EXT.docx);
          GEP.download.downloadBlob(blob, fileName, MIME.docx);
          toast(`Downloading: ${fileName}`);
          return;
        }
        case "epub": {
          const blob = GEP.epub.convert(ir, exportOpts);
          const fileName = fname(ir.title, EXT.epub);
          GEP.download.downloadBlob(blob, fileName, MIME.epub);
          toast(`Downloading: ${fileName}`);
          return;
        }
        case "pdf":
          await GEP.pdf.exportPdf(ir, exportOpts);
          toast("Print dialog opened for PDF.");
          return;
        case "clipboard_md": {
          const mdOpts = { ...exportOpts };
          await navigator.clipboard.writeText(GEP.markdown.convert(ir, mdOpts));
          toast("Markdown copied to clipboard.");
          return;
        }
        case "clipboard_txt":
          await navigator.clipboard.writeText(GEP.txt.convert(ir, exportOpts).replace(/\r\n/g, "\n"));
          toast("Plain text copied to clipboard.");
          return;
        case "clipboard_html": {
          const richHtml = GEP.pdf.buildDocument(ir, exportOpts);
          const htmlBlob = new Blob([richHtml], { type: "text/html" });
          const textFallback = new Blob([GEP.txt.convert(ir, exportOpts)], { type: "text/plain" });
          await navigator.clipboard.write([
            new ClipboardItem({ "text/html": htmlBlob, "text/plain": textFallback }),
          ]);
          toast("Rich HTML copied to clipboard.");
          return;
        }
        case "clipboard_json":
          await navigator.clipboard.writeText(GEP.json.convert(ir));
          toast("JSON copied to clipboard.");
          return;
        case "vault": {
          const entries = GEP.vault.buildEntries(ir, exportOpts);
          if (!entries.length) {
            toast("Nothing to export to a vault.", { isError: true });
            return;
          }
          const zipName = fname(ir.title, EXT.vault, "vault");
          GEP.download.downloadBlob(GEP.zip.build(entries), zipName, MIME.vault);
          toast(`Downloading: ${zipName} (${entries.length} files)`);
          return;
        }
        case "zip_all": {
          const ef = enabledFormats || {};
          const entryName = (fmt) => fname(ir.title, EXT[fmt], fmt);

          // Plan the work first so we can report meaningful progress.
          // Each job receives its own per-format options (#50) at run time so
          // overrides apply inside the bundle exactly as for single exports.
          const textJobs = [
            ["markdown", (o) => GEP.markdown.convert(ir, o)],
            ["txt", (o) => GEP.txt.convert(ir, o)],
            ["html", (o) => GEP.html.convert(ir, o)],
            ["reader", (o) => GEP.reader.convert(ir, o)],
            ["json", () => GEP.json.convert(ir)],
            ["latex", (o) => GEP.latex.convert(ir, o)],
            ["csv", () => GEP.csv.convert(ir)],
            ["bibtex", () => GEP.bibtex.convert(ir)],
            ["ris", () => GEP.ris.convert(ir)],
            ["csljson", () => GEP.csljson.convert(ir)],
            ["rtf", (o) => GEP.rtf.convert(ir, o)],
          ].filter(([k]) => ef[k]);

          const binaryJobs = [];
          if (ef.docx) binaryJobs.push(["docx", (o) => GEP.docx.convert(ir, o)]);
          if (ef.epub && GEP.epub) binaryJobs.push(["epub", (o) => GEP.epub.convert(ir, o)]);

          const total = textJobs.length + binaryJobs.length;
          if (!total) {
            toast("No download formats enabled. Enable at least one in Settings.", { isError: true });
            return;
          }

          const entries = [];
          let done = 0;
          for (const [fmt, run] of textJobs) {
            progress(done, total, `Exporting ${fmt}… (${done + 1}/${total})`);
            entries.push({ name: entryName(fmt), data: run(getExportOpts(fmt)) });
            done++;
            await yieldToUI();
          }
          for (const [fmt, run] of binaryJobs) {
            progress(done, total, `Exporting ${fmt}… (${done + 1}/${total})`);
            const blob = run(getExportOpts(fmt));
            entries.push({ name: entryName(fmt), data: new Uint8Array(await blob.arrayBuffer()) });
            done++;
            await yieldToUI();
          }

          progress(total, total, "Packaging ZIP…");
          const zipName = fname(ir.title, ".zip", "zip");
          GEP.download.downloadBlob(GEP.zip.build(entries), zipName, MIME.zip);
          toast(`Downloading: ${zipName} (${entries.length} file${entries.length > 1 ? "s" : ""})`);
          return;
        }
        default:
          console.warn("[GEP] unknown format:", format);
          return;
      }
    } catch (err) {
      console.error("[GEP] export error", err);
      toast("An error occurred during export.", {
        isError: true,
        retryFn: () => onExport(rawFormat),
      });
    }
  }

  /** Synchronous scan — settings must already be loaded. */
  function processNodeSync(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const menus = [];
    if (node.matches && node.matches(".mat-mdc-menu-content")) menus.push(node);
    if (node.querySelectorAll) {
      node.querySelectorAll(".mat-mdc-menu-content").forEach((m) => menus.push(m));
    }
    for (const menu of menus) {
      try {
        GEP.menuInjector.inject(menu, onExport, enabledFormats);
      } catch (err) {
        console.error("[GEP] injection failed", err);
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (!enabledFormats) {
      loadSettings().then(() => {
        for (const m of mutations) m.addedNodes.forEach(processNodeSync);
      });
      return;
    }
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(processNodeSync);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  loadSettings().then(() => {
    document.querySelectorAll(".mat-mdc-menu-content").forEach((m) => {
      try {
        GEP.menuInjector.inject(m, onExport, enabledFormats);
      } catch (err) {
        console.error("[GEP] initial injection failed", err);
      }
    });

  });

  const FLAVORS = ["gfm", "commonmark", "obsidian", "notion"];
  const CITATIONS = ["numbered", "apa", "mla", "chicago", "ieee", "vancouver", "harvard", "acs", "ama"];

  // Option-condition variants exercised on a representative format set so the
  // TOC-off / footnotes-off / metadata-on render paths get covered too (the
  // citation-style/flavor matrix above keeps include_toc/footnotes on).
  const SAMPLE_META = {
    author: "Test Author",
    affiliation: "Test University",
    keywords: "fourier, dsp, signal",
    abstract: "Bu, metadata render yolunu doğrulamak için kullanılan örnek bir özettir.",
  };
  const DEBUG_VARIANTS = [
    ["notoc", { includeToc: false, includeFootnotes: true }],
    ["nofn", { includeToc: true, includeFootnotes: false }],
    ["meta", { includeToc: true, includeFootnotes: true, meta: SAMPLE_META }],
  ];

  async function onDebugExport() {
    await loadExporters();
    const ir = getIR();
    if (!ir) return;

    const baseOpts = { includeToc: true, includeFootnotes: true, meta: getExportOpts().meta };
    const entries = [];

    function add(name, data) {
      if (typeof data === "string") entries.push({ name, data });
    }

    for (const flavor of FLAVORS) {
      for (const cite of CITATIONS) {
        const opts = { ...baseOpts, flavor, citationStyle: cite };
        add(`markdown-${flavor}-${cite}.md`, GEP.markdown.convert(ir, opts));
      }
    }

    for (const cite of CITATIONS) {
      const opts = { ...baseOpts, citationStyle: cite };
      add(`txt-${cite}.txt`, GEP.txt.convert(ir, opts));
      add(`html-${cite}.html`, GEP.html.convert(ir, opts));
      add(`reader-${cite}.html`, GEP.reader.convert(ir, opts));
      add(`latex-${cite}.tex`, GEP.latex.convert(ir, opts));
      add(`rtf-${cite}.rtf`, GEP.rtf.convert(ir, opts));
    }

    add("json.json", GEP.json.convert(ir));
    add("csv.csv", GEP.csv.convert(ir));
    add("bibtex.bib", GEP.bibtex.convert(ir));
    add("ris.ris", GEP.ris.convert(ir));

    add("csljson.json", GEP.csljson.convert(ir));

    try {
      const vaultEntries = GEP.vault.buildEntries(ir, baseOpts);
      vaultEntries.forEach((e) => add(`vault/${e.name}`, e.data));
    } catch (e) { console.error("[GEP] debug vault failed", e); }

    // Condition variants (TOC off / footnotes off / metadata on) on a
    // representative format set — citation style fixed to keep the count small.
    for (const [tag, vopts] of DEBUG_VARIANTS) {
      const o = { ...baseOpts, ...vopts, citationStyle: "numbered" };
      add(`variants/markdown-${tag}.md`, GEP.markdown.convert(ir, { ...o, flavor: "gfm" }));
      // Obsidian routes metadata through YAML front matter (gfm uses an inline block),
      // so emit an Obsidian-flavored copy of the metadata variant to cover that path too.
      if (vopts.meta) {
        add(`variants/markdown-obsidian-${tag}.md`, GEP.markdown.convert(ir, { ...o, flavor: "obsidian" }));
      }
      add(`variants/latex-${tag}.tex`, GEP.latex.convert(ir, o));
      add(`variants/html-${tag}.html`, GEP.html.convert(ir, o));
      add(`variants/reader-${tag}.html`, GEP.reader.convert(ir, o));
    }

    for (let i = 0; i < CITATIONS.length; i++) {
      const cite = CITATIONS[i];
      const opts = { ...baseOpts, citationStyle: cite };
      progress(i, CITATIONS.length, `Debug: documents ${i + 1}/${CITATIONS.length}…`);
      try {
        const docxBlob = GEP.docx.convert(ir, opts);
        entries.push({ name: `docx-${cite}.docx`, data: new Uint8Array(await docxBlob.arrayBuffer()) });
      } catch (e) { console.error(`[GEP] debug docx-${cite} failed`, e); }
      try {
        const epubBlob = GEP.epub.convert(ir, opts);
        entries.push({ name: `epub-${cite}.epub`, data: new Uint8Array(await epubBlob.arrayBuffer()) });
      } catch (e) { console.error(`[GEP] debug epub-${cite} failed`, e); }
      await yieldToUI();
    }

    // Binary condition variants (TOC off / footnotes off / metadata on).
    for (const [tag, vopts] of DEBUG_VARIANTS) {
      const o = { ...baseOpts, ...vopts, citationStyle: "numbered" };
      try {
        entries.push({ name: `variants/docx-${tag}.docx`, data: new Uint8Array(await GEP.docx.convert(ir, o).arrayBuffer()) });
      } catch (e) { console.error(`[GEP] debug docx-${tag} failed`, e); }
      try {
        entries.push({ name: `variants/epub-${tag}.epub`, data: new Uint8Array(await GEP.epub.convert(ir, o).arrayBuffer()) });
      } catch (e) { console.error(`[GEP] debug epub-${tag} failed`, e); }
      await yieldToUI();
    }

    progress(1, 1, "Debug: packaging ZIP…");
    const count = entries.length;
    GEP.download.downloadBlob(GEP.zip.build(entries), "debug-export.zip", MIME.zip);
    toast(`Debug export: ${count} files downloaded.`);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "GEP_PING") {
      try {
        const root = GEP.extractor.findContentRoot();
        sendResponse({ hasContent: !!root });
      } catch {
        sendResponse({ hasContent: false });
      }
      return true;
    }

    if (msg.type === "GEP_EXPORT") {
      if (!msg.format || typeof msg.format !== "string") {
        sendResponse({ ok: false, error: "Invalid format" });
        return true;
      }
      onExport(msg.format)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (msg.type === "GEP_DEBUG_EXPORT") {
      onDebugExport()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (msg.type === "GEP_QUALITY") {
      // The validator's math check needs GEP.texmath (lazy); without it the
      // check degrades gracefully, but a diagnostic action deserves the full
      // report, so load the stack first (failures are non-fatal).
      loadExporters().catch(() => {}).then(() => {
        try {
          const ir = getIR();
          if (!ir) {
            sendResponse({ ok: false, error: "No content found." });
            return;
          }
          const report = GEP.validator.check(ir);
          const s = report.stats;
          toast(
            report.ok
              ? `Quality OK - no issues found.`
              : `Quality: ${s.errors} error(s), ${s.warnings} warning(s), ${s.infos} info.`,
            { isError: !report.ok }
          );
          sendResponse({ ok: true, report });
        } catch (err) {
          toast("Quality check failed: " + String(err), { isError: true });
          sendResponse({ ok: false, error: String(err) });
        }
      });
      return true;
    }

    if (msg.type === "GEP_DIAGNOSE") {
      try {
        const report = downloadDiagnostics();
        toast(report.ok ? "Diagnostics OK - report downloaded." : "Diagnostics found issues - report downloaded.", { isError: !report.ok });
        sendResponse({ ok: true, report });
      } catch (err) {
        toast("Diagnostics failed: " + String(err), { isError: true });
        sendResponse({ ok: false, error: String(err) });
      }
      return true;
    }
  });

  /** Renders the diagnose() report object into a human-readable text file. */
  function formatDiagnostics(r) {
    const lines = [
      "Gemini Export — Diagnostics Report",
      "==================================",
      `Timestamp : ${r.timestamp}`,
      `Version   : ${r.version || "(unknown)"}`,
      `URL       : ${r.url}`,
      `Overall   : ${r.ok ? "OK" : "ISSUES DETECTED"}`,
      "",
    ];
    if (r.contentRoot) {
      lines.push(
        "Content root",
        `  found      : ${r.contentRoot.found}`,
        `  method     : ${r.contentRoot.method}`,
        `  detail     : ${r.contentRoot.detail}`,
        `  textLength : ${r.contentRoot.textLength}`,
        ""
      );
    }
    if (r.title) lines.push("Title", `  ${r.title.value}`, "");
    if (r.blockCounts) {
      lines.push(`Blocks (total ${r.blockTotal})`);
      Object.keys(r.blockCounts).sort().forEach((k) => {
        lines.push(`  ${k.padEnd(12)}: ${r.blockCounts[k]}`);
      });
      lines.push("");
    }
    if (r.math) {
      lines.push("Math", `  inline runs : ${r.math.runCount}`, `  blocks      : ${r.math.blockCount}`, "");
    }
    if (r.footnotes) {
      lines.push(
        "Footnotes / Sources",
        `  seen indices   : ${r.footnotes.seenIndices.join(", ") || "(none)"}`,
        `  seen count     : ${r.footnotes.seenCount}`,
        `  panel items    : ${r.footnotes.panelItemCount}`,
        `  matched        : ${r.footnotes.matched}`,
        `  unmatched      : ${r.footnotes.unmatched.join(", ") || "(none)"}`,
        ""
      );
    }
    const menuStats = GEP.menuInjector && GEP.menuInjector.stats;
    if (menuStats) {
      lines.push(
        "Menu injection (this session)",
        `  menus seen      : ${menuStats.menusSeen}`,
        `  export menus    : ${menuStats.exportMenusMatched}`,
        `  injected        : ${menuStats.injected}`,
        ""
      );
    }
    if (r.error) lines.push("Error", "  " + r.error, "");
    return lines.join("\n");
  }

  try {
    const m = chrome.runtime.getManifest();
    console.debug(`[GEP] More Export for Gemini v${m.version_name || m.version} is active.`);
  } catch {
    console.debug("[GEP] More Export for Gemini is active.");
  }
})();
