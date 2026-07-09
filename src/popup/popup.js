(async function () {
  "use strict";

  const t = GEP.i18n.t;
  GEP.i18n.localizeDocument();

  const manifest = chrome.runtime.getManifest();
  document.getElementById("version").textContent = `v${manifest.version_name || manifest.version}`;

  document.getElementById("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    try { chrome.runtime.openOptionsPage(); } catch { /* fallback */ }
  });

  function openFeedback(buildUrl) {
    const url = buildUrl({
      version: manifest.version_name || manifest.version,
      browser: navigator.userAgent,
    });
    try { chrome.tabs.create({ url }); } catch { window.open(url, "_blank"); }
  }

  const bugReportLink = document.getElementById("bugReportLink");
  if (bugReportLink && window.GEP_LINKS) {
    bugReportLink.addEventListener("click", (e) => {
      e.preventDefault();
      openFeedback(window.GEP_LINKS.buildBugReportUrl);
    });
  }

  const suggestionLink = document.getElementById("suggestionLink");
  if (suggestionLink && window.GEP_LINKS) {
    suggestionLink.addEventListener("click", (e) => {
      e.preventDefault();
      openFeedback(window.GEP_LINKS.buildSuggestionUrl);
    });
  }

  const FORMAT_LABELS = {
    clipboard_md: t("popChipClipMd"), clipboard_txt: t("popChipClipTxt"),
    clipboard_html: t("popChipClipHtml"), clipboard_json: t("popChipClipJson"),
    markdown: ".md", txt: ".txt", html: ".html", reader: t("popChipReader"), json: ".json",
    latex: ".tex",
    csv: ".csv",
    bibtex: ".bib", ris: ".ris", csljson: "CSL-JSON",
    docx: ".docx", rtf: ".rtf", pdf: ".pdf", epub: ".epub",
    vault: t("popChipVault"), zip_all: ".zip",
  };

  const DOC_FORMATS = new Set(["docx", "rtf", "pdf", "epub", "vault"]);
  const REF_FORMATS = new Set(["bibtex", "ris", "csljson"]);
  const DATA_FORMATS = new Set(["csv"]);
  const CLIP_FORMATS = new Set(["clipboard_md", "clipboard_txt", "clipboard_html", "clipboard_json"]);

  const CITATION_LABELS = {
    numbered: t("citeNumbered"), apa: "APA", mla: "MLA", chicago: "Chicago", ieee: "IEEE",
    vancouver: "Vancouver", harvard: "Harvard", acs: "ACS", ama: "AMA",
  };

  const FORMAT_DEFAULTS = GEP.settings.DEFAULTS;
  const OPTION_DEFAULTS = GEP.settings.OPTION_DEFAULTS;

  const stored = await chrome.storage.sync.get({
    formats: FORMAT_DEFAULTS,
    options: OPTION_DEFAULTS,
  });
  const formats = { ...FORMAT_DEFAULTS, ...stored.formats };
  const options = { ...OPTION_DEFAULTS, ...stored.options };

  const downloadFormats = Object.entries(formats)
    .filter(([k, v]) => v && !CLIP_FORMATS.has(k) && k !== "zip_all");
  const clipFormats = Object.entries(formats)
    .filter(([k, v]) => v && CLIP_FORMATS.has(k));

  document.getElementById("formatCount").textContent = downloadFormats.length;
  document.getElementById("clipboardCount").textContent = clipFormats.length;
  document.getElementById("citationLabel").textContent =
    CITATION_LABELS[options.citation_style] || t("citeNumbered");

  const chipsEl = document.getElementById("enabledFormats");
  downloadFormats.forEach(([k]) => {
    const chip = document.createElement("span");
    chip.className = "format-chip";
    if (DOC_FORMATS.has(k)) chip.classList.add("doc");
    else if (REF_FORMATS.has(k)) chip.classList.add("ref");
    else if (DATA_FORMATS.has(k)) chip.classList.add("data");
    chip.textContent = FORMAT_LABELS[k] || k;
    chipsEl.appendChild(chip);
  });
  if (formats.zip_all) {
    const chip = document.createElement("span");
    chip.className = "format-chip doc";
    chip.textContent = t("popChipZipAll");
    chipsEl.appendChild(chip);
  }

  // ── Quick profile switcher (#12) ──
  const profileRow = document.getElementById("profileRow");
  const profileSelect = document.getElementById("profileSelect");
  const profileApplyBtn = document.getElementById("profileApplyBtn");
  if (profileRow && profileSelect && profileApplyBtn) {
    const profiles = await GEP.settings.loadProfiles();
    const names = Object.keys(profiles)
      .sort((a, b) => (profiles[b].savedAt || 0) - (profiles[a].savedAt || 0));
    if (names.length) {
      profileRow.hidden = false;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = t("popSwitchProfile");
      profileSelect.appendChild(placeholder);
      for (const name of names) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        profileSelect.appendChild(opt);
      }
      profileApplyBtn.addEventListener("click", async () => {
        const name = profileSelect.value;
        if (!name || !profiles[name]) return;
        profileApplyBtn.disabled = true;
        const snap = GEP.settings.sanitizeSnapshot(profiles[name]);
        try {
          await chrome.storage.sync.set({
            formats: snap.formats,
            options: snap.options,
            overrides: snap.overrides,
          });
          // Re-render the popup so the stats and chips reflect the new setup
          // (the background worker rebuilds the context menu on its own).
          location.reload();
        } catch {
          profileApplyBtn.disabled = false;
        }
      });
    }
  }

  // Status
  const dot = document.getElementById("dot");
  const statusText = document.getElementById("statusText");

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    dot.classList.add("inactive");
    statusText.textContent = t("popStatusTabError");
    return;
  }

  if (!tab || !tab.url || !tab.url.startsWith("https://gemini.google.com")) {
    dot.classList.add("inactive");
    statusText.textContent = t("popStatusNotGemini");
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GEP_PING" });
    if (response && response.hasContent) {
      dot.classList.add("active");
      statusText.textContent = t("popStatusReady");
    } else {
      dot.classList.add("active");
      statusText.textContent = t("popStatusWaiting");
    }
  } catch {
    dot.classList.add("inactive");
    statusText.textContent = t("popStatusNoConnection");
  }
})();
