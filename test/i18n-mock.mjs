/**
 * Shared chrome.i18n mock for the test suites: getMessage() backed by the
 * real _locales/en/messages.json, so a key that is missing from the catalog
 * surfaces in tests exactly like it would in the browser (empty string ->
 * GEP.i18n.t falls back to the raw key, which assertions then catch).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const messages = JSON.parse(
  fs.readFileSync(path.join(root, "_locales", "en", "messages.json"), "utf8")
);

/** Mirrors chrome.i18n.getMessage semantics (positional $1..$9 substitution). */
export function getMessage(key, subs) {
  const entry = messages[key];
  if (!entry || typeof entry.message !== "string") return "";
  const list = subs == null ? [] : Array.isArray(subs) ? subs : [subs];
  return entry.message.replace(/\$(\d)/g, (m, d) => {
    const idx = Number(d) - 1;
    return idx < list.length ? String(list[idx]) : m;
  });
}

export const i18nMock = { getMessage };
