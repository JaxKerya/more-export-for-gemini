/**
 * Background service worker.
 *
 * Creates a right-click context menu with export options. Each click sends a
 * message to the content script on the active tab.
 */
"use strict";

importScripts("lib/i18n.js", "lib/settings.js");

/** @type {typeof globalThis.GEP} */
const GEP = globalThis.GEP;
const DEFAULT_FORMATS = GEP.settings.DEFAULTS;
const t = GEP.i18n.t;

// Menu grouped into sections; a separator is drawn only between sections that
// each have at least one enabled item (no dangling/adjacent separators).
// `format` is the message payload; `base` (when set) is the settings key that
// gates a scoped variant like "markdown@tables".
const MENU_SECTIONS = [
  [
    { format: "clipboard_md", title: t("fmtClipboardMd") },
    { format: "clipboard_txt", title: t("fmtClipboardTxt") },
    { format: "clipboard_html", title: t("fmtClipboardHtml") },
    { format: "clipboard_json", title: t("fmtClipboardJson") },
  ],
  [
    { format: "markdown", title: t("fmtMarkdown") },
    { format: "txt", title: t("fmtTxt") },
    { format: "html", title: t("fmtHtml") },
    { format: "reader", title: t("fmtReader") },
    { format: "json", title: t("fmtJson") },
  ],
  [{ format: "latex", title: t("fmtLatex") }],
  [{ format: "csv", title: t("fmtCsv") }],
  [
    { format: "bibtex", title: t("fmtBibtex") },
    { format: "ris", title: t("fmtRis") },
    { format: "csljson", title: t("fmtCsljson") },
  ],
  [
    { format: "docx", title: t("fmtDocx") },
    { format: "rtf", title: t("fmtRtf") },
    { format: "pdf", title: t("fmtPdf") },
    { format: "epub", title: t("fmtEpub") },
  ],
  [
    { format: "vault", title: t("fmtVault") },
    { format: "zip_all", title: t("fmtZipAll") },
  ],
  [
    { format: "markdown@tables", base: "markdown", title: t("fmtTablesMd") },
    { format: "csv@tables", base: "csv", title: t("fmtTablesCsv") },
    { format: "markdown@nosrc", base: "markdown", title: t("fmtNosrcMd") },
  ],
];

async function loadFormats() {
  try {
    const stored = await chrome.storage.sync.get("formats");
    return { ...DEFAULT_FORMATS, ...(stored && stored.formats) };
  } catch {
    return { ...DEFAULT_FORMATS };
  }
}

/** (Re)builds the context menu so only user-enabled formats are shown. */
async function rebuildMenus() {
  const formats = await loadFormats();
  const isEnabled = (item) => formats[item.base || item.format] === true;

  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));

  const create = (props) =>
    chrome.contextMenus.create({
      contexts: ["page"],
      documentUrlPatterns: ["https://gemini.google.com/*"],
      ...props,
    });

  create({ id: "gep-parent", title: "More Export for Gemini" });

  let sepIndex = 0;
  let sectionsShown = 0;
  for (const section of MENU_SECTIONS) {
    const visible = section.filter(isEnabled);
    if (!visible.length) continue;
    if (sectionsShown > 0) {
      create({ id: `gep-sep${sepIndex++}`, parentId: "gep-parent", type: "separator" });
    }
    for (const item of visible) {
      create({ id: `gep-${item.format}`, parentId: "gep-parent", title: item.title });
    }
    sectionsShown++;
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  rebuildMenus();
  // First-run onboarding: open the Options page once with a welcome banner so
  // new users learn where the export options live (the share-menu entries are
  // otherwise easy to miss).
  if (details && details.reason === "install") {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") + "?welcome=1" });
    } catch { /* tab creation unavailable (e.g. during tests) */ }
  }
});
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(rebuildMenus);

// Keep the menu in sync when the user toggles formats in the Options page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.formats) rebuildMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith("gep-") || info.menuItemId === "gep-parent") return;
  const format = info.menuItemId.replace("gep-", "");
  if (format.startsWith("sep")) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "GEP_EXPORT", format });
  } catch {
    // Content script not ready or tab is not Gemini — silently ignore.
  }
});

/** Finds the active Gemini tab, falling back to any open Gemini tab. */
async function findGeminiTab() {
  const [active] = await chrome.tabs.query({
    active: true, currentWindow: true, url: "https://gemini.google.com/*",
  });
  if (active) return active;
  const [any] = await chrome.tabs.query({ url: "https://gemini.google.com/*" });
  return any || null;
}

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    const tab = await findGeminiTab();
    if (!tab) return;

    let format;
    if (command === "copy_markdown") format = "clipboard_md";
    else if (command === "download_all") format = "zip_all";
    else if (command === "export_primary") {
      try {
        const { options } = await chrome.storage.sync.get("options");
        format = (options && options.primary_format) || "markdown";
      } catch {
        format = "markdown";
      }
    } else {
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { type: "GEP_EXPORT", format });
    } catch {
      // Content script not ready — silently ignore.
    }
  });
}
