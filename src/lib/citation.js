/**
 * Citation formatter.
 *
 * Provides a unified API for formatting footnotes in different academic
 * citation styles. Each exporter delegates to this module so that switching
 * styles only requires changing one option.
 *
 * Available styles: numbered (default), apa, mla, chicago, ieee,
 * vancouver, harvard, acs, ama.
 *
 * Because the IR footnotes only carry { index, url, title, domain }, author
 * and publication-year fields are unavailable. The formatters therefore apply
 * a "best-effort" adaptation of each style using the data at hand.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  const STYLES = ["numbered", "apa", "mla", "chicago", "ieee", "vancouver", "harvard", "acs", "ama"];

  function accessDate() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * @param {{ index: number, url?: string, title?: string, domain?: string }} fn
   * @param {string} style
   * @returns {{ plain: string, label: string, url: string }}
   */
  function format(fn, style) {
    const idx = fn.index;
    const url = fn.url || "";
    const title = fn.title || "";
    const domain = fn.domain || "";
    const label = title || domain || url;

    if (!url) {
      return { plain: `[${idx}] Source ${idx}`, label: `Source ${idx}`, url: "" };
    }

    switch (style) {
      case "apa":
        // APA 7th (adapted): Title. Domain. URL
        return {
          plain: `${label}. ${domain ? domain + ". " : ""}${url}`,
          label,
          url,
        };

      case "mla":
        // MLA 9th (adapted): "Title." Domain, URL.
        return {
          plain: `\u201C${label}.\u201D ${domain ? domain + ", " : ""}${url}.`,
          label,
          url,
        };

      case "chicago":
        // Chicago Author-Date (adapted): "Title." Domain. Accessed DATE. URL.
        return {
          plain: `\u201C${label}.\u201D ${domain ? domain + ". " : ""}Accessed ${accessDate()}. ${url}.`,
          label,
          url,
        };

      case "ieee":
        // IEEE (adapted): [N] "Title," Domain. [Online]. Available: URL
        return {
          plain: `[${idx}] \u201C${label},\u201D ${domain ? domain + ". " : ""}[Online]. Available: ${url}`,
          label,
          url,
        };

      case "vancouver":
        // Vancouver (adapted): N. Title [Internet]. Domain; [cited DATE]. Available from: URL
        return {
          plain: `${idx}. ${label} [Internet]. ${domain ? domain + "; " : ""}[cited ${accessDate()}]. Available from: ${url}`,
          label,
          url,
        };

      case "harvard":
        // Harvard (adapted): Title. Domain. Available at: URL (Accessed: DATE).
        return {
          plain: `${label}. ${domain ? domain + ". " : ""}Available at: ${url} (Accessed: ${accessDate()}).`,
          label,
          url,
        };

      case "acs":
        // ACS (adapted): Title. Domain. URL (accessed DATE).
        return {
          plain: `${label}. ${domain ? domain + ". " : ""}${url} (accessed ${accessDate()}).`,
          label,
          url,
        };

      case "ama":
        // AMA (adapted): N. Title. Domain. Accessed DATE. URL
        return {
          plain: `${idx}. ${label}. ${domain ? domain + ". " : ""}Accessed ${accessDate()}. ${url}`,
          label,
          url,
        };

      default:
        // numbered (original style): [N] Label — URL
        return {
          plain: `[${idx}] ${label} \u2014 ${url}`,
          label,
          url,
        };
    }
  }

  GEP.citation = { STYLES, format };
})();
