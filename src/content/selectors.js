// Everything the extension knows about the VSA timesheet DOM lives here, so a
// markup change on their side is a one-file fix.
//
// Structure of the pivot page (verified 2026-09 on /o_services/timesheetspivot/):
//
//   Each timesheet line has a 13-char row id, e.g. "6aa007476cb4b".
//   Left table (table.vs-ts-col1) holds the line identity:
//     select#tiers_<row>            activity / client, name="line[<row>][tiers_code]"
//       inline onchange="getBdc(<row>,'UITimesheetPivot',<ctx>,this.value)"
//       -> loads the project list over GET /service.php
//     select#complete_line_<row>    project, empty until an activity is chosen
//     input#description_<row>       free-text description
//   Day cells (td.classic_day) hold, per day number 1..31:
//     input#input_day_((<row>))_[[<n>]]    value in days   name="line[<row>][day][<n>][unit]"
//     input#input_hour_((<row>))_[[<n>]]   value in hours  name="line[<row>][day][<n>][unit_hour]"
//     hidden line[<row>][day][<n>][tval] and [order_id]
//
// The visible unit is per line: input#input_format_<row> is "HOUR" or "DAY".

const VSA = {
  activitySelect: 'select.selectTimesheetLine[id^="tiers_"]',
  projectSelectFor: (row) => `#complete_line_${row}`,
  descriptionFor: (row) => `#description_${row}`,
  formatFor: (row) => `#input_format_${row}`,
  // These ids contain "((" and "[[", which are invalid CSS selector syntax --
  // they must be looked up with getElementById, never querySelector.
  dayInputId: (row, n) => `input_day_((${row}))_[[${n}]]`,
  hourInputId: (row, n) => `input_hour_((${row}))_[[${n}]]`,
  // The "+" button: <a class="mainaction-add-like-plus"
  //   onclick="addLine('UITimesheetPivot','<ctx>')">
  addLineButton: 'a.mainaction-add-like-plus',

  rowIdOf(activityEl) {
    return activityEl.id.replace(/^tiers_/, '');
  },

  allRows() {
    return [...document.querySelectorAll(VSA.activitySelect)].map(VSA.rowIdOf);
  },

  // Maps a client label as shown in the extension back to its VSA option value.
  activityOptionByLabel(activityEl, label) {
    return [...activityEl.options].find(
      (o) => o.text.trim().toLowerCase() === String(label).trim().toLowerCase()
    );
  },
};

globalThis.VSA = VSA;
