# VSA Ext

Browser extension (Chrome, Edge, Firefox) for the VSA timesheet pivot page.

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke) for Chrome and Edge.
The Firefox version is awaiting review on addons.mozilla.org, see
[Firefox](#firefox).

The timesheet URL is configured in the extension, not hardcoded: set it on the
options page on first run and grant access to that site when the browser asks. The
content script is then registered for that address.

User documentation (French): [docs/guide.html](docs/guide.html).

Privacy policy: [English](docs/privacy-policy.md), [français](docs/politique-de-confidentialite.md).

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## Sharing

Share the [Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke) link: it installs in one click and
keeps everyone up to date. Edge users use the same link, see
[Microsoft Edge](#microsoft-edge). Firefox users use the addons.mozilla.org
listing once it is approved, see [Firefox](#firefox).

For a build that is not on a store yet, released versions are on the Releases
page with both packages attached: `vsa-ext-<version>.zip` for Chrome and Edge,
`vsa-ext-firefox-<version>.zip` for Firefox. CI also attaches them to every run
as the `extension` and `extension-firefox` artifacts. To build them locally:

```bash
node .github/scripts/build-extension.mjs all --zip
```

Unzipped, each package loads as described below.

Chrome cannot install a zip directly -- it must be unzipped first, and the
folder has to stay put, since "Load unpacked" references it on disk rather than
copying it. Bump `version` in `manifest.json` when sharing an update.

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke): click "Add to Chrome". Updates install
automatically.

Then open the extension's options page and set your VSA timesheet URL. The
`Open` button next to it opens that page in a new tab.

### Microsoft Edge

Edge installs the same Chrome Web Store version:

1. Open `edge://extensions` and turn on **Allow extensions from other stores**
2. Open the [Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke?hl=en-US) and click "Add to Chrome". Updates keep
   coming from the Chrome Web Store
3. Edge warns that it has not verified extensions from other stores. That is
   expected

On a company-managed Edge, IT can lock that setting. Either ask them to allow
the extension ID `ljojgaimkhhjakiibaohlmnhdgjhnhke`, or use the unpacked build
below.

### Firefox

Requires Firefox 140 or later, on desktop. The listing on addons.mozilla.org is
awaiting review; once it is live, click "Add to Firefox" there and updates
install automatically.

Until then, or to test a build:

1. Build it: `node .github/scripts/build-extension.mjs firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on** -> pick `build/firefox/manifest.json`

Firefox removes a temporary add-on, and its data, when it restarts.

Firefox hides new toolbar buttons: pin VSA Ext from the puzzle icon to reach
the options page. The extension does not run in private windows unless you
allow it in its settings.

### Unpacked Build

For development or a build that is not on the store yet:

1. Chrome -> `chrome://extensions`, Edge -> `edge://extensions`
2. Enable Developer mode
3. "Load unpacked" -> pick this directory
4. Set your VSA timesheet URL on the options page, as above

Remove the store version first, or both copies run side by side.

## Features

### Readable selects
Click any timesheet line select and it widens to 640px while open, so labels
like `BS-26-000112 [Projet Principal]` are readable. It snaps back on choice,
blur, or Escape.

### Shadow tracking
Track day to day in the extension, then push a whole month into VSA in one go.

- Toolbar icon opens the options page.
- `Sync clients & projects from VSA` walks every client in the activity
  dropdown and records its project list, so the grid offers real values.
  Run it with the VSA timesheet page open.
- Fill the month grid with `Add row`. Entries are grouped under a header row
  per day showing the day's total out of 1 and its status: complete, missing
  some time, or over one day. The footer counts complete, partial and over days.
- `Inject this month into VSA` writes the entries into the grid.

Injection runs in two passes:

1. **Structure** -- one timesheet line per client/project pair, with both
   dropdowns selected. This is the slow part: each client change round-trips to
   VSA for its project list.
2. **Time** -- writes the day cells. Local and instant.

A line that fails in step 1 gets no days written in step 2, so a failed project
lookup cannot leave time booked against a half-configured line. The status line
reports how many lines were prepared and which failed.

Injection never saves. It fills the form the same way clicking would, then you
review and press Save in VSA yourself.

### Team CRA workbook

`Copy for CRA sheet` copies the displayed month as one line of JSON. Paste it
into cell I23 of your tab in the team workbook and click its `⬇ Importer VSA
Ext` button: an Office Script checks the block against the Admin referential
and writes the rows, all or nothing. Rows it wrote earlier for the same month
(column `Source` = `VSA Ext`) are replaced; rows typed by hand are left alone.
The note becomes the workbook's `Tâche` column, so it is no longer private once
you send a month.
With `Send notes to VSA as day comments` ticked (off by default), injection also
writes each note as that day's comment in VSA.

Two optional settings on the options page: `CRA sheet tab` (your tab's exact
name, so a block cannot land in a colleague's tab) and `CRA workbook URL` (enables
an `Open` button). No permission is needed: the clipboard is written from the
options page on your click.

The workbook side, its install notice and the exchange contract live in
[`tools/cra-import/`](tools/cra-import/README.md).

### "Could not establish connection. Receiving end does not exist."

The options page could not reach the content script in the VSA tab. It now
re-injects the scripts and retries automatically, which covers the usual cause:
a timesheet tab that was already open when the extension was reloaded.

If it still fails, reload the timesheet tab.

### If sync does not work

`tools/dump-catalog.js` does the same walk from the DevTools console, where
VSA's requests behave normally. Open the timesheet page, paste the file into the
console, let it run, and it copies a JSON catalog to the clipboard. Save that as
a `.json` file and load it with `Import JSON`.

Import is per-section: a catalog-only file leaves tracked entries untouched, and
an entries-only file leaves the catalog untouched.

### Re-syncing

Sync merges into the existing catalog rather than replacing it. A client whose
lookup fails or times out keeps the projects an earlier sync found, so a bad
run cannot erase good data; the status line reports how many were kept that way.

Because merging never deletes, a client removed in VSA stays in the list.
`Reset catalog` clears it for a clean rebuild. Tracked entries are untouched.

### Stored data

Both the tracked entries and the client/project catalog live in
the extension storage (`storage.local`), so they survive page reloads, browser restarts and
extension reloads. You only need to re-sync when the project list changes on
VSA's side. Uninstalling the extension clears it -- use `Export JSON` for a
backup. Storage is local to this machine and never syncs to a browser account.

## Layout

| Path | Role |
| --- | --- |
| `manifest.json` | Chrome and Edge manifest, loadable from the repository root. |
| `manifest.firefox.json` | Firefox differences only, merged over `manifest.json` by the build. |
| `.github/scripts/build-extension.mjs` | Builds `build/chrome`, `build/firefox` and both zips from the same sources. |
| `src/content/selectors.js` | All VSA DOM knowledge, documented. Fix markup changes here. |
| `src/content/widen.js` | Select widening. |
| `src/content/inject.js` | Grid writing and catalog sync. |
| `src/content/main.js` | Content script entry, message handling. |
| `src/options/` | Month grid editor. |
| `src/shared/store.js` | Entry model and `chrome.storage` access. |
| `src/shared/cra.js` | The one-line block copied for the team CRA workbook. |
| `tools/cra-import/` | Office Scripts for the CRA workbook (pure core, Excel glue, generated `dist/`, install notice). |
| `test/` | `node --test` suites. |

## Notes on the VSA DOM

Each timesheet line has a 13-char row id, e.g. `6aa007476cb4b`:

- `select#tiers_<row>` activity/client, inline
  `onchange="getBdc(<row>,'UITimesheetPivot',<ctx>,this.value)"` loads projects
  over `GET /service.php`.
- `select.select_order[name="line[<row>][order_id]"]` is the project ("mission /
  project") list, refilled after the client changes. Its id is random
  (e.g. `fa3002b5`) so it must be found by name. Note `#complete_line_<row>`
  also exists but is never populated -- it is not the project select.
  Projects sit under optgroup headers ("Fixed-price contracts", "Time-based
  contracts") and the list starts with a `none` placeholder.
- Clients carry a `C-` code, internal activities an `I-` code. Only clients are
  synced. The codes are identical in every locale; the optgroup label is not
  (`Customers` in English, `Clients` in French), so the code is what identifies
  a client, with the labels kept only as a fallback. The options page has a
  language preference (auto, French, English) driving that fallback.
- `input#input_day_((<row>))_[[<n>]]` day value, `input#input_hour_...` hours.
- `input#input_format_<row>` is `HOUR` or `DAY` and decides which of the two
  fields is authoritative for that line.
- `input#comment_<n>_<row>` (`name="tdesc[<row>][day][<n>]"`) is the day comment.
  Its inline `checkCommentValue` makes no network call but toggles the comment
  popup open, so injection closes it again. It is saved with the rest of the form.

## Verification status

Verified directly against the live page:

- Select widening: 208px -> 640px and back. Works.
- Day cell writing: 1 day -> `7`, 0.5 -> `3.5` on a `HOUR`-format line, then
  restored. Works. Note the ids contain `((` and `[[`, so these fields must be
  reached with `getElementById`; `querySelector` throws on them.
- Add line / project list loading: selectors and functions confirmed present
  (`a.mainaction-add-like-plus` -> `addLine(...)`, `select#tiers_<row>` inline
  `onchange` -> `getBdc(...)`), but both round-trip to `/service.php` and could
  not be completed through the remote-debugging channel used during
  development. They need a first run in the browser as a real content script.
