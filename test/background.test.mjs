import { test } from 'node:test';
import assert from 'node:assert/strict';

// background.js registers its listeners when imported, so the chrome API is
// stubbed first. The scripting stub rejects a duplicate script id the way the
// browsers do, and yields between steps so concurrent calls can interleave.
const tick = () => new Promise((resolve) => setImmediate(resolve));
const listeners = {};
const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
const registered = new Map();
const calls = [];
const store = { timesheetUrl: 'https://vsa.example.com/o_services/timesheetspivot/' };
let granted = true;

globalThis.chrome = {
  runtime: {
    onInstalled: event('onInstalled'),
    onStartup: event('onStartup'),
    onMessage: event('onMessage'),
    openOptionsPage() {},
  },
  action: { onClicked: event('onClicked') },
  permissions: {
    onAdded: event('onAdded'),
    onRemoved: event('onRemoved'),
    contains: async () => granted,
  },
  storage: {
    local: {
      get: async (key) => (key in store ? { [key]: store[key] } : {}),
      set: async (items) => Object.assign(store, items),
    },
  },
  scripting: {
    getRegisteredContentScripts: async ({ ids }) => {
      calls.push('get');
      await tick();
      return ids.filter((id) => registered.has(id)).map((id) => registered.get(id));
    },
    unregisterContentScripts: async ({ ids }) => {
      calls.push('unregister');
      await tick();
      for (const id of ids) registered.delete(id);
    },
    registerContentScripts: async (scripts) => {
      calls.push('register');
      await tick();
      for (const script of scripts) {
        if (registered.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`);
        registered.set(script.id, script);
      }
    },
  },
};

const { syncRegistration } = await import('../src/background.js');

function reset() {
  registered.clear();
  calls.length = 0;
  granted = true;
}

test('concurrent registrations run one at a time and leave a single script', async () => {
  reset();
  const results = await Promise.all([syncRegistration(), syncRegistration()]);
  assert.deepEqual(results.map((r) => r.registered), [true, true]);
  assert.equal(registered.size, 1);
  assert.deepEqual(calls, ['get', 'register', 'get', 'unregister', 'register']);
});

test('site access granted or revoked outside the options page re-syncs registration', async () => {
  reset();
  await listeners.onAdded();
  assert.equal(registered.size, 1);
  granted = false;
  await listeners.onRemoved();
  assert.equal(registered.size, 0);
});

test('a failed registration does not block the next one', async () => {
  reset();
  const original = chrome.scripting.registerContentScripts;
  chrome.scripting.registerContentScripts = async () => {
    throw new Error('registration refused');
  };
  await assert.rejects(syncRegistration(), /registration refused/);
  chrome.scripting.registerContentScripts = original;
  const result = await syncRegistration();
  assert.equal(result.registered, true);
  assert.equal(registered.size, 1);
});
