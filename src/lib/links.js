/**
 * Central place for outbound links shared by the popup and the options page.
 *
 * Feedback goes to Tally forms (https://tally.so). To wire one up:
 *   1. Create a form in Tally with a free-text field for the message.
 *   2. Add two hidden fields and, in each field's "Pre-fill" settings, set the
 *      parameter name to exactly:
 *        version   browser
 *      Tally then accepts ?version=…&browser=… and pre-fills them.
 *   3. Copy the form's share URL and paste its id below (the part after /r/).
 *
 * Note: we intentionally do NOT auto-send the page URL. The active Gemini URL
 * is a private per-account link we can't open, so for bug reports we instead
 * ask the user to paste a public "Share" link (https://share.gemini.google/…)
 * into a visible, optional field on the form itself.
 *
 * Until a real form id is set the button still opens Tally's site, so it never
 * dead-ends — but replace any placeholder before publishing.
 */
(function () {
  const g = typeof window !== "undefined" ? window : globalThis;

  const BUG_REPORT_FORM = "https://tally.so/r/ODg15K";
  const SUGGESTION_FORM = "https://tally.so/r/44qE5b";

  /**
   * Appends environment info as query params so Tally can pre-fill the matching
   * hidden fields (parameter names must equal the keys: version/browser).
   * @param {string} base form URL
   * @param {{version?:string, browser?:string}} info
   */
  function withEnv(base, info) {
    info = info || {};
    const params = new URLSearchParams();
    if (info.version) params.set("version", info.version);
    if (info.browser) params.set("browser", info.browser);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  g.GEP_LINKS = {
    bugReportForm: BUG_REPORT_FORM,
    suggestionForm: SUGGESTION_FORM,

    /** Bug-report URL, pre-filled with environment info. */
    buildBugReportUrl(info) {
      return withEnv(BUG_REPORT_FORM, info);
    },

    /** Feature-suggestion URL, pre-filled with environment info. */
    buildSuggestionUrl(info) {
      return withEnv(SUGGESTION_FORM, info);
    },
  };
})();
