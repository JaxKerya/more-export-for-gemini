/**
 * Options page entry (ES module). Owns the shared settings state (formats,
 * options, per-format overrides) and the core controls that edit it; every
 * self-contained card lives in ./modules/ and receives a `ctx` handle:
 *
 *   ctx.formats / ctx.options   live state objects (mutate in place)
 *   ctx.overrides               per-format overrides (reassignable)
 *   ctx.saveAll()               persist state + refresh badges
 *   ctx.syncControlsFromState() push state onto every core control
 *   ctx.refreshLastEnabled()    re-evaluate the "last enabled format" guard
 *
 * The content script world intentionally stays IIFE + window.GEP (script
 * order is guaranteed by the manifest); only extension pages use modules.
 */

import { initNav } from "./modules/nav.js";
import { initBackup } from "./modules/backup.js";
import { initProfiles } from "./modules/profiles.js";
import { initReexport } from "./modules/reexport.js";
import { initTools } from "./modules/tools.js";
import { initFeedback } from "./modules/feedback.js";
import { initWhatsNew } from "./modules/whats-new.js";

const {
  DEFAULTS: FORMAT_DEFAULTS,
  OPTION_DEFAULTS,
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

/** Shared handle passed to every card module (see header comment). */
const ctx = {
  formats,
  options,
  // Per-format overrides (#50): { [formatKey]: { include_toc?, include_footnotes?, citation_style? } }
  overrides:
    stored.overrides && typeof stored.overrides === "object" ? { ...stored.overrides } : {},
  saveAll,
  syncControlsFromState,
  refreshLastEnabled,
};

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
    overrides: sanitizeOverrides(ctx.overrides),
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
  loadOverrideControls();
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
  const o = ctx.overrides[fmt];
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
  const o = ctx.overrides[fmt] || {};
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
  if (Object.keys(entry).length) ctx.overrides[fmt] = entry;
  else delete ctx.overrides[fmt];
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
  ctx.overrides = {};
  syncControlsFromState();
  await saveAll();
  refreshLastEnabled();
  resetModal.classList.remove("visible");
});

// ── Cross-context sync ──
// Reflect changes written by another context (the popup's quick profile
// switcher, or a second Options window) onto this open page. Fires for our
// own writes too, but re-applying just-saved values is a visual no-op.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  let touched = false;
  if (changes.formats && changes.formats.newValue) {
    Object.assign(formats, { ...FORMAT_DEFAULTS, ...changes.formats.newValue });
    touched = true;
  }
  if (changes.options && changes.options.newValue) {
    Object.assign(options, { ...OPTION_DEFAULTS, ...changes.options.newValue });
    touched = true;
  }
  if (changes.overrides) {
    ctx.overrides = sanitizeOverrides(changes.overrides.newValue);
    touched = true;
  }
  if (touched) {
    syncControlsFromState();
    refreshLastEnabled();
    refreshBadges();
  }
});

// ── Card modules ──
initNav();
initBackup(ctx);
initReexport(ctx);
initTools();
initFeedback();
await initProfiles(ctx);
await initWhatsNew();

refreshLastEnabled();
refreshBadges();
