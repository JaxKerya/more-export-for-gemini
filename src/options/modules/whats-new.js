/**
 * What's New panel (#46): renders the release notes and surfaces a "New"
 * badge on the nav item until the current version has been seen once.
 */

const RELEASE_NOTES = [
  {
    version: "2.2.0",
    date: "2026-07-29",
    items: [
      "The interface now speaks 8 languages - English, Turkish, Spanish, Portuguese (BR), German, French, Japanese and Korean. Pick one in Settings or let it follow your browser.",
      "Excel export (.xlsx) - each table becomes its own worksheet with a frozen header row and genuinely numeric cells, so SUM() works right away.",
      "Export a single section - choose the headings you need from the share menu and get just those, with the source list reduced to the references they actually cite.",
      "Firefox and Edge are now supported alongside Chrome.",
      "Export profiles - save a set of formats and options, then switch between them from the popup.",
      "Recent reports - every export is backed up locally, so you can turn it into another format later without reopening Gemini.",
      "Copy for Google Docs / Word - the same rich clipboard copy as before, now named for what it actually does.",
      "Faster pages and a faster first export - the conversion stack and its heavy vendors load only when you actually export something.",
      "The scary install warning is gone - the extension no longer requests the broad browsing-history permission.",
      "Arabic, Hebrew and CJK reports now typeset correctly in LaTeX, with the right fonts set up automatically.",
    ],
  },
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

export async function initWhatsNew() {
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
