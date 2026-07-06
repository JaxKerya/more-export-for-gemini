/**
 * JSON exporter: serializes the intermediate representation as-is.
 * Strips the live DOM reference (`root`) before serializing.
 * Includes footnotes plus a small envelope (`schemaVersion`, `generator`,
 * `exportedAt`) so downstream consumers can detect the IR shape version.
 */
(function () {
  const GEP = (window.GEP = window.GEP || {});

  const SCHEMA_VERSION = 1;

  function convert(ir) {
    const { root, ...data } = ir;
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      generator: "More Export for Gemini",
      exportedAt: new Date().toISOString(),
      ...data,
    };
    return JSON.stringify(envelope, null, 2);
  }

  GEP.json = { convert, SCHEMA_VERSION };
})();
