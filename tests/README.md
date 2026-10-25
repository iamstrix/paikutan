Run the game logic regressions with `npm test`.

Run `node tests/browser-audit.mjs` for Chromium integration checks. Set
`CHROME_PATH` if Chrome is installed somewhere other than the standard Windows
location. The first run caches pinned Three.js and QR dependencies from jsDelivr.
The script starts its own local server and headless browser and closes them when
finished. Screenshots and results go to `node_modules/.trumpo-check/audit/`.

The browser checks exercise actual concurrent touches, CPU removal, same-device
hosting, illustrated instructions, multiplayer hum and quick chat, room entry,
leave/rejoin, host shutdown, and phone host controls. Separate tabs represent
separate devices over BroadcastChannel. Animation timers remain active in those
tabs, and rendering resolution is reduced for software WebGL. These checks do
not exercise live Supabase delivery or physical motion sensors.
