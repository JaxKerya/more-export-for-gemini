/**
 * External-tool export validator.
 *
 * Automates the manual checks in Manuel-Validate/validate-yontemleri.MD: it runs
 * each format's *reference* parser / compiler / validator against the exported files
 * and classifies every format as PASS / WARN / FAIL / SKIP. Tools used:
 *   pdflatex, pandoc, EPUBCheck, python parsers, and —
 *   KaTeX (md math, our own renderer), vnu.jar (W3C HTML5), LibreOffice headless
 *   (DOCX real open+render), and ajv + csl-data.json (CSL-JSON schema).
 *
 * Bundled resources are looked up in the target dir, Manuel-Validate/, scripts/tools/,
 * scripts/schemas/ or repo root: drop `vnu.jar` there to enable those
 * checks (each degrades to SKIP / a lighter check when its tool/resource is absent).
 *
 * Two folder layouts are auto-detected:
 *   • matrix — <fmt>/output.<ext> subfolders (e.g. Manuel-Validate): one file per format.
 *   • flat   — a single folder of many files (e.g. a debug export with every format ×
 *              citation style × markdown flavor). Every file is routed to its parser by
 *              extension, giving full combinatorial coverage, plus a per-format breakdown.
 *
 * Usage:
 *   node scripts/external-validate.mjs [targetDir] [--skip-heavy] [--only=tex,epub] [--render-out[=dir]]
 *
 *   targetDir         folder to validate (default: Manuel-Validate)
 *   --skip-heavy      skip browser/npx-based checks
 *   --only=a,b        run only the listed kinds by extension (tex, epub, md, …)
 *   --render-out[=dir]  keep the render artifacts the validators normally throw away
 *                     (pandoc → HTML, LaTeX → PDF,
 *                     LibreOffice DOCX → PDF) in `dir` for manual
 *                     inspection, mirroring each source file's relative path. Defaults
 *                     to `validate/render` when no dir is given.
 *
 * A tool that is not installed (or a missing export file) yields SKIP, not FAIL,
 * so the script is useful on partial environments. Exit code is non-zero only when
 * at least one real FAIL is found.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const require = createRequire(import.meta.url);

// Optional npm libs — present as devDependencies, but degrade to SKIP if absent.
function tryRequire(name) { try { return require(name); } catch { return null; } }
let _katex, _katexTried = false;
function getKatex() {
  if (!_katexTried) { _katexTried = true; _katex = tryRequire("katex"); }
  return _katex;
}
let _cslValidate, _cslTried = false;
function getCslValidator() {
  if (_cslTried) return _cslValidate;
  _cslTried = true;
  const Ajv = tryRequire("ajv");
  const schemaPath = path.join(__dirname, "schemas", "csl-data.json");
  if (!Ajv || !fs.existsSync(schemaPath)) { _cslValidate = null; return null; }
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    const ajv = new Ajv({ strict: false, allErrors: true });
    _cslValidate = ajv.compile(schema);
  } catch { _cslValidate = null; }
  return _cslValidate;
}

// ── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const onlyArg = argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)) : null;
const skipHeavy = flags.has("--skip-heavy");
const posArgs = argv.filter((a) => !a.startsWith("--"));
const targetDir = path.resolve(repoRoot, posArgs[0] || "Manuel-Validate");

// --render-out[=dir]: persist the render artifacts (HTML/PDF/SVG) that validators
// otherwise write to a temp dir and discard, so they can be inspected by hand.
const renderArg = argv.find((a) => a === "--render-out" || a.startsWith("--render-out="));
let RENDER_DIR = null;
if (renderArg) {
  const v = renderArg.includes("=") ? renderArg.slice("--render-out=".length) : "";
  RENDER_DIR = path.resolve(repoRoot, v || path.join("validate", "render"));
}

// ── tiny ANSI helpers ─────────────────────────────────────────────────────────
const useColor = process.stdout.isTTY;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const STATUS = {
  PASS: { sym: "PASS", color: 32 },
  WARN: { sym: "WARN", color: 33 },
  FAIL: { sym: "FAIL", color: 31 },
  SKIP: { sym: "SKIP", color: 90 },
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gep-extval-"));
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

// ── process runner ────────────────────────────────────────────────────────────
function run(cmd, args, { shell = false, timeoutMs = 120000, cwd } = {}) {
  const r = spawnSync(cmd, args, {
    shell,
    cwd,
    timeout: timeoutMs,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    code: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    out: (r.stdout || "") + (r.stderr || ""),
    timedOut: r.error && r.error.code === "ETIMEDOUT",
    spawnError: r.error && r.error.code === "ENOENT" ? r.error : (r.error && !r.error.code ? null : (r.error && r.error.code !== "ETIMEDOUT" ? r.error : null)),
  };
}

// Quote args for shell:true on Windows (.bat/.cmd/.ps1 wrappers need a shell).
const q = (s) => (/[\s"&|<>^]/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : s);

// ── tool availability (cached) ─────────────────────────────────────────────────
const toolCache = new Map();
function hasTool(cmd, probeArgs = ["--version"], { shell = false } = {}) {
  const key = cmd + "|" + probeArgs.join(" ");
  if (toolCache.has(key)) return toolCache.get(key);
  const r = run(shell ? q(cmd) : cmd, probeArgs, { shell, timeoutMs: 30000 });
  const ok = !r.spawnError && !r.timedOut;
  toolCache.set(key, ok);
  return ok;
}
const pyPkgCache = new Map();
function hasPyPkg(pkg) {
  if (!hasTool("python", ["--version"])) return false;
  if (pyPkgCache.has(pkg)) return pyPkgCache.get(pkg);
  const r = run("python", ["-c", `import ${pkg}`], { timeoutMs: 30000 });
  const ok = r.code === 0;
  pyPkgCache.set(pkg, ok);
  return ok;
}

// ── shared python dispatcher (avoids inline-quoting headaches) ──────────────────
const PY_DISPATCH = `import sys
kind, path = sys.argv[1], sys.argv[2]
if kind == 'bib':
    from pybtex.database import parse_file
    parse_file(path)
elif kind == 'ris':
    import rispy
    with open(path, encoding='utf-8') as f:
        rispy.load(f)
elif kind == 'csv':
    import csv
    list(csv.reader(open(path, newline='', encoding='utf-8')))
elif kind == 'html':
    from html.parser import HTMLParser
    HTMLParser().feed(open(path, encoding='utf-8').read())
elif kind == 'zip':
    import zipfile
    z = zipfile.ZipFile(path)
    bad = z.testzip()
    assert bad is None, 'corrupt entry: %s' % bad
else:
    sys.stderr.write('unknown kind\\n'); sys.exit(2)
print('OK')
`;
const pyFile = path.join(TMP, "_dispatch.py");
fs.writeFileSync(pyFile, PY_DISPATCH, "utf8");

function pyCheck(kind, file, pkg) {
  if (!hasTool("python", ["--version"])) return { status: "SKIP", summary: "python not found" };
  if (pkg && !hasPyPkg(pkg)) return { status: "SKIP", summary: `pip install ${pkg}` };
  const r = run("python", [pyFile, kind, file], { timeoutMs: 60000 });
  if (r.timedOut) return { status: "FAIL", summary: "timed out" };
  if (r.code === 0) {
    // docutils prints non-fatal problems to stderr without failing.
    const warnish = /\b(WARNING|ERROR|SEVERE)\b/.test(r.stderr);
    return warnish
      ? { status: "WARN", summary: "parser warnings", detail: tail(r.stderr) }
      : { status: "PASS", summary: "parsed cleanly" };
  }
  return { status: "FAIL", summary: "parser error", detail: tail(r.out) };
}

function tail(s, n = 12) {
  const lines = String(s || "").split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.slice(-n).join("\n");
}

// status constructors
function pass(summary) { return { status: "PASS", summary }; }
function warn(summary, detail) { return { status: "WARN", summary, detail: tail(detail) }; }
function fail(summary, detail) { return { status: "FAIL", summary, detail: tail(detail) }; }
function skip(summary) { return { status: "SKIP", summary }; }

function grep(text, re) {
  return String(text || "").split(/\r?\n/).filter((l) => re.test(l)).slice(0, 12).join("\n");
}

// Find a bundled resource (jar / schema) in the usual drop-off locations.
function findInDirs(names) {
  const dirs = [targetDir, path.join(repoRoot, "Manuel-Validate"), path.join(__dirname, "tools"), path.join(__dirname, "schemas"), repoRoot];
  for (const d of dirs) for (const n of names) { const p = path.join(d, n); if (fs.existsSync(p)) return p; }
  return null;
}
function findEpubcheckJar() { return findInDirs(["epubcheck.jar"]); }

// ── KaTeX math validation (md) ─────────────────────────────────────────────
// Pulls every math span out of the source and renders it with KaTeX — the same
// engine our HTML/EPUB exporters ship — so we validate OUR math, not pandoc's
// (incomplete) MathML writer, which false-warns on plain \frac in pandoc 3.x.
function extractMath(src) {
  let s = src.replace(/```[\s\S]*?```/g, " ").replace(/~~~[\s\S]*?~~~/g, " ").replace(/`[^`\n]*`/g, " ");
  const out = [];
  const push = (tex, display) => { const t = (tex || "").trim(); if (t) out.push({ tex: t, display }); };
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => { push(m, true); return " "; });   // $$…$$  (md display)
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => { push(m, true); return " "; });    // \[…\]  display
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => { push(m, false); return " "; });   // \(…\)  inline
  s = s.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_, pre, m) => { push(m, false); return pre + " "; }); // $…$ (md inline)
  return out;
}
function validateMath(file) {
  const katex = getKatex();
  if (!katex) return { available: false };
  const exprs = extractMath(fs.readFileSync(file, "utf8"));
  const bad = [];
  for (const e of exprs) {
    try { katex.renderToString(e.tex, { throwOnError: true, displayMode: e.display, strict: false }); }
    catch (err) { bad.push(`${e.tex}  →  ${String(err.message).split("\n")[0]}`); }
  }
  return { available: true, total: exprs.length, bad };
}
// pandoc 3.x emits a "Could not convert TeX math …" WARNING for valid TeX (e.g. \frac)
// it can't lower to MathML. We verify that math with KaTeX instead, so drop those chunks.
function dropPandocMathWarnings(stderr) {
  const chunks = String(stderr || "").split(/(?=\[(?:WARNING|ERROR|INFO)\])/);
  return chunks.filter((ch) => ch.trim() && !/Could not convert TeX math/.test(ch)).join("").trim();
}
function mdOrgCheck(file, from, art) {
  const m = validateMath(file);
  let pandocFailed = false, pandocOut = "", pandocLeft = "";
  if (hasTool("pandoc", ["--version"])) {
    const outHtml = art ? art("html") : path.join(TMP, "pandoc.html");
    // --standalone yields a complete, browser-openable HTML doc for inspection;
    // it doesn't affect pandoc's exit code or the TeX-math warnings we filter below.
    const r = run("pandoc", [file, "-f", from, "-t", "html", "--standalone", "-o", outHtml], { timeoutMs: 90000 });
    if (r.code !== 0) { pandocFailed = true; pandocOut = r.out; }
    else pandocLeft = dropPandocMathWarnings(r.stderr);
  }
  if (m.available && m.bad.length) return fail(`${m.bad.length}/${m.total} math invalid (KaTeX)`, m.bad.join("\n"));
  if (pandocFailed) return fail("pandoc error", pandocOut);
  if (pandocLeft) return warn("pandoc warnings (non-math)", pandocLeft);
  return pass(m.available ? `math ${m.total}/${m.total} valid (KaTeX), pandoc ok` : "pandoc parsed (katex missing → math unchecked)");
}

// ── HTML via Nu Html Checker (vnu.jar) ─────────────────────────────────────────
function htmlCheck(file) {
  const jar = findInDirs(["vnu.jar"]);
  if (jar && hasTool("java", ["-version"])) {
    const r = run("java", ["-jar", jar, "--errors-only", "--format", "gnu", file], { timeoutMs: 90000 });
    if (!r.out.trim() && (r.code === 0 || r.code == null)) return pass("W3C valid (vnu, errors-only)");
    if (/: error|: fatal/i.test(r.out)) return fail("vnu HTML errors", grep(r.out, /: (error|fatal)/i));
    return warn("vnu messages", tail(r.out));
  }
  const res = pyCheck("html", file);
  return res.status === "PASS" ? pass("well-formed (drop vnu.jar in target dir for W3C validation)") : res;
}

// ── DOCX: real open+render via LibreOffice headless ─────────────────────────
let _soffice, _sofficeTried = false;
function findSoffice() {
  if (_sofficeTried) return _soffice;
  _sofficeTried = true;
  // shell:true masks ENOENT on Windows, so require a clean exit and no "not recognized".
  const p = run(q("soffice"), ["--version"], { shell: isWin, timeoutMs: 20000 });
  if (!p.spawnError && !p.timedOut && p.code === 0 && !/not recognized|not found|No such file/i.test(p.out)) {
    _soffice = "soffice"; return _soffice;
  }
  const guesses = isWin
    ? ["C:\\Program Files\\LibreOffice\\program\\soffice.exe", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"]
    : ["/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  _soffice = guesses.find((pp) => fs.existsSync(pp)) || null;
  return _soffice;
}
function officeCheck(file, art) {
  const zipRes = pyCheck("zip", file);
  if (zipRes.status === "FAIL") return zipRes;
  const so = findSoffice();
  if (!so) return pass("zip ok (install LibreOffice to render-test)");
  const outdir = fs.mkdtempSync(path.join(TMP, "lo-"));
  const profile = "file:///" + outdir.replace(/\\/g, "/") + "/profile";
  const r = run(q(so), ["--headless", `-env:UserInstallation=${profile}`, "--convert-to", "pdf", "--outdir", q(outdir), q(file)], { shell: isWin, timeoutMs: 120000 });
  if (r.timedOut) return warn("LibreOffice render timed out; zip integrity ok");
  const pdf = fs.readdirSync(outdir).find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) return fail("LibreOffice could not open the document", r.out);
  const pdfPath = path.join(outdir, pdf);
  if (RENDER_DIR && art) fs.copyFileSync(pdfPath, art("pdf"));
  const sz = fs.statSync(pdfPath).size;
  return pass(`opens & renders (LibreOffice → PDF, ${(sz / 1024).toFixed(0)} KB)`);
}

// ── RTF: LibreOffice render if available, else a structural integrity check ─────
// RTF has no ubiquitous offline CLI validator, but it is a strict, brace-grouped
// plain-text format, so we can verify the header + group balance ourselves and
// (when LibreOffice is present) confirm a real word processor can open it.
function rtfCheck(file, art) {
  const s = fs.readFileSync(file, "latin1"); // RTF is 7-bit ASCII; non-ASCII is \uN? escaped
  if (!s.startsWith("{\\rtf1")) return fail("missing {\\rtf1 header");
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") { i++; continue; } // skip the char escaped by a backslash
    if (ch === "{") depth++;
    else if (ch === "}") { if (--depth < 0) return fail("unbalanced braces (extra '}')"); }
  }
  if (depth !== 0) return fail(`unbalanced braces (${depth} unclosed group(s))`);
  if (/[^\x00-\x7F]/.test(s)) return warn("contains raw non-ASCII bytes (should be \\uN? escaped)");

  const so = findSoffice();
  if (!so) return pass("structural ok: header + balanced groups (install LibreOffice to render-test)");
  const outdir = fs.mkdtempSync(path.join(TMP, "lo-"));
  const profile = "file:///" + outdir.replace(/\\/g, "/") + "/profile";
  const r = run(q(so), ["--headless", `-env:UserInstallation=${profile}`, "--convert-to", "pdf", "--outdir", q(outdir), q(file)], { shell: isWin, timeoutMs: 120000 });
  if (r.timedOut) return warn("LibreOffice render timed out; structure ok");
  const pdf = fs.readdirSync(outdir).find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) return fail("LibreOffice could not open the document", r.out);
  const pdfPath = path.join(outdir, pdf);
  if (RENDER_DIR && art) fs.copyFileSync(pdfPath, art("pdf"));
  const sz = fs.statSync(pdfPath).size;
  return pass(`opens & renders (LibreOffice → PDF, ${(sz / 1024).toFixed(0)} KB)`);
}

// ── CSL-JSON: validate against the official csl-data.json schema (ajv) ───────────
function cslCheck(file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { return fail("invalid JSON", String(e.message)); }
  const validate = getCslValidator();
  if (!validate) return pass("valid JSON (install ajv for CSL schema check)");
  if (validate(data)) return pass(`valid CSL-JSON (${Array.isArray(data) ? data.length : "?"} items)`);
  const errs = (validate.errors || []).slice(0, 8).map((e) => `${e.instancePath || "/"} ${e.message}`).join("\n");
  return fail("CSL-JSON schema errors", errs);
}

// ── per-format checkers, keyed by "kind" (= the file's extension family) ──────
const HEAVY = new Set([]);
const KIND = {
  bib: (f) => pyCheck("bib", f, "pybtex"),
  ris: (f) => pyCheck("ris", f, "rispy"),
  rtf: (f, art) => rtfCheck(f, art),
  tex(file, art) {
    // Prefer a Unicode engine: the export's iftex preamble pulls in fontspec
    // under LuaLaTeX/XeLaTeX, so non-Latin scripts (CJK, Arabic, Cyrillic) and
    // emoji become "missing glyph" warnings instead of fatal pdfTeX errors.
    const engine = ["lualatex", "xelatex", "pdflatex"].find((e) => hasTool(e, ["--version"]));
    if (!engine) return skip("no LaTeX engine found (lualatex/xelatex/pdflatex)");
    const job = "gepval"; // fixed jobname so concurrent files never collide on output.*
    const r = run(engine, ["-interaction=nonstopmode", "-halt-on-error", `-output-directory=${TMP}`, `-jobname=${job}`, file], { timeoutMs: 180000 });
    const logPath = path.join(TMP, job + ".log");
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : r.out;
    if (r.timedOut) return fail(`${engine} timed out`);
    const fatal = /^! |Emergency stop|Fatal error occurred|! LaTeX Error/m.test(log);
    if (fatal || r.code !== 0) return fail(`LaTeX compile error (${engine})`, grep(log, /(^! .*|.*Emergency stop.*|.*Fatal error.*|.*LaTeX Error.*)/m));
    const pdfPath = path.join(TMP, job + ".pdf");
    if (!fs.existsSync(pdfPath)) return fail("no PDF produced");
    if (RENDER_DIR) fs.copyFileSync(pdfPath, art("pdf"));
    const missing = (log.match(/Missing character: There is no/g) || []).length;
    const over = (log.match(/Overfull \\hbox/g) || []).length;
    const under = (log.match(/Underfull \\hbox/g) || []).length;
    if (missing) return warn(`PDF compiled (${engine}); ${missing} missing glyphs (font lacks those scripts)`);
    return (over || under)
      ? warn(`PDF ok (${engine}); ${over} overfull, ${under} underfull \\hbox`)
      : pass(`PDF compiled (${engine}), no layout warnings`);
  },
  md: (f, art) => mdOrgCheck(f, "markdown", art),
  json(file) {
    try { JSON.parse(fs.readFileSync(file, "utf8")); return pass("valid JSON"); }
    catch (e) { return fail("invalid JSON", String(e.message)); }
  },
  csl: (f) => cslCheck(f),
  csv: (f) => pyCheck("csv", f),
  html: (f) => htmlCheck(f),
  docx: (f, art) => officeCheck(f, art),
  epub(file) {
    const jar = findEpubcheckJar();
    if (!jar) return skip("epubcheck.jar not found (place it in the target dir or Manuel-Validate/)");
    if (!hasTool("java", ["-version"])) return skip("java not found");
    const r = run("java", ["-jar", jar, file], { timeoutMs: 120000 });
    if (/\b(FATAL|ERROR)\b/.test(r.out) || r.code !== 0) return fail("EPUBCheck reported errors", grep(r.out, /(FATAL|ERROR|WARNING)\(.+/));
    return /\bWARNING\b/.test(r.out) ? warn("EPUBCheck warnings", grep(r.out, /WARNING\(.+/)) : pass("no errors");
  },
  pdf(file, art) {
    const buf = fs.readFileSync(file);
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return fail("missing %PDF- header");
    if (!buf.subarray(-1024).toString("latin1").includes("%%EOF")) return warn("no %%EOF marker (truncated?)");
    if (RENDER_DIR && art) fs.copyFileSync(file, art("pdf"));
    return pass(`valid PDF (${(buf.length / 1024).toFixed(0)} KB)`);
  },
  txt(file) {
    const s = fs.readFileSync(file, "utf8");
    if (!s.trim()) return warn("file is empty");
    if (s.includes("\uFFFD")) return warn("contains U+FFFD replacement chars (encoding?)");
    return pass(`readable UTF-8 (${s.length} chars)`);
  },
};

const KIND_LABEL = {
  bib: "BibTeX", ris: "RIS", rtf: "RTF", tex: "LaTeX", json: "JSON", csl: "CSL-JSON",
  csv: "CSV", html: "HTML", docx: "DOCX", md: "Markdown", epub: "EPUB",
  pdf: "PDF", txt: "Text",
};

// Resolve a file path to a checker kind. Returns null for artifacts to ignore.
function kindOf(file) {
  const base = path.basename(file).toLowerCase();
  const ext = path.extname(base).replace(/^\./, "");
  if (ext === "json" && /csl-?json|csl-data/.test(base)) return "csl"; // CSL-JSON vs plain JSON
  if (KIND[ext]) return ext;
  return null; // .aux .log .out .toc .svg .synctex(busy) … → skip silently
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "lib" || entry.name === "licenses" || entry.name.endsWith("_files")) continue;
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

// Matrix layout: one canonical file per format in <fmt>/output.<ext> subfolders.
const MATRIX = [
  ["bib", "bib/output.bib"], ["ris", "ris/output.ris"], ["rtf", "rtf/output.rtf"],
  ["tex", "tex/output.tex"], ["json", "json/output.json"], ["csl", "csljson/output.json"],
  ["csv", "csv/output.csv"],
  ["md", "md/output.md"], ["html", "html/output.html"], ["epub", "epub/output.epub"],
  ["docx", "docx/output.docx"], ["pdf", "tex/output.pdf"],
  ["txt", "txt/output.txt"],
];

function isMatrixLayout() {
  return MATRIX.some(([, rel]) => fs.existsSync(path.join(targetDir, rel)));
}

// Build the work list (each item: { kind, label, file }).
function buildWorkItems() {
  if (isMatrixLayout()) {
    return MATRIX.map(([kind, rel]) => {
      const file = fs.existsSync(path.join(targetDir, rel)) ? path.join(targetDir, rel) : null;
      return { kind, label: `${KIND_LABEL[kind]} (${path.basename(rel)})`, file };
    });
  }
  // Flat/debug layout: discover every file and route by extension.
  const items = [];
  for (const file of walk(targetDir)) {
    const kind = kindOf(file);
    if (!kind) continue;
    items.push({ kind, label: path.relative(targetDir, file), file });
  }
  items.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
  return items;
}

// ── main ────────────────────────────────────────────────────────────────────
if (!fs.existsSync(targetDir)) {
  console.error(`Target directory not found: ${targetDir}`);
  process.exit(2);
}

const matrixMode = isMatrixLayout();
let workItems = buildWorkItems();
if (only) workItems = workItems.filter((w) => only.has(w.kind));

// Returns a destination path for a render artifact of the given extension. When
// --render-out is set, the path is persistent and mirrors the source file's
// relative location (so same-kind files never collide); otherwise it points into
// the ephemeral TMP dir (cleaned up on exit, preserving the old throw-away behavior).
function artFor(w) {
  return (ext) => {
    if (!RENDER_DIR || !w.file) return path.join(TMP, `${w.kind}-art.${ext}`);
    const rel = path.relative(targetDir, w.file).replace(/\.[^.]+$/, "");
    const dest = path.join(RENDER_DIR, `${rel}.${ext}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    return dest;
  };
}

console.log(`\nExternal validation of: ${targetDir}`);
console.log(`Layout: ${matrixMode ? "matrix (one file per format)" : "flat (every file — e.g. debug export, all formats × styles × flavors)"}`);
console.log(`Files to check: ${workItems.length}${skipHeavy ? "  (--skip-heavy)" : ""}`);
if (RENDER_DIR) console.log(`Render artifacts → ${RENDER_DIR}`);
console.log("─".repeat(72));

const results = [];
for (const w of workItems) {
  let res;
  if (skipHeavy && HEAVY.has(w.kind)) res = skip("skipped (--skip-heavy)");
  else if (!w.file) res = skip("no export file present");
  else {
    process.stdout.write(`  …${w.label}\r`);
    try { res = KIND[w.kind](w.file, artFor(w)); } catch (e) { res = fail("validator threw", String((e && e.stack) || e)); }
  }
  const row = { ...w, ...res };
  results.push(row);
  printRow(w.label, row);
}

function printRow(label, row) {
  const st = STATUS[row.status] || STATUS.SKIP;
  const badge = c(st.color, st.sym.padEnd(4));
  process.stdout.write("\x1b[2K");
  console.log(`  ${badge}  ${String(label).padEnd(matrixMode ? 26 : 38)} ${c(90, row.summary || "")}`);
}

// detail for WARN/FAIL
const noteworthy = results.filter((r) => (r.status === "FAIL" || r.status === "WARN") && r.detail);
if (noteworthy.length) {
  console.log("\n" + "─".repeat(72));
  console.log("Details:");
  for (const r of noteworthy) {
    console.log(`\n${c(STATUS[r.status].color, r.status)}  ${r.label}`);
    console.log(r.detail.split("\n").map((l) => "    " + l).join("\n"));
  }
}

// per-kind breakdown (most useful for the combinatorial debug layout)
if (!matrixMode) {
  console.log("\n" + "─".repeat(72));
  console.log("Per-format breakdown:");
  const byKind = {};
  for (const r of results) {
    const k = (byKind[r.kind] = byKind[r.kind] || { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 });
    k[r.status]++;
  }
  for (const kind of Object.keys(byKind).sort()) {
    const k = byKind[kind];
    const parts = [];
    if (k.PASS) parts.push(c(32, `${k.PASS} PASS`));
    if (k.WARN) parts.push(c(33, `${k.WARN} WARN`));
    if (k.FAIL) parts.push(c(31, `${k.FAIL} FAIL`));
    if (k.SKIP) parts.push(c(90, `${k.SKIP} SKIP`));
    console.log(`  ${(KIND_LABEL[kind] || kind).padEnd(18)} ${parts.join("  ")}`);
  }
}

// summary
const counts = results.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
console.log("\n" + "═".repeat(72));
console.log(
  `  ${c(32, (counts.PASS || 0) + " PASS")}   ` +
  `${c(33, (counts.WARN || 0) + " WARN")}   ` +
  `${c(31, (counts.FAIL || 0) + " FAIL")}   ` +
  `${c(90, (counts.SKIP || 0) + " SKIP")}   (of ${results.length})`
);
console.log("═".repeat(72));
if (RENDER_DIR) {
  const kept = fs.existsSync(RENDER_DIR) ? walk(RENDER_DIR).length : 0;
  console.log(`  ${kept} render artifact(s) saved to ${RENDER_DIR}`);
}
console.log("");

process.exit((counts.FAIL || 0) > 0 ? 1 : 0);
