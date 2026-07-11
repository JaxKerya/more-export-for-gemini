/**
 * Settings manager.
 *
 * Persists user preferences in chrome.storage.sync so they roam across devices.
 * Every format key maps to a boolean (visible in menu or not).
 *
 * On load, stored settings are merged with DEFAULTS so that newly added formats
 * get their default value and removed keys are pruned.
 */
(function () {
  "use strict";
  // globalThis works in content scripts, extension pages, and service workers.
  const root = typeof globalThis !== "undefined" ? globalThis : self;
  // settings.js loads after exporters in content scripts and test sandboxes;
  // never replace an existing namespace (would wipe already-registered modules).
  const existing =
    (typeof window !== "undefined" && window.GEP) ||
    root.GEP ||
    {};
  const GEP = (root.GEP = existing);
  if (typeof window !== "undefined") window.GEP = GEP;

  const DEFAULTS = {
    // Clipboard
    clipboard_md: true,
    clipboard_txt: false,
    clipboard_html: false,
    clipboard_json: false,
    // Text downloads
    markdown: true,
    txt: false,
    html: false,
    reader: true,
    json: false,
    // Markup / academic
    latex: false,
    // Data
    csv: false,
    xlsx: false,
    // References
    bibtex: false,
    ris: false,
    csljson: false,
    // Documents
    docx: true,
    rtf: false,
    pdf: true,
    epub: false,
    // Bundle
    vault: false,
    zip_all: false,
    // Tools ("Export section…" picker in the share menu)
    sections_pick: true,
  };

  /** Export options (non-format settings). */
  const OPTION_DEFAULTS = {
    markdown_flavor: "gfm",
    include_toc: false,
    include_footnotes: true,
    citation_style: "numbered",
    filename_template: "{title} - {date}",
    primary_format: "markdown",
    // Document metadata (#2): woven into exports that support it.
    meta_author: "",
    meta_affiliation: "",
    meta_keywords: "",
    meta_abstract: "",
    // Page / typography layout for document formats (PDF / HTML / DOCX / LaTeX).
    // Defaults reproduce the historical hardcoded output exactly.
    doc_paper: "a4",
    doc_margins: "normal",
    doc_font_size: "11",
    doc_line_spacing: "normal",
    doc_font_family: "sans",
    // Source hygiene (#16/#17/#20): applied as a pre-export IR transform.
    source_dedupe: false,
    source_sort: "appearance",
    source_enrich_ids: true,
    // Reader HTML presentation: baked into the export at build time so the
    // file ships with the chosen defaults and carries no in-page controls.
    reader_theme: "auto",
    reader_width: "comfort",
    reader_outline: true,
    reader_font: "sans",
    reader_size: "medium",
    reader_spacing: "normal",
    reader_accent: "blue",
    reader_justify: false,
    reader_progress: true,
  };

  /** Options whose value must be one of a fixed set of strings. */
  const OPTION_ENUMS = {
    markdown_flavor: ["gfm", "commonmark", "obsidian", "notion"],
    citation_style: ["numbered", "apa", "mla", "chicago", "ieee", "vancouver", "harvard", "acs", "ama"],
    doc_paper: ["a4", "letter"],
    doc_margins: ["narrow", "normal", "wide"],
    doc_font_size: ["10", "11", "12"],
    doc_line_spacing: ["normal", "onehalf", "double"],
    doc_font_family: ["sans", "serif"],
    source_sort: ["appearance", "alpha", "domain"],
    reader_theme: ["auto", "light", "dark"],
    reader_width: ["comfort", "wide"],
    reader_font: ["sans", "serif"],
    reader_size: ["small", "medium", "large"],
    reader_spacing: ["normal", "relaxed"],
    reader_accent: ["blue", "teal", "green", "purple", "amber", "rose"],
  };

  /**
   * Upper bounds for free-text options. chrome.storage.sync has an ~8 KB
   * per-item quota and snapshots are copied into export profiles, so
   * unbounded user text must be capped somewhere central. Mirrored by the
   * maxlength attributes in options.html; enforced in sanitizeSnapshot so
   * load / settings import / profile apply are all covered.
   */
  const OPTION_TEXT_LIMITS = {
    filename_template: 120,
    meta_author: 200,
    meta_affiliation: 200,
    meta_keywords: 300,
    meta_abstract: 2000,
  };

  const VALID_KEYS = new Set(Object.keys(DEFAULTS));
  const VALID_OPTION_KEYS = new Set(Object.keys(OPTION_DEFAULTS));

  /**
   * Per-format overrides (#50): a format may override global TOC / footnote /
   * citation settings. Only these fields are overridable; any other key is
   * dropped. Stored under its own `overrides` storage key.
   */
  const OVERRIDE_FIELDS = {
    include_toc: "boolean",
    include_footnotes: "boolean",
    citation_style: "enum",
  };

  /** Formats whose output is affected by TOC / footnotes / citation style. */
  const OVERRIDABLE_FORMATS = [
    "markdown", "html", "reader", "pdf", "docx", "rtf", "epub",
    "latex", "vault",
    "clipboard_md", "clipboard_html",
  ];
  const OVERRIDABLE_SET = new Set(OVERRIDABLE_FORMATS);

  function sanitizeOverrides(raw) {
    const clean = {};
    if (!raw || typeof raw !== "object") return clean;
    for (const fmt of Object.keys(raw)) {
      if (!OVERRIDABLE_SET.has(fmt)) continue;
      const o = raw[fmt];
      if (!o || typeof o !== "object") continue;
      const entry = {};
      for (const field of Object.keys(OVERRIDE_FIELDS)) {
        if (!(field in o)) continue;
        const v = o[field];
        if (OVERRIDE_FIELDS[field] === "boolean") {
          if (typeof v === "boolean") entry[field] = v;
        } else if (field === "citation_style") {
          if (typeof v === "string" && OPTION_ENUMS.citation_style.includes(v)) entry[field] = v;
        }
      }
      if (Object.keys(entry).length) clean[fmt] = entry;
    }
    return clean;
  }

  /**
   * Validates a full settings snapshot ({ formats, options, overrides }) and
   * returns a clean copy with defaults filled in. Shared by load(), the
   * settings import in Options, and export profiles (#12).
   */
  function sanitizeSnapshot(raw) {
    const src = raw && typeof raw === "object" ? raw : {};

    const formats = { ...DEFAULTS };
    const rawFormats = src.formats && typeof src.formats === "object" ? src.formats : {};
    for (const key of VALID_KEYS) {
      if (typeof rawFormats[key] === "boolean") formats[key] = rawFormats[key];
    }
    if (!Object.values(formats).some(Boolean)) formats.markdown = true;

    const options = { ...OPTION_DEFAULTS };
    const rawOptions = src.options && typeof src.options === "object" ? src.options : {};
    for (const key of VALID_OPTION_KEYS) {
      const val = rawOptions[key];
      const def = OPTION_DEFAULTS[key];
      if (typeof def === "string") {
        if (typeof val !== "string") continue;
        if (OPTION_ENUMS[key]) {
          if (OPTION_ENUMS[key].includes(val)) options[key] = val;
        } else {
          const limit = OPTION_TEXT_LIMITS[key];
          options[key] = limit ? val.slice(0, limit) : val;
        }
      } else if (typeof def === "boolean") {
        if (typeof val === "boolean") options[key] = val;
      }
    }

    return { formats, options, overrides: sanitizeOverrides(src.overrides) };
  }

  async function load() {
    try {
      const stored = await chrome.storage.sync.get({
        formats: DEFAULTS,
        options: OPTION_DEFAULTS,
        overrides: {},
      });
      const clean = sanitizeSnapshot(stored);
      return { ...clean.formats, ...clean.options, overrides: clean.overrides };
    } catch {
      return { ...DEFAULTS, ...OPTION_DEFAULTS, overrides: {} };
    }
  }

  // ── Export profiles (#12): named settings snapshots in chrome.storage.sync ──
  // Sync quota is ~8 KB per item; a snapshot is ~1.5 KB, so cap the count.
  const MAX_PROFILES = 6;
  const MAX_PROFILE_NAME = 40;

  /** Drops invalid names/snapshots and enforces the profile cap (newest kept). */
  function sanitizeProfiles(raw) {
    const clean = {};
    if (!raw || typeof raw !== "object") return clean;
    const names = Object.keys(raw)
      .filter((n) => typeof n === "string" && n.trim() && n.length <= MAX_PROFILE_NAME &&
                     raw[n] && typeof raw[n] === "object")
      .sort((a, b) => (raw[b].savedAt || 0) - (raw[a].savedAt || 0))
      .slice(0, MAX_PROFILES);
    for (const name of names) {
      const snap = sanitizeSnapshot(raw[name]);
      clean[name] = {
        formats: snap.formats,
        options: snap.options,
        overrides: snap.overrides,
        savedAt: typeof raw[name].savedAt === "number" ? raw[name].savedAt : 0,
      };
    }
    return clean;
  }

  async function loadProfiles() {
    try {
      const stored = await chrome.storage.sync.get({ profiles: {} });
      return sanitizeProfiles(stored.profiles);
    } catch {
      return {};
    }
  }

  async function saveProfiles(profiles) {
    await chrome.storage.sync.set({ profiles: sanitizeProfiles(profiles) });
  }

  async function save(formats) {
    const cleanFormats = {};
    for (const key of VALID_KEYS) {
      cleanFormats[key] = typeof formats[key] === "boolean" ? formats[key] : DEFAULTS[key];
    }

    const cleanOptions = {};
    for (const key of VALID_OPTION_KEYS) {
      const val = formats[key];
      const expected = typeof OPTION_DEFAULTS[key];
      if (typeof val === expected) {
        cleanOptions[key] = val;
      } else {
        cleanOptions[key] = OPTION_DEFAULTS[key];
      }
    }

    const cleanOverrides = sanitizeOverrides(formats.overrides);

    await chrome.storage.sync.set({
      formats: cleanFormats,
      options: cleanOptions,
      overrides: cleanOverrides,
    });
  }

  GEP.settings = {
    DEFAULTS, OPTION_DEFAULTS, OPTION_ENUMS, OPTION_TEXT_LIMITS,
    OVERRIDE_FIELDS, OVERRIDABLE_FORMATS,
    VALID_KEYS, VALID_OPTION_KEYS,
    MAX_PROFILES, MAX_PROFILE_NAME,
    sanitizeOverrides, sanitizeSnapshot, sanitizeProfiles,
    load, save, loadProfiles, saveProfiles,
  };
})();
