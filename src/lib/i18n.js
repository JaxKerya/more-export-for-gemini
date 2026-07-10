/**
 * i18n helper.
 *
 * Wrapper around chrome.i18n plus the HTML localizer for extension pages.
 * All user-visible strings live in _locales/<lang>/messages.json.
 *
 * Language selection: by default ("auto") the browser picks the language via
 * chrome.i18n. The user may also pin a language in Settings; the choice is
 * stored as the `uiLang` key in chrome.storage.sync. Since chrome.i18n cannot
 * be redirected at runtime, a pinned language loads its catalog manually with
 * fetch (the catalogs are listed in web_accessible_resources so content
 * scripts can read them too) and t() consults that catalog first, falling
 * back to chrome.i18n.
 *
 * Callers that render UI must `await GEP.i18n.init()` once before reading
 * translations. Before/without init, t() serves the browser language.
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

  /** Languages with a catalog in _locales/ (keep in sync with that folder). */
  const SUPPORTED_LOCALES = ["en", "tr", "es", "pt_BR", "de", "fr", "ja", "ko"];

  /** @type {{ lang: string, messages: Record<string, {message?: string}> } | null} */
  let override = null;
  /** @type {Promise<void> | null} */
  let initPromise = null;

  /** Clamps a stored uiLang value to a supported locale or "auto". */
  function normalizeLang(value) {
    return typeof value === "string" && SUPPORTED_LOCALES.includes(value) ? value : "auto";
  }

  async function loadCatalog(lang) {
    const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    if (!res.ok) throw new Error("i18n catalog unavailable: " + lang);
    return res.json();
  }

  async function doInit() {
    try {
      const stored = await chrome.storage.sync.get({ uiLang: "auto" });
      const lang = normalizeLang(stored.uiLang);
      if (lang === "auto") {
        override = null;
        return;
      }
      override = { lang, messages: await loadCatalog(lang) };
    } catch {
      override = null; // any failure -> browser language, never a broken UI
    }
  }

  /**
   * Loads the pinned language (if any). Idempotent and cached; pass
   * force=true to re-read storage (used when uiLang changes at runtime).
   */
  function init(force) {
    if (force || !initPromise) initPromise = doInit();
    return initPromise;
  }

  /** Chrome-style positional substitution: $1..$9. */
  function substitute(msg, list) {
    if (!list || !list.length) return msg;
    return msg.replace(/\$([1-9])/g, (match, n) => {
      const i = Number(n) - 1;
      return i < list.length ? list[i] : match;
    });
  }

  function raw(key, subs) {
    const list =
      subs == null ? undefined : (Array.isArray(subs) ? subs : [subs]).map(String);
    if (override) {
      const entry = override.messages[key];
      if (entry && typeof entry.message === "string") return substitute(entry.message, list);
    }
    try {
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

  // Long-lived contexts (content scripts, service worker) pick up a language
  // change without a reload; pages that render static DOM reload themselves.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.uiLang) init(true);
    });
  } catch { /* chrome.storage unavailable (tests) */ }

  GEP.i18n = { t, raw, localizeDocument, init, normalizeLang, SUPPORTED_LOCALES };
})();
