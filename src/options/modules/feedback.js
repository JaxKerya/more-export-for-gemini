/**
 * Feedback buttons (bug report / feature suggestion). Opens the pre-filled
 * Tally forms from src/links.js — the only outbound links in the extension.
 */

export function initFeedback() {
  function versionName() {
    try {
      const m = chrome.runtime.getManifest();
      return m.version_name || m.version;
    } catch {
      return "";
    }
  }

  function openForm(url) {
    try { window.open(url, "_blank", "noopener"); } catch { location.href = url; }
  }

  // ── Report a bug (multiple triggers: beta strip, Overview, Tools) ──
  const bugReportBtns = document.querySelectorAll(".js-bug-report");
  if (bugReportBtns.length && window.GEP_LINKS) {
    const openBugReport = () =>
      openForm(window.GEP_LINKS.buildBugReportUrl({ version: versionName(), browser: navigator.userAgent }));
    bugReportBtns.forEach((b) => b.addEventListener("click", openBugReport));
  }

  // ── Suggest a feature ──
  const suggestionBtns = document.querySelectorAll(".js-suggestion");
  if (suggestionBtns.length && window.GEP_LINKS) {
    const openSuggestion = () =>
      openForm(window.GEP_LINKS.buildSuggestionUrl({ version: versionName(), browser: navigator.userAgent }));
    suggestionBtns.forEach((b) => b.addEventListener("click", openSuggestion));
  }

  // ── Support the project (voluntary donation) ──
  const donateBtns = document.querySelectorAll(".js-donate");
  if (donateBtns.length && window.GEP_LINKS) {
    donateBtns.forEach((b) => b.addEventListener("click", () => openForm(window.GEP_LINKS.donateUrl)));
  }
}
