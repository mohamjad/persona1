# persona1 Extension

This is the Chrome extension surface for persona1.

Key responsibilities:

- detect live compose contexts
- render the sidebar chess tree UI
- store local persona and observations
- enforce the free usage gate locally
- sync to the backend only when auth is present

Important runtime files:

- `background.js`
  service worker, API calls, storage coordination, checkout trigger
- `content-script.js`
  page detection, compose snapshotting, draft insertion
- `sidepanel.html` / `sidepanel.js`
  main product UI
- `popup.html` / `popup.js`
  onboarding and local settings
- `lib/extractors/*`
  isolated platform extraction logic

Load in Chrome via:

1. `chrome://extensions`
2. enable Developer Mode
3. `Load unpacked`
4. select [apps/persona1-ext](/C:/Users/moham/persona1/apps/persona1-ext)
