# More Export for Gemini

A browser (Manifest V3) extension for **Chrome, Edge and Firefox** that adds 15+ export formats to the Google Gemini **Deep Research** share menu — Markdown, PDF, Word (.docx), Excel (.xlsx), Reader HTML, EPUB, LaTeX, RTF, HTML, plain text, JSON, CSV, BibTeX, RIS, CSL-JSON and a multi-file Vault ZIP — with citations (9 styles), page/typography controls, document metadata, source hygiene and offline re-export. Everything runs locally in the browser; no data ever leaves it (see [PRIVACY.md](PRIVACY.md)).

A Turkish architectural overview lives in [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md), a Turkish developer guide (commands, scripts, CI/release automation) in [REHBER.md](REHBER.md); user-facing release notes in [CHANGELOG.md](CHANGELOG.md).

The extension is free and open source. If it saves you time, you can [support it with a coffee](https://jaxkerya.gumroad.com/coffee) — voluntary donations fund new formats, more languages and quick fixes whenever Gemini changes its interface.

## Install (unpacked, for development)

**Chrome / Edge**

1. Clone this repository.
2. Open `chrome://extensions` (Edge: `edge://extensions`), enable **Developer mode**.
3. Click **Load unpacked** and select the repository root (the folder containing `manifest.json`).
4. Open a Gemini Deep Research report — the new entries appear in the share menu and the right-click menu.

**Firefox** (140+)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.
3. Temporary add-ons are removed when Firefox closes; reload after a restart.

One manifest serves all three browsers: Chrome/Edge run `background.service_worker`, Firefox (no MV3 service workers) runs the same code as an event page via `background.scripts`, and each side ignores the other's key.

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
| `npm run test:options`     | Options page against the real HTML (toggles, profiles, history, sync). |
| `npm run test:e2e`         | Real-browser smoke test (Playwright Chromium): extension load, content-script injection on a faked gemini.google.com, one real export, Options/popup render. Needs `npx playwright install chromium` once. |
| `npm run lint`             | ESLint over `src/`, `test/`, `scripts/`.                            |
| `npm run lint:amo`         | Builds the package and runs Mozilla's `addons-linter` on it — the exact validation addons.mozilla.org applies on upload. |
| `npm run typecheck`        | TypeScript `checkJs` static analysis (no emit).                     |

CI (GitHub Actions) runs lint, typecheck, the full test suite and the AMO linter on every push and pull request, plus the e2e smoke test as a separate job.

## Build a store package

```bash
npm run build
```

Produces `store/more-export-for-gemini-v<version>.zip` (works on any OS — plain Node, no dependencies). The file list is derived from `manifest.json` (content scripts + background scripts + `web_accessible_resources` + popup/options pages), so it cannot drift from what the extension actually loads. **The same zip is uploaded to all three stores** — Chrome Web Store, addons.mozilla.org (AMO) and Edge Add-ons; per-store steps live in [store/listings/README.md](store/listings/README.md).

## Releases

The full release flow (bump, notes, manual smoke test, tagging) is documented in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). The short version:

```bash
npm run bump -- 2.2.0     # updates manifest.json, package.json, package-lock.json
# update CHANGELOG.md + the What's New notes, run the smoke test, commit, then:
git tag v2.2.0 && git push origin master v2.2.0
```

The `Release` workflow refuses tags that don't match `manifest.json`, runs lint + typecheck + the full test suite, builds the store zip and attaches it to the GitHub Release.

### Versioning & the Beta label

`manifest.json` currently ships `version_name: "2.1.0 Beta"` on purpose: the extension depends on Gemini's (undocumented) DOM, so the first store release is labelled Beta while real-world usage is observed. Exit criteria: after the first Chrome Web Store release, monitor bug reports for **2–3 weeks**; if no critical extraction/export bugs surface, drop the ` Beta` suffix in **2.2.0** (remove `version_name` entirely — Chrome then displays `version`). The UI reads the version exclusively via `chrome.runtime.getManifest()`, so no source changes are needed beyond the manifest.

## Architecture in one paragraph

A small content-script core (8 files) watches the Gemini page and injects export entries into the share menu; the heavy conversion stack (16 exporters) is lazy-loaded via dynamic `import()` on the first export, and the KaTeX/highlight.js vendors are imported only when the report actually contains math/code blocks. Extraction produces a format-agnostic intermediate representation (IR: title, blocks, footnotes, lang/dir), which every exporter consumes independently — adding a format never touches the DOM-scraping code. All modules attach to a shared `window.GEP` namespace and are dependency-free (ZIP, DOCX/OOXML, EPUB and LaTeX-math conversion are implemented from scratch).

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
