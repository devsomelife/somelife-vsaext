// Goal 1: widen a line select on demand so its content is readable.
//
// Clicking a select widens it; it snaps back on blur or after a choice, so the
// grid layout is only disturbed while you are actually reading the list.

const WIDE = 'vsaext-wide';

function widen(el) {
  el.classList.add(WIDE);
}

function unwiden(el) {
  el.classList.remove(WIDE);
}

function isLineSelect(el) {
  return (
    el instanceof HTMLSelectElement &&
    el.classList.contains('selectTimesheetLine')
  );
}

function installWiden() {
  // Delegated, so lines added after load are covered without re-binding.
  document.addEventListener(
    'mousedown',
    (e) => {
      const el = e.target;
      if (!isLineSelect(el)) return;
      widen(el);
    },
    true
  );

  const shrink = (e) => {
    if (isLineSelect(e.target)) unwiden(e.target);
  };
  document.addEventListener('change', shrink, true);
  document.addEventListener('blur', shrink, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isLineSelect(e.target)) unwiden(e.target);
  }, true);
}

globalThis.VsaWiden = { installWiden };
