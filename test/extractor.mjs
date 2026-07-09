/**
 * Extractor fixture test.
 *
 * Runs the real src/lib/extractor.js against a DOM built by linkedom from a
 * synthetic-but-faithful Gemini report fixture. This is the only test that
 * exercises the DOM-parsing half of the pipeline (every other test starts from
 * a hand-written IR), so it guards against silent extraction regressions when
 * Gemini changes its markup.
 *
 * Usage: node test/extractor.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let ok = true;
let total = 0;
let passed = 0;
const failures = [];

function check(label, cond) {
  total++;
  if (cond) {
    passed++;
  } else {
    ok = false;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 56 - name.length))}`);
}

/** Loads extractor.js into a fresh vm sandbox backed by the given DOM. */
function makeExtractor(html, url) {
  const { window, document } = parseHTML(html);
  const sandbox = {
    window,
    document,
    Node: window.Node,
    console,
    location: { href: url || "https://gemini.google.com/app/test" },
    chrome: undefined,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, "src/lib/extractor.js"), "utf8"),
    sandbox,
    { filename: "src/lib/extractor.js" }
  );
  return sandbox.window.GEP.extractor;
}

// =====================================================================
// SCENARIO 1 — Synthetic fixture (strict)
// =====================================================================

section("Fixture extraction");

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, "fixtures", "gemini-report.html"),
  "utf8"
);
const extractor = makeExtractor(fixtureHtml);
const ir = extractor.extract();

check("extract() returns an IR", ir !== null && typeof ir === "object");

if (ir) {
  // Title
  check("title resolved", ir.title === "The Ontology of Sound");

  // Block-type coverage
  const types = ir.blocks.map((b) => b.type);
  const count = (t) => types.filter((x) => x === t).length;

  check("has headings", count("heading") >= 3);
  check("has paragraphs", count("paragraph") >= 2);
  check("has a list", count("list") === 1);
  check("has a table", count("table") === 1);
  check("has a blockquote", count("blockquote") === 1);
  check("has a code block", count("code") === 1);
  check("code block detects language", ir.blocks.some((b) => b.type === "code" && b.lang === "javascript"));
  check("has an image (figure)", count("image") === 1);
  check("has display-math blocks (MathML + Gemini data-math)", count("math") === 2);

  // The IR keeps the H1 heading block verbatim; de-duplicating it against the
  // title is each exporter's responsibility, not the extractor's.
  const h1Texts = ir.blocks
    .filter((b) => b.type === "heading" && b.level === 1)
    .map((b) => (b.runs || []).map((r) => r.text).join(""));
  check("H1 heading preserved in IR (exporters de-dup it)", h1Texts.includes("The Ontology of Sound"));

  // Inline formatting in the intro paragraph
  const intro = ir.blocks.find(
    (b) => b.type === "paragraph" && (b.runs || []).some((r) => r.bold)
  );
  check("intro paragraph found", !!intro);
  if (intro) {
    check("bold run present", intro.runs.some((r) => r.bold && /physics/.test(r.text)));
    check("italic run present", intro.runs.some((r) => r.italic && /perception/.test(r.text)));
    check("code run present", intro.runs.some((r) => r.code && /signal/.test(r.text)));
    check("link run present", intro.runs.some((r) => r.href === "https://example.org/sound"));
    check("footnote ref [1] present", intro.runs.some((r) => r.footnoteIndex === 1));
  }

  // Inline math run (E = mc^2)
  const mathPara = ir.blocks.find(
    (b) => b.type === "paragraph" && (b.runs || []).some((r) => r.math)
  );
  check("inline math paragraph found", !!mathPara);
  if (mathPara) {
    const mrun = mathPara.runs.find((r) => r.math);
    check("inline math tex captured", /E = mc\^2/.test(mrun.math.tex));
    check("inline math mathml captured", /<math/.test(mrun.math.mathml));
    check("inline math is not display", mrun.math.display === false);
    check("inline math katex html captured", /class="katex"/.test(mrun.math.html || ""));
    // The raw LaTeX annotation must NOT leak into prose text.
    const proseText = mathPara.runs.map((r) => r.text).join("");
    check("annotation tex does not leak into prose", !proseText.includes("mc^2"));
    // A math run is a self-contained atom: prose around it must stay in its own
    // run, never merged into the math run (where exporters would drop it).
    check("math run carries no merged prose", mrun.text === "");
    check("prose before inline math preserved", proseText.includes("A classic relation"));
    check("prose after inline math preserved", proseText.includes("which connects energy and mass"));
  }

  // Display math block (MathML-annotated KaTeX)
  const mathBlocks = ir.blocks.filter((b) => b.type === "math");
  const mathMlBlock = mathBlocks.find((b) => /\\int_0\^1/.test(b.tex));
  check("MathML display math tex captured", !!mathMlBlock);
  if (mathMlBlock) check("MathML display math mathml captured", /<math/.test(mathMlBlock.mathml));

  // Gemini's own data-math block (no annotation/MathML, LaTeX in data-math attr)
  const gemMathBlock = mathBlocks.find((b) => /f_s \\geq 2B/.test(b.tex));
  check("Gemini data-math block tex captured", !!gemMathBlock);
  if (gemMathBlock) check("Gemini data-math block has no MathML (KaTeX-only)", !gemMathBlock.mathml);
  if (gemMathBlock) check("Gemini data-math block katex html captured", /class="katex/.test(gemMathBlock.html || ""));

  // Gemini inline data-math run (a^2 + b^2 = c^2)
  const gemInlinePara = ir.blocks.find(
    (b) => b.type === "paragraph" && (b.runs || []).some((r) => r.math && /a\^2 \+ b\^2 = c\^2/.test(r.math.tex))
  );
  check("Gemini inline data-math run captured", !!gemInlinePara);
  if (gemInlinePara) {
    const gemRun = gemInlinePara.runs.find((r) => r.math && /a\^2/.test(r.math.tex));
    check("Gemini inline data-math katex html captured", /class="katex"/.test(gemRun.math.html || ""));
    check("Gemini inline math run carries no merged prose", gemRun.text === "");
    const gemProse = gemInlinePara.runs.map((r) => r.text).join("");
    check("prose after Gemini inline math preserved", gemProse.includes("keeps the LaTeX in a data-math attribute"));
  }

  // List nesting (level 0 + level 1 items)
  const list = ir.blocks.find((b) => b.type === "list");
  if (list) {
    const levels = new Set(list.items.map((i) => i.level));
    check("list has nested levels (0 and 1)", levels.has(0) && levels.has(1));
  }

  // Table header
  const table = ir.blocks.find((b) => b.type === "table");
  if (table) {
    check("table has a header row", Array.isArray(table.header) && table.header.length === 2);
    const headerText = (table.header || []).map((c) => c.map((r) => r.text).join("")).join("|");
    check("table header text correct", headerText === "Property|Unit");
    check("table has data rows", table.rows.length === 2);
  }

  // Footnotes mapped to the source panel (index -> {url, title})
  check("3 footnotes collected", ir.footnotes.length === 3);
  const fn1 = ir.footnotes.find((f) => f.index === 1);
  check("footnote 1 has url", fn1 && fn1.url === "https://acoustics.example.com/intro");
  check("footnote 1 has title", fn1 && fn1.title === "An Introduction to Acoustics");
  const fn2 = ir.footnotes.find((f) => f.index === 2);
  check("footnote 2 maps to physics source", fn2 && /physics\.example\.org/.test(fn2.url));
  const fn3 = ir.footnotes.find((f) => f.index === 3);
  check("footnote 3 maps to nature source", fn3 && /nature\.example\.net/.test(fn3.url));
}

// =====================================================================
// SCENARIO 2 — diagnose()
// =====================================================================

section("Diagnostics");

const diag = extractor.diagnose();
check("diagnose() returns a report", diag && typeof diag === "object");
if (diag) {
  check("diagnose: content root found", diag.contentRoot && diag.contentRoot.found === true);
  check("diagnose: method is selector", diag.contentRoot.method === "selector");
  check("diagnose: blockTotal > 0", diag.blockTotal > 0);
  check("diagnose: footnotes seen = 3", diag.footnotes && diag.footnotes.seenCount === 3);
  check("diagnose: all footnotes matched", diag.footnotes && diag.footnotes.unmatched.length === 0);
  check("diagnose: math detected", diag.math && (diag.math.runCount + diag.math.blockCount) >= 2);
  check("diagnose: ok = true", diag.ok === true);
  check("diagnose: url captured", typeof diag.url === "string" && diag.url.includes("gemini"));
}

// =====================================================================
// SCENARIO 3 — Real captured DOM (optional, tolerant)
// =====================================================================

/**
 * Tolerant sanity checks against a real captured Gemini DOM. The captures are
 * raw outerHTML pastes, so only structural invariants are asserted (no exact
 * block counts): extraction succeeds, yields a title and a non-trivial block
 * list, leaks no "[object Object]" and resolves footnote URLs when present.
 */
function checkRealDom(label, content) {
  const realHtml = `<!DOCTYPE html><html><body>${content}</body></html>`;

  let realIr = null;
  try {
    realIr = makeExtractor(realHtml).extract();
  } catch (err) {
    check(`${label}: extract did not throw`, false);
    console.error("    " + String(err));
    return;
  }

  check(`${label}: extract returns IR`, realIr !== null && typeof realIr === "object");
  if (!realIr) return;
  check(`${label}: has a title`, typeof realIr.title === "string" && realIr.title.length > 0);
  check(`${label}: produced blocks`, Array.isArray(realIr.blocks) && realIr.blocks.length > 5);
  check(`${label}: no [object Object] in text`,
    realIr.blocks.every((b) =>
      !(b.runs || []).some((r) => String(r.text || "").includes("[object Object]"))
    ));
  if (realIr.footnotes.length) {
    check(`${label}: at least one footnote resolved a URL`,
      realIr.footnotes.some((f) => typeof f.url === "string" && f.url.startsWith("http")));
  }
}

const realContentPath = path.join(root, "referance", "outer-html.md");
const realSourcesPath = path.join(root, "referance", "sources outer-html.md");

if (fs.existsSync(realContentPath)) {
  section("Real captured DOM (referance/)");
  const content = fs.readFileSync(realContentPath, "utf8");
  const sources = fs.existsSync(realSourcesPath)
    ? fs.readFileSync(realSourcesPath, "utf8")
    : "";
  checkRealDom("real DOM", content + sources);
}

// =====================================================================
// SCENARIO 3b — Report corpus: every capture in referance/reports/
// =====================================================================

const reportsDir = path.join(root, "referance", "reports");

if (fs.existsSync(reportsDir)) {
  const reportFiles = fs.readdirSync(reportsDir)
    .filter((f) => f.toLowerCase().endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();
  if (reportFiles.length) {
    section(`Report corpus (referance/reports/, ${reportFiles.length} capture${reportFiles.length > 1 ? "s" : ""})`);
    for (const file of reportFiles) {
      const content = fs.readFileSync(path.join(reportsDir, file), "utf8");
      checkRealDom(file, content);
    }
  }
}

// =====================================================================
// SCENARIO 4 — Real captured DOM with code + math (testprompt)
// =====================================================================

const promptDomPath = path.join(root, "referance", "testprompt-outerhtml.md");

if (fs.existsSync(promptDomPath)) {
  section("Real DOM: code language + math (testprompt)");
  const content = fs.readFileSync(promptDomPath, "utf8");
  const realHtml = `<!DOCTYPE html><html><body>${content}</body></html>`;

  let ir2 = null;
  try {
    ir2 = makeExtractor(realHtml).extract();
  } catch (err) {
    check("testprompt DOM: extract did not throw", false);
    console.error("    " + String(err));
  }

  if (ir2) {
    const codeBlocks = ir2.blocks.filter((b) => b.type === "code");
    check("testprompt: captured code blocks", codeBlocks.length >= 3);
    const langs = new Set(codeBlocks.map((b) => b.lang).filter(Boolean));
    check("testprompt: detected python", langs.has("python"));
    check("testprompt: detected javascript", langs.has("javascript"));
    check("testprompt: detected c", langs.has("c"));

    // Math: Gemini stores LaTeX in data-math; expect both inline runs and blocks.
    const mathBlockCount = ir2.blocks.filter((b) => b.type === "math").length;
    const inlineMathCount = ir2.blocks.reduce(
      (n, b) => n + (b.runs || []).filter((r) => r.math).length, 0);
    check("testprompt: captured block math", mathBlockCount >= 1);
    check("testprompt: captured inline math", inlineMathCount >= 5);
    check("testprompt: math tex is non-empty LaTeX",
      ir2.blocks.some((b) => b.type === "math" && /[\\^_{}]/.test(b.tex || "")) ||
      ir2.blocks.some((b) => (b.runs || []).some((r) => r.math && (r.math.tex || "").length > 0)));

    // The KaTeX render must not leak garbled glyphs as the only content.
    check("testprompt: no [object Object] leak",
      ir2.blocks.every((b) =>
        !(b.runs || []).some((r) => String(r.text || "").includes("[object Object]"))));

    // Invariant: a math/image run never also carries prose text. Otherwise the
    // prose between consecutive inline formulas would be silently dropped by
    // every exporter (the reported "$x$$T_s$$f_s$" content-loss bug).
    check("testprompt: no run mixes prose with math/image",
      ir2.blocks.every((b) =>
        !(b.runs || []).some((r) => (r.math || r.image) && (r.text || "") !== "")));

    // Rendered KaTeX HTML must be captured so offline HTML/PDF/EPUB can display it.
    const anyMathHtml =
      ir2.blocks.some((b) => b.type === "math" && /class="katex/.test(b.html || "")) ||
      ir2.blocks.some((b) => (b.runs || []).some((r) => r.math && /class="katex/.test(r.math.html || "")));
    check("testprompt: captured rendered KaTeX html", anyMathHtml);
  }
}

// =====================================================================
// SUMMARY
// =====================================================================

console.log(`\n${"═".repeat(58)}`);
console.log(`  ${passed}/${total} extractor checks passed.`);
if (ok) {
  console.log("  All extractor checks passed. ✓");
} else {
  console.log(`  ${failures.length} failed:`);
  failures.forEach((f) => console.log(`   - ${f}`));
  process.exitCode = 1;
}
console.log(`${"═".repeat(58)}\n`);
