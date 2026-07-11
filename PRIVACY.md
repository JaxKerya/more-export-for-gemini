# Privacy Policy — More Export for Gemini

**Last updated:** July 10, 2026

## Overview

"More Export for Gemini" is a browser extension that adds extra export formats to the Google Gemini Deep Research share menu: Markdown, Plain Text, HTML, HTML – Reader, JSON, LaTeX, CSV, BibTeX, RIS, CSL-JSON, RTF, Word (.docx), PDF, EPUB and a multi-file Vault ZIP bundle, plus clipboard copies (Markdown, Plain Text, rich HTML, JSON). All conversion runs entirely in your browser with no external servers.

## Data Collection

This extension does **not** collect, store, transmit, or share any personal data or browsing information.

## What the Extension Accesses

- **Page content on `gemini.google.com` only:** The extension reads the Deep Research report content visible on the page solely to convert it into the export format you select. This content never leaves your browser.
- **No analytics, no tracking, no cookies.**
- **No automatic network requests:** All export processing is performed locally. The extension never sends your report content, settings, or browsing data to any server, API, or third party.

## Permissions Explained

| Permission      | Why it's needed                                                              |
| --------------- | ---------------------------------------------------------------------------- |
| `activeTab`     | Access the current Gemini tab to read visible report content on click.       |
| `contextMenus`  | Add a right-click "More Export for Gemini" menu on Gemini pages.             |
| `storage`       | Save your export preferences (formats, citation style, options) locally and sync them across your browser profile. No browsing data is stored. |
| Host access to `gemini.google.com` | Run the export menu on Gemini pages and let the popup and keyboard shortcuts find the open Gemini tab. The extension cannot see any other site or your browsing history. |

## Data Retention

No data is retained by the extension. Exported files are saved to your local device through the browser's download mechanism.

## Third-Party Services

The extension performs no background communication with third parties. There are exactly two, fully user-initiated exceptions:

- **Feedback forms (Tally):** the optional "Report a bug" and "Suggest a feature" buttons in the popup and Settings page open an external form hosted on [tally.so](https://tally.so) **in a new tab, only when you click them**. To save you typing, the link pre-fills the extension version, your browser's user-agent string and (from the popup) the address of the active Gemini tab as URL parameters. Nothing is sent unless you open the form and submit it yourself; anything you enter there is governed by Tally's own privacy policy.
- **Donation page (Gumroad):** the optional "Support" buttons in the popup and Settings page open the project's donation page hosted on [gumroad.com](https://gumroad.com) **in a new tab, only when you click them**. The link carries no parameters — no version, browser or page information is attached. Any purchase you make there is handled entirely by Gumroad and governed by Gumroad's own privacy policy.

No other third-party service is contacted, embedded, or integrated.

## Changes to This Policy

If this policy changes, the update will be reflected here with a new "Last updated" date.

## Contact

If you have questions about this privacy policy, please open an issue on the extension's GitHub repository.
