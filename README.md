# tromPOW!

A browser party game that brings back **trompo** in a rural barangay at golden hour. Draw circles to wind your trompo, flick it into the *bilog*, then steer and fire your mythic power. The last top spinning wins the round. Play solo with bots or online with up to 6 friends, and use your **phone as the trompo**.

The battle mechanic is ported from [paikutan](https://github.com/jmdgg/paikutan) (the source of truth): circle-draw spin, tilt-aim and flick throw, tilt steering that costs spin, wobble-to-topple, character stats, five mythic powers, and the stray dog. It's generalised here from 1v1 to 2–6 players.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5188.

- **Solo:** "Laro kasama ang bots".
- **Online:** one player clicks "Gumawa ng kwarto" and shares the 4-letter code; the others type it and press "Sumali". The host's browser runs the match.
- **Offline test on one PC:** add `?net=local` to every URL (host, players, phone pages). Tabs talk over `BroadcastChannel`, with no internet needed.

### Online rooms need your own Supabase project (free)

1. Create a project at supabase.com. Only **Realtime broadcast** is used: no tables, no auth.
2. Copy `.env.example` to `.env` and fill in the project URL and publishable key (Project Settings → API).
3. Restart `npm run dev`.

Free projects pause after about a week idle, so open the dashboard before a demo. Phone motion sensors need **HTTPS**, so deploy (see below) to use phones on real devices.

## Phone as your trompo

In the game, press **📱** (top right) and scan the QR with your phone. Then on the phone:

| Phase | Phone | Desktop fallback |
|---|---|---|
| **Paikot!** (spin) | Draw fast circles on the ring for 3 s: speed = power, neatness = steadiness | Same, with the mouse |
| **Bitaw!** (throw) | Tilt left/right to aim, **flick the phone forward** (or swipe up) | Drag the mouse up and let go (Space = medium throw) |
| **Laban!** (fight) | **Tilt to steer** (costs a little spin) or drag the pad; tap the **power** when charged | WASD / arrows steer, Space / E power |

A top that topples (*natumba*) or leaves the circle (*labas*) is out.

## Other controls

| | |
|---|---|
| WASD / arrows | Walk the barangay |
| Shift | Run (bump people to make them tumble) |
| Walk into the pebble ring | Ready up; the match starts when every player is inside |
| Enter (host) | Start now |
| 1–6 | Quick-chat heckles |
| `?debug` in the URL | Live tuning panel |

## Characters and trompos

Every character spends the same 9 points on **Lakas** (hit weight), **Tagal** (spin time) and **Tatag** (balance). Pick a trompo power: **Kidlat** (lightning strike), **Tikbalang** (dash), **Agimat** (shield), **Diwata** (restore spin), **Bakunawa** (reverse a rival's steering). Powers charge over time and from hits.

## Build and deploy

```bash
npm run build
```

`dist/` is static (two pages: `index.html` and `controller.html`) with relative paths. Upload it to Netlify, Vercel or GitHub Pages; HTTPS there makes phone motion work.

## Tests

```bash
npx playwright test
```

This runs the battle-sim unit tests, a lobby → hub walk check, and a full bot-played match from hub to podium. Tests use your installed Chrome; set `PW_CHANNEL=chromium` to use Playwright's bundled build.

## Docs

- [Design brief, loop, level plan, status](artifacts/game-progress.md)
- [Phone controller notes](artifacts/mobile-handoff.md)
- [Evidence and scorecard](artifacts/final-evidence.md)
- [Audio drop-in guide](public/audio/README.md)
