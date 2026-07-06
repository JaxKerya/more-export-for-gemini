/**
 * Document metadata helper (#2).
 *
 * Normalizes the user-provided metadata (author, affiliation, keywords,
 * abstract) into a single shape that every exporter can consume the same way.
 * Keywords accept comma- or semicolon-separated input and are split into an
 * array; the raw string is kept for formats that prefer a single field.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  function normalize(opts) {
    const m = (opts && opts.meta) || {};
    const author = String(m.author == null ? "" : m.author).trim();
    const affiliation = String(m.affiliation == null ? "" : m.affiliation).trim();
    const abstract = String(m.abstract == null ? "" : m.abstract).trim();
    const keywordsRaw = String(m.keywords == null ? "" : m.keywords).trim();
    const keywords = keywordsRaw
      ? keywordsRaw.split(/[,;]+/).map((k) => k.trim()).filter(Boolean)
      : [];

    return {
      author,
      affiliation,
      abstract,
      keywords,
      keywordsRaw: keywords.join(", "),
      hasByline: !!(author || affiliation),
      has: !!(author || affiliation || abstract || keywords.length),
    };
  }

  /** "Name — Affiliation" / "Name" / "Affiliation" depending on what is set. */
  function byline(meta) {
    if (meta.author && meta.affiliation) return `${meta.author} \u2014 ${meta.affiliation}`;
    return meta.author || meta.affiliation || "";
  }

  GEP.docmeta = { normalize, byline };
})();
