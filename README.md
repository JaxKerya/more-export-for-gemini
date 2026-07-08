# More Export for Gemini

A Chrome (Manifest V3) extension that adds 15+ export formats to the Google Gemini **Deep Research** share menu — Markdown, PDF, Word (.docx), Reader HTML, EPUB, LaTeX, RTF, HTML, plain text, JSON, CSV, BibTeX, RIS, CSL-JSON and a multi-file Vault ZIP — with citations (9 styles), page/typography controls, document metadata, source hygiene and offline re-export. Everything runs locally in the browser; no data ever leaves it (see [PRIVACY.md](PRIVACY.md)).

A Turkish architectural overview lives in [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md); user-facing release notes in [CHANGELOG.md](CHANGELOG.md).

## Install (unpacked, for development)

1. Clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the repository root (the folder containing `manifest.json`).
4. Open a Gemini Deep Research report — the new entries appear in the share menu and the right-click menu.

## Development setup

Node.js 20+ is required for the test/lint toolchain (the extension itself has zero runtime dependencies).

```bash
npm install
```

| Command                    | What it does                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| `npm test`                 | Full suite: edge cases, validation + manifest integrity, extractor (linkedom), menu injector, background worker, content script. |
| `npm run test:edge`        | Unit/integration checks on the exporters (IR → output).             |
| `npm run test:validate`    | High-level output validation + manifest integrity.                  |
| `npm run test:extractor`   | Real extractor against a synthetic Gemini DOM fixture.              |
| `npm run test:menu`        | Menu-injection tests (detection, filtering, caps).                  |
| `npm run test:background`  | Service-worker tests with a mocked `chrome` API.                    |
| `npm run test:content`     | Content-script message-handler smoke tests (PING/EXPORT/QUALITY).   |
| `npm run lint`             | ESLint over `src/`, `test/`, `scripts/`.                            |
| `npm run typecheck`        | TypeScript `checkJs` static analysis (no emit).                     |

CI (GitHub Actions) runs lint, typecheck and the full test suite on every push and pull request.

## Build a store package

```bash
npm run build
```

Produces `store/more-export-for-gemini-v<version>.zip` (works on any OS — plain Node, no dependencies). The file list is derived from `manifest.json` (content scripts + `web_accessible_resources` + popup/options pages), so it cannot drift from what the extension actually loads.

## Releases

Pushing a version tag builds and publishes a GitHub Release automatically:

```bash
git tag v2.2.0 && git push origin v2.2.0
```

The `Release` workflow runs lint + typecheck + the full test suite, builds the store zip and attaches it to the release. Before tagging, bump `version` (and `version_name`) in `manifest.json` and `version` in `package.json`, and add a `CHANGELOG.md` entry.

### Versioning & the Beta label

`manifest.json` currently ships `version_name: "2.1.0 Beta"` on purpose: the extension depends on Gemini's (undocumented) DOM, so the first store release is labelled Beta while real-world usage is observed. Exit criteria: after the first Chrome Web Store release, monitor bug reports for **2–3 weeks**; if no critical extraction/export bugs surface, drop the ` Beta` suffix in **2.2.0** (remove `version_name` entirely — Chrome then displays `version`). The UI reads the version exclusively via `chrome.runtime.getManifest()`, so no source changes are needed beyond the manifest.

## Architecture in one paragraph

A small content-script core (8 files) watches the Gemini page and injects export entries into the share menu; the heavy conversion stack (KaTeX/highlight.js vendors + 16 exporters) is lazy-loaded via dynamic `import()` on the first export. Extraction produces a format-agnostic intermediate representation (IR: title, blocks, footnotes, lang/dir), which every exporter consumes independently — adding a format never touches the DOM-scraping code. All modules attach to a shared `window.GEP` namespace and are dependency-free (ZIP, DOCX/OOXML, EPUB and LaTeX-math conversion are implemented from scratch).

## Repository layout

```
manifest.json         MV3 manifest (static core + lazy web_accessible_resources)
src/content.js        Orchestrator: menu watching, extraction, export routing
src/background.js     Service worker: context menu, shortcuts, first-run page
src/lib/              Extractor, settings, citations, TOC, math, validators…
src/exporters/        16 IR → format converters (zero dependencies)
src/vendor/           Generated KaTeX / highlight.js single-file bundles
src/popup/            Toolbar popup
src/options/          Settings page (ES module entry + per-card modules/)
test/                 Node-based test suites (vm + linkedom, no browser needed)
scripts/              build.mjs (store package), vendor build, external validation
```
