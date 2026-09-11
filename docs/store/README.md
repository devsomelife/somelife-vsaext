# Store Assets

Screenshots for the Chrome Web Store and addons.mozilla.org listings, at
1280x800.

| File | Shows |
| --- | --- |
| `store-1-tracking.png` | The tracking page: a month of entries, totals, the inject action. |
| `store-2-dropdown.png` | Before and after of the dropdown widening. |

All client and project names are invented (NORTHWIND TRADING, ATLAS
LOGISTIQUE, MERIDIAN SANTE). A public listing must never carry real customer
data, so regenerate rather than screenshotting a live session.

Regenerate with:

```bash
python3 docs/store/render-screenshots.py
```

Both stores use `icons/icon128.png` as the icon.
