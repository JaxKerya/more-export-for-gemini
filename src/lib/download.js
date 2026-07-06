/**
 * Download helpers.
 *
 * Content scripts can trigger downloads without the `downloads` permission by
 * synthesising an anchor click during a user gesture. We revoke the object URL
 * shortly after to avoid leaks.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  /** Turns an arbitrary title into a safe, readable file name (no extension). */
  function safeFileName(title, fallback = "gemini-deep-research") {
    const MAX = 80;
    const raw = (title || fallback)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")           // strip combining diacritics
      .replace(/[\p{Emoji_Presentation}]/gu, "")  // strip emoji
      .replace(/[\\/:*?"<>|,;]+/g, " ")           // illegal on Windows + comma/semicolon (shell arg separators)
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "")  // strip remaining control chars
      .replace(/\s+/g, " ")
      .trim();
    const base = raw.length > MAX ? raw.slice(0, MAX).trimEnd() + "..." : raw;
    return base || fallback;
  }

  /** Downloads a Blob (or string) as `fileName`. */
  function downloadBlob(data, fileName, mimeType) {
    const blob =
      data instanceof Blob ? data : new Blob([data], { type: mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    (document.body || document.documentElement).appendChild(anchor);

    try {
      anchor.click();
    } finally {
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  /** Returns a date-stamped file name: "Title - 2026-06-04.ext" */
  function datedFileName(title, ext) {
    const date = new Date().toISOString().slice(0, 10);
    return `${safeFileName(title)} - ${date}${ext}`;
  }

  /**
   * Builds a file name from a user-defined template.
   *
   * Supported tokens:
   *   {title}     Report title (safe)    {date}      YYYY-MM-DD
   *   {YYYY}      Year                   {MM}        Month (01-12)
   *   {DD}        Day (01-31)            {time}      HH-mm
   *   {HH}        Hour (00-23)           {mm}        Minute (00-59)
   *   {ss}        Second (00-59)         {format}    Format name
   *   {ext}       File extension         {wordcount} Approx word count
   *   {timestamp} Unix timestamp
   */
  function templateFileName(title, ext, format, template, ir) {
    const now = new Date();
    const wordcount = (ir && ir.blocks || []).reduce((n, b) => {
      if (b.runs) return n + b.runs.reduce((s, r) => s + (r.text || "").split(/\s+/).filter(Boolean).length, 0);
      if (b.text) return n + b.text.split(/\s+/).filter(Boolean).length;
      if (b.items) return n + b.items.reduce((s, item) => s + item.runs.reduce((s2, r) => s2 + (r.text || "").split(/\s+/).filter(Boolean).length, 0), 0);
      return n;
    }, 0);
    const tokens = {
      title: safeFileName(title),
      date: now.toISOString().slice(0, 10),
      YYYY: String(now.getFullYear()),
      MM: String(now.getMonth() + 1).padStart(2, "0"),
      DD: String(now.getDate()).padStart(2, "0"),
      time: `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`,
      HH: String(now.getHours()).padStart(2, "0"),
      mm: String(now.getMinutes()).padStart(2, "0"),
      ss: String(now.getSeconds()).padStart(2, "0"),
      format: format || "",
      ext: ext || "",
      wordcount: String(wordcount),
      timestamp: String(Math.floor(now.getTime() / 1000)),
    };
    let name = (template && typeof template === "string" && template.trim()) ? template : "{title} - {date}";
    for (const [k, v] of Object.entries(tokens)) {
      name = name.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return name + ext;
  }

  GEP.download = { safeFileName, datedFileName, templateFileName, downloadBlob };
})();
