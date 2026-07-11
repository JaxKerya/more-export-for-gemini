/**
 * Local error log (telemetry-free).
 *
 * Caught runtime failures (extraction, export, module loading, menu
 * injection) are appended to a small ring buffer in chrome.storage.local so
 * the diagnostics report can show WHAT went wrong on this device — today a
 * user saying "PDF doesn't work" leaves no trace to debug from.
 *
 * Nothing ever leaves the device: entries surface only inside the
 * user-downloaded gep-diagnostics.txt, which the user reviews and attaches
 * to a bug report themselves. Recording is fire-and-forget and can never
 * break the calling code path.
 */
(function () {
  "use strict";
  const root = typeof globalThis !== "undefined" ? globalThis : self;
  const existing =
    (typeof window !== "undefined" && window.GEP) ||
    root.GEP ||
    {};
  const GEP = (root.GEP = existing);
  if (typeof window !== "undefined") window.GEP = GEP;

  const STORAGE_KEY = "gep_errors";
  const MAX_ENTRIES = 20;
  const MAX_TEXT = 600; // per-field cap so the log can never bloat storage

  /**
   * Appends one error to the ring buffer (oldest entries are dropped).
   * @param {string} context short machine tag, e.g. "export:pdf", "extract"
   * @param {unknown} err Error or anything thrown
   */
  async function record(context, err) {
    try {
      const entry = {
        ts: new Date().toISOString(),
        context: String(context || "").slice(0, 80),
        message: String((err && err.message) || err || "").slice(0, MAX_TEXT),
        stack: String((err && err.stack) || "").slice(0, MAX_TEXT),
      };
      const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
      const list = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
      list.push(entry);
      await chrome.storage.local.set({ [STORAGE_KEY]: list.slice(-MAX_ENTRIES) });
    } catch { /* logging must never break the caller */ }
  }

  /** Oldest-first list of recorded errors (possibly empty). */
  async function list() {
    try {
      const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
      return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    } catch {
      return [];
    }
  }

  function clear() {
    try {
      return chrome.storage.local.set({ [STORAGE_KEY]: [] });
    } catch {
      return Promise.resolve();
    }
  }

  GEP.errlog = { record, list, clear, STORAGE_KEY, MAX_ENTRIES };
})();
