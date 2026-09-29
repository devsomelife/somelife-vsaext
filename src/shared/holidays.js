// Public holidays and date ranges for the range entry.
//
// Holidays are rules, not stored dates, so any year works without upkeep. There
// is one rule set per country; France is the default, the UK and the USA can be
// picked instead. Settings record the country and only what the user changed
// from its defaults, so a rule added in a later version gets its own default
// instead of being silently off for everyone who touched the list before.
//
// A rule is one of:
//   { fixed: 'MM-DD' }                       same date every year
//   { easter: offset }                       days from Easter Sunday
//   { month, weekday, nth, offset? }         nth weekday of a month (0 = Sunday,
//                                            nth -1 = last), plus offset days
// and may carry `since` (first year it applies).
//
// Dates are "YYYY-MM-DD" strings throughout, and any arithmetic is done in UTC:
// local-time Date math shifts by a day around DST changes.

export const FRENCH_RULES = [
  { id: 'new-year', label: "Jour de l'an", fixed: '01-01', defaultOn: true },
  { id: 'good-friday', label: 'Vendredi saint (Alsace-Moselle)', easter: -2, defaultOn: false },
  { id: 'easter-monday', label: 'Lundi de Pâques', easter: 1, defaultOn: true },
  { id: 'labour', label: 'Fête du travail', fixed: '05-01', defaultOn: true },
  { id: 'victory-1945', label: 'Victoire 1945', fixed: '05-08', defaultOn: true },
  { id: 'ascension', label: 'Ascension', easter: 39, defaultOn: true },
  { id: 'whit-monday', label: 'Lundi de Pentecôte', easter: 50, defaultOn: true },
  { id: 'bastille', label: 'Fête nationale', fixed: '07-14', defaultOn: true },
  { id: 'assumption', label: 'Assomption', fixed: '08-15', defaultOn: true },
  { id: 'all-saints', label: 'Toussaint', fixed: '11-01', defaultOn: true },
  { id: 'armistice', label: 'Armistice 1918', fixed: '11-11', defaultOn: true },
  { id: 'christmas', label: 'Noël', fixed: '12-25', defaultOn: true },
  { id: 'st-stephen', label: 'Saint-Étienne (Alsace-Moselle)', fixed: '12-26', defaultOn: false },
];

// England and Wales on by default; the Scotland and Northern Ireland days are
// listed but off. One-off bank holidays (royal events) are custom days off.
export const UK_RULES = [
  { id: 'new-year', label: "New Year's Day", fixed: '01-01', defaultOn: true },
  { id: 'jan-2', label: '2nd January (Scotland)', fixed: '01-02', defaultOn: false },
  { id: 'st-patrick', label: "St Patrick's Day (Northern Ireland)", fixed: '03-17', defaultOn: false },
  { id: 'good-friday', label: 'Good Friday', easter: -2, defaultOn: true },
  { id: 'easter-monday', label: 'Easter Monday (not Scotland)', easter: 1, defaultOn: true },
  { id: 'early-may', label: 'Early May bank holiday', month: 5, weekday: 1, nth: 1, defaultOn: true },
  { id: 'spring', label: 'Spring bank holiday', month: 5, weekday: 1, nth: -1, defaultOn: true },
  { id: 'boyne', label: 'Battle of the Boyne (Northern Ireland)', fixed: '07-12', defaultOn: false },
  { id: 'summer-scotland', label: 'Summer bank holiday (Scotland)', month: 8, weekday: 1, nth: 1, defaultOn: false },
  { id: 'summer', label: 'Summer bank holiday (not Scotland)', month: 8, weekday: 1, nth: -1, defaultOn: true },
  { id: 'st-andrew', label: "St Andrew's Day (Scotland)", fixed: '11-30', defaultOn: false },
  { id: 'christmas', label: 'Christmas Day', fixed: '12-25', defaultOn: true },
  { id: 'boxing', label: 'Boxing Day', fixed: '12-26', defaultOn: true },
];

// The eleven federal holidays; the day after Thanksgiving is listed but off.
export const US_RULES = [
  { id: 'new-year', label: "New Year's Day", fixed: '01-01', defaultOn: true },
  { id: 'mlk', label: 'Martin Luther King Jr. Day', month: 1, weekday: 1, nth: 3, defaultOn: true },
  { id: 'washington', label: "Washington's Birthday", month: 2, weekday: 1, nth: 3, defaultOn: true },
  { id: 'memorial', label: 'Memorial Day', month: 5, weekday: 1, nth: -1, defaultOn: true },
  { id: 'juneteenth', label: 'Juneteenth', fixed: '06-19', since: 2021, defaultOn: true },
  { id: 'independence', label: 'Independence Day', fixed: '07-04', defaultOn: true },
  { id: 'labor', label: 'Labor Day', month: 9, weekday: 1, nth: 1, defaultOn: true },
  { id: 'columbus', label: 'Columbus Day', month: 10, weekday: 1, nth: 2, defaultOn: true },
  { id: 'veterans', label: 'Veterans Day', fixed: '11-11', defaultOn: true },
  { id: 'thanksgiving', label: 'Thanksgiving Day', month: 11, weekday: 4, nth: 4, defaultOn: true },
  { id: 'black-friday', label: 'Day after Thanksgiving', month: 11, weekday: 4, nth: 4, offset: 1, defaultOn: false },
  { id: 'christmas', label: 'Christmas Day', fixed: '12-25', defaultOn: true },
];

// `observe` says what happens to a holiday falling on a weekend:
//   substitute  the next weekday not already a holiday is off (UK)
//   nearest     Saturday -> the Friday before, Sunday -> the Monday after (USA)
export const COUNTRIES = {
  fr: { rules: FRENCH_RULES, observe: null },
  uk: { rules: UK_RULES, observe: 'substitute' },
  us: { rules: US_RULES, observe: 'nearest' },
};

export const DEFAULT_COUNTRY = 'fr';

export function holidayDefaults(country = DEFAULT_COUNTRY) {
  return { country: COUNTRIES[country] ? country : DEFAULT_COUNTRY, disabled: [], enabled: [], custom: [] };
}

export const DEFAULT_HOLIDAY_SETTINGS = Object.freeze(holidayDefaults());

// The words added to holiday names, in English by default. The options page
// passes its own, in the interface language: `dayOff` names a custom day
// without a label, `substitute` and `nearest` mark a day shifted off a weekend.
export const HOLIDAY_WORDS = Object.freeze({ dayOff: 'Day off', substitute: 'substitute day', nearest: 'observed' });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');
const toUtc = (date) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
const fromUtc = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const weekday = (date) => new Date(toUtc(date)).getUTCDay();

export const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && fromUtc(toUtc(s)) === s;

export function addDays(date, n) {
  return fromUtc(toUtc(date) + n * DAY_MS);
}

// Calendar days from `from` to `to`, both included; 0 when either is not a date
// or the range is inverted.
export function spanDays(from, to) {
  if (!isDate(from) || !isDate(to) || from > to) return 0;
  return (toUtc(to) - toUtc(from)) / DAY_MS + 1;
}

export function isWeekend(date) {
  const day = weekday(date);
  return day === 0 || day === 6;
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// The nth given weekday of a month; nth -1 is the last one.
export function nthWeekday(year, month, day, nth) {
  if (nth > 0) {
    const first = `${year}-${pad(month)}-01`;
    return addDays(first, ((day - weekday(first) + 7) % 7) + (nth - 1) * 7);
  }
  const last = fromUtc(Date.UTC(year, month, 0));
  return addDays(last, -((weekday(last) - day + 7) % 7));
}

// The calendar date of a rule, before any weekend shift.
export function ruleDate(rule, year) {
  if (rule.fixed) return `${year}-${rule.fixed}`;
  if (rule.easter !== undefined) return addDays(easterSunday(year), rule.easter);
  return addDays(nthWeekday(year, rule.month, rule.weekday, rule.nth), rule.offset ?? 0);
}

export function rulesOf(country) {
  return (COUNTRIES[country] ?? COUNTRIES[DEFAULT_COUNTRY]).rules;
}

// Anything unexpected in stored or imported settings falls back to the default
// rather than failing: a bad holiday list must not block time entry. Settings
// saved before countries existed have none, and were French.
export function normalizeHolidaySettings(input) {
  const country = COUNTRIES[input?.country] ? input.country : DEFAULT_COUNTRY;
  const ids = new Set(rulesOf(country).map((r) => r.id));
  const list = (v) => (Array.isArray(v) ? [...new Set(v.filter((id) => ids.has(id)))] : []);
  // One custom day per date, the last one winning, as when the user adds a date
  // that is already listed.
  const byDate = new Map();
  for (const c of Array.isArray(input?.custom) ? input.custom : []) {
    if (isDate(c?.date)) byDate.set(c.date, { date: c.date, label: String(c.label ?? '').trim() });
  }
  const custom = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { country, disabled: list(input?.disabled), enabled: list(input?.enabled), custom };
}

export function isRuleOn(rule, settings) {
  if (settings.disabled.includes(rule.id)) return false;
  return rule.defaultOn || settings.enabled.includes(rule.id);
}

// Returns the settings with one rule switched, recording it only as a
// deviation from its default.
export function toggleRule(settings, id, on) {
  const rule = rulesOf(settings.country).find((r) => r.id === id);
  if (!rule) return settings;
  const disabled = settings.disabled.filter((x) => x !== id);
  const enabled = settings.enabled.filter((x) => x !== id);
  if (on && !rule.defaultOn) enabled.push(id);
  if (!on && rule.defaultOn) disabled.push(id);
  return { ...settings, disabled, enabled };
}

// The active rules over the given years, each with `date` (calendar date) and
// `off` (the day actually off once weekends are shifted). Holidays are shifted
// in date order, and a UK substitute never lands on another holiday: Christmas
// on a Sunday gives Tuesday, since Monday is already Boxing Day.
function observedDays(settings, years) {
  const { observe } = COUNTRIES[settings.country];
  const active = rulesOf(settings.country).filter((r) => isRuleOn(r, settings));
  const days = years
    .flatMap((year) =>
      active.filter((r) => !r.since || year >= r.since).map((rule) => ({ rule, date: ruleDate(rule, year) }))
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const taken = new Set(days.map((d) => d.date));
  for (const d of days) {
    d.off = d.date;
    if (!observe || !isWeekend(d.date)) continue;
    if (observe === 'nearest') {
      d.off = addDays(d.date, weekday(d.date) === 6 ? -1 : 1);
    } else {
      do d.off = addDays(d.off, 1);
      while (isWeekend(d.off) || taken.has(d.off));
      taken.add(d.off);
    }
  }
  return days;
}

// Every rule of the settings' country for one year, for display: its calendar
// date, whether it is on, and the day off when a weekend shifts it.
export function ruleDays(year, settings) {
  const s = normalizeHolidaySettings(settings);
  const observed = observedDays(s, [year]);
  return rulesOf(s.country).map((rule) => {
    const day = observed.find((d) => d.rule === rule);
    return { rule, on: isRuleOn(rule, s), date: ruleDate(rule, year), off: day?.off ?? null };
  });
}

// Active holidays of one year, date -> label. Neighbouring years are included
// because a shift can cross the new year: in the USA, New Year's Day on a
// Saturday is observed on the Friday before, in December. A custom day on a
// holiday's date keeps the custom label: it is the one the user chose.
export function holidaysFor(year, settings, words = HOLIDAY_WORDS) {
  const s = normalizeHolidaySettings(settings);
  const word = words[COUNTRIES[s.country].observe];
  const out = new Map();
  for (const d of observedDays(s, [year - 1, year, year + 1])) {
    if (!d.off.startsWith(`${year}-`) || out.has(d.off)) continue;
    out.set(d.off, d.off === d.date ? d.rule.label : `${d.rule.label} (${word})`);
  }
  for (const c of s.custom) {
    if (c.date.startsWith(`${year}-`)) out.set(c.date, c.label || words.dayOff);
  }
  return out;
}

export function observedWord(country, words = HOLIDAY_WORDS) {
  return words[COUNTRIES[country]?.observe] ?? '';
}

// Every date from `from` to `to` inclusive, minus weekends and holidays unless
// asked for. Skipped dates are returned too, so the user sees why a day is
// missing; `words` are passed on to holidaysFor.
export function rangeDates(
  from,
  to,
  { weekends = false, holidays = false, words = HOLIDAY_WORDS } = {},
  settings = DEFAULT_HOLIDAY_SETTINGS
) {
  const dates = [];
  const skipped = [];
  if (!isDate(from) || !isDate(to) || from > to) return { dates, skipped };
  const byYear = new Map();
  const holidayOf = (date) => {
    const year = +date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, holidaysFor(year, settings, words));
    return byYear.get(year).get(date);
  };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const holiday = holidayOf(d);
    if (!weekends && isWeekend(d)) skipped.push({ date: d, reason: 'weekend' });
    else if (!holidays && holiday) skipped.push({ date: d, reason: holiday });
    else dates.push(d);
  }
  return { dates, skipped };
}
