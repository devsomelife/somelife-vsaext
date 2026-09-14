# VSA Ext

Browser extension for the VSA timesheet pivot page, for Chrome, Edge and Firefox.

- Widens the timesheet dropdowns so project labels are readable.
- Tracks time day to day, then fills a whole month into VSA in one go, without saving.
- Sends the month to the team CRA workbook by copy and paste.

## Documentation

| Document | For |
| --- | --- |
| [User guide (French)](docs/guide.md) | Users: install, daily tracking, injection, team CRA, troubleshooting |
| [Privacy policy](docs/privacy-policy.md), [politique de confidentialité](docs/politique-de-confidentialite.md) | Users and store reviewers |
| [CRA workbook import](tools/cra-import/README.md) | Whoever installs the Office Scripts in the team workbook |
| [Store assets](docs/store/README.md) | Maintainers of the store listings |
| [Contributing](CONTRIBUTING.md) | Developers: setup, checks, releases |

The extension package also ships the guide as [docs/guide.html](docs/guide.html).

## Installation

### Chrome

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke). Updates install automatically.

### Microsoft Edge

Edge installs the same Chrome Web Store version:

1. Open `edge://extensions` and turn on **Allow extensions from other stores**.
2. Open the [Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke?hl=en-US) and click **Add to Chrome**. Updates keep coming from the Chrome Web Store.
3. Edge warns that it has not verified extensions from other stores. That is expected.

On a company-managed Edge, IT can lock that setting. Ask them to allow the extension ID `ljojgaimkhhjakiibaohlmnhdgjhnhke`, or use the [unpacked build](#unpacked-build).

### Firefox

- Firefox 140 or later, desktop only.
- The addons.mozilla.org listing is awaiting review. Once it is live, click **Add to Firefox** there; updates install automatically.
- Until then, or to test a build:
  1. `node .github/scripts/build-extension.mjs firefox`
  2. Open `about:debugging#/runtime/this-firefox`
  3. **Load Temporary Add-on** -> pick `build/firefox/manifest.json`
- Firefox removes a temporary add-on, and its data, when it restarts.
- Firefox hides new toolbar buttons: pin VSA Ext from the puzzle icon to reach the options page.
- The extension does not run in private windows unless allowed in its settings.

### Unpacked build

For development, or a build that is not on a store yet:

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Enable Developer mode.
3. **Load unpacked** -> pick the repository folder, or an unzipped Chrome package.

- Remove the store version first, or both copies run side by side.
- Chrome cannot install a zip: unzip it first and keep the folder in place, since **Load unpacked** references it on disk rather than copying it.

## Configuration

The timesheet URL is not hardcoded. On first run:

1. Click the toolbar icon to open the options page.
2. Paste the VSA timesheet page address in **VSA timesheet URL**.
3. Click **Save & grant access** and accept the browser's site access request. The content script is then registered for that address.

| Setting | Effect |
| --- | --- |
| **VSA language** | Fallback used to recognise the client group when codes are unusual. Leave it on automatic detection. |
| **Send notes to VSA as day comments** | Off by default. When ticked, injection also writes each note as that day's comment in VSA. |
| **CRA sheet tab** | Your exact tab name in the team workbook, so a block cannot land in a colleague's tab. |
| **CRA workbook URL** | Enables an **Open** button for the workbook. |

The **Open** button next to each address opens it in a new tab.

## Features

### Readable dropdowns

- Click any timesheet line select: it widens to 640px while open, so labels like `BS-26-000112 [Projet Principal]` are readable.
- It snaps back on choice, blur, or Escape.

### Shadow tracking

- **Sync clients & projects from VSA**, run with the VSA timesheet page open:
  - walks every client in the activity dropdown and records its project list
  - also records internal activities (Formation, Alternance Ecole, Intercontrat...), listed after the clients, without projects; Absence stays in VSA
  - works on a page without any line: it adds one with `+`, leaves it empty and unsaved, and injection reuses it
- **Add row** fills the month grid. Entries are grouped under a header row per day, showing the day's total out of 1 and its status: complete, missing some time, or over one day. The footer counts complete, partial and over days.
- **Inject this month into VSA** writes the entries into the VSA grid in two passes:
  1. **Structure**: one timesheet line per client/project pair, with both dropdowns selected. This is the slow part, since each client change round-trips to VSA for its project list. An internal activity line gets the activity only, once VSA has reloaded the line's unit.
  2. **Time**: writes the day cells, plus the day comments when enabled. Local and instant.
- A line that fails the structure pass gets no days, so time is never booked against a half-configured line. The status line reports how many lines were prepared and which failed.
- Injection never saves. It fills the form the way clicking would; you review and press Save in VSA yourself.

### Team CRA workbook

- **Copy for CRA sheet** copies the displayed month as one line of JSON.
- Paste it into cell I23 of your tab in the team workbook and click its **Importer VSA Ext** button.
- An Office Script checks the block against the Admin referential and writes the rows, all or nothing.
- Rows it wrote earlier for the same month (column `Source` = `VSA Ext`) are replaced; rows typed by hand are left alone.
- The note becomes the workbook's `Tâche` column, so it is no longer private once the month is sent.
- The workbook refuses a project its Admin referential does not know. **Copy projects for Admin** copies the month's projects as rows ready to paste into that referential (client, BS number, project name, `Facturable`, `Oui`). Send them to whoever keeps it before your first block of the month.
- Internal activity rows are sent with the activity name as both client and project, and no BS number. They are never copied as Admin rows.
- No permission is needed: the clipboard is written from the options page on your click.
- Workbook side, install notice and exchange contract: [tools/cra-import/](tools/cra-import/README.md).

## Stored data

- Tracked entries and the client/project catalog live in extension storage (`storage.local`).
- They survive page reloads, browser restarts and extension reloads. Re-sync only when the project list changes in VSA.
- Uninstalling the extension clears them. **Export JSON** makes a backup, **Import JSON** restores it.
- Import is per section: a catalog-only file leaves tracked entries untouched, and an entries-only file leaves the catalog untouched.
- Storage is local to this machine and never syncs to a browser account.

## Troubleshooting

User-side messages are covered in the [guide](docs/guide.md#en-cas-de-problème).

### Connection error with the VSA tab

`Could not establish connection. Receiving end does not exist.`

- The options page could not reach the content script in the VSA tab.
- It re-injects the scripts and retries automatically, which covers the usual cause: a timesheet tab already open when the extension was reloaded.
- If it still fails, reload the timesheet tab.

### Sync fallback

- `tools/dump-catalog.js` does the same walk from the DevTools console, where VSA's requests behave normally.
- Open the timesheet page, paste the file into the console and let it run. It copies a JSON catalog to the clipboard.
- Save that as a `.json` file and load it with **Import JSON**.

### Re-syncing

- Sync merges into the existing catalog rather than replacing it.
- A client whose lookup fails or times out keeps the projects an earlier sync found, so a bad run cannot erase good data. The status line reports how many were kept that way.
- Merging never deletes, so a client removed in VSA stays listed. **Reset catalog** clears the catalog for a clean rebuild; tracked entries are untouched.

## Distribution

- Share the [Chrome Web Store](https://chromewebstore.google.com/detail/vsa-ext/ljojgaimkhhjakiibaohlmnhdgjhnhke) link: one-click install, automatic updates. Edge users use the same link, see [Microsoft Edge](#microsoft-edge). Firefox users use the addons.mozilla.org listing once it is approved.
- Each release on the Releases page attaches `vsa-ext-<version>.zip` (Chrome, Edge) and `vsa-ext-firefox-<version>.zip` (Firefox). Unzipped, each loads as an [unpacked build](#unpacked-build) or a [temporary Firefox add-on](#firefox).
- CI attaches both packages to every run as the `extension` and `extension-firefox` artifacts.
- Releases are cut from the Release workflow, see [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

Local build of both packages:

```bash
node .github/scripts/build-extension.mjs all --zip
```

## Repository layout

| Path | Role |
| --- | --- |
| `manifest.json` | Chrome and Edge manifest, loadable from the repository root. |
| `manifest.firefox.json` | Firefox differences only, merged over `manifest.json` by the build. |
| `.github/scripts/build-extension.mjs` | Builds `build/chrome`, `build/firefox` and both zips from the same sources. |
| `src/content/selectors.js` | All VSA DOM knowledge, documented. Fix markup changes here. |
| `src/content/widen.js` | Dropdown widening. |
| `src/content/inject.js` | Grid writing and catalog sync. |
| `src/content/main.js` | Content script entry, message handling. |
| `src/options/` | Month grid editor. |
| `src/shared/store.js` | Entry model and `chrome.storage` access. |
| `src/shared/cra.js` | The one-line block copied for the team CRA workbook. |
| `docs/` | User guide (Markdown, plus the HTML copy shipped in the package), privacy policies, store assets. |
| `tools/dump-catalog.js` | Console fallback for reading the client catalog. |
| `tools/cra-import/` | Office Scripts for the CRA workbook (pure core, Excel glue, generated `dist/`, install notice). |
| `test/` | `node --test` suites. |

The full table, with every shared module, is in [CONTRIBUTING.md](CONTRIBUTING.md#layout).

## VSA DOM notes

Each timesheet line has a 13-char row id, e.g. `6aa007476cb4b`.

- `select#tiers_<row>`: activity or client. Its inline `onchange="getBdc(<row>,'UITimesheetPivot',<ctx>,this.value)"` loads the projects over `GET /service.php`.
- `select.select_order[name="line[<row>][order_id]"]`: the project ("mission / project") list, refilled after the client changes.
  - Its id is random (e.g. `fa3002b5`), so it must be found by name.
  - `#complete_line_<row>` also exists but is never populated: it is not the project select.
  - Projects sit under optgroup headers ("Fixed-price contracts", "Time-based contracts"), and the list starts with a `none` placeholder.
- Clients carry a `C-` code, internal activities an `I-` code.
  - Clients are walked for their projects.
  - Internal activities are the `I-` options inside an optgroup ("Activités internes"). The two ungrouped ones, `I-INTERNE` (the empty "list of activities" value) and `I-ABSENCE`, are not synced.
  - Selecting an internal activity removes the project select and reloads the line's unit and day cells, with no project list to wait for.
  - The codes are identical in every locale; the optgroup label is not (`Customers` in English, `Clients` in French). The code identifies a client, with the labels kept as a fallback driven by the **VSA language** setting.
- `input#input_day_((<row>))_[[<n>]]`: day value. `input#input_hour_...`: hours.
- `input#input_format_<row>`: `HOUR` or `DAY`, decides which of the two fields is authoritative for that line.
- `input#comment_<n>_<row>` (`name="tdesc[<row>][day][<n>]"`): the day comment. Its inline `checkCommentValue` makes no network call but toggles the comment popup open, so injection closes it again. It is saved with the rest of the form.
- `a.mainaction-add-like-plus`: the `+` button, `addLine(...)`. The same class is on two hidden buttons (`addUow`, `addExtra`); the `addLine` one comes first.

### Verification against the live page

- **Dropdown widening**: 208px -> 640px and back.
- **Day cell writing**: 1 day -> `7`, 0.5 -> `3.5` on a `HOUR`-format line, then restored. The ids contain `((` and `[[`, so these fields must be reached with `getElementById`; `querySelector` throws on them.
- **Project list loading**: `getBdc(...)` round-trips to `/service.php`. It could not be completed through the remote-debugging channel used early on, and works from the page itself.
- **Add line**: `addLine(...)` fetches the new line from `/service.php`, then inserts it after `#grid_thead_table_crapivot > tbody > tr[id^="line_"]:last`. With no line left, that matches nothing and `+` silently adds nothing, even when clicked by hand. The extension appends a hidden placeholder `tr#line_vsaext_anchor` first, and removes it once the line arrived (about 170 ms, verified 2026-09).
