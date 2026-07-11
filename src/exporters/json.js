/**
 * JSON exporter: serializes the intermediate representation as-is.
 * Strips the live DOM reference (`root`) before serializing.
 * Includes footnotes plus a small envelope (`schemaVersion`, `generator`,
 * `exportedAt`) so downstream consumers can detect the IR shape version.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  // Keep in sync with IR_VERSION in src/lib/extractor.js.
  const SCHEMA_VERSION = 1;

  function convert(ir) {
    // `v` is re-emitted as the envelope's schemaVersion (single copy).
    const { root, v, ...data } = ir;
    const envelope = {
      schemaVersion: v || SCHEMA_VERSION,
      generator: "More Export for Gemini",
      exportedAt: new Date().toISOString(),
      ...data,
    };
    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Upgrades a parsed IR (from a .json export or a history backup) from any
   * earlier schema version to the current one. Version history:
   *   0 — implicit (pre-versioning): same shape as v1, no version field.
   *   1 — adds the version field itself; no structural change.
   * A future structural change must bump SCHEMA_VERSION here (and IR_VERSION
   * in extractor.js) and add an explicit upgrade step below, so old backups
   * and exported .json files keep loading forever.
   */
  function migrate(src) {
    if (!src || typeof src !== "object") return src;
    const ir = { ...src };
    // const from = Number(ir.v || ir.schemaVersion) || 0;
    // if (from < 2) { ...upgrade 1 -> 2... }
    ir.v = SCHEMA_VERSION;
    delete ir.schemaVersion;
    return ir;
  }

  GEP.json = { convert, migrate, SCHEMA_VERSION };
})();
