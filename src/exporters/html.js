/**
 * HTML exporter: reuses the PDF module's styled HTML builder and downloads it
 * as a standalone .html file instead of printing.
 * Now passes through TOC and footnote options.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function convert(ir, opts) {
    return GEP.pdf.buildDocument(ir, opts);
  }

  GEP.html = { convert };
})();
