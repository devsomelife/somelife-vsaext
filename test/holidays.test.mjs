import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  easterSunday,
  holidaysFor,
  rangeDates,
  toggleRule,
  isRuleOn,
  isWeekend,
  addDays,
  isDate,
  normalizeHolidaySettings,
  holidayDefaults,
  nthWeekday,
  ruleDays,
  FRENCH_RULES,
  DEFAULT_HOLIDAY_SETTINGS,
} from '../src/shared/holidays.js';

const defaults = normalizeHolidaySettings(DEFAULT_HOLIDAY_SETTINGS);

test('Easter Sunday for known years', () => {
  assert.equal(easterSunday(2024), '2024-03-31');
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2038), '2038-04-25');
});

test('the 11 French national holidays are on by default, Alsace-Moselle days are not', () => {
  const days = holidaysFor(2026, defaults);
  assert.deepEqual([...days.keys()].sort(), [
    '2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25',
    '2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25',
  ]);
  assert.equal(days.get('2026-05-14'), 'Ascension');
  assert.equal(days.has('2026-04-03'), false);
  assert.equal(days.has('2026-12-26'), false);
});

test('rules toggle as deviations from their default', () => {
  let s = toggleRule(defaults, 'whit-monday', false);
  assert.deepEqual(s.disabled, ['whit-monday']);
  assert.equal(holidaysFor(2026, s).has('2026-05-25'), false);
  s = toggleRule(s, 'whit-monday', true);
  assert.deepEqual(s.disabled, []);

  s = toggleRule(defaults, 'good-friday', true);
  assert.deepEqual(s.enabled, ['good-friday']);
  assert.equal(holidaysFor(2026, s).get('2026-04-03'), 'Vendredi saint (Alsace-Moselle)');
  const rule = FRENCH_RULES.find((r) => r.id === 'good-friday');
  assert.equal(isRuleOn(rule, toggleRule(s, 'good-friday', false)), false);
});

test('custom days off count only in their own year', () => {
  const s = normalizeHolidaySettings({ custom: [{ date: '2026-05-15', label: ' Pont ' }, { date: '2027-05-07' }] });
  const days = holidaysFor(2026, s);
  assert.equal(days.get('2026-05-15'), 'Pont');
  assert.equal(days.has('2027-05-07'), false);
  assert.equal(holidaysFor(2027, s).get('2027-05-07'), 'Day off');
});

test('bad stored settings fall back to defaults', () => {
  assert.deepEqual(normalizeHolidaySettings(undefined), defaults);
  assert.deepEqual(
    normalizeHolidaySettings({ disabled: ['nope', 'labour', 'labour'], enabled: 'x', custom: [{ date: '2026-02-30' }, null] }),
    { country: 'fr', disabled: ['labour'], enabled: [], custom: [] }
  );
});

test('the issue example: Tuesday to Saturday gives four weekdays', () => {
  const { dates, skipped } = rangeDates('2026-09-01', '2026-09-05');
  assert.deepEqual(dates, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  assert.deepEqual(skipped, [{ date: '2026-09-05', reason: 'weekend' }]);
});

test('weekends are kept when asked', () => {
  assert.equal(rangeDates('2026-09-01', '2026-09-06', { weekends: true }).dates.length, 6);
});

test('bank holidays are skipped by default and kept when asked', () => {
  const skipped = rangeDates('2026-05-11', '2026-05-15', {}, defaults);
  assert.deepEqual(skipped.dates, ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-15']);
  assert.deepEqual(skipped.skipped, [{ date: '2026-05-14', reason: 'Ascension' }]);
  assert.equal(rangeDates('2026-05-11', '2026-05-15', { holidays: true }, defaults).dates.length, 5);
});

test('a range across the new year resolves each year holidays', () => {
  const { dates, skipped } = rangeDates('2026-12-24', '2027-01-04', {}, defaults);
  assert.deepEqual(dates, ['2026-12-24', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-04']);
  assert.deepEqual(
    skipped.filter((s) => s.reason !== 'weekend').map((s) => s.date),
    ['2026-12-25', '2027-01-01']
  );
});

test('an inverted or invalid range is empty', () => {
  assert.deepEqual(rangeDates('2026-09-05', '2026-09-01'), { dates: [], skipped: [] });
  assert.deepEqual(rangeDates('', '2026-09-01'), { dates: [], skipped: [] });
});

test('date helpers stay on calendar days across DST changes', () => {
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(isWeekend('2026-03-29'), true);
  assert.equal(isWeekend('2026-03-30'), false);
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2028-02-29'), true);
});

const uk = holidayDefaults('uk');
const us = holidayDefaults('us');

test('settings saved before countries existed stay French, unknown countries fall back to France', () => {
  assert.equal(normalizeHolidaySettings({ disabled: ['whit-monday'] }).country, 'fr');
  assert.equal(normalizeHolidaySettings({ country: 'de' }).country, 'fr');
  // Rule ids are checked against the country's own list.
  assert.deepEqual(normalizeHolidaySettings({ country: 'uk', disabled: ['boxing', 'ascension'] }).disabled, ['boxing']);
});

test('nth and last weekday of a month', () => {
  assert.equal(nthWeekday(2026, 5, 1, 1), '2026-05-04');
  assert.equal(nthWeekday(2026, 5, 1, -1), '2026-05-25');
  assert.equal(nthWeekday(2026, 11, 4, 4), '2026-11-26');
  assert.equal(nthWeekday(2026, 8, 1, -1), '2026-08-31');
});

test('UK defaults are the England and Wales bank holidays, with substitute days', () => {
  const days = holidaysFor(2026, uk);
  assert.deepEqual([...days.keys()].sort(), [
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25',
    '2026-08-31', '2026-12-25', '2026-12-28',
  ]);
  assert.equal(days.get('2026-12-28'), 'Boxing Day (substitute day)');
});

test('a UK substitute day never lands on another holiday', () => {
  // Christmas on a Sunday: Boxing Day stays Monday, Christmas moves to Tuesday.
  const y2022 = holidaysFor(2022, uk);
  assert.equal(y2022.get('2022-12-26'), 'Boxing Day');
  assert.equal(y2022.get('2022-12-27'), 'Christmas Day (substitute day)');
  assert.equal(y2022.get('2022-01-03'), "New Year's Day (substitute day)");
  // Christmas on a Saturday: Monday and Tuesday.
  const y2021 = holidaysFor(2021, uk);
  assert.equal(y2021.get('2021-12-27'), 'Christmas Day (substitute day)');
  assert.equal(y2021.get('2021-12-28'), 'Boxing Day (substitute day)');
});

test('Scottish days are listed but off in the UK defaults', () => {
  let s = toggleRule(uk, 'st-andrew', true);
  s = toggleRule(s, 'jan-2', true);
  const days = holidaysFor(2022, s);
  assert.equal(days.get('2022-11-30'), "St Andrew's Day (Scotland)");
  // 1 and 2 January 2022 are a weekend: Monday 3 and Tuesday 4.
  assert.equal(days.get('2022-01-04'), '2nd January (Scotland) (substitute day)');
});

test('USA defaults are the federal holidays, weekends observed on the nearest weekday', () => {
  const days = holidaysFor(2026, us);
  assert.deepEqual([...days.keys()].sort(), [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03',
    '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  ]);
  assert.equal(days.get('2026-07-03'), 'Independence Day (observed)');
  assert.equal(holidaysFor(2026, toggleRule(us, 'black-friday', true)).get('2026-11-27'), 'Day after Thanksgiving');
});

test('a USA New Year on a Saturday is observed in the previous December', () => {
  assert.equal(holidaysFor(2021, us).get('2021-12-31'), "New Year's Day (observed)");
  assert.equal(holidaysFor(2022, us).has('2022-01-01'), false);
});

test('Juneteenth applies from 2021 only', () => {
  assert.equal(holidaysFor(2020, us).has('2020-06-19'), false);
  assert.equal(holidaysFor(2021, us).get('2021-06-18'), 'Juneteenth (observed)');
});

test('the rule list shows each rule with its day off', () => {
  const boxing = ruleDays(2026, uk).find((d) => d.rule.id === 'boxing');
  assert.deepEqual({ on: boxing.on, date: boxing.date, off: boxing.off }, { on: true, date: '2026-12-26', off: '2026-12-28' });
  const stAndrew = ruleDays(2026, uk).find((d) => d.rule.id === 'st-andrew');
  assert.equal(stAndrew.on, false);
  assert.equal(stAndrew.off, null);
});

test('a range skips the country holidays', () => {
  const { skipped } = rangeDates('2026-12-21', '2026-12-31', {}, uk);
  assert.deepEqual(
    skipped.filter((s) => s.reason !== 'weekend').map((s) => s.date),
    ['2026-12-25', '2026-12-28']
  );
});
