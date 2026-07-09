/**
 * i18n helper.
 *
 * Thin wrapper around chrome.i18n plus the HTML localizer for extension
 * pages. All user-visible strings live in _locales/<lang>/messages.json;
 * the browser picks the language (no in-extension language switcher).
 *
 * Conventions:
 *   t("key")            -> message, or the key itself when missing so a
 *                          forgotten entry is loudly visible in the UI/tests
 *   t("key", "x")       -> single $1 substitution
 *   t("key", ["x","y"]) -> $1/$2 substitutions
 *
 * HTML pages keep their English text inline (build-time fallback) and mark
 * elements with data-i18n attributes; localizeDocument() overwrites them
 * from messages at load. `data-i18n-html` values may contain markup — they
 * come exclusively from our own bundled messages.json, never from user or
 * page input.
 */
(function () {
  const root = typeof globalThis !== "undefined" ? globalThis : self;
  const existing = (typeof window !== "undefined" && window.GEP) || root.GEP || {};
  const GEP = (root.GEP = existing);
  if (typeof window !== "undefined") window.GEP = GEP;

  function raw(key, subs) {
    try {
      const list =
        subs == null ? undefined : (Array.isArray(subs) ? subs : [subs]).map(String);
      return chrome.i18n.getMessage(key, list) || "";
    } catch {
      return "";
    }
  }

  function t(key, subs) {
    return raw(key, subs) || key;
  }

  /**
   * Applies messages to a document (options / popup pages):
   *   data-i18n             -> textContent
   *   data-i18n-html        -> innerHTML (trusted bundled strings only)
   *   data-i18n-placeholder -> placeholder attribute
   *   data-i18n-title       -> title attribute
   *   data-i18n-aria        -> aria-label attribute
   * Elements whose key has no message keep their inline English text.
   */
  function localizeDocument(scope) {
    const doc = scope || document;
    doc.querySelectorAll("[data-i18n]").forEach((el) => {
      const msg = raw(el.getAttribute("data-i18n"));
      if (msg) el.textContent = msg;
    });
    doc.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const msg = raw(el.getAttribute("data-i18n-html"));
      if (msg) el.innerHTML = msg;
    });
    const attrMap = [
      ["data-i18n-placeholder", "placeholder"],
      ["data-i18n-title", "title"],
      ["data-i18n-aria", "aria-label"],
    ];
    for (const [dataAttr, target] of attrMap) {
      doc.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
        const msg = raw(el.getAttribute(dataAttr));
        if (msg) el.setAttribute(target, msg);
      });
    }
  }

  GEP.i18n = { t, raw, localizeDocument };
})();
