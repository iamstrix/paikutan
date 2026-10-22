# tromPOW: final evidence (paikutan battle integration, 2026-10-22)

## What ran

| Check | Command | Result |
|---|---|---|
| Typecheck + production build | `npm run build` | Pass. Two pages. The game is 726 KB JS (198 KB gzip); the phone page is about 38 KB with no three.js, plus the Supabase client (215 KB, loaded only when it connects) |
| Battle sim tests (paikutan port) | `tests/sim.spec.ts` | 6/6 pass: seat frames, a lone top toppling, steer-out ring-out, a 4-way bot battle resolving, Kidlat hitting the nearest rival, determinism |
| Lobby → hub → WASD | `tests/visual.spec.ts` | Pass |
| Bot playtest (full match) | `tests/bot-playtest.spec.ts` | Pass. hub → charge → countdown → throw → fight → roundEnd → podium, 6 rounds, 0 errors |
| Real mouse gestures | Headless Chrome: drew circles on the pad (8.0 laps), swiped up to throw, steered with W | Spin locked in, top thrown with the hand-to-ring flight, steering moved it (out of the ring when overdone), round resolved; 0 errors |
| Phone pairing + play | Headless Chrome, host tab + 390×844 phone tab over `?net=local` | QR link opened; host showed "Nakakonekta"; the phone drew circles (7.7 laps), swiped to throw, steered with the pad; host reached fight; 0 errors |
| Canvas inspector | `node scripts/inspect-threejs-canvas.mjs --manifest artifacts/evidence.json --seed 42` | 7/7 PASS (lobby, hub, charge, throw, fight, dusk, podium) on hardware GPU, within budget |
| Evidence coverage | `check_evidence.py --manifest artifacts/evidence.json` | Passed: 10 artifacts (run `pass-11`) |
| Supabase online rooms | Not run | No Supabase project yet: needs your `.env`. Only the BroadcastChannel transport was exercised |
| Real phone sensors (tilt/flick) | Not run | Needs HTTPS and a physical phone; tested with swipe and joystick fallbacks only |

## Paikutan battle integration (latest)

Source of truth: [jmdgg/paikutan](https://github.com/jmdgg/paikutan) (`js/sim.js`, `js/input.js`, `js/engine.js`, `js/data.js`, `js/net.js`).

- **Sim (`src/sim/TrompoSim.ts`):** paikutan's physics in its own units (5 m arena), drawn at `WORLD_SCALE` 0.56 into the 2.8 m bilog:
  - tilt steering that costs spin, grip that scales with spin
  - the ground dipping to the centre, wobble from hits and low spin, topple at wobble 1
  - rim-grind clash impulses and late drain after 45 s
  - Generalised to N tops: seat-angle frames, all-pairs collisions with **per-pair** hit cooldowns (paikutan's per-top cooldown breaks with three or more), powers aimed at the nearest rival, last-top-standing settlement.
- **Round flow (`RoundManager`):** paikutan's charge (25 s window, 3 s drawing) → countdown (Isa, Dalawa, Tatlo) → throw (3 s, weak auto-throw) → fight. Bots are paikutan's CPU pointed at the nearest rival. Bot Kidlat, Tikbalang and Bakunawa are telegraphed 0.45 s ahead (the danger arrow).
- **Content:** Lakas/Tagal/Tatag on tromPOW's six characters; Kidlat, Tikbalang, Agimat, Diwata and Bakunawa with VFX (lightning bolt, dash dust, shield bubble, sparkles, eclipse ring); the asong gala runs through and bumps tops.
- **Input:** `BattleInput` seam. Desktop fallbacks: mouse circle pad, swipe-up throw, WASD steer, Space power. The phone page uses paikutan's gestures.
- **Network:** PeerJS removed. Supabase Realtime broadcast (your project via `.env`) or `BroadcastChannel` (`?net=local`), with heartbeat presence (players 7 s, phones 7 s). Phone messages are authenticated by a per-player pairing key.
- Captures: [pairing QR](pass-11/host-pair-qr.png) · [phone PAIKOT](pass-11/phone-paikot.png) · [phone LABAN](pass-11/phone-laban.png) · [charge](pass-11/desktop-charge.png) · [throw](pass-11/desktop-throw.png) · [fight](pass-11/desktop-fight.png).

## HUD animation pass (latest)

- **Score chips are persistent now** (they used to be rebuilt as HTML on every change, which would kill any animation):
  - They slide in one after another when the match starts and deal back in at each round.
  - They shake when that player's top takes a hit, and shake then grey out when it's out.
  - A star pops (scale and rotate) and the chip flashes gold on a round win.
- **Spin meter:** it slides up when your top lands. On a clash involving your top it shakes and flashes red, and a red **damage bar** trails the fill down after a 250 ms delay, fighting-game style.
- **Podium reveal:** the card drops in with a little swing, then places appear from last to first (#4, #3, #2, about 0.5 s apart). The champion row pops in with a crown, and only then does the "hari ng trompo" line appear. Each reveal plays a tick, and the win jingle plays for 1st.
- **Throw widget and hint** slide or fade in instead of popping. All motion uses the Web Animations API on the separate `translate`/`scale` properties, so it never fights the layout transforms.
- `prefers-reduced-motion` turns every HUD animation off, and the podium then reveals all at once.
- Motion evidence: [podium reveal sequence + chip slide-in](pass-11/hud-podium-reveal.png) (0.15 / 0.9 / 1.5 / 2.05 / 2.9 s, then a round intro) · [spin meter after a hit](pass-11/hud-spin-damage.png) (90 ms steps: red flash, then the damage bar).
- The inspector state captures are new (pass-10). The 3D VFX frames (clash, telegraph, dusk, face) were carried over from pass-9; that code didn't change in this pass.

## Dusk lighting pass

- **Window glow:** jalousie glass, the nipa hut's gasera window and the lit sari-sari interior are lamp materials that glow as evening comes. Houses alternate warm bombilya and cool fluorescent; the barangay hall is fluorescent. Each lit window throws an additive pool of light on the ground. The pools reuse the puddle decal's soft mask, so no new textures.
- **Practical lights:** 8 point lights, dark by day:
  - the store tube, which flickers like an old fluorescent
  - the parol at the shed
  - the barangay hall door
  - a basketball-court floodlight on its own pole
  - two streetlights
  - the videoke glow
  - **a bombilya hung over the bilog** on a wire from the mango tree to the fiesta pole

  The bombilya is a gameplay fix: in the first dusk capture the tops weren't readable after 6 PM. Every bulb has an additive halo and a light pool.
- **Alitaptap:** fireflies blink up around the mango tree and the gumamela bushes as dusk deepens.
- **Danger telegraph:**
  - Bot palos now **commit 0.45 s before they fire**, with the direction locked, so the target can palo out of the way (`RoundManager.WINDUP`, sent to clients as a `windup` event). The deterministic sim and its tests are unchanged.
  - Every client sees a red arrow on the dirt that charges toward the target.
  - If it's aimed at you, a double warning blip plays and a red ring pulses under your top.
  - The ring also glows faintly whenever a stronger rival is within 1.8 m.
- **Fixes found on the way:**
  - The store tube light sat 0.6 m from its sign and blew it out at dusk; it moved down and forward.
  - The store halo was oversized; it was shrunk.
  - The podium card could stay up if a round started straight after the podium; it now hides on every non-podium phase.
- **New test state `dusk`:** a spin round at 6:10 PM, so evening lighting is part of every inspector run.

Frames: [telegraph](pass-11/vfx-telegraph.png) · [dusk play](pass-11/vfx-dusk-play.png) · [dusk, inspector](pass-11/desktop-dusk.png).

## Hero detail pass

- **Trompos:** lacquered `MeshPhysicalMaterial` (clearcoat 0.6) over turned-wood grain. The paint is chipped, and one **shared** procedural grain normal map serves every top. The lathe went from 14 to 20 segments.
- **GI roofs:** real corrugated sheet geometry with ridge caps and an old tire on top.
- **Characters:** mitten hands; tsinelas with bare feet and a V-strap; sneakers; boots.
- **Faces** react to state: neutral, happy (win or throw), sad (loss), dizzy (tumble).

Close-up: [happy face, glasses, tsinelas](pass-11/detail-face-happy.png).

## Visual pass 2

- Baked weathering, 11 procedural decal kinds, aged posters and graffiti ("BAWAL ANG UTANG! Bukas pwede.", "J ♥ M forever 2009"), and ink outlines on characters and tops.
- Soft dust and additive sparks, impact rings, comic bursts (PAK!/POW!/TSUG!/BLAG!), the pisi cord with a whip trail, spin blur, contact shadows, confetti.

## Captures (run pass-11, 1280×720, desktop scope)

| State | Screenshot | entropy (pass-2 → 11) | edges (pass-2 → 11) |
|---|---|---|---|
| lobby | [png](pass-11/desktop-lobby.png) | 5.89 → 5.90 | 0.395 → 0.406 |
| hub | [png](pass-11/desktop-hub.png) | 5.63 → 5.85 | 0.471 → 0.507 |
| throw | [png](pass-11/desktop-throw.png) | 5.21 → 5.49 | 0.426 → 0.460 |
| spin | [png](pass-11/desktop-spin.png) | 5.16 → 5.50 | 0.427 → 0.464 |
| dusk (new) | [png](pass-11/desktop-dusk.png) | — → 5.31 | — → 0.279 (contrast 223.8) |
| podium | [png](pass-11/desktop-podium.png) | 4.62 → 5.77 | 0.235 → 0.294 |

Live frames: [clash](pass-11/vfx-clash.png) · [telegraph](pass-11/vfx-telegraph.png) · [dusk play](pass-11/vfx-dusk-play.png).

Budget 300 calls / 750k tris / 300 geometries / 60 textures. Peak, pass-2 → pass-9: calls 101 → 235 (lobby; 182 in play), geometries 149 → 274, textures 26 → 57. The dusk state uses 155 calls and 53 textures. **This pass added no textures.** Its cost is 6 more point lights (8 in total, a per-fragment cost on every lit material, fine on desktop GPUs, worth cutting for mobile) and about 20 geometries.

## Visual scorecard

| Category | pass-2 | pass-5 | pass-6 | pass-9 | pass-10 | Evidence |
|---|---|---|---|---|---|---|
| Art direction | 2 | 2.5 | 2.5 | 2.5 | 2.5 | Comic bursts, ink outlines, storytelling decals, painted-sign UI; the evening barangay has its own mood |
| Hero (trompo + avatars) | 2 | 2.5 | 3 | 3 | 3 | Lacquered grained tops; characters with reactive faces, hands, footwear |
| Obstacles (rival tops, ring) | 2 | 2 | 2 | 2.5 | 2.5 | Telegraphed rival palos (charging arrow), a danger ring for the target, a proximity warning; the threat reads by shape and motion, not only colour |
| Interactables (throw/palo) | 2 | 2.5 | 2.5 | 2.5 | 2.5 | Wind gauge + beat meter, reticle, string payout, palo ring |
| World | 2 | 2.5 | 2.5 | 2.5 | 2.5 | Layered world, decals, roofs; dusk adds window glow and lit landmarks |
| Materials | 1.5 | 2 | 2.5 | 2.5 | 2.5 | Physical hero material, corrugated geometry, weathering, decals, emissive window roles |
| Lighting | 2 | 2 | 2 | 2.5 | 2.5 | Golden hour into dusk with 8 practicals, halos, light pools, window glow, a lit play area at night, a flickering tube |
| VFX/motion | 1.5 | 2.5 | 2.5 | 2.5 | 2.5 | Event-driven pooled effects plus telegraph arrows and alitaptap |
| UI/HUD | 2 | 2 | 2 | 2 | 2.5 | Genre HUD with motion: chips deal in, shake on hits, grey out, star pop; spin damage bar; staged podium reveal; reduced-motion fallback |
| Performance evidence | 2 | 2.5 | 2.5 | 2.5 | 2.5 | Per-state metrics across passes, budget tradeoffs, the `dusk` state in the inspector |

**Average 2.55; every category ≥ 2.5 except Hero at 3.** Premium threshold met. These are my own scores; with Hero at 2.5 the average is 2.5. No automatic failure stands at 1280×720.

**Next margin (showcase needs six categories at 3):** richer character models, layered world density, cinematic camera beats. This is now well beyond the scope of a finals project.

## Known limitations
- P2P has no TURN relay, so strict networks may fail; not tested across two machines. The `windup` event hasn't been exercised over the network yet.
- No host migration; client release timing isn't latency-compensated.
- Barks use speech synthesis until recordings are added.
- Textures are at 57/60: pack posters into an atlas before adding more unique canvases.
- 8 point lights: cut to 3–4 (bombilya, store, streetlights) for a future mobile build.
- Tests and the inspector use the installed Chrome (`PW_CHANNEL`), because Playwright's chromium-1223 doesn't start on this Windows 10 machine.
