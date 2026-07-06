/** Shared runtime globals for the extension (GEP namespace). */

interface Window {
  GEP: Record<string, any>;
}

interface GlobalThis {
  GEP: Record<string, any>;
}

declare var GEP: Record<string, any>;

declare var GEP_LINKS: {
  bugReportForm: string;
  suggestionForm: string;
  buildBugReportUrl: (info?: { version?: string; browser?: string }) => string;
  buildSuggestionUrl: (info?: { version?: string; browser?: string }) => string;
};

/** MV3 service worker API (importScripts is unavailable in DOM contexts). */
declare function importScripts(...urls: string[]): void;
