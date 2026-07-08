/**
 * Export history (#13) and profile (#12) tests.
 *
 * Loads the real src/lib/history.js + src/lib/settings.js into a vm sandbox
 * with an in-memory chrome.storage mock and a deterministic clock. Guards the
 * LRU/dedupe/size-cap behaviour of the automatic IR backup and the snapshot
 * validation shared by settings import, profiles and the popup switcher.
 *
 * Usage: node test/history.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let ok = true;
let total = 0;
let passed = 0;

function check(label, cond) {
  total++;
  if (cond) {
    passed++;
  } else {
    ok = false;
    console.error(`  ✗ ${label}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 56 - name.length))}`);
}

/** Fresh sandbox with in-memory chrome.storage and a monotonic clock. */
function makeSandbox() {
  const local = {};
  const sync = {};
  let clock = 1_700_000_000_000;

  const storageArea = (store) => ({
    get: async (key) => {
      if (typeof key === "string") return { [key]: store[key] };
      const out = {};
      for (const k of Object.keys(key || {})) {
        out[k] = store[k] !== undefined ? store[k] : key[k];
      }
      return out;
    },
    set: async (obj) => { Object.assign(store, obj); },
  });

  const sandbox = {
    chrome: { storage: { local: storageArea(local), sync: storageArea(sync) } },
    console,
    setTimeout,
    clearTimeout,
    // Deterministic, strictly increasing clock so LRU ordering never ties.
    Date: { now: () => ++clock },
  };
  vm.createContext(sandbox);
  for (const rel of ["src/lib/settings.js", "src/lib/history.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
  }
  return { sandbox, local, sync, GEP: sandbox.GEP };
}

const makeIR = (title, blocks = 3, extra = {}) => ({
  title,
  url: `https://gemini.google.com/app/${title.replace(/\s+/g, "-")}`,
  blocks: Array.from({ length: blocks }, (_, i) => ({
    type: "paragraph",
    runs: [{ text: `${title} paragraph ${i}` }],
  })),
  footnotes: [{ url: "https://example.com", title: "Src" }],
  ...extra,
});

// =====================================================================
section("History: add, dedupe, metadata");

{
  const { GEP } = makeSandbox();
  const H = GEP.history;

  const r1 = await H.add(makeIR("Report One"), { format: "markdown" });
  check("add returns ok", r1.ok === true && typeof r1.id === "string");
  check("count is 1", r1.count === 1);

  let items = await H.list();
  check("list has one entry", items.length === 1);
  check("list strips the IR", !("ir" in items[0]));
  check("metadata captured", items[0].title === "Report One" && items[0].blocks === 3 && items[0].sources === 1);
  check("format recorded", items[0].formats.length === 1 && items[0].formats[0] === "markdown");
  check("bytes recorded", items[0].bytes > 0);

  // Same report, different format → LRU bump, not a duplicate.
  const r2 = await H.add(makeIR("Report One"), { format: "pdf" });
  check("re-export dedupes", r2.ok === true && r2.count === 1);
  items = await H.list();
  check("still one entry", items.length === 1);
  check("both formats recorded", items[0].formats.join(",") === "markdown,pdf");

  const entry = await H.get(items[0].id);
  check("get returns full entry", !!entry && Array.isArray(entry.ir.blocks));
  check("get(null-id) returns null", (await H.get("nope")) === null);

  check("empty IR rejected", (await H.add({ title: "x", blocks: [] })).reason === "empty");
  check("null IR rejected", (await H.add(null)).ok === false);
}

// =====================================================================
section("History: LRU eviction and caps");

{
  const { GEP } = makeSandbox();
  const H = GEP.history;

  for (let i = 1; i <= 12; i++) await H.add(makeIR(`Doc ${i}`));
  const items = await H.list();
  check("capped at MAX_ENTRIES", items.length === H.MAX_ENTRIES);
  check("newest first", items[0].title === "Doc 12");
  const titles = items.map((e) => e.title);
  check("oldest two evicted", !titles.includes("Doc 1") && !titles.includes("Doc 2"));
  check("third survives", titles.includes("Doc 3"));

  // Re-exporting an old entry bumps it to the front before new adds evict it.
  await H.add(makeIR("Doc 3"), { format: "docx" });
  await H.add(makeIR("Doc 13"));
  const bumped = await H.list();
  check("bumped entry survives new adds", bumped.some((e) => e.title === "Doc 3"));
  check("un-bumped oldest evicted instead", !bumped.some((e) => e.title === "Doc 4"));
}

{
  const { GEP } = makeSandbox();
  const H = GEP.history;

  const big = "x".repeat(H.MAX_ENTRY_BYTES);
  const r = await H.add(makeIR("Huge", 1, { blocks: [{ type: "paragraph", runs: [{ text: big }] }] }));
  check("oversized entry rejected", r.ok === false && r.reason === "too-large");

  // ~1.9 MB each: the 5th entry would push the total past MAX_TOTAL_BYTES.
  const chunk = "y".repeat(1_900_000);
  for (let i = 1; i <= 5; i++) {
    await H.add(makeIR(`Big ${i}`, 1, { blocks: [{ type: "paragraph", runs: [{ text: chunk }] }] }));
  }
  const items = await H.list();
  const totalBytes = items.reduce((s, e) => s + e.bytes, 0);
  check("total byte cap enforced", totalBytes <= H.MAX_TOTAL_BYTES);
  check("newest kept under byte pressure", items[0].title === "Big 5");
  check("byte cap evicted some entries", items.length < 5);
}

// =====================================================================
section("History: remove / clear");

{
  const { GEP } = makeSandbox();
  const H = GEP.history;

  await H.add(makeIR("A"));
  await H.add(makeIR("B"));
  const items = await H.list();
  check("remove returns true on hit", (await H.remove(items[0].id)) === true);
  check("remove returns false on miss", (await H.remove("nope")) === false);
  check("one entry left", (await H.list()).length === 1);

  await H.clear();
  check("clear empties history", (await H.list()).length === 0);
}

// =====================================================================
section("Profiles: snapshot sanitization");

{
  const { GEP } = makeSandbox();
  const S = GEP.settings;

  const snap = S.sanitizeSnapshot({
    formats: { markdown: false, pdf: true, bogus: true, txt: "yes" },
    options: {
      citation_style: "apa",
      markdown_flavor: "not-a-flavor",
      include_toc: true,
      meta_author: "Jane",
      unknown_key: "drop me",
    },
    overrides: { markdown: { include_toc: false, nonsense: 1 }, bogusfmt: { include_toc: true } },
  });
  check("valid format kept", snap.formats.pdf === true && snap.formats.markdown === false);
  check("unknown format dropped", !("bogus" in snap.formats));
  check("non-boolean format falls back to default", snap.formats.txt === S.DEFAULTS.txt);
  check("valid enum kept", snap.options.citation_style === "apa");
  check("invalid enum falls back", snap.options.markdown_flavor === S.OPTION_DEFAULTS.markdown_flavor);
  check("boolean option kept", snap.options.include_toc === true);
  check("free-text option kept", snap.options.meta_author === "Jane");
  check("unknown option dropped", !("unknown_key" in snap.options));
  check("override sanitized", snap.overrides.markdown.include_toc === false && !("nonsense" in snap.overrides.markdown));
  check("override for unknown format dropped", !("bogusfmt" in snap.overrides));

  const allOff = S.sanitizeSnapshot({ formats: Object.fromEntries(Object.keys(S.DEFAULTS).map((k) => [k, false])) });
  check("all-off snapshot keeps markdown on", allOff.formats.markdown === true);

  const junk = S.sanitizeSnapshot("garbage");
  check("junk snapshot yields defaults", junk.formats.markdown === S.DEFAULTS.markdown &&
    junk.options.citation_style === S.OPTION_DEFAULTS.citation_style);
}

// =====================================================================
section("Profiles: map sanitization + storage round-trip");

{
  const { GEP } = makeSandbox();
  const S = GEP.settings;

  const raw = {};
  for (let i = 1; i <= 8; i++) raw[`Profile ${i}`] = { options: { citation_style: "mla" }, savedAt: i };
  raw[""] = { savedAt: 99 };
  raw["x".repeat(S.MAX_PROFILE_NAME + 1)] = { savedAt: 99 };
  raw["Not an object"] = "nope";

  const clean = S.sanitizeProfiles(raw);
  const names = Object.keys(clean);
  check("capped at MAX_PROFILES", names.length === S.MAX_PROFILES);
  check("newest profiles kept", names.includes("Profile 8") && !names.includes("Profile 1"));
  check("empty / overlong / junk names dropped",
    !names.includes("") && !names.some((n) => n.length > S.MAX_PROFILE_NAME) && !names.includes("Not an object"));
  check("snapshot inside profile sanitized", clean["Profile 8"].options.citation_style === "mla");
  check("savedAt preserved", clean["Profile 8"].savedAt === 8);

  await S.saveProfiles({ Academic: { options: { citation_style: "apa" }, savedAt: 5 } });
  const loaded = await S.loadProfiles();
  check("save/load round-trip", loaded.Academic && loaded.Academic.options.citation_style === "apa");

  check("junk profiles map yields empty object", Object.keys(S.sanitizeProfiles(null)).length === 0);
}

// =====================================================================
console.log(`\n  ${passed}/${total} history/profile checks passed.`);
if (!ok) {
  console.error("  Some history/profile checks FAILED. ✗");
  process.exit(1);
}
console.log("  All history/profile checks passed. ✓");
