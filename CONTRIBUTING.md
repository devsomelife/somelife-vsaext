# Contributing

A browser extension for the VSA timesheet page, for Chrome, Edge and Firefox.
No dependencies: the files in `src/` are what browsers load. Chrome and Edge
load the repository root as it is. The Firefox package is generated, because
Firefox needs a different background declaration and its own settings, kept in
`manifest.firefox.json`.

## Getting set up

1. Clone the repository.
2. `chrome://extensions` -> enable Developer mode -> Load unpacked -> select the
   repository folder.
3. After changing anything, press the reload icon on the extension card.
   Content scripts also need the VSA tab reloaded, though the options page
   re-injects them automatically when it cannot reach the page.

For Firefox, build the package and run it in a dedicated profile:

```bash
node .github/scripts/build-extension.mjs firefox
npx --yes web-ext@10.6.0 run --source-dir build/firefox --firefox-profile ~/.cache/vsa-ext-ff-profile --profile-create-if-missing --keep-profile-changes
```

`web-ext run` reloads the add-on whenever `build/firefox` changes, so rebuild
after each edit. The profile keeps granted site access and data between runs.
Loading `build/firefox/manifest.json` as a temporary add-on from
`about:debugging` also works, but is cleared when Firefox restarts.

## Layout

| Path | Role |
| --- | --- |
| `src/content/selectors.js` | Every assumption about VSA's DOM. Fix markup changes here first. |
| `src/content/widen.js` | Dropdown widening. |
| `src/content/inject.js` | Catalog sync and the two-pass injection. |
| `src/content/main.js` | Content script entry and message handling. |
| `src/options/` | The tracking page. |
| `src/shared/store.js` | Entry model and `chrome.storage` access. |
| `src/shared/config.js` | The user's timesheet URL and its match patterns, plus the CRA workbook preferences. |
| `src/shared/cra.js` | The one-line block copied for the team CRA workbook (contract v1). |
| `src/background.js` | Registers the content script for the configured URL, and again when site access changes. |
| `manifest.firefox.json` | Firefox differences only (background scripts, add-on id, minimum version, data collection). |
| `.github/scripts/build-extension.mjs` | Builds `build/chrome`, `build/firefox` and both zips from the same sources. |
| `tools/dump-catalog.js` | Console fallback for reading the client catalog. |
| `tools/cra-import/` | The two Office Scripts for the CRA workbook: `logic.ts` (pure, tested), the Excel glue, `build.mjs` and the generated `dist/`. |
| `test/` | `node --test` suites for the content scripts, background, shared modules, build, manifest validation and `logic.ts`. |
| `.github/scripts/` | The checks CI runs. |

## Before opening a pull request

Node 24 or newer (the `.ts` tests rely on Node's built-in type stripping).

```bash
node .github/scripts/check-syntax.mjs
node .github/scripts/validate-manifest.mjs
node --test --experimental-test-coverage
node tools/cra-import/build.mjs && git diff --exit-code -- tools/cra-import/dist
node .github/scripts/build-extension.mjs all --zip
node .github/scripts/validate-manifest.mjs --target chrome --dir build/chrome
node .github/scripts/validate-manifest.mjs --target firefox --dir build/firefox
npx --yes web-ext@10.6.0 lint --source-dir build/firefox
```

CI runs the same checks. They cover syntax, both manifests, the Firefox lint,
the pure logic and the generated bundles, not behaviour: nothing here can verify the extension
against VSA or the scripts against Excel, so test by hand and say what you
exercised in the pull request. Edit `tools/cra-import/logic.ts` or the glue,
never `dist/`, then rebuild.

The coverage table printed locally only lists files that a test loads. In CI,
the job summary lists every source file, marks the untested ones as not
measured, and `lcov.info` is uploaded as the `coverage` artifact. Coverage does
not fail the build.

Put Firefox differences in `manifest.firefox.json` only. It must never set
`version`, `name` or `manifest_version`: those come from `manifest.json`, and
the validator refuses them. `web-ext` is pinned; bump it on purpose, in both
workflows.

## Releasing

Actions -> Release -> Run workflow, then enter the version (e.g. `0.2.0`).

It bumps `manifest.json`, builds and checks both packages (including the
Firefox lint) before tagging, commits and tags `v<version>`, then publishes a
GitHub release with both zips attached and generated notes.

Store uploads stay manual; the run summary lists both. Upload
`vsa-ext-<version>.zip` to the Chrome Web Store and
`vsa-ext-firefox-<version>.zip` to addons.mozilla.org (Firefox desktop, no
source code upload: nothing is minified).

The version must be one to four dot-separated integers, and the tag must not
already exist; the workflow fails rather than overwriting either.

## Working against VSA

The extension drives VSA's real form rather than its API, so most breakage comes
from their markup changing. Notes on the observed structure are in the README,
and every selector is in `src/content/selectors.js`.

Two constants are specific to an account and worth checking if numbers look
wrong: `HOURS_PER_DAY` in `src/content/inject.js`, and whether timesheet lines
are in `HOUR` or `DAY` format.

Injection deliberately never saves the timesheet. It fills the form and leaves
Save to the user. Keep it that way.

## Commits

Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.

## Privacy

Never commit real client names, project codes, or timesheet data. That includes
issue reports, test fixtures, and screenshots.
