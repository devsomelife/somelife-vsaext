import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStatus, groupByDay, summarizeDays, isComplete, rangeEntries } from '../src/shared/store.js';

test('an internal activity row is complete without a project, a client row still needs one', () => {
  const base = { date: '2026-09-07', days: 1, note: '' };
  assert.equal(isComplete({ ...base, client: 'Alternance Ecole', project: '', internal: true }), true);
  assert.equal(isComplete({ ...base, client: '', project: '', internal: true }), false);
  assert.equal(isComplete({ ...base, client: 'NORTHWIND TRADING', project: '' }), false);
  assert.equal(isComplete({ ...base, client: 'NORTHWIND TRADING', project: 'BS-99-000112 [Lot 1]' }), true);
});

const entry = (date, days, project = 'BS-99-000112 [Lot 1]') => ({
  date, days, project, client: 'NORTHWIND TRADING', note: '',
});

test('entries of the same day are grouped in date order with the day total', () => {
  const days = groupByDay([
    entry('2026-09-04', 1),
    entry('2026-09-03', 0.5),
    entry('2026-09-03', 0.25, 'BS-99-000087 [Run]'),
  ]);
  assert.deepEqual(
    days.map((d) => [d.date, d.entries.length, d.total, d.status]),
    [
      ['2026-09-03', 2, 0.75, 'partial'],
      ['2026-09-04', 1, 1, 'complete'],
    ]
  );
});

test('a day keeps its entries in their original order', () => {
  const first = entry('2026-09-03', 0.5, 'first');
  const second = entry('2026-09-03', 0.5, 'second');
  const [day] = groupByDay([first, second]);
  assert.equal(day.entries[0], first);
  assert.equal(day.entries[1], second);
});

test('fractions that add up to one day count as complete', () => {
  const eighths = Array.from({ length: 8 }, () => entry('2026-09-05', 0.125));
  assert.equal(groupByDay(eighths)[0].status, 'complete');
  const tenths = Array.from({ length: 10 }, () => entry('2026-09-06', 0.1));
  assert.equal(groupByDay(tenths)[0].status, 'complete');
});

test('a day is partial below one day and over above it', () => {
  assert.equal(dayStatus(0), 'partial');
  assert.equal(dayStatus(0.875), 'partial');
  assert.equal(dayStatus(1), 'complete');
  assert.equal(dayStatus(1.125), 'over');
});

test('the month summary counts days per status', () => {
  const days = groupByDay([
    entry('2026-09-01', 1),
    entry('2026-09-02', 0.5),
    entry('2026-09-03', 1),
    entry('2026-09-03', 0.25),
  ]);
  assert.deepEqual(summarizeDays(days), { complete: 1, partial: 1, over: 1 });
});

test('an empty month has no day groups', () => {
  assert.deepEqual(groupByDay([]), []);
  assert.deepEqual(summarizeDays([]), { complete: 0, partial: 0, over: 0 });
});

test('a range makes one independent entry per date', () => {
  const rows = rangeEntries(
    { client: 'NORTHWIND TRADING', project: 'BS-99-000112 [Lot 1]', projectCode: '10001|ATE', internal: false, days: 0.5, note: 'n' },
    ['2026-09-01', '2026-09-02']
  );
  assert.deepEqual(rows[0], {
    date: '2026-09-01', client: 'NORTHWIND TRADING', project: 'BS-99-000112 [Lot 1]',
    projectCode: '10001|ATE', days: 0.5, note: 'n',
  });
  assert.equal(rows[1].date, '2026-09-02');
  assert.notEqual(rows[0], rows[1]);
  const internal = rangeEntries({ client: 'Formation', project: '', internal: true, days: 1 }, ['2026-09-01']);
  assert.equal(internal[0].internal, true);
  assert.equal(isComplete(internal[0]), true);
});
