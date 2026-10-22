# Paikutan: Trumpo Showdown

A 1v1 Filipino **trumpo** (spinning top) battle for DOST Level Up 3.0 (theme: Philippine Games and Sports).
A laptop/TV shows the 3D plaza as host and spectator screen; two phones are the controllers.

1. **Pick** a player (stats) and a trumpo (mythic power).
2. **Paikot!** Draw fast circles on the ring for 3 s: speed sets spin power, neatness sets steadiness.
3. **Bitaw!** Tilt to aim, flick the phone forward to throw (swipe up as a fallback).
4. **Laban!** Tilt to steer (costs a little spin), tap the power when charged. A trumpo that topples (*natumba*) or leaves the circle (*labas*) loses the round. Best of 3.

## Stack decision: GitHub Pages + Supabase Realtime (not localhost)

| | GitHub Pages + Supabase | Laptop localhost / LAN |
|---|---|---|
| Phone motion sensors (flick, tilt) | Work: HTTPS is a secure context | Blocked: `http://192.168.x.x` is not secure, so iOS and Chrome withhold motion events |
| Judges screening remotely | One public link | Not reachable |
| Venue Wi-Fi (client isolation, captive portals) | Phones can use mobile data | Phones often can't reach the laptop |
| Setup | No server; broadcast channels need no tables or migrations | Must run a server + self-signed certs |
| Latency | ~70 ms measured; host is authoritative so it's fine | Lower |

The desktop page runs the physics (`js/sim.js`) and is the single source of truth. Phones only send inputs and render 10 Hz snapshots.
For offline testing, add `?net=local` to the host URL. That uses `BroadcastChannel`, so the host and two `play.html` tabs on one PC can play without internet.

## Run locally

```sh
python -m http.server 8000
# host:      http://localhost:8000/index.html
# practice:  http://localhost:8000/index.html?practice
# CPU demo:  http://localhost:8000/index.html?demo   (full HUD; good for trailer footage)
# offline:   http://localhost:8000/index.html?net=local  then open the join link in 2 more tabs
# phone solo vs CPU: play.html?solo=1
```

## Deploy

Push to a GitHub repo, then go to Settings → Pages → deploy from branch (root). Open `https://<user>.github.io/<repo>/`.
The Supabase project (`js/config.js`) is the SingkaTibay one. Free projects pause after about a week of inactivity, so open the dashboard before demos.

## Files

- `js/sim.js`: trumpo physics (spin, wobble, clashes, powers, stray dog). Pure, testable in Node.
- `js/engine.js`: match flow (lobby → pick → rounds → champion) and the CPU opponent.
- `js/scene.js`: three.js plaza, lathe-modelled trumpos, effects.
- `js/controller.js` + `js/input.js`: phone/desktop controls (circle drawing, flick, swipe, tilt, joystick).
- `js/host.js` / `index.html`: host, spectator HUD, commentary, practice.
- `js/play.js` / `play.html`: phone controller.
- `js/audio.js`: all sound synthesized with WebAudio (kulintang-style gong loop, SFX). No audio files.
- `js/net.js`: Supabase broadcast or BroadcastChannel transport.

## Third-party (rendering/plumbing only, no game logic)

three.js r160 (MIT), supabase-js 2.117.3 (MIT), qrcode-generator 1.4.4 (MIT), Google Fonts Bungee and Nunito (OFL). All loaded from CDNs.
