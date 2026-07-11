/**
 * Re-export from JSON card: converts a previously exported .json report (or
 * an automatic backup from the export history, #13) into any other format,
 * fully offline, using the live export options + source hygiene.
 */

export function initReexport(ctx) {
  const t = GEP.i18n.t;
  const reexportFileInput = document.getElementById("reexportFileInput");
  const reexportChooseBtn = document.getElementById("reexportChooseBtn");
  const reexportFileName = document.getElementById("reexportFileName");
  const reexportFormat = document.getElementById("reexportFormat");
  const reexportBtn = document.getElementById("reexportBtn");
  const reexportStatus = document.getElementById("reexportStatus");
  let reexportIR = null;

  function setReexportStatus(msg, type) {
    if (!reexportStatus) return;
    reexportStatus.textContent = msg;
    reexportStatus.className = "debug-status visible " + (type || "");
  }

  if (reexportFormat && window.GEP && GEP.exportOpts) {
    const labels = GEP.exportOpts.LABELS || {};
    // Localized picker labels; formats without a message fall back to the
    // English label table in export-opts.js.
    const labelKeys = {
      markdown: "fmtMarkdown", txt: "fmtTxt", html: "fmtHtml",
      reader: "fmtReaderReexport", json: "fmtJson", latex: "fmtLatex",
      csv: "fmtCsv", bibtex: "fmtBibtex", ris: "fmtRis",
      csljson: "fmtCsljson", rtf: "fmtRtfExt", docx: "fmtDocx",
      pdf: "fmtPdfPrint", epub: "fmtEpub", vault: "fmtVault",
    };
    GEP.exportOpts.EXPORTABLE.forEach((fmt) => {
      const opt = document.createElement("option");
      opt.value = fmt;
      opt.textContent = (labelKeys[fmt] && GEP.i18n.raw(labelKeys[fmt])) || labels[fmt] || fmt;
      reexportFormat.appendChild(opt);
    });
    reexportFormat.value = "markdown";
  }

  /** Strip the JSON export envelope and validate the IR shape. */
  function parseReexportIR(text) {
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: t("optInvalidJson") }; }
    if (!data || typeof data !== "object") return { ok: false, error: t("optNotJsonReport") };
    // The JSON exporter spreads IR fields next to envelope keys (schemaVersion,
    // generator, exportedAt); tolerate a nested `ir` shape too.
    const src = Array.isArray(data.blocks)
      ? data
      : (data.ir && Array.isArray(data.ir.blocks)) ? data.ir : null;
    if (!src) return { ok: false, error: t("optNoBlocks") };
    return { ok: true, ir: normalizeIR(src) };
  }

  function normalizeIR(src) {
    // Upgrade older schema versions first (v0 backups / .json files keep
    // loading forever); migrate() stamps the current version.
    if (window.GEP && GEP.json && GEP.json.migrate) src = GEP.json.migrate(src);
    const ir = {
      title: typeof src.title === "string" ? src.title : "",
      blocks: src.blocks,
      footnotes: Array.isArray(src.footnotes) ? src.footnotes : [],
    };
    if (src.v) ir.v = src.v;
    if (src.lang) ir.lang = src.lang;
    if (src.dir) ir.dir = src.dir;
    if (src.url) ir.url = src.url;
    return ir;
  }

  if (reexportChooseBtn && reexportFileInput) {
    reexportChooseBtn.addEventListener("click", () => reexportFileInput.click());
    reexportFileInput.addEventListener("change", async () => {
      const file = reexportFileInput.files && reexportFileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const res = parseReexportIR(text);
        if (!res.ok) {
          reexportIR = null;
          if (reexportBtn) reexportBtn.disabled = true;
          if (reexportFileName) reexportFileName.textContent = t("optChooseFilePrompt");
          setReexportStatus(res.error, "error");
          return;
        }
        reexportIR = res.ir;
        if (reexportBtn) reexportBtn.disabled = false;
        if (reexportFileName) {
          reexportFileName.textContent =
            t("optFileMeta", [file.name, String(res.ir.blocks.length), String(res.ir.footnotes.length)]);
        }
        setReexportStatus(t("optReportLoaded"), "success");
      } catch {
        setReexportStatus(t("optFileReadError"), "error");
      } finally {
        reexportFileInput.value = "";
      }
    });
  }

  if (reexportBtn) {
    reexportBtn.addEventListener("click", async () => {
      if (!reexportIR) { setReexportStatus(t("optLoadFirst"), "error"); return; }
      if (!window.GEP || !GEP.exportOpts) { setReexportStatus(t("optModulesFailed"), "error"); return; }
      const format = reexportFormat ? reexportFormat.value : "markdown";
      const MIME = GEP.exportOpts.MIME;
      const EXT = GEP.exportOpts.EXT;
      try {
        const settings = { ...ctx.options, overrides: ctx.overrides };
        const opts = GEP.exportOpts.build(settings, format);
        let ir = reexportIR;
        if (GEP.sourceHygiene) ir = GEP.sourceHygiene.apply(ir, opts);
        const name = (ext) => GEP.download.datedFileName(ir.title || "Gemini Deep Research", ext);

        const textConverters = {
          markdown: GEP.markdown, txt: GEP.txt, html: GEP.html, reader: GEP.reader,
          json: GEP.json, latex: GEP.latex, csv: GEP.csv, bibtex: GEP.bibtex,
          ris: GEP.ris, csljson: GEP.csljson, rtf: GEP.rtf,
        };
        if (textConverters[format]) {
          const result = textConverters[format].convert(ir, opts);
          GEP.download.downloadBlob(result, name(EXT[format]), MIME[format]);
          setReexportStatus(t("optExportedFile", name(EXT[format])), "success");
          return;
        }
        if (format === "docx") {
          GEP.download.downloadBlob(GEP.docx.convert(ir, opts), name(EXT.docx), MIME.docx);
          setReexportStatus(t("optExportedWord"), "success"); return;
        }
        if (format === "epub") {
          GEP.download.downloadBlob(GEP.epub.convert(ir, opts), name(EXT.epub), MIME.epub);
          setReexportStatus(t("optExportedEpub"), "success"); return;
        }
        if (format === "vault") {
          const entries = GEP.vault.buildEntries(ir, opts);
          if (!entries.length) { setReexportStatus(t("toastVaultEmpty"), "error"); return; }
          GEP.download.downloadBlob(GEP.zip.build(entries), name(EXT.vault), MIME.vault);
          setReexportStatus(t("optExportedVault", String(entries.length)), "success"); return;
        }
        if (format === "pdf") {
          await GEP.pdf.exportPdf(ir, opts);
          setReexportStatus(t("toastPdfPrint"), "success"); return;
        }
        setReexportStatus(t("optUnsupportedFormat", format), "error");
      } catch (e) {
        setReexportStatus(t("optExportFailed", e && e.message ? e.message : String(e)), "error");
      }
    });
  }

  // ── Recent reports (#13): auto-backed-up IRs from chrome.storage.local ──
  const recentListEl = document.getElementById("recentList");
  const recentClearBtn = document.getElementById("recentClearBtn");

  function formatWhen(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function loadHistoryEntry(entry) {
    const ir = entry && entry.ir;
    if (!ir || !Array.isArray(ir.blocks)) {
      setReexportStatus(t("optBackupUnreadable"), "error");
      return;
    }
    reexportIR = normalizeIR(ir);
    if (reexportBtn) reexportBtn.disabled = false;
    if (reexportFileName) {
      reexportFileName.textContent = t("optFileMetaHistory", [
        entry.title || t("optUntitledReport"),
        String(reexportIR.blocks.length),
        String(reexportIR.footnotes.length),
      ]);
    }
    setReexportStatus(t("optLoadedFromHistory"), "success");
  }

  async function renderRecentReports() {
    if (!recentListEl || !window.GEP || !GEP.history) return;
    let items = [];
    try { items = await GEP.history.list(); } catch { items = []; }
    recentListEl.replaceChildren();
    if (recentClearBtn) recentClearBtn.hidden = items.length === 0;

    if (!items.length) {
      const li = document.createElement("li");
      li.className = "recent-empty";
      li.textContent = t("optNoBackups");
      recentListEl.appendChild(li);
      return;
    }

    for (const item of items) {
      const li = document.createElement("li");
      li.className = "recent-item";

      const info = document.createElement("div");
      info.className = "profile-info";
      const nameEl = document.createElement("span");
      nameEl.className = "profile-item-name";
      nameEl.textContent = item.title || t("optUntitledReport");
      const metaEl = document.createElement("span");
      metaEl.className = "profile-item-meta";
      const kb = Math.max(1, Math.round((item.bytes || 0) / 1024));
      metaEl.textContent = t("optRecentMeta", [
        formatWhen(item.savedAt), String(item.blocks || 0), String(item.sources || 0), String(kb),
      ]);
      info.append(nameEl, metaEl);

      const loadBtn = document.createElement("button");
      loadBtn.className = "backup-btn";
      loadBtn.type = "button";
      loadBtn.textContent = t("optLoadBtn");
      loadBtn.addEventListener("click", async () => {
        const entry = await GEP.history.get(item.id);
        if (!entry) {
          setReexportStatus(t("optBackupGone"), "error");
          renderRecentReports();
          return;
        }
        loadHistoryEntry(entry);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "backup-btn danger";
      delBtn.type = "button";
      delBtn.textContent = t("optDeleteBtn");
      delBtn.setAttribute("aria-label", t("optDeleteBackupAria", item.title || ""));
      delBtn.addEventListener("click", async () => {
        await GEP.history.remove(item.id);
        renderRecentReports();
      });

      li.append(info, loadBtn, delBtn);
      recentListEl.appendChild(li);
    }
  }

  if (recentClearBtn) {
    recentClearBtn.addEventListener("click", async () => {
      if (!window.GEP || !GEP.history) return;
      await GEP.history.clear();
      renderRecentReports();
      setReexportStatus(t("optBackupsCleared"), "success");
    });
  }

  renderRecentReports();
}
