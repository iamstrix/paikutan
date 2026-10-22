# tromPOW: game progress

## Intent and constraints
A browser "friendslop" party game that brings back trompo in a rural barangay at golden hour. Finals project, 2–4 weeks. Procedural art plus free audio; no paid APIs.

**Battle mechanic source of truth: [paikutan](https://github.com/jmdgg/paikutan)** (since 2026-10-22). Its sim, controls, stats, powers and stray dog are ported and generalised from 1v1 to 2–6 players. Phones pair to each player's own screen as motion controllers (QR). Transport is Supabase Realtime broadcast (the user's own project, via `.env`), with BroadcastChannel `?net=local` for offline tabs. Host-authoritative; bots fill seats.

## Design brief
- **Promise:** be the batang kalye legend; your trompo is the last one spinning.
- **Primary verbs (paikutan):** paikot (draw circles → spin power + steadiness), bitaw (tilt aim + flick), laban (tilt steering that costs spin, plus a charged mythic power). **Secondary:** walk, dash-bump, quick-chat.
- **Every 5–30 s:** wind, throw, survive clashes, choose when to palo.
- **Across a match:** first to 3 round wins, or sunset (each round +25 min from 3:30 PM; dusk at 6:00 PM). After 45 s spin drains twice as fast (paikutan's late drain); 90 s cap.
- **Lose / learn / restart:** out by toppling (wobble reaches 1, or spin runs out) or by leaving the ring. Sloppy circles mean low steadiness, so hits shake you more. The next round starts about 4 s later.
- **Better players:** clean wraps, release on the beat, palo only with the spin advantage, and dash back to the centre when near the edge.
- **Non-goals (v1):** betting, voice chat (use Discord), mobile, real ragdoll physics, randomized maps.

## Core loop contract
Players **throw their trompo into the bilog** to be **the last one spinning**, while **spin decay, clashes and the shrinking ring** create risk. Winning gives **a star and the round**; losing means **spectating, bumping people and heckling** until the next throw.

Proven in code: verb → `DesktopThrowInput` (Space/click + mouse); objective → bilog ring + scoreboard spin bars; pressure → `TrompoSim` decay/clash/shrink; reward → `wins` and the clock advancing; failure → "LABAS!"/"PATAY!" banners plus the toppled 3D top; restart → `roundEnd` (4 s) → `throw`.

## Level plan: Brgy. Maligaya (~60 × 35 m playable)
- **Centre:** the dirt bilog (2.8 m radius) in front of **Aling Nena's sari-sari store**, under a mango tree. Pebble ring at 5.5 m = the ready zone.
- **Ring of landmarks:** pastel concrete houses with GI roofs and jalousie windows, nipa huts on stilts, barangay hall with a waving PH flag, half basketball court ("Kap. Bong" backboard), waiting shed, jeepney, two tricycles, poso, videoke with monobloc chairs, sorbetes cart, sampayan, banderitas on bamboo poles, power lines with spaghetti wiring, carabao, askal, roaming chickens, fiesta tarpaulin.
- **Background:** rice paddies to the south, coconut groves, hazy mountains.
- **Flow:** spawn on the road → walk into the pebble ring → when every human is inside, a 3 s countdown (the host can press Enter) → seats around the bilog.
- **Lighting:** sun, sky, fog and lamp glow keyed to the match clock (3:00 → 6:30 PM). The fluorescent tube and parol turn on at dusk.

## Architecture
See the plan file. Key files: `src/sim/TrompoSim.ts` (pure physics), `src/game/RoundManager.ts` (host authority), `src/net/Net.ts` (PeerJS), `src/game/Game.ts` (orchestrator), `src/world/*` (barangay), `src/entities/*` (characters, trompo view, chickens), `src/ui/Ui.ts`, `src/input/*` (device seam).

## Done
- Sim + 4 unit tests (decay, ring-out by clash, wild-aim ring-out, determinism).
- Round flow hub → throw → spin → roundEnd → podium → hub, with bots and a dusk timer.
- 6 procedural characters, the full barangay kit, the time-of-day atmosphere.
- PeerJS host/join, verified across two browser tabs (same eliminations and winner on both sides).
- A worker-timer fallback so a backgrounded host tab keeps simulating.
- Procedural SFX/ambience, speech-synthesis barks, drop-in audio folder.

- Visual pass 2: baked weathering, 11 decal kinds plus aged posters, ink outlines, soft dust/sparks, impact rings, comic bursts, the pisi cord and whip trail, spin blur, contact shadows, confetti. Scorecard 1.9 → 2.3 (premium threshold met, no margin); see `final-evidence.md`.

- Hero detail pass: lacquered grained tops (shared normal map), corrugated GI roofs, hands, tsinelas straps, happy/sad/dizzy faces. Scorecard 2.4 (pass-6).

- Dusk lighting pass: window glow + light pools, 8 practical lights incl. the bombilya over the bilog, halos, alitaptap, bot palo wind-up telegraph + danger ring. Scorecard 2.5 (pass-9).

- HUD animation pass: persistent chips (deal-in, hit shake, out grey, star pop), spin damage bar + hit shake, staged podium reveal, reduced-motion fallback. Scorecard 2.55 (pass-10).

- Paikutan integration: ported battle sim (N-way), round flow charge → countdown → throw → fight, stats, 5 powers + telegraphed bot powers, stray dog, desktop fallbacks, phone controller page + QR pairing, Supabase/BroadcastChannel transport. 8/8 tests; phone pairing verified over `?net=local`.

## Known gaps / next
- Record barks and add a CC0 ambience loop (`public/audio/README.md`).
- Create the Supabase project and put its keys in `.env`; test a real phone over HTTPS (deploy).
- If the host leaves, the match ends (no host migration).
- Client release timing isn't latency-compensated (~50 ms disadvantage).
- Cut point lights to 3-4 for mobile. Textures are at 57/60, so atlas the posters before adding more.
