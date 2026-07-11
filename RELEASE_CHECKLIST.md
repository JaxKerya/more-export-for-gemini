# Release checklist

The automated pipeline (lint, typecheck, ~1,400 checks, package build, GitHub
Release) covers everything that can be tested without a real Gemini session.
What it **cannot** cover is Gemini's live, undocumented DOM — that is what the
manual smoke test below exists for. Run it before every store release.

## 1. Version bump

```bash
npm run bump -- 2.2.0
```

Updates `manifest.json` (`version` + `version_name`), `package.json` and
`package-lock.json` in one step, then prints these remaining steps.

## 2. Release notes (two hand-maintained copies)

- [ ] `CHANGELOG.md` — move the `[Unreleased]` items into a new `[x.y.z]` section.
- [ ] `src/options/modules/whats-new.js` — add a `RELEASE_NOTES` entry so the
      What's New panel matches the changelog (user-facing highlights only).
- [ ] `store/listings/*.txt` — if a user-visible feature was added or removed,
      update the store description in all 8 languages (source of truth: `en.txt`)
      and re-paste the changed ones into the Web Store dashboard.

## 3. Manual smoke test (~5 minutes, real Gemini page)

Load the unpacked extension (`chrome://extensions` → Load unpacked), open a
Deep Research report on gemini.google.com, then:

- [ ] **Menu injection** — "Share & export" shows the extension's format entries.
- [ ] **Markdown export** — downloads, opens, footnotes/sources present.
- [ ] **PDF export** — print dialog opens with the styled report.
- [ ] **Word export** — `.docx` downloads and opens in Word without a repair prompt.
- [ ] **Right-click menu** — context-menu entries match the enabled formats and work.
- [ ] **Popup** — toolbar popup shows the report status; profile switcher applies (if profiles exist).
- [ ] **Options page** — a format toggle saves ("Settings saved" badge) and survives reload.
- [ ] **Recent reports** — the export above appears under Settings → Tools → Recent reports; Load + re-export works.
- [ ] **Diagnostics** — Settings → Tools → Run diagnostics reports OK on the open report.
- [ ] **First-run banner** — remove + re-add the unpacked extension; the Options page opens once with the welcome banner.

If Gemini's DOM changed and extraction misbehaves, `src/lib/extractor.js`
selectors and the diagnostics report are the starting points.

## 4. Tag and publish

```bash
git commit -am "Release x.y.z"
git tag vX.Y.Z && git push origin master vX.Y.Z
```

The `Release` workflow refuses tags that don't match `manifest.json`, runs the
full suite, builds `store/more-export-for-gemini-vX.Y.Z.zip` and attaches it to
the GitHub Release. Upload that zip to the Chrome Web Store dashboard.

## Beta label

`version_name` carries a ` Beta` suffix on purpose. Exit criteria: after the
first store release, watch bug reports for 2–3 weeks; if no critical
extraction/export bug surfaces, remove `version_name` from the manifest in
2.2.0 (see README "Versioning & the Beta label").
