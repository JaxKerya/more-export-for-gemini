/**
 * i18n catalog tests.
 *
 * Guards the localization layer without a browser:
 *   1. Locale parity     - every locale ships the exact same key set as en.
 *   2. Placeholder parity- $1/$2... counts match en for every key.
 *   3. HTML coverage     - every data-i18n* key referenced by options.html /
 *                          popup.html exists in the en catalog.
 *   4. JS coverage       - every t("key") / i18n.raw("key") literal in the
 *                          source exists in the en catalog.
 *   5. Manifest          - default_locale is set and every __MSG_key__
 *                          placeholder resolves.
 *   6. Key hygiene       - keys are [a-zA-Z0-9_] only (Chrome requirement)
 *                          and every message is a non-empty string.
 *   7. Markup builder    - data-i18n-html messages are built through the tag
 *                          whitelist, and every real message survives it.
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

// ── Load catalogs ──
const localesDir = path.join(root, "_locales");
const locales = fs.readdirSync(localesDir).filter((d) =>
  fs.existsSync(path.join(localesDir, d, "messages.json"))
);
check("en locale exists", locales.includes("en"));

const catalogs = {};
for (const loc of locales) {
  catalogs[loc] = readJSON(path.join("_locales", loc, "messages.json"));
}
const en = catalogs.en;
const enKeys = new Set(Object.keys(en));

// ── 1+2: parity across locales ──
function placeholderCount(msg) {
  const found = new Set();
  for (const m of msg.matchAll(/\$(\d)/g)) found.add(m[1]);
  return found.size;
}

for (const loc of locales) {
  if (loc === "en") continue;
  const keys = new Set(Object.keys(catalogs[loc]));
  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));
  check(`${loc}: no missing keys`, missing.length === 0, missing.slice(0, 10).join(", "));
  check(`${loc}: no extra keys`, extra.length === 0, extra.slice(0, 10).join(", "));
  for (const k of enKeys) {
    if (!keys.has(k)) continue;
    const a = placeholderCount(en[k].message);
    const b = placeholderCount(catalogs[loc][k].message);
    if (a !== b) check(`${loc}: placeholder parity for ${k}`, false, `en=${a} ${loc}=${b}`);
  }
}
check("placeholder parity spot check ran", true);

// ── 6: key hygiene ──
for (const loc of locales) {
  for (const [k, v] of Object.entries(catalogs[loc])) {
    if (!/^[a-zA-Z0-9_]+$/.test(k)) check(`${loc}: key charset ${k}`, false, "invalid characters");
    if (!v || typeof v.message !== "string" || v.message.length === 0) {
      check(`${loc}: message for ${k}`, false, "empty or missing message");
    }
  }
}
check("key hygiene scan ran", true);

// ── 3: HTML data-i18n* coverage ──
const htmlFiles = ["src/options/options.html", "src/popup/popup.html"];
const dataAttrs = ["data-i18n", "data-i18n-html", "data-i18n-placeholder", "data-i18n-title", "data-i18n-aria"];
for (const rel of htmlFiles) {
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  const used = new Set();
  for (const attr of dataAttrs) {
    for (const m of html.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !enKeys.has(k));
  check(`${rel}: all data-i18n keys resolve (${used.size} keys)`, missing.length === 0, missing.join(", "));
}

// ── 4: JS t()/raw() literal coverage ──
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}
const jsFiles = walk(path.join(root, "src"), []).filter(
  // i18n.js itself only mentions t("key") in doc comments.
  (f) => path.basename(f) !== "i18n.js"
);
const usedInJs = new Set();
for (const file of jsFiles) {
  const txt = fs.readFileSync(file, "utf8");
  for (const m of txt.matchAll(/\bt\(\s*"([a-zA-Z0-9_]+)"/g)) usedInJs.add(m[1]);
  for (const m of txt.matchAll(/i18n\.raw\(\s*"([a-zA-Z0-9_]+)"/g)) usedInJs.add(m[1]);
  // Key tables like labelKeys in reexport.js: values that look like catalog
  // keys (known camelCase prefix followed by an uppercase letter).
  for (const m of txt.matchAll(/:\s*"((?:fmt|opt|pop|toast|cmd|app|menu|cite)[A-Z][A-Za-z0-9_]*)"/g)) {
    usedInJs.add(m[1]);
  }
}
{
  const missing = [...usedInJs].filter((k) => !enKeys.has(k));
  check(`JS sources: all t() keys resolve (${usedInJs.size} keys)`, missing.length === 0, missing.join(", "));
}

// ── Store listings: one detailed description per shipped locale ──
// The Web Store summary localizes itself via __MSG_appDesc__, but the detailed
// description is pasted per language from store/listings/<locale>.txt.
for (const loc of locales) {
  const p = path.join(root, "store", "listings", `${loc}.txt`);
  check(`store listing exists for ${loc}`,
    fs.existsSync(p) && fs.readFileSync(p, "utf8").trim().length > 500);
}

// ── 5: manifest __MSG_ references ──
const manifest = readJSON("manifest.json");
check("manifest default_locale", manifest.default_locale === "en");
{
  const raw = fs.readFileSync(path.join(root, "manifest.json"), "utf8");
  const refs = [...raw.matchAll(/__MSG_([a-zA-Z0-9_]+)__/g)].map((m) => m[1]);
  check("manifest has __MSG_ refs", refs.length > 0);
  const missing = refs.filter((k) => !enKeys.has(k));
  check("manifest __MSG_ refs resolve", missing.length === 0, missing.join(", "));
}

// ── 7: data-i18n-html markup builder ──
// The messages are ours, but they are still built through a fixed whitelist
// rather than assigned as innerHTML, so anything outside that whitelist has to
// come out as visible text instead of an element.
{
  const { window, document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
  const sandbox = {
    window, document, console,
    chrome: {
      storage: {
        sync: { get: async (d) => ({ ...d }) },
        onChanged: { addListener() {} },
      },
      i18n: { getMessage: () => "" },
      runtime: { getURL: (p) => p },
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "src", "lib", "i18n.js"), "utf8"), sandbox, { filename: "i18n.js" });
  const { setLocalizedMarkup } = sandbox.window.GEP.i18n;

  const render = (markup) => {
    const el = document.createElement("div");
    setLocalizedMarkup(el, markup);
    return el;
  };

  check("markup: plain text has no child elements", (() => {
    const el = render("Just text");
    return el.textContent === "Just text" && el.children.length === 0;
  })());

  for (const tag of ["strong", "em", "code", "kbd"]) {
    check(`markup: <${tag}> becomes an element`, (() => {
      const el = render(`a <${tag}>b</${tag}> c`);
      const child = el.querySelector(tag);
      return !!child && child.textContent === "b" && el.textContent === "a b c";
    })());
  }

  check("markup: nested tags nest", (() => {
    const el = render("<strong>bold <em>and italic</em></strong>");
    const em = el.querySelector("strong em");
    return !!em && em.textContent === "and italic";
  })());

  check("markup: https link keeps href/target/rel", (() => {
    const el = render('<a href="https://gemini.google.com" target="_blank" rel="noopener">Gemini</a>');
    const a = el.querySelector("a");
    return !!a && a.getAttribute("href") === "https://gemini.google.com"
      && a.getAttribute("target") === "_blank" && a.getAttribute("rel") === "noopener";
  })());

  check("markup: javascript: href is dropped", (() => {
    const el = render('<a href="javascript:alert(1)">x</a>');
    const a = el.querySelector("a");
    return !!a && !a.hasAttribute("href");
  })());

  check("markup: event handler attributes are dropped", (() => {
    const el = render('<strong onclick="alert(1)">x</strong>');
    const s = el.querySelector("strong");
    return !!s && !s.hasAttribute("onclick");
  })());

  check("markup: non-whitelisted tags render as text", (() => {
    const el = render("<script>alert(1)</script>");
    return el.querySelector("script") === null
      && el.textContent === "<script>alert(1)</script>";
  })());

  check("markup: <img onerror> renders as text", (() => {
    const el = render('<img src=x onerror="alert(1)">');
    return el.querySelector("img") === null && el.textContent.includes("<img");
  })());

  check("markup: entities are decoded", (() => {
    const el = render("a &amp; b &lt;c&gt; &#65;");
    return el.textContent === "a & b <c> A";
  })());

  check("markup: stray closing tag is ignored", (() => {
    const el = render("a</strong>b");
    return el.textContent === "ab" && el.children.length === 0;
  })());

  check("markup: re-rendering replaces previous content", (() => {
    const el = document.createElement("div");
    setLocalizedMarkup(el, "<strong>first</strong>");
    setLocalizedMarkup(el, "second");
    return el.textContent === "second" && el.children.length === 0;
  })());

  // Every real message in every locale must survive the whitelist: nothing may
  // be left over as literal "<...>" text, which is how an unsupported tag
  // would surface.
  const htmlKeys = new Set();
  for (const rel of htmlFiles) {
    const html = fs.readFileSync(path.join(root, rel), "utf8");
    for (const m of html.matchAll(/data-i18n-html="([^"]+)"/g)) htmlKeys.add(m[1]);
  }
  check("markup: found data-i18n-html keys to verify", htmlKeys.size > 0);
  for (const loc of locales) {
    const offenders = [];
    for (const key of htmlKeys) {
      const msg = catalogs[loc][key] && catalogs[loc][key].message;
      if (!msg) continue;
      const el = render(msg);
      const expected = msg.replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'");
      if (el.textContent !== expected) offenders.push(key);
    }
    check(`${loc}: every data-i18n-html message renders without leftover markup`,
      offenders.length === 0, offenders.slice(0, 5).join(", "));
  }
}

// ── Summary ──
console.log(`\ni18n tests: ${passed} passed, ${failed} failed (locales: ${locales.join(", ")})`);
if (failed > 0) process.exit(1);
