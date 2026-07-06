/**
 * Markdown exporter: intermediate representation -> GitHub-flavoured Markdown.
 *
 * Supports multiple Markdown flavors: GFM (default), CommonMark, Obsidian, Notion.
 * Includes optional TOC and footnote rendering.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  function escapeText(text) {
    // Only escape characters that reliably trigger Markdown formatting.
    // Dots and hyphens are intentionally left unescaped — they only matter
    // as list/hr markers at line start, not inside running prose.
    return text.replace(/([\\`*_{}[\]#+!|~>])/g, "\\$1");
  }

  function runToMd(run, flavor, includeFootnotes) {
    if (run.image) return `![${run.image.alt}](${run.image.src})`;
    if (run.math) {
      const tex = run.math.tex || "";
      return run.math.display ? `$$${tex}$$` : `$${tex}$`;
    }
    if (run.footnoteIndex) {
      if (!includeFootnotes) return "";
      if (flavor === "commonmark" || flavor === "notion") return "";
      return `[^${run.footnoteIndex}]`;
    }
    if (run.text === "\n") return "  \n";
    let text = escapeText(run.text);
    if (run.code) {
      text = "`" + run.text + "`";
    } else {
      if (run.bold || run.italic) {
        const trailing = text.match(/(\s+)$/);
        const suffix = trailing ? trailing[1] : "";
        const core = trailing ? text.slice(0, -suffix.length) : text;
        text = core;
        if (run.bold) text = `**${text}**`;
        if (run.italic) text = `*${text}*`;
        text += suffix;
      }
    }
    if (run.href) text = `[${text}](${run.href})`;
    return text;
  }

  function runsToMd(runs, flavor, includeFootnotes) {
    return (runs || []).map((r) => runToMd(r, flavor, includeFootnotes)).join("").trim();
  }

  function cellToMd(runs, flavor, includeFootnotes) {
    return runsToMd(runs, flavor, includeFootnotes).replace(/\|/g, "\\|").replace(/\n/g, " ");
  }

  function listToMd(block, flavor, includeFootnotes) {
    const lines = [];
    const counters = {};
    block.items.forEach((item) => {
      const level = item.level || 0;
      const indent = "  ".repeat(level);
      const ordered = item.ordered ?? block.ordered;
      let marker;
      if (ordered) {
        counters[level] = (counters[level] || 0) + 1;
        marker = `${counters[level]}.`;
      } else {
        marker = "-";
      }
      Object.keys(counters).forEach((k) => {
        if (Number(k) > level) delete counters[k];
      });
      lines.push(`${indent}${marker} ${runsToMd(item.runs, flavor, includeFootnotes)}`);
    });
    return lines.join("\n");
  }

  function tableToMd(block, flavor, includeFootnotes) {
    // GFM requires a header row; for headerless tables promote the first data
    // row instead of dropping it. Pad the header to the widest row so no
    // trailing cells are discarded by renderers.
    const headerSrc = block.header || (block.rows.length ? block.rows[0] : []);
    const body = block.header ? block.rows : block.rows.slice(1);
    const colCount = Math.max(headerSrc.length, ...body.map((r) => r.length), 1);
    const headerCells = Array.from({ length: colCount }, (_, i) =>
      headerSrc[i] ? cellToMd(headerSrc[i], flavor, includeFootnotes) : ""
    );
    const lines = [
      `| ${headerCells.join(" | ")} |`,
      `| ${headerCells.map(() => "---").join(" | ")} |`,
    ];
    body.forEach((row) => {
      lines.push(`| ${row.map((c) => cellToMd(c, flavor, includeFootnotes)).join(" | ")} |`);
    });
    return lines.join("\n");
  }

  function buildTocMd(ir, flavor) {
    if (!GEP.toc) return "";
    const toc = GEP.toc.generate(ir);
    if (!toc.items.length) return "";

    const lines = ["## Table of Contents", ""];
    toc.items.forEach((item) => {
      const indent = "  ".repeat(Math.max(0, item.level - 1));
      if (flavor === "obsidian") {
        lines.push(`${indent}- [[#${item.text}]]`);
      } else {
        lines.push(`${indent}- [${item.text}](#${item.id})`);
      }
    });
    return lines.join("\n");
  }

  function buildFootnotesMd(ir, flavor, citationStyle) {
    if (!ir.footnotes || !ir.footnotes.length) return "";

    const style = citationStyle || "numbered";
    const lines = ["", "---", ""];

    if (flavor === "commonmark" || flavor === "notion") {
      lines.push("### Sources", "");
      ir.footnotes.forEach((fn) => {
        const cite = GEP.citation.format(fn, style);
        if (fn.url) {
          lines.push(`${fn.index}. [${cite.label}](${cite.url})`);
        } else {
          lines.push(`${fn.index}. ${cite.label}`);
        }
      });
    } else {
      ir.footnotes.forEach((fn) => {
        const cite = GEP.citation.format(fn, style);
        if (fn.url) {
          lines.push(`[^${fn.index}]: [${cite.label}](${cite.url})`);
        } else {
          lines.push(`[^${fn.index}]: ${cite.label}`);
        }
      });
    }

    return lines.join("\n");
  }

  function yamlScalar(text) {
    return '"' + String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  /** YAML front matter, emitted only for Obsidian flavor. */
  function buildFrontmatterMd(ir, meta) {
    const lines = ["---"];
    if (ir.title) lines.push("title: " + yamlScalar(ir.title));
    if (meta.author) lines.push("author: " + yamlScalar(meta.author));
    if (meta.affiliation) lines.push("affiliation: " + yamlScalar(meta.affiliation));
    if (meta.keywords.length) {
      lines.push("tags: [" + meta.keywords.map(yamlScalar).join(", ") + "]");
    }
    lines.push("---");
    return lines.join("\n");
  }

  /** Inline byline / abstract / keywords block placed under the title. */
  function buildMetaMd(meta) {
    const parts = [];
    const byline = GEP.docmeta ? GEP.docmeta.byline(meta) : meta.author;
    if (byline) parts.push(`*${byline}*`);
    if (meta.abstract) parts.push(`> **Abstract.** ${meta.abstract}`);
    if (meta.keywords.length) parts.push(`**Keywords:** ${meta.keywords.join(", ")}`);
    return parts.join("\n\n");
  }

  function blockquoteToMd(block, flavor, includeFootnotes) {
    const text = runsToMd(block.runs, flavor, includeFootnotes);
    if (flavor === "obsidian") {
      return text.split("\n").map((l) => `> [!NOTE]\n> ${l}`).join("\n");
    }
    return text.split("\n").map((l) => `> ${l}`).join("\n");
  }

  /**
   * @param {object} ir
   * @param {{ flavor?: string, includeToc?: boolean, includeFootnotes?: boolean }} [opts]
   */
  function convert(ir, opts) {
    const o = opts || {};
    const flavor = o.flavor || "gfm";
    const includeToc = o.includeToc !== undefined ? o.includeToc : false;
    const includeFootnotes = o.includeFootnotes !== undefined ? o.includeFootnotes : true;

    const meta = GEP.docmeta ? GEP.docmeta.normalize(o) : { has: false, keywords: [] };
    const suppressMeta = !!o.suppressMeta;

    const out = [];
    if (flavor === "obsidian" && !suppressMeta && (ir.title || meta.has)) {
      out.push(buildFrontmatterMd(ir, meta));
    }
    if (ir.title) out.push(`# ${ir.title}`);
    if (!suppressMeta && meta.has) {
      const metaBlock = buildMetaMd(meta);
      if (metaBlock) out.push(metaBlock);
    }

    if (includeToc) {
      const toc = buildTocMd(ir, flavor);
      if (toc) out.push(toc);
    }

    ir.blocks.forEach((block) => {
      switch (block.type) {
        case "heading": {
          const headingText = (block.runs || []).map((r) => r.text || "").join("").trim();
          if (ir.title && block.level === 1 && headingText === ir.title) break;
          const level = ir.title && block.level === 1 ? 2 : block.level;
          out.push(`${"#".repeat(level)} ${runsToMd(block.runs, flavor, includeFootnotes)}`);
          break;
        }
        case "paragraph":
          out.push(runsToMd(block.runs, flavor, includeFootnotes));
          break;
        case "blockquote":
          out.push(blockquoteToMd(block, flavor, includeFootnotes));
          break;
        case "code":
          out.push("```" + (block.lang || "") + "\n" + block.text + "\n```");
          break;
        case "math":
          out.push("$$\n" + (block.tex || "") + "\n$$");
          break;
        case "list":
          out.push(listToMd(block, flavor, includeFootnotes));
          break;
        case "table":
          out.push(tableToMd(block, flavor, includeFootnotes));
          break;
        case "image":
          out.push(`![${block.alt || ""}](${block.src})`);
          break;
        case "hr":
          out.push("---");
          break;
      }
    });

    if (includeFootnotes) {
      const fnBlock = buildFootnotesMd(ir, flavor, o.citationStyle);
      if (fnBlock) out.push(fnBlock);
    }

    return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  GEP.markdown = { convert };
})();
