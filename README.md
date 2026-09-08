# VSA Ext

Local Chrome extension for the VSA timesheet pivot page
(`https://vsa.example.com/o_services/timesheetspivot/`).

## Install

1. Chrome -> `chrome://extensions`
2. Enable Developer mode
3. "Load unpacked" -> pick this directory

## Features

### Readable selects
Click any timesheet line select and it widens to 640px while open, so labels
like `BS-26-000086 [Projet Principal]` are readable. It snaps back on choice,
blur, or Escape.

### Shadow tracking
Track day to day in the extension, then push a whole month into VSA in one go.

- Toolbar icon opens the options page.
- `Sync clients & projects from VSA` walks every client in the activity
  dropdown and records its project list, so the grid offers real values.
  Run it with the VSA timesheet page open.
- Fill the month grid (`Add row`, or `Fill weekdays` to seed working days).
- `Inject this month into VSA` writes the entries into the grid.

Injection never saves. It fills the form the same way clicking would, then you
review and press Save in VSA yourself.

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
- `select#complete_line_<row>` project, empty until an activity is chosen.
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
