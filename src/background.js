/**
 * Background service worker.
 *
 * Creates a right-click context menu with export options. Each click sends a
 * message to the content script on the active tab.
 */
"use strict";

importScripts("lib/settings.js");

/** @type {typeof globalThis.GEP} */
const GEP = globalThis.GEP;
const DEFAULT_FORMATS = GEP.settings.DEFAULTS;

// Menu grouped into sections; a separator is drawn only between sections that
// each have at least one enabled item (no dangling/adjacent separators).
// `format` is the message payload; `base` (when set) is the settings key that
// gates a scoped variant like "markdown@tables".
const MENU_SECTIONS = [
  [
    { format: "clipboard_md", title: "Copy as Markdown" },
    { format: "clipboard_txt", title: "Copy as Plain Text" },
    { format: "clipboard_html", title: "Copy as HTML (rich)" },
    { format: "clipboard_json", title: "Copy as JSON" },
  ],
  [
    { format: "markdown", title: "Markdown (.md)" },
    { format: "txt", title: "Plain text (.txt)" },
    { format: "html", title: "HTML (.html)" },
    { format: "reader", title: "HTML – Reader (.html)" },
    { format: "json", title: "JSON (.json)" },
  ],
  [{ format: "latex", title: "LaTeX (.tex)" }],
  [{ format: "csv", title: "CSV (.csv)" }],
  [
    { format: "bibtex", title: "BibTeX (.bib)" },
    { format: "ris", title: "RIS (.ris)" },
    { format: "csljson", title: "CSL-JSON (.json)" },
  ],
  [
    { format: "docx", title: "Word (.docx)" },
    { format: "rtf", title: "Rich Text (.rtf)" },
    { format: "pdf", title: "PDF (.pdf)" },
    { format: "epub", title: "EPUB (.epub)" },
  ],
  [
    { format: "vault", title: "Vault bundle (.zip)" },
    { format: "zip_all", title: "Download all (.zip)" },
  ],
  [
    { format: "markdown@tables", base: "markdown", title: "Tables only → Markdown" },
    { format: "csv@tables", base: "csv", title: "Tables only → CSV" },
    { format: "markdown@nosrc", base: "markdown", title: "Body only (no sources) → Markdown" },
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

chrome.runtime.onInstalled.addListener(rebuildMenus);
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
