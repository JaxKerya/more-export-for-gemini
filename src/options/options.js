(async function () {
  "use strict";

  const {
    DEFAULTS: FORMAT_DEFAULTS,
    OPTION_DEFAULTS,
    OPTION_ENUMS,
    sanitizeOverrides,
  } = GEP.settings;

  const SECTION_FORMAT_KEYS = {
    clipboard:  ["clipboard_md", "clipboard_txt", "clipboard_html", "clipboard_json"],
    "text-formats": ["markdown", "txt", "html", "reader", "json"],
    academic:   ["latex"],
    data:       ["csv"],
    references: ["bibtex", "ris", "csljson"],
    documents:  ["docx", "rtf", "pdf", "epub"],
  };

  const BADGE_IDS = {
    clipboard:  "clipboardBadge",
    "text-formats": "textBadge",
    academic:   "academicBadge",
    data:       "dataBadge",
    references: "refBadge",
    documents:  "docBadge",
  };

  const stored = await chrome.storage.sync.get({
    formats: FORMAT_DEFAULTS,
    options: OPTION_DEFAULTS,
    overrides: {},
  });
  const formats = { ...FORMAT_DEFAULTS, ...stored.formats };
  const options = { ...OPTION_DEFAULTS, ...stored.options };
  // Per-format overrides (#50): { [formatKey]: { include_toc?, include_footnotes?, citation_style? } }
  let overrides =
    stored.overrides && typeof stored.overrides === "object" ? { ...stored.overrides } : {};

  const formatToggles = document.querySelectorAll(".toggle[data-format]");
  const optionToggles = document.querySelectorAll(".toggle[data-option]");
  const badge = document.getElementById("savedBadge");
  let badgeTimer = null;
  let maxToastTimer = null;

  function showSaved() {
    badge.classList.add("visible");
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.classList.remove("visible"), 1500);
  }

  function showMaxToast() {
    const el = badge;
    el.textContent = "";
    const icon = document.createElement("span");
    icon.textContent = "⚠ ";
    const msg = document.createTextNode(`Max ${MAX_ENABLED_FORMATS} formats allowed in the dropdown menu`);
    el.appendChild(icon);
    el.appendChild(msg);
    el.style.borderColor = "rgba(249, 171, 0, 0.35)";
    el.style.color = "#f9ab00";
    el.classList.add("visible");
    clearTimeout(maxToastTimer);
    maxToastTimer = setTimeout(() => {
      el.classList.remove("visible");
      setTimeout(() => {
        el.textContent = "";
        const checkSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        checkSvg.setAttribute("viewBox", "0 0 24 24");
        checkSvg.setAttribute("width", "14");
        checkSvg.setAttribute("height", "14");
        checkSvg.setAttribute("fill", "currentColor");
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z");
        checkSvg.appendChild(p);
        el.appendChild(checkSvg);
        el.appendChild(document.createTextNode(" Settings saved"));
        el.style.borderColor = "";
        el.style.color = "";
      }, 300);
    }, 2500);
  }

  async function saveAll() {
    const cleanFormats = {};
    for (const key of Object.keys(FORMAT_DEFAULTS)) {
      cleanFormats[key] = typeof formats[key] === "boolean" ? formats[key] : FORMAT_DEFAULTS[key];
    }
    await chrome.storage.sync.set({
      formats: cleanFormats,
      options: { ...options },
      overrides: sanitizeOverrides(overrides),
    });
    showSaved();
    refreshBadges();
  }

  /** Push the in-memory formats/options state onto every UI control. */
  function syncControlsFromState() {
    formatToggles.forEach((t) => {
      const key = t.dataset.format;
      t.querySelector("input").checked = !!formats[key];
    });
    optionToggles.forEach((t) => {
      const key = t.dataset.option;
      t.querySelector("input").checked = !!options[key];
    });
    if (flavorSelect) flavorSelect.value = options.markdown_flavor;
    if (citationSelect) citationSelect.value = options.citation_style;
    if (primarySelect) primarySelect.value = options.primary_format;
    if (readerThemeSelect) readerThemeSelect.value = options.reader_theme;
    if (readerWidthSelect) readerWidthSelect.value = options.reader_width;
    document.querySelectorAll("select[data-option]").forEach((s) => {
      const k = s.dataset.option;
      if (options[k] != null) s.value = options[k];
    });
    if (templateInput) {
      templateInput.value = options.filename_template;
      updateTemplatePreview();
    }
    document.querySelectorAll("[data-option-text]").forEach((input) => {
      const key = input.dataset.optionText;
      input.value = options[key] != null ? options[key] : "";
    });
    if (typeof loadOverrideControls === "function") loadOverrideControls();
  }

  const MAX_ENABLED_FORMATS = 12;

  function formatEnabledCount() {
    return Object.values(formats).filter(Boolean).length;
  }

  function refreshLastEnabled() {
    formatToggles.forEach((t) => {
      const key = t.dataset.format;
      t.classList.toggle("last-enabled", formats[key] && formatEnabledCount() === 1);
    });
  }

  function refreshBadges() {
    for (const [section, keys] of Object.entries(SECTION_FORMAT_KEYS)) {
      const el = document.getElementById(BADGE_IDS[section]);
      if (!el) continue;
      const count = keys.filter((k) => formats[k]).length;
      el.textContent = count;
      el.classList.toggle("zero", count === 0);
    }
    const tabCount = document.getElementById("tabFormatsCount");
    if (tabCount) {
      const total = formatEnabledCount();
      tabCount.textContent = total;
      tabCount.classList.toggle("zero", total === 0);
    }
    updateSummary();
  }

  function selectLabel(sel, val) {
    if (!sel) return val || "-";
    const opt = Array.from(sel.options).find((o) => o.value === val);
    return opt ? opt.textContent : (val || "-");
  }

  // Sidebar footer count + Overview "current setup" summary.
  function updateSummary() {
    const total = formatEnabledCount();
    const footer = document.getElementById("enabledCountFooter");
    if (footer) footer.textContent = total + (total === 1 ? " format enabled" : " formats enabled");
    const ovEnabled = document.getElementById("ovEnabled");
    if (ovEnabled) ovEnabled.textContent = String(total);
    const ovPrimary = document.getElementById("ovPrimary");
    if (ovPrimary) ovPrimary.textContent = selectLabel(primarySelect, options.primary_format);
    const ovCitation = document.getElementById("ovCitation");
    if (ovCitation) ovCitation.textContent = selectLabel(citationSelect, options.citation_style);
  }

  // ── Format toggles ──
  formatToggles.forEach((toggle) => {
    const key = toggle.dataset.format;
    const input = toggle.querySelector("input");
    input.checked = formats[key];

    input.addEventListener("change", async () => {
      if (input.checked && formatEnabledCount() >= MAX_ENABLED_FORMATS) {
        input.checked = false;
        showMaxToast();
        return;
      }
      formats[key] = input.checked;
      if (formatEnabledCount() === 0) {
        formats[key] = true;
        input.checked = true;
        return;
      }
      await saveAll();
      refreshLastEnabled();
    });
  });

  // ── Option toggles ──
  optionToggles.forEach((toggle) => {
    const key = toggle.dataset.option;
    const input = toggle.querySelector("input");
    input.checked = !!options[key];

    input.addEventListener("change", async () => {
      options[key] = input.checked;
      await saveAll();
    });
  });

  // ── Markdown flavor ──
  const flavorSelect = document.getElementById("markdownFlavor");
  if (flavorSelect) {
    flavorSelect.value = options.markdown_flavor || "gfm";
    flavorSelect.addEventListener("change", async () => {
      options.markdown_flavor = flavorSelect.value;
      await saveAll();
    });
  }

  // ── Citation style ──
  const citationSelect = document.getElementById("citationStyle");
  if (citationSelect) {
    citationSelect.value = options.citation_style || "numbered";
    citationSelect.addEventListener("change", async () => {
      options.citation_style = citationSelect.value;
      await saveAll();
    });
  }

  // ── Reader HTML presentation ──
  const readerThemeSelect = document.getElementById("readerTheme");
  if (readerThemeSelect) {
    readerThemeSelect.value = options.reader_theme || "auto";
    readerThemeSelect.addEventListener("change", async () => {
      options.reader_theme = readerThemeSelect.value;
      await saveAll();
    });
  }
  const readerWidthSelect = document.getElementById("readerWidth");
  if (readerWidthSelect) {
    readerWidthSelect.value = options.reader_width || "comfort";
    readerWidthSelect.addEventListener("change", async () => {
      options.reader_width = readerWidthSelect.value;
      await saveAll();
    });
  }
  // Typeface / size / spacing / accent + document layout — simple enum selects.
  [
    ["readerFont", "reader_font"],
    ["readerSize", "reader_size"],
    ["readerSpacing", "reader_spacing"],
    ["readerAccent", "reader_accent"],
    ["docPaper", "doc_paper"],
    ["docMargins", "doc_margins"],
    ["docFontSize", "doc_font_size"],
    ["docLineSpacing", "doc_line_spacing"],
    ["docFontFamily", "doc_font_family"],
    ["sourceSort", "source_sort"],
  ].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = options[key] || OPTION_DEFAULTS[key];
    el.addEventListener("change", async () => {
      options[key] = el.value;
      await saveAll();
    });
  });

  // ── Per-format overrides (#50) ──
  const overrideFormat = document.getElementById("overrideFormat");
  const overrideToc = document.getElementById("overrideToc");
  const overrideFootnotes = document.getElementById("overrideFootnotes");
  const overrideCitation = document.getElementById("overrideCitation");
  const overrideStatus = document.getElementById("overrideStatus");

  const triToSelect = (v) => (v === true ? "on" : v === false ? "off" : "");
  const selectToTri = (v) => (v === "on" ? true : v === "off" ? false : undefined);

  function describeOverride(fmt) {
    const o = overrides[fmt];
    if (!o || !Object.keys(o).length) return "Inherits all global settings.";
    const parts = [];
    if (o.include_toc !== undefined) parts.push(`TOC ${o.include_toc ? "on" : "off"}`);
    if (o.include_footnotes !== undefined) parts.push(`Footnotes ${o.include_footnotes ? "on" : "off"}`);
    if (o.citation_style) parts.push(`Citation ${o.citation_style}`);
    return "Overrides: " + parts.join(", ") + ".";
  }

  function loadOverrideControls() {
    if (!overrideFormat) return;
    const fmt = overrideFormat.value;
    const o = overrides[fmt] || {};
    if (overrideToc) overrideToc.value = triToSelect(o.include_toc);
    if (overrideFootnotes) overrideFootnotes.value = triToSelect(o.include_footnotes);
    if (overrideCitation) overrideCitation.value = o.citation_style || "";
    if (overrideStatus) {
      overrideStatus.textContent = describeOverride(fmt);
      overrideStatus.className = "override-status visible";
    }
  }

  async function saveOverrideFromControls() {
    if (!overrideFormat) return;
    const fmt = overrideFormat.value;
    const entry = {};
    const toc = selectToTri(overrideToc ? overrideToc.value : "");
    const fn = selectToTri(overrideFootnotes ? overrideFootnotes.value : "");
    const cit = overrideCitation ? overrideCitation.value : "";
    if (toc !== undefined) entry.include_toc = toc;
    if (fn !== undefined) entry.include_footnotes = fn;
    if (cit) entry.citation_style = cit;
    if (Object.keys(entry).length) overrides[fmt] = entry;
    else delete overrides[fmt];
    if (overrideStatus) overrideStatus.textContent = describeOverride(fmt);
    await saveAll();
  }

  if (overrideFormat) {
    overrideFormat.addEventListener("change", loadOverrideControls);
    [overrideToc, overrideFootnotes, overrideCitation].forEach((el) => {
      if (el) el.addEventListener("change", saveOverrideFromControls);
    });
    loadOverrideControls();
  }

  // ── Primary format (keyboard shortcut target) ──
  const primarySelect = document.getElementById("primaryFormat");
  if (primarySelect) {
    primarySelect.value = options.primary_format || "markdown";
    primarySelect.addEventListener("change", async () => {
      options.primary_format = primarySelect.value;
      await saveAll();
    });
  }

  // ── Filename template ──
  const templateInput = document.getElementById("filenameTemplate");
  const templatePreview = document.getElementById("templatePreview");

  function updateTemplatePreview() {
    if (!templateInput || !templatePreview) return;
    const now = new Date();
    const tokens = {
      title: "Example Report Title",
      date: now.toISOString().slice(0, 10),
      YYYY: String(now.getFullYear()),
      MM: String(now.getMonth() + 1).padStart(2, "0"),
      DD: String(now.getDate()).padStart(2, "0"),
      time: `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`,
      HH: String(now.getHours()).padStart(2, "0"),
      mm: String(now.getMinutes()).padStart(2, "0"),
      ss: String(now.getSeconds()).padStart(2, "0"),
      format: "markdown",
      ext: ".md",
      wordcount: "1250",
      timestamp: String(Math.floor(now.getTime() / 1000)),
    };
    let tpl = templateInput.value || "{title} - {date}";
    for (const [k, v] of Object.entries(tokens)) {
      tpl = tpl.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    templatePreview.textContent = `Preview: ${tpl}.md`;
  }

  if (templateInput) {
    templateInput.value = options.filename_template || "{title} - {date}";
    updateTemplatePreview();

    let templateTimer = null;
    templateInput.addEventListener("input", () => {
      updateTemplatePreview();
      clearTimeout(templateTimer);
      templateTimer = setTimeout(async () => {
        options.filename_template = templateInput.value || "{title} - {date}";
        await saveAll();
      }, 600);
    });
  }

  // ── Free-text option inputs (document metadata, #2) ──
  const textOptionInputs = document.querySelectorAll("[data-option-text]");
  textOptionInputs.forEach((input) => {
    const key = input.dataset.optionText;
    input.value = options[key] != null ? options[key] : "";
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        options[key] = input.value;
        await saveAll();
      }, 600);
    });
  });

  // ── Click-to-insert token ──
  document.querySelectorAll(".template-tokens code").forEach((code) => {
    code.addEventListener("click", () => {
      if (!templateInput) return;
      const start = templateInput.selectionStart;
      const end = templateInput.selectionEnd;
      const val = templateInput.value;
      const token = code.textContent;
      templateInput.value = val.slice(0, start) + token + val.slice(end);
      templateInput.selectionStart = templateInput.selectionEnd = start + token.length;
      templateInput.focus();
      templateInput.dispatchEvent(new Event("input"));
    });
  });

  // ── Sidebar navigation / panels ──
  const PANEL_STORAGE_KEY = "gep_active_panel";
  const VALID_PANELS = ["overview", "formats", "options", "metadata", "overrides", "tools", "whatsnew"];
  const navButtons = document.querySelectorAll(".nav-item[data-nav]");
  const panels = document.querySelectorAll(".panel[data-panel]");
  const searchInput = document.getElementById("searchInput");
  const contentEl = document.getElementById("content");
  let activePanel = "overview";

  function applyPanelFilter() {
    // While a search is active, the search handler controls visibility.
    if (searchInput && searchInput.value.trim()) return;
    panels.forEach((p) => {
      p.classList.toggle("panel-hidden", p.dataset.panel !== activePanel);
    });
  }

  function setActivePanel(name, opts) {
    const updateHash = !opts || opts.updateHash !== false;
    if (!VALID_PANELS.includes(name)) name = "overview";
    activePanel = name;
    navButtons.forEach((b) => {
      const on = b.dataset.nav === name;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    try { localStorage.setItem(PANEL_STORAGE_KEY, name); } catch {}
    if (updateHash) { try { history.replaceState(null, "", "#" + name); } catch {} }
    applyPanelFilter();
  }

  function clearSearch() {
    if (!searchInput || !searchInput.value) return;
    searchInput.value = "";
    panels.forEach((p) => p.classList.remove("search-hidden"));
    document.querySelectorAll(".card").forEach((c) => c.classList.remove("search-hidden"));
    document.querySelectorAll(".toggle").forEach((t) => t.classList.remove("search-match"));
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      clearSearch();
      setActivePanel(btn.dataset.nav);
      if (contentEl) { try { contentEl.focus({ preventScroll: true }); } catch { contentEl.focus(); } }
    });
  });

  // CTA buttons in the Overview panel jump straight to another panel.
  document.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      clearSearch();
      setActivePanel(btn.dataset.go);
    });
  });

  // ── First-run welcome (#9): background opens options.html?welcome=1 once
  // right after install; show a dismissible 3-step orientation banner. ──
  const isWelcome = new URLSearchParams(location.search).get("welcome") === "1";
  const welcomeHero = document.getElementById("welcomeHero");
  if (isWelcome && welcomeHero) {
    welcomeHero.hidden = false;
    const dismissWelcome = () => {
      welcomeHero.hidden = true;
      // Strip ?welcome=1 so a reload doesn't resurrect the banner.
      try { history.replaceState(null, "", location.pathname + location.hash); } catch {}
    };
    const dismissBtn = document.getElementById("welcomeDismiss");
    if (dismissBtn) dismissBtn.addEventListener("click", dismissWelcome);
    const formatsBtn = document.getElementById("welcomeFormats");
    if (formatsBtn) formatsBtn.addEventListener("click", dismissWelcome);
  }

  // Initial panel: welcome flow > URL hash > stored > default.
  let initialPanel = "overview";
  const hashPanel = (location.hash || "").replace(/^#/, "");
  if (isWelcome) {
    initialPanel = "overview";
  } else if (VALID_PANELS.includes(hashPanel)) {
    initialPanel = hashPanel;
  } else {
    try { initialPanel = localStorage.getItem(PANEL_STORAGE_KEY) || "overview"; } catch {}
  }
  setActivePanel(initialPanel, { updateHash: false });

  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (VALID_PANELS.includes(h) && h !== activePanel) {
      clearSearch();
      setActivePanel(h, { updateHash: false });
    }
  });

  // ── Search / filter (spans all panels) ──
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();

      if (!q) {
        panels.forEach((p) => p.classList.remove("search-hidden"));
        document.querySelectorAll(".card").forEach((c) => c.classList.remove("search-hidden"));
        document.querySelectorAll(".toggle").forEach((t) => t.classList.remove("search-match"));
        applyPanelFilter();
        return;
      }

      // Reveal every panel so matches can surface from any section.
      panels.forEach((p) => p.classList.remove("panel-hidden"));

      panels.forEach((panel) => {
        let panelMatch = false;
        panel.querySelectorAll(".card").forEach((card) => {
          const toggles = card.querySelectorAll(".toggle[data-format], .toggle[data-option]");
          let anyMatch = false;
          toggles.forEach((t) => {
            const searchText = [
              t.dataset.search || "",
              t.dataset.format || "",
              t.querySelector(".toggle-name")?.textContent || "",
              t.querySelector(".toggle-hint")?.textContent || "",
            ].join(" ").toLowerCase();
            const match = searchText.includes(q);
            t.classList.toggle("search-match", match);
            if (match) anyMatch = true;
          });
          const headerText = card.querySelector(".section-header")?.textContent?.toLowerCase() || "";
          if (headerText.includes(q)) anyMatch = true;
          card.classList.toggle("search-hidden", !anyMatch);
          if (anyMatch) panelMatch = true;
        });
        panel.classList.toggle("search-hidden", !panelMatch);
      });
    });
  }

  // ── Reset settings ──
  const resetModal = document.getElementById("resetModal");
  document.getElementById("resetBtn").addEventListener("click", () => {
    resetModal.classList.add("visible");
  });
  document.getElementById("resetCancel").addEventListener("click", () => {
    resetModal.classList.remove("visible");
  });
  resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) resetModal.classList.remove("visible");
  });
  document.getElementById("resetConfirm").addEventListener("click", async () => {
    Object.assign(formats, FORMAT_DEFAULTS);
    Object.assign(options, OPTION_DEFAULTS);
    overrides = {};
    syncControlsFromState();
    await saveAll();
    refreshLastEnabled();
    resetModal.classList.remove("visible");
  });

  // ── Backup & Restore (#30): export/import settings as JSON ──
  const exportSettingsBtn = document.getElementById("exportSettingsBtn");
  const importSettingsBtn = document.getElementById("importSettingsBtn");
  const importSettingsInput = document.getElementById("importSettingsInput");
  const backupStatus = document.getElementById("backupStatus");

  function setBackupStatus(msg, type) {
    if (!backupStatus) return;
    backupStatus.textContent = msg;
    backupStatus.className = "debug-status visible " + (type || "");
  }

  if (exportSettingsBtn) {
    exportSettingsBtn.addEventListener("click", () => {
      const cleanFormats = {};
      for (const key of Object.keys(FORMAT_DEFAULTS)) {
        cleanFormats[key] = typeof formats[key] === "boolean" ? formats[key] : FORMAT_DEFAULTS[key];
      }
      let version = "";
      try { version = chrome.runtime.getManifest().version; } catch {}
      const payload = {
        app: "more-export-for-gemini",
        type: "settings",
        version,
        exportedAt: new Date().toISOString(),
        formats: cleanFormats,
        options: { ...options },
        overrides: sanitizeOverrides(overrides),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `more-export-settings-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setBackupStatus("Settings exported.", "success");
    });
  }

  /** Validate and merge an imported payload into the live state. */
  function applyImportedSettings(data) {
    if (!data || typeof data !== "object") {
      return { ok: false, error: "Not a valid settings file." };
    }
    const f = data.formats;
    const o = data.options;
    if ((f && typeof f !== "object") || (o && typeof o !== "object")) {
      return { ok: false, error: "Malformed formats/options in file." };
    }

    let formatCount = 0;
    let optionCount = 0;

    if (f) {
      for (const key of Object.keys(FORMAT_DEFAULTS)) {
        if (typeof f[key] === "boolean") { formats[key] = f[key]; formatCount++; }
      }
      if (Object.values(formats).filter(Boolean).length === 0) formats.markdown = true;
    }

    if (o) {
      for (const key of Object.keys(OPTION_DEFAULTS)) {
        const val = o[key];
        const def = OPTION_DEFAULTS[key];
        if (typeof def === "string") {
          if (typeof val !== "string") continue;
          if (OPTION_ENUMS[key]) {
            if (OPTION_ENUMS[key].includes(val)) { options[key] = val; optionCount++; }
          } else {
            options[key] = val; optionCount++;
          }
        } else if (typeof def === "boolean") {
          if (typeof val === "boolean") { options[key] = val; optionCount++; }
        }
      }
    }

    if (data.overrides && typeof data.overrides === "object") {
      overrides = sanitizeOverrides(data.overrides);
    }

    if (!formatCount && !optionCount) {
      return { ok: false, error: "No recognizable settings found in file." };
    }
    return { ok: true, formatCount, optionCount };
  }

  if (importSettingsBtn && importSettingsInput) {
    importSettingsBtn.addEventListener("click", () => importSettingsInput.click());
    importSettingsInput.addEventListener("change", async () => {
      const file = importSettingsInput.files && importSettingsInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let data;
        try { data = JSON.parse(text); }
        catch { setBackupStatus("Invalid JSON file.", "error"); return; }

        const result = applyImportedSettings(data);
        if (!result.ok) {
          setBackupStatus(result.error, "error");
          return;
        }
        syncControlsFromState();
        await saveAll();
        refreshLastEnabled();
        setBackupStatus(
          `Imported ${result.formatCount} format${result.formatCount === 1 ? "" : "s"} and ${result.optionCount} option${result.optionCount === 1 ? "" : "s"}.`,
          "success"
        );
      } catch {
        setBackupStatus("Could not read the file.", "error");
      } finally {
        importSettingsInput.value = "";
      }
    });
  }

  // ── Re-export from JSON (offline) ──
  // Reads a JSON report exported by this extension and produces any other
  // format entirely offline, using the live export options + source hygiene.
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
    GEP.exportOpts.EXPORTABLE.forEach((fmt) => {
      const opt = document.createElement("option");
      opt.value = fmt;
      opt.textContent = labels[fmt] || fmt;
      reexportFormat.appendChild(opt);
    });
    reexportFormat.value = "markdown";
  }

  /** Strip the JSON export envelope and validate the IR shape. */
  function parseReexportIR(text) {
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: "Invalid JSON file." }; }
    if (!data || typeof data !== "object") return { ok: false, error: "Not a JSON report." };
    // The JSON exporter spreads IR fields next to envelope keys (schemaVersion,
    // generator, exportedAt); tolerate a nested `ir` shape too.
    const src = Array.isArray(data.blocks)
      ? data
      : (data.ir && Array.isArray(data.ir.blocks)) ? data.ir : null;
    if (!src) return { ok: false, error: "No report blocks found in this JSON." };
    const ir = {
      title: typeof src.title === "string" ? src.title : "",
      blocks: src.blocks,
      footnotes: Array.isArray(src.footnotes) ? src.footnotes : [],
    };
    if (src.lang) ir.lang = src.lang;
    if (src.dir) ir.dir = src.dir;
    if (src.url) ir.url = src.url;
    return { ok: true, ir };
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
          if (reexportFileName) reexportFileName.textContent = "Choose a JSON report exported by this extension.";
          setReexportStatus(res.error, "error");
          return;
        }
        reexportIR = res.ir;
        if (reexportBtn) reexportBtn.disabled = false;
        if (reexportFileName) {
          reexportFileName.textContent = `${file.name} - ${res.ir.blocks.length} block(s), ${res.ir.footnotes.length} source(s)`;
        }
        setReexportStatus("Report loaded. Pick a format and export.", "success");
      } catch {
        setReexportStatus("Could not read the file.", "error");
      } finally {
        reexportFileInput.value = "";
      }
    });
  }

  if (reexportBtn) {
    reexportBtn.addEventListener("click", async () => {
      if (!reexportIR) { setReexportStatus("Load a JSON report first.", "error"); return; }
      if (!window.GEP || !GEP.exportOpts) { setReexportStatus("Exporter modules failed to load.", "error"); return; }
      const format = reexportFormat ? reexportFormat.value : "markdown";
      const MIME = GEP.exportOpts.MIME;
      const EXT = GEP.exportOpts.EXT;
      try {
        const settings = { ...options, overrides };
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
          setReexportStatus(`Exported ${name(EXT[format])}.`, "success");
          return;
        }
        if (format === "docx") {
          GEP.download.downloadBlob(GEP.docx.convert(ir, opts), name(EXT.docx), MIME.docx);
          setReexportStatus("Exported Word document.", "success"); return;
        }
        if (format === "epub") {
          GEP.download.downloadBlob(GEP.epub.convert(ir, opts), name(EXT.epub), MIME.epub);
          setReexportStatus("Exported EPUB.", "success"); return;
        }
        if (format === "vault") {
          const entries = GEP.vault.buildEntries(ir, opts);
          if (!entries.length) { setReexportStatus("Nothing to export to a vault.", "error"); return; }
          GEP.download.downloadBlob(GEP.zip.build(entries), name(EXT.vault), MIME.vault);
          setReexportStatus(`Exported vault (${entries.length} files).`, "success"); return;
        }
        if (format === "pdf") {
          await GEP.pdf.exportPdf(ir, opts);
          setReexportStatus("Print dialog opened for PDF.", "success"); return;
        }
        setReexportStatus(`Unsupported format: ${format}.`, "error");
      } catch (e) {
        setReexportStatus("Export failed: " + (e && e.message ? e.message : String(e)), "error");
      }
    });
  }

  // ── Debug mode (tap logo 7 times) ──
  const debugCard = document.querySelector('.card[data-section="debug"]');
  const logoTap = document.getElementById("logoTap");
  let tapCount = 0;
  let tapTimer = null;

  if (logoTap && debugCard) {
    logoTap.style.cursor = "pointer";
    logoTap.addEventListener("click", () => {
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { tapCount = 0; }, 2000);

      if (tapCount >= 15) {
        tapCount = 0;
        debugCard.classList.toggle("unlocked");
      }
    });
  }

  // ── Debug export ──
  const debugBtn = document.getElementById("debugExportBtn");
  const debugStatus = document.getElementById("debugStatus");

  function setDebugStatus(msg, type) {
    debugStatus.textContent = msg;
    debugStatus.className = "debug-status visible " + (type || "");
  }

  if (debugBtn) {
    debugBtn.addEventListener("click", async () => {
      debugBtn.disabled = true;
      setDebugStatus("Searching for active Gemini tab...", "");

      try {
        const [tab] = await chrome.tabs.query({
          active: true, currentWindow: true, url: "*://gemini.google.com/*",
        });

        if (!tab) {
          const geminiTabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
          if (!geminiTabs.length) {
            setDebugStatus("No Gemini tab found. Open a Deep Research page first.", "error");
            debugBtn.disabled = false;
            return;
          }
          const target = geminiTabs[0];
          setDebugStatus("Sending to Gemini tab...", "");
          chrome.tabs.sendMessage(target.id, { type: "GEP_DEBUG_EXPORT" }, (resp) => {
            if (chrome.runtime.lastError) {
              setDebugStatus("Could not reach content script. Refresh the Gemini page.", "error");
            } else if (resp && resp.ok) {
              setDebugStatus("Debug ZIP downloaded successfully!", "success");
            } else {
              setDebugStatus(resp?.error || "Export failed.", "error");
            }
            debugBtn.disabled = false;
          });
          return;
        }

        setDebugStatus("Exporting all combinations...", "");
        chrome.tabs.sendMessage(tab.id, { type: "GEP_DEBUG_EXPORT" }, (resp) => {
          if (chrome.runtime.lastError) {
            setDebugStatus("Could not reach content script. Refresh the Gemini page.", "error");
          } else if (resp && resp.ok) {
            setDebugStatus("Debug ZIP downloaded successfully!", "success");
          } else {
            setDebugStatus(resp?.error || "Export failed.", "error");
          }
          debugBtn.disabled = false;
        });
      } catch (err) {
        setDebugStatus("Error: " + err.message, "error");
        debugBtn.disabled = false;
      }
    });
  }

  // ── Run diagnostics ──
  const diagnoseBtn = document.getElementById("diagnoseBtn");
  const diagnoseStatus = document.getElementById("diagnoseStatus");

  function setDiagnoseStatus(msg, type) {
    if (!diagnoseStatus) return;
    diagnoseStatus.textContent = msg;
    diagnoseStatus.className = "debug-status visible " + (type || "");
  }

  async function resolveGeminiTab() {
    const [tab] = await chrome.tabs.query({
      active: true, currentWindow: true, url: "*://gemini.google.com/*",
    });
    if (tab) return tab;
    const geminiTabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
    return geminiTabs[0] || null;
  }

  if (diagnoseBtn) {
    diagnoseBtn.addEventListener("click", async () => {
      diagnoseBtn.disabled = true;
      setDiagnoseStatus("Searching for active Gemini tab...", "");
      try {
        const target = await resolveGeminiTab();
        if (!target) {
          setDiagnoseStatus("No Gemini tab found. Open a Deep Research page first.", "error");
          diagnoseBtn.disabled = false;
          return;
        }
        setDiagnoseStatus("Running diagnostics...", "");
        chrome.tabs.sendMessage(target.id, { type: "GEP_DIAGNOSE" }, (resp) => {
          if (chrome.runtime.lastError) {
            setDiagnoseStatus("Could not reach content script. Refresh the Gemini page.", "error");
          } else if (resp && resp.ok) {
            const r = resp.report || {};
            setDiagnoseStatus(
              (r.ok ? "OK" : "Issues detected") +
              ` - ${r.blockTotal || 0} blocks, ${r.footnotes ? r.footnotes.seenCount : 0} sources. Report downloaded.`,
              r.ok ? "success" : "error"
            );
          } else {
            setDiagnoseStatus(resp?.error || "Diagnostics failed.", "error");
          }
          diagnoseBtn.disabled = false;
        });
      } catch (err) {
        setDiagnoseStatus("Error: " + err.message, "error");
        diagnoseBtn.disabled = false;
      }
    });
  }

  // ── Report a bug (multiple triggers: beta strip, Overview, Tools) ──
  const bugReportBtns = document.querySelectorAll(".js-bug-report");
  if (bugReportBtns.length && window.GEP_LINKS) {
    const openBugReport = () => {
      let version = "";
      try { const m = chrome.runtime.getManifest(); version = m.version_name || m.version; } catch {}
      const url = window.GEP_LINKS.buildBugReportUrl({ version, browser: navigator.userAgent });
      try { window.open(url, "_blank", "noopener"); } catch { location.href = url; }
    };
    bugReportBtns.forEach((b) => b.addEventListener("click", openBugReport));
  }

  // ── Suggest a feature ──
  const suggestionBtns = document.querySelectorAll(".js-suggestion");
  if (suggestionBtns.length && window.GEP_LINKS) {
    const openSuggestion = () => {
      let version = "";
      try { const m = chrome.runtime.getManifest(); version = m.version_name || m.version; } catch {}
      const url = window.GEP_LINKS.buildSuggestionUrl({ version, browser: navigator.userAgent });
      try { window.open(url, "_blank", "noopener"); } catch { location.href = url; }
    };
    suggestionBtns.forEach((b) => b.addEventListener("click", openSuggestion));
  }

  // ── Quality check ──
  const qualityBtn = document.getElementById("qualityBtn");
  const qualityStatus = document.getElementById("qualityStatus");
  const qualityFindings = document.getElementById("qualityFindings");

  function setQualityStatus(msg, type) {
    if (!qualityStatus) return;
    qualityStatus.textContent = msg;
    qualityStatus.className = "debug-status visible " + (type || "");
  }

  function renderQualityFindings(report) {
    if (!qualityFindings) return;
    qualityFindings.replaceChildren();
    const order = { error: 0, warn: 1, info: 2 };
    const labels = { error: "ERROR", warn: "WARN", info: "INFO" };
    const items = (report && report.warnings ? report.warnings : [])
      .slice()
      .sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
    if (!items.length) { qualityFindings.classList.remove("visible"); return; }
    items.forEach((w) => {
      const li = document.createElement("li");
      li.className = "quality-finding " + w.level;
      const tag = document.createElement("span");
      tag.className = "qf-tag";
      tag.textContent = labels[w.level] || String(w.level || "").toUpperCase();
      const msg = document.createElement("span");
      msg.className = "qf-msg";
      msg.textContent = w.message;
      li.append(tag, msg);
      qualityFindings.appendChild(li);
    });
    qualityFindings.classList.add("visible");
  }

  if (qualityBtn) {
    qualityBtn.addEventListener("click", async () => {
      qualityBtn.disabled = true;
      if (qualityFindings) { qualityFindings.replaceChildren(); qualityFindings.classList.remove("visible"); }
      setQualityStatus("Searching for active Gemini tab...", "");
      try {
        const target = await resolveGeminiTab();
        if (!target) {
          setQualityStatus("No Gemini tab found. Open a Deep Research page first.", "error");
          qualityBtn.disabled = false;
          return;
        }
        setQualityStatus("Checking quality...", "");
        chrome.tabs.sendMessage(target.id, { type: "GEP_QUALITY" }, (resp) => {
          if (chrome.runtime.lastError) {
            setQualityStatus("Could not reach content script. Refresh the Gemini page.", "error");
          } else if (resp && resp.ok) {
            const s = (resp.report && resp.report.stats) || {};
            setQualityStatus(
              (resp.report.ok ? "Quality OK" : "Issues detected") +
              ` - ${s.errors || 0} error(s), ${s.warnings || 0} warning(s), ${s.infos || 0} info.`,
              resp.report.ok ? "success" : "error"
            );
            renderQualityFindings(resp.report);
          } else {
            setQualityStatus(resp?.error || "Quality check failed.", "error");
          }
          qualityBtn.disabled = false;
        });
      } catch (err) {
        setQualityStatus("Error: " + err.message, "error");
        qualityBtn.disabled = false;
      }
    });
  }

  // ── What's New / release notes (#46) ──
  const RELEASE_NOTES = [
    {
      version: "2.1.0",
      date: "2026-07-03",
      items: [
        "15 export formats: Markdown, PDF, Word, Reader HTML, EPUB, LaTeX, RTF, HTML, plain text, JSON and citation formats.",
        "Reader HTML - a clean, self-contained, reading-optimized document with light/dark theme and a live outline.",
        "Page & typography controls (paper size, margins, font, line spacing) for PDF, HTML, Word and LaTeX.",
        "9 citation styles plus BibTeX, RIS and CSL-JSON exports, with offline DOI/ISBN detection.",
        "Source hygiene - merge duplicate sources, sort the list and keep every in-text reference in sync.",
        "Offline re-export - turn a saved JSON report into any other format without reopening Gemini.",
        "Native math in Word, EPUB and Typst, plus multilingual & right-to-left aware output.",
        "Everything runs locally in your browser - your reports are never uploaded.",
      ],
    },
  ];

  function renderReleaseNotes() {
    const container = document.getElementById("releaseNotes");
    if (!container) return;
    container.textContent = "";
    RELEASE_NOTES.forEach((rel) => {
      const block = document.createElement("div");
      block.className = "release-block";

      const head = document.createElement("div");
      head.className = "release-head";
      const ver = document.createElement("span");
      ver.className = "release-version";
      ver.textContent = "v" + rel.version;
      head.appendChild(ver);
      if (rel.date) {
        const date = document.createElement("span");
        date.className = "release-date";
        date.textContent = rel.date;
        head.appendChild(date);
      }
      block.appendChild(head);

      const ul = document.createElement("ul");
      ul.className = "release-list";
      rel.items.forEach((it) => {
        const li = document.createElement("li");
        // An item is either a plain string or { text, by } where `by` credits
        // the person who suggested the feature (shown only with their consent).
        const text = typeof it === "string" ? it : it && it.text ? it.text : "";
        li.textContent = text;
        const by = it && typeof it === "object" ? it.by : "";
        if (by) {
          const credit = document.createElement("span");
          credit.className = "release-credit";
          credit.textContent = "suggested by " + by;
          li.appendChild(credit);
        }
        ul.appendChild(li);
      });
      block.appendChild(ul);
      container.appendChild(block);
    });
  }

  async function initWhatsNew() {
    renderReleaseNotes();
    let current = "";
    try { current = chrome.runtime.getManifest().version; } catch {}
    const badgeEl = document.getElementById("whatsnewBadge");

    let lastSeen = "";
    try {
      const r = await chrome.storage.sync.get({ last_seen_version: "" });
      lastSeen = r.last_seen_version || "";
    } catch {}

    // Surface the "New" badge on the What's New nav item until the user has
    // seen the current version (the panel stays where the user left it).
    if (current && lastSeen !== current) {
      if (badgeEl) badgeEl.hidden = false;
      try { await chrome.storage.sync.set({ last_seen_version: current }); } catch {}
    }
  }

  await initWhatsNew();

  refreshLastEnabled();
  refreshBadges();
})();
