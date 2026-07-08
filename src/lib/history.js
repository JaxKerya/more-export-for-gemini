/**
 * Export history / automatic JSON backup (#13).
 *
 * Every successful export snapshots the report IR into chrome.storage.local
 * so the report can be re-exported later (Options → Re-export from JSON →
 * Recent reports) even after the Gemini conversation is deleted.
 *
 * chrome.storage.local (not sync) because IRs are far larger than the sync
 * quota. Eviction is LRU with both an entry-count cap and a total-byte cap;
 * re-exporting the same report bumps its slot instead of duplicating it.
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

  const STORAGE_KEY = "gep_history";
  const MAX_ENTRIES = 10;
  const MAX_ENTRY_BYTES = 2 * 1024 * 1024;  // single report cap
  const MAX_TOTAL_BYTES = 8 * 1024 * 1024;  // whole history cap (local quota is 10 MB)

  /** Same report re-exported → same fingerprint → LRU bump, not a duplicate. */
  function fingerprint(ir) {
    const title = ir && ir.title ? String(ir.title) : "";
    const url = ir && ir.url ? String(ir.url) : "";
    const blocks = ir && Array.isArray(ir.blocks) ? ir.blocks.length : 0;
    return `${title}::${url}::${blocks}`;
  }

  async function readAll() {
    try {
      const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
      const list = stored[STORAGE_KEY];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function writeAll(entries) {
    return chrome.storage.local.set({ [STORAGE_KEY]: entries });
  }

  /**
   * Saves an IR snapshot. `meta.format` records which export triggered the
   * backup (informational only). Returns { ok, reason?, id?, count? }.
   */
  async function add(ir, meta) {
    if (!ir || !Array.isArray(ir.blocks) || !ir.blocks.length) {
      return { ok: false, reason: "empty" };
    }
    let bytes;
    try {
      bytes = JSON.stringify(ir).length;
    } catch {
      return { ok: false, reason: "unserializable" };
    }
    if (bytes > MAX_ENTRY_BYTES) return { ok: false, reason: "too-large" };

    const entries = await readAll();
    const fp = fingerprint(ir);
    const format = meta && meta.format ? String(meta.format) : "";

    let entry = entries.find((e) => e && e.fp === fp);
    if (entry) {
      entry.savedAt = Date.now();
      entry.ir = ir;
      entry.bytes = bytes;
      if (!Array.isArray(entry.formats)) entry.formats = [];
      if (format && !entry.formats.includes(format)) entry.formats.push(format);
    } else {
      entry = {
        id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        fp,
        title: ir.title || "Untitled report",
        url: typeof ir.url === "string" ? ir.url : "",
        savedAt: Date.now(),
        blocks: ir.blocks.length,
        sources: Array.isArray(ir.footnotes) ? ir.footnotes.length : 0,
        bytes,
        formats: format ? [format] : [],
        ir,
      };
      entries.push(entry);
    }

    // LRU eviction: newest first, keep entries while both caps hold.
    entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const kept = [];
    let total = 0;
    for (const e of entries) {
      const b = (e && e.bytes) || 0;
      if (kept.length >= MAX_ENTRIES || total + b > MAX_TOTAL_BYTES) break;
      kept.push(e);
      total += b;
    }

    try {
      await writeAll(kept);
    } catch (err) {
      return { ok: false, reason: "storage", error: String(err) };
    }
    return { ok: true, id: entry.id, count: kept.length };
  }

  /** Newest-first metadata list; the (potentially large) IR is omitted. */
  async function list() {
    const entries = await readAll();
    entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return entries.map((e) => {
      const metaOnly = { ...e };
      delete metaOnly.ir;
      return metaOnly;
    });
  }

  /** Full entry (including IR) by id, or null. */
  async function get(id) {
    const entries = await readAll();
    return entries.find((e) => e && e.id === id) || null;
  }

  async function remove(id) {
    const entries = await readAll();
    const next = entries.filter((e) => e && e.id !== id);
    await writeAll(next);
    return next.length !== entries.length;
  }

  function clear() {
    return writeAll([]);
  }

  GEP.history = {
    STORAGE_KEY, MAX_ENTRIES, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES,
    add, list, get, remove, clear,
  };
})();
