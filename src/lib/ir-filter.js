/**
 * IR filters for selective / partial export.
 *
 * Each function returns a NEW shallow-cloned IR; the original (which may be the
 * cached extraction) is never mutated.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  /** Keep only table blocks; drops everything else and the sources list. */
  function tablesOnly(ir) {
    const blocks = (ir.blocks || []).filter((b) => b.type === "table");
    return { ...ir, blocks, footnotes: [] };
  }

  /** Strip footnote references and the sources list, keeping the body text. */
  function withoutSources(ir) {
    const strip = (runs) => (runs || []).filter((r) => !r.footnoteIndex);
    const blocks = (ir.blocks || []).map((b) => {
      const nb = { ...b };
      if (nb.runs) nb.runs = strip(nb.runs);
      if (nb.items) nb.items = nb.items.map((it) => ({ ...it, runs: strip(it.runs) }));
      return nb;
    });
    return { ...ir, blocks, footnotes: [] };
  }

  /** Resolve a scope keyword to a filter; unknown scopes return the IR as-is. */
  function apply(ir, scope) {
    if (scope === "tables") return tablesOnly(ir);
    if (scope === "nosrc") return withoutSources(ir);
    return ir;
  }

  GEP.irFilter = { tablesOnly, withoutSources, apply };
})();
