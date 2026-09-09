# VSA Ext

Local Chrome extension for the VSA timesheet pivot page.

The timesheet URL is configured in the extension, not hardcoded: set it on the
options page on first run and grant access to that site when Chrome asks. The
content script is then registered for that address.

User documentation (French): [docs/guide.html](docs/guide.html).

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## Sharing

Released versions are on the Releases page, with the zip attached. CI also
attaches an archive to every run: open the Actions tab, pick a run and download
the `extension` artifact. To build one locally:

```bash
zip -r vsa-ext.zip manifest.json src icons docs/guide.html
```

Send that zip; the recipient unzips it and loads the folder as below.

Chrome cannot install a zip directly -- it must be unzipped first, and the
folder has to stay put, since "Load unpacked" references it on disk rather than
copying it. Bump `version` in `manifest.json` when sharing an update.

## Install

1. Chrome -> `chrome://extensions`
2. Enable Developer mode
3. "Load unpacked" -> pick this directory
4. Open the options page and set your VSA timesheet URL

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
- Fill the month grid (`Add row`, or `Fill weekdays` to seed working days).
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
`chrome.storage.local`, so they survive page reloads, browser restarts and
extension reloads. You only need to re-sync when the project list changes on
VSA's side. Uninstalling the extension clears it -- use `Export JSON` for a
backup. Storage is local to this machine and never syncs to a Google account.

## Layout

| Path | Role |
| --- | --- |
| `src/content/selectors.js` | All VSA DOM knowledge, documented. Fix markup changes here. |
| `src/content/widen.js` | Select widening. |
| `src/content/inject.js` | Grid writing and catalog sync. |
| `src/content/main.js` | Content script entry, message handling. |
| `src/options/` | Month grid editor. |
| `src/shared/store.js` | Entry model and `chrome.storage` access. |

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
- Clients are the options under `<optgroup label="Customers">`. Only these are
  synced; internal activities (Absence, Formation, Intercontrat...) are ignored.
- `input#input_day_((<row>))_[[<n>]]` day value, `input#input_hour_...` hours.
- `input#input_format_<row>` is `HOUR` or `DAY` and decides which of the two
  fields is authoritative for that line.

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
