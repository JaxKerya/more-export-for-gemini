/**
 * Source hygiene (#16 / #17 / #20).
 *
 * Pure IR transforms (the input IR is never mutated — every function returns a
 * new shallow-cloned IR, following the src/lib/ir-filter.js pattern):
 *   - normalizeUrl(u)        canonicalize a URL for comparison
 *   - dedupe(ir)             merge footnotes sharing a normalized URL, remap refs
 *   - sortSources(ir, mode)  reorder the sources list + renumber references
 *   - enrichIds(ir)          extract DOI / ISBN from url+title into fn.doi/fn.isbn
 *   - apply(ir, opts)        enrich → dedupe → sort, driven by export options
 *
 * Renumbering keeps body references and the sources list in lock-step: both the
 * runs' `footnoteIndex` and each footnote's `index` are remapped together, so
 * renderers that build ids from those numbers (e.g. PDF `#fnref-N-1`) stay
 * consistent. No network access — DOI/ISBN are detected purely by regex.
 */
(function () {
  "use strict";
  /** @type {Record<string, any>} */
  const GEP = (window.GEP = window.GEP || {});

  // Common tracking / analytics query params dropped during normalization.
  const TRACKING = /^(utm_.*|fbclid|gclid|gclsrc|dclid|msclkid|mc_eid|mc_cid|ref|ref_src|ref_url|igshid|spm|_hsenc|_hsmi|yclid|wt_zmc|s_cid|cmpid)$/i;

  /**
   * Canonicalize a URL for equality comparison: lowercase scheme/host, drop a
   * leading `www.`, treat http as https, remove the fragment, strip tracking
   * params, sort the remaining query, and drop trailing slashes. Parser-free so
   * it behaves identically in the browser, Node and the test sandbox.
   * @param {string} u
   * @returns {string}
   */
  function normalizeUrl(u) {
    if (typeof u !== "string") return "";
    let s = u.trim();
    if (!s) return "";
    s = s.replace(/#.*$/, "");

    let scheme = "";
    let rest = s;
    const m = s.match(/^([a-z][a-z0-9+.-]*:)\/\//i);
    if (m) { scheme = m[1].toLowerCase(); rest = s.slice(m[0].length); }
    if (scheme === "http:") scheme = "https:";

    let query = "";
    const qIdx = rest.indexOf("?");
    if (qIdx >= 0) { query = rest.slice(qIdx + 1); rest = rest.slice(0, qIdx); }

    let host = rest;
    let path = "";
    const slashIdx = rest.indexOf("/");
    if (slashIdx >= 0) { host = rest.slice(0, slashIdx); path = rest.slice(slashIdx); }
    host = host.toLowerCase().replace(/^www\./, "");
    path = path.replace(/\/+$/, "");

    let qs = "";
    if (query) {
      const pairs = query
        .split("&")
        .map((p) => { const i = p.indexOf("="); return i >= 0 ? [p.slice(0, i), p.slice(i + 1)] : [p, ""]; })
        .filter(([k]) => k && !TRACKING.test(k));
      pairs.sort((a, b) => a[0].localeCompare(b[0]));
      qs = pairs.map(([k, v]) => (v === "" ? k : `${k}=${v}`)).join("&");
    }

    const prefix = scheme ? `${scheme}//` : "";
    return `${prefix}${host}${path}${qs ? `?${qs}` : ""}`;
  }

  /** Domain key for sorting (normalized host, or "" when unknown). */
  function domainOf(fn) {
    if (fn.domain) return String(fn.domain).toLowerCase().replace(/^www\./, "");
    const n = normalizeUrl(fn.url || "");
    const m = n.match(/^[a-z]+:\/\/([^/?]+)/);
    return m ? m[1] : "";
  }

  /** Title key for sorting (falls back to URL). */
  function titleOf(fn) {
    return String(fn.title || fn.url || "").trim().toLowerCase();
  }

  /**
   * Rebuild every block, remapping run footnote indices through `indexMap`
   * (Map<oldIndex, newIndex>). Mirrors the traversal in validator.js / ir-filter.js
   * (block runs, list items, table header + rows).
   */
  function remapBlocks(ir, indexMap) {
    const mapRuns = (runs) =>
      (runs || []).map((r) =>
        r.footnoteIndex && indexMap.has(r.footnoteIndex)
          ? { ...r, footnoteIndex: indexMap.get(r.footnoteIndex) }
          : r
      );
    return (ir.blocks || []).map((b) => {
      const nb = { ...b };
      if (nb.runs) nb.runs = mapRuns(nb.runs);
      if (nb.items) nb.items = nb.items.map((it) => ({ ...it, runs: mapRuns(it.runs) }));
      if (nb.type === "table") {
        if (nb.header) nb.header = nb.header.map(mapRuns);
        if (nb.rows) nb.rows = nb.rows.map((row) => (row || []).map(mapRuns));
      }
      return nb;
    });
  }

  /**
   * Renumber a (possibly reordered) footnote list to 1..N and remap all body
   * references accordingly. `ordered` holds the footnotes (with their CURRENT
   * indices) in the desired final order.
   */
  function renumberTo(ir, ordered) {
    const indexMap = new Map();
    const footnotes = ordered.map((fn, i) => {
      indexMap.set(fn.index, i + 1);
      return { ...fn, index: i + 1 };
    });
    return { ...ir, blocks: remapBlocks(ir, indexMap), footnotes };
  }

  /** Merge footnotes that share a normalized URL; remap refs and renumber 1..N. */
  function dedupe(ir) {
    if (!ir) return ir;
    const footnotes = ir.footnotes || [];
    if (footnotes.length < 2) return ir;

    const canonicalByUrl = new Map(); // normalizedUrl -> canonical index
    const indexMap = new Map();       // oldIndex -> canonical index
    const kept = [];
    for (const fn of footnotes) {
      const key = fn.url ? normalizeUrl(fn.url) : "";
      if (key && canonicalByUrl.has(key)) {
        indexMap.set(fn.index, canonicalByUrl.get(key));
      } else {
        if (key) canonicalByUrl.set(key, fn.index);
        indexMap.set(fn.index, fn.index);
        kept.push(fn);
      }
    }
    if (kept.length === footnotes.length) return ir; // nothing merged

    const merged = { ...ir, blocks: remapBlocks(ir, indexMap), footnotes: kept };
    return renumberTo(merged, kept); // canonical (gapped) indices -> 1..N
  }

  /** Reorder the sources list; `appearance` keeps the current order untouched. */
  function sortSources(ir, mode) {
    if (!ir) return ir;
    const footnotes = ir.footnotes || [];
    if (footnotes.length < 2) return ir;
    if (mode !== "alpha" && mode !== "domain") return ir;

    const sorted = footnotes.slice();
    if (mode === "alpha") {
      sorted.sort((a, b) => titleOf(a).localeCompare(titleOf(b)) || a.index - b.index);
    } else {
      sorted.sort(
        (a, b) =>
          domainOf(a).localeCompare(domainOf(b)) ||
          titleOf(a).localeCompare(titleOf(b)) ||
          a.index - b.index
      );
    }
    return renumberTo(ir, sorted);
  }

  const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/;

  /** Extract a bare ISBN-13 (978/979) or labeled ISBN-10/13 from text. */
  function extractIsbn(s) {
    const m13 = s.match(/97[89](?:[ -]?\d){10}/);
    if (m13) {
      const d = m13[0].replace(/[^\d]/g, "");
      if (d.length === 13) return d;
    }
    const labeled = s.match(/isbn[-\s:]*([\dXx][\dXx -]{8,16}[\dXx])/i);
    if (labeled) {
      const d = labeled[1].replace(/[^\dXx]/gi, "").toUpperCase();
      if (d.length === 10 || d.length === 13) return d;
    }
    return null;
  }

  /** Add fn.doi / fn.isbn where detectable from the URL + title (additive only). */
  function enrichIds(ir) {
    if (!ir) return ir;
    const footnotes = ir.footnotes || [];
    if (!footnotes.length) return ir;
    let changed = false;
    const out = footnotes.map((fn) => {
      const hay = `${fn.url || ""} ${fn.title || ""}`;
      const next = { ...fn };
      if (!next.doi) {
        const m = hay.match(DOI_RE);
        if (m) { next.doi = m[1].replace(/[).,;]+$/, ""); changed = true; }
      }
      if (!next.isbn) {
        const isbn = extractIsbn(hay);
        if (isbn) { next.isbn = isbn; changed = true; }
      }
      return next;
    });
    return changed ? { ...ir, footnotes: out } : ir;
  }

  /**
   * Apply the configured hygiene pipeline.
   * @param {object} ir
   * @param {{sourceEnrichIds?:boolean, sourceDedupe?:boolean, sourceSort?:string}} opts
   */
  function apply(ir, opts) {
    if (!ir) return ir;
    const o = opts || {};
    let out = ir;
    if (o.sourceEnrichIds !== false) out = enrichIds(out);
    if (o.sourceDedupe === true) out = dedupe(out);
    const mode = o.sourceSort || "appearance";
    if (mode === "alpha" || mode === "domain") out = sortSources(out, mode);
    return out;
  }

  GEP.sourceHygiene = { normalizeUrl, dedupe, sortSources, enrichIds, apply, domainOf };
})();
