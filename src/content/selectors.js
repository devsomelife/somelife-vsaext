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
//     input#comment_<n>_<row>              day comment     name="tdesc[<row>][day][<n>]"
//       inline onchange="checkCommentValue(<row>,<n>,<skin>)": no network call. It
//       swaps the comment icon, marks the page modified and TOGGLES the popup
//       div#div_comment_<n>_<row>. Saved by Save with the rest of the form.
//
// The visible unit is per line: input#input_format_<row> is "HOUR" or "DAY".

const VSA = {
  activitySelect: 'select.selectTimesheetLine[id^="tiers_"]',

  // The project select carries a random id (e.g. "fa3002b5"), so it must be
  // found by name, scoped to its line. It is NOT #complete_line_<row>, which
  // exists but is never populated.
  projectSelectFor: (row) => `select.select_order[name="line[${row}][order_id]"]`,

  // Clients carry a "C-" code; internal activities carry "I-". The codes are
  // the same in every locale, unlike the optgroup labels ("Customers" in
  // English, "Clients" in French), so the code is what identifies a client.
  clientCodePrefix: 'C-',

  // The client optgroup per language, used as a fallback when an instance
  // shapes its codes differently. Set from the options page; "auto" reads the
  // page's own lang attribute.
  customersGroupLabels: { en: 'Customers', fr: 'Clients' },

  language: 'auto',

  resolvedLanguage() {
    if (VSA.language !== 'auto') return VSA.language;
    const pageLang = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    return pageLang in VSA.customersGroupLabels ? pageLang : 'en';
  },

  // Accepts the label for the resolved language, and for the others too: the
  // code is the real signal, so a mismatched preference must not break sync.
  isClientOption(option) {
    if (option.value.startsWith(VSA.clientCodePrefix)) return true;
    const group = option.parentElement;
    if (group?.tagName !== 'OPTGROUP') return false;
    return Object.values(VSA.customersGroupLabels).includes(group.label.trim());
  },
  descriptionFor: (row) => `#description_${row}`,
  formatFor: (row) => `#input_format_${row}`,
  // These ids contain "((" and "[[", which are invalid CSS selector syntax --
  // they must be looked up with getElementById, never querySelector.
  dayInputId: (row, n) => `input_day_((${row}))_[[${n}]]`,
  hourInputId: (row, n) => `input_hour_((${row}))_[[${n}]]`,
  commentInputId: (row, n) => `comment_${n}_${row}`,
  commentPopupId: (row, n) => `div_comment_${n}_${row}`,
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
