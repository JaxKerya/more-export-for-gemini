/**
 * CSL-JSON exporter: intermediate representation -> Citation Style Language JSON.
 *
 * CSL-JSON is the native bibliography interchange format used by Zotero,
 * Pandoc (`--citeproc`), and most modern academic toolchains. Only the
 * footnotes/sources are exported, each as a `webpage` item.
 *
 * Reference: https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  function accessedNow() {
    const d = new Date();
    return { "date-parts": [[d.getFullYear(), d.getMonth() + 1, d.getDate()]] };
  }

  function convert(ir) {
    const accessed = accessedNow();
    const items = (ir.footnotes || []).map((fn) => {
      const cite = GEP.citation ? GEP.citation.format(fn, "numbered") : null;
      const title = fn.title || (cite && cite.label) || "Source " + fn.index;
      const item = {
        id: "source-" + fn.index,
        type: "webpage",
        title: title,
        accessed: accessed,
      };
      if (fn.domain) item["container-title"] = fn.domain;
      if (fn.url) item.URL = fn.url;
      // DOI / ISBN from source hygiene (#20), when detected.
      if (fn.doi) item.DOI = fn.doi;
      if (fn.isbn) item.ISBN = fn.isbn;
      return item;
    });

    return JSON.stringify(items, null, 2) + "\n";
  }

  GEP.csljson = { convert };
})();
