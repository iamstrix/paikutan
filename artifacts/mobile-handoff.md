# Phone controller (paikutan motion)

The phone is no longer a stub. A paired phone is a player's motion controller, using paikutan's gestures, the source of truth for the battle controls.

## How pairing works

1. Each player's game tab makes a random **pairing key** and shows a QR (📱 button) for `controller.html?room=CODE&pid=PLAYER&key=KEY` (plus `&net=local` in offline mode).
2. The phone joins the same room channel (Supabase broadcast, or `BroadcastChannel` with `?net=local`) and sends `pair`, then pings every 2 s.
3. The **host** accepts phone messages only when `pid` + `key` match (`Game.onPhone`, the trust boundary), and only `spin`, `throw`, `steer`, `ability` and `chat`. A phone that goes quiet for 7 s is unpaired.
4. The phone renders from the host's 12 Hz snapshots (phase, your spin, charge, inverted steering) and vibrates on hits, when you go out, and when you win.

Solo also opens a hidden room when the network is configured, so a phone can pair even without friends.

## Files

| File | Role |
|---|---|
| `src/input/gestures.ts` | Port of paikutan `input.js`: `CircleTracker`, `readSwipe`, `requestMotion`, `Motion` (tilt aim/steer, flick) |
| `src/controller/main.ts` + `controller.html` | Phone page: spin pad, throw view, fight view (tilt/joystick + power), quick-chat |
| `src/input/DesktopBattleInput.ts` | Desktop fallbacks behind the same `BattleInput` seam |
| `src/net/Net.ts` | `PhoneNet` (phone side), `HostNet.onPhone` (host side) |

## Gotchas

- **HTTPS only:** iOS and Chrome withhold motion events on plain HTTP (`http://192.168.x.x`). Deploy to Netlify/GitHub Pages or tunnel the dev server.
- **iOS permission:** `requestMotion()` runs inside the "Ikonekta" tap, as iOS requires.
- **Calibration:** tilt is re-zeroed at each throw and fight view; there's a "I-center ang tilt" button.
- **No sensor:** swipe up to throw and drag the pad to steer.
- **Bundle:** the phone page imports nothing from three.js (about 38 KB plus the Supabase client, which loads only when it connects).
