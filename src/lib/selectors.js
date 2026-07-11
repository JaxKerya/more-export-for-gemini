/**
 * Gemini DOM selectors — the single source of truth.
 *
 * Everything in the extension that touches Gemini's (undocumented) markup
 * resolves its selectors from this file. When Gemini changes its DOM, the
 * fix should be a one-file patch here, verified by the real-DOM corpus in
 * test/extractor.mjs — no hunting through extractor/menu-injector logic.
 *
 * Keep entries ordered from most specific (today's markup) to broadest
 * fallback, and leave a dated comment when a selector is added for a new
 * Gemini revision.
 */
(function () {
  "use strict";
  const GEP = (window.GEP = window.GEP || {});

  GEP.selectors = {
    // ── Report content ──────────────────────────────────────────────
    /** Content-root candidates, most specific first. */
    CONTENT_ROOTS: [
      "#extended-response-markdown-content",
      ".markdown-main-panel",
      "deep-research-immersive-panel .markdown",
      "message-content .markdown",
      ".response-container .markdown",
      "[data-test-id='message-content'] .markdown",
    ],
    /** Heuristic fallback: the largest element matching this. */
    CONTENT_HEURISTIC: '[class*="markdown"]',
    /** Report title fallback (outside the content root). */
    TITLE_FALLBACK: "deep-research-immersive-panel .title, toolbar .title, .title-text",

    // ── Source panel (footnote URL/title resolution) ────────────────
    /** Panel candidates, most specific first. */
    SOURCE_PANELS: [".source-list.used-sources", ".source-list", ".used-sources"],
    SOURCE_ITEM: "browse-web-item",
    SOURCE_LINK: "a[href]",
    SOURCE_DOMAIN: ".display-name, [data-test-id='domain-name']",
    SOURCE_TITLE: ".sub-title, [data-test-id='sub-title']",
    /** Inline footnote marker inside the report body. */
    FOOTNOTE_SUP: "sup[data-turn-source-index]",

    // ── Inline content details ───────────────────────────────────────
    /** Code-block language label (first span inside the decoration bar). */
    CODE_BLOCK_HOST: "code-block",
    CODE_BLOCK_LABEL: ".code-block-decoration",

    // ── Share/export menu (Angular Material overlay) ────────────────
    /** A freshly opened menu panel; watched by the MutationObserver. */
    MENU_CONTENT: ".mat-mdc-menu-content",
    /**
     * Identifies the export menu among all menus. Exact test ids first
     * (today's markup), then substring fallbacks so a renamed id (e.g.
     * "copy-report-button") still matches instead of silently disabling
     * injection.
     */
    EXPORT_MENU: [
      '[data-test-id="copy-button"]',
      '[data-test-id="export-to-docs-button"]',
      "copy-button",
      "export-to-docs-button",
      '[data-test-id*="copy"]',
      '[data-test-id*="export"]',
      '[data-test-id*="share"]',
    ].join(", "),
    /** Native item cloned so injected entries inherit Gemini's styling. */
    MENU_REFERENCE_ITEM: '[data-test-id="copy-button"] gem-menu-item',
    MENU_ANY_ITEM: "gem-menu-item",
    /** Clicking this closes the open overlay menu. */
    OVERLAY_BACKDROP: ".cdk-overlay-backdrop",

    // ── Non-content wrappers handled during traversal (tag names) ───
    /** Custom-element tags skipped entirely (carousel UI, not content). */
    SKIP_CUSTOM_TAGS: ["SOURCES-CAROUSEL-INLINE", "SOURCES-CAROUSEL"],
    /** Wrapper tag whose children (incl. footnotes) must be traversed. */
    RESPONSE_WRAPPER_TAG: "RESPONSE-ELEMENT",
    /** Footnote host tag containing the FOOTNOTE_SUP marker. */
    FOOTNOTE_TAG: "SOURCE-FOOTNOTE",
  };
})();
