# Contributing

A local Chrome extension for the VSA timesheet page. No build step, no
dependencies: the files in `src/` are what Chrome loads.

## Getting set up

1. Clone the repository.
2. `chrome://extensions` -> enable Developer mode -> Load unpacked -> select the
   repository folder.
3. After changing anything, press the reload icon on the extension card.
   Content scripts also need the VSA tab reloaded, though the options page
   re-injects them automatically when it cannot reach the page.

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
| `src/background.js` | Registers the content script for the configured URL. |
| `tools/dump-catalog.js` | Console fallback for reading the client catalog. |
| `tools/cra-import/` | The two Office Scripts for the CRA workbook: `logic.ts` (pure, tested), the Excel glue, `build.mjs` and the generated `dist/`. |
| `test/` | `node --test` suites for `cra.js`, `config.js` and `logic.ts`. |
| `.github/scripts/` | The checks CI runs. |

## Before opening a pull request

Node 24 or newer (the `.ts` tests rely on Node's built-in type stripping).

```bash
node .github/scripts/check-syntax.mjs
node .github/scripts/validate-manifest.mjs
node --test --experimental-test-coverage
node tools/cra-import/build.mjs && git diff --exit-code -- tools/cra-import/dist
```

CI runs the same checks. They cover syntax, the manifest, the pure logic and
the generated bundles, not behaviour: nothing here can verify the extension
against VSA or the scripts against Excel, so test by hand and say what you
exercised in the pull request. Edit `tools/cra-import/logic.ts` or the glue,
never `dist/`, then rebuild.

The coverage table printed locally only lists files that a test loads. In CI,
the job summary lists every source file, marks the untested ones as not
measured, and `lcov.info` is uploaded as the `coverage` artifact. Coverage does
not fail the build.

## Releasing

Actions -> Release -> Run workflow, then enter the version (e.g. `0.2.0`).

It bumps `manifest.json`, runs the same checks as CI, commits and tags
`v<version>`, then publishes a GitHub release with the zip attached and
generated notes.

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
