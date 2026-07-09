/**
 * Build script (#18): creates a clean, compressed .zip package for Chrome
 * Web Store upload. Platform-independent (Node only, no dependencies) so it
 * runs identically on Windows, macOS, Linux and in CI.
 *
 * Usage: node scripts/build.mjs   (or: npm run build)
 * Output: store/more-export-for-gemini-v<version>.zip
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = manifest.version;
const outName = `more-export-for-gemini-v${version}.zip`;
const outPath = join(root, "store", outName);

// ── Packaged file list ──
// Derived straight from manifest.json so it can never drift out of sync with
// the actual content scripts / background worker / lazy-loaded resources.
const cs = manifest.content_scripts[0];
const include = [
  "manifest.json",
  // Locale catalogs (i18n): one messages.json per supported language.
  ...readdirSync(join(root, "_locales")).map((lang) => `_locales/${lang}/messages.json`),
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  manifest.background.service_worker,
  ...cs.js,
  ...cs.css,
  // Lazy-loaded exporter stack: fetched at runtime via import(), so it lives
  // in web_accessible_resources instead of content_scripts.
  ...manifest.web_accessible_resources.flatMap((war) => war.resources),
  // Shared by the popup and options pages via <script>, but NOT a content
  // script — so it isn't covered by cs.js and must be listed explicitly.
  "src/lib/links.js",
  "src/popup/popup.html",
  "src/popup/popup.css",
  "src/popup/popup.js",
  "src/options/options.html",
  "src/options/options.css",
  "src/options/options.js",
  // Options page ES modules (#17), imported by options.js at runtime.
  ...readdirSync(join(root, "src/options/modules"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => `src/options/modules/${f}`),
];

const files = [...new Set(include)].sort();

// ── Minimal ZIP writer (deflate) ──
// The runtime zip exporter (src/exporters/zip.js) intentionally uses STORE;
// for the store package we want real compression, so this uses zlib.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function buildZip(entries) {
  const now = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    // Fall back to STORE when deflate doesn't help (e.g. PNG icons).
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);            // extra length
    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0x0800, 8);      // UTF-8 names
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    // extra/comment/disk/attrs all zero
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

// ── Build ──
const entries = files.map((file) => ({
  name: file.replace(/\\/g, "/"),
  data: readFileSync(join(root, file)),
}));

mkdirSync(join(root, "store"), { recursive: true });
const zip = buildZip(entries);
writeFileSync(outPath, zip);

const sizeKb = Math.round((zip.length / 1024) * 10) / 10;
console.log("");
console.log(`  Package built: store/${outName} (${sizeKb} KB)`);
console.log(`  Files included: ${files.length}`);
console.log("");
