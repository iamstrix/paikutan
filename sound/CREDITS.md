# Paikutan sound credits

The five power textures below are edited from Freesound recordings whose source
pages were checked for CC0 on 2026-10-25. Public preview encodings are trimmed,
converted to mono, normalized, and faded for short game playback. Full source
URLs, preview URLs, cut positions, and file sizes are in `source-manifest.json`.
The files are rebuilt with `node sound/build-sfx.mjs` (Node and ffmpeg required).

| Game file | Source recording | Creator | License |
| --- | --- | --- | --- |
| `assets/audio/sfx/kidlat.mp3` | [200817 Thunder, pretty close crack 4pm.flac](https://freesound.org/people/TRP/sounds/567945/) | TRP | CC0 1.0 |
| `assets/audio/sfx/tikbalang.mp3` | [HorseGallop1.wav](https://freesound.org/people/gbnelso/sounds/684446/) | gbnelso | CC0 1.0 |
| `assets/audio/sfx/agimat.mp3` | [MUSCChim_Atonal Crystal Chime Texture 1_EM](https://freesound.org/people/newlocknew/sounds/772279/) | newlocknew | CC0 1.0 |
| `assets/audio/sfx/diwata.mp3` | [WOODEN WINDCHIMES.wav](https://freesound.org/people/Alex_hears_things/sounds/412416/) | Alex_hears_things | CC0 1.0 |
| `assets/audio/sfx/bakunawa.mp3` (growl) | [Deep Monster Growl](https://freesound.org/people/uagadugu/sounds/222523/) | uagadugu | CC0 1.0 |
| `assets/audio/sfx/bakunawa.mp3` (gong answer) | [T'boli Tribe South Cotabato](https://freesound.org/people/Peligro8/sounds/797987/) | Peligro8 | CC0 1.0 |

Bakunawa's gong answer is excerpted from Peligro8's recording described as T'boli
kulintang music from South Cotabato, Mindanao. This credit preserves the source's
cultural identification; the excerpt is separate from the game's synthesized
kulintang-style music.

[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) permits copying,
adaptation, and redistribution. Creator credits are retained voluntarily.

All other effects, continuous spin/winding textures, and the adaptive music are
procedural WebAudio synthesis authored for this project. The existing Filipino
quick-chat voice clips retain their separate provenance in
`assets/audio/chat/README.md`.

## Integration

`js/audio.js` preserves the existing `audio` / `playFx` API and forwards to the
isolated audio modules. The host and phone each feed `audio.setMatchState` and
`audio.setMatchSnap`. Existing countdown/victory calls remain compatible and are
deduplicated. The controller's throw uses the new string-release cue.

The five power clips preload after the first gesture. A missing, loading, or
blocked clip uses its immediate synthesized fallback, without delayed replay.
The music dips under powers, results, and voice lines; a compressor and voice
limits protect a crowded brawl mix. Mute, music mute, and leave cleanup share the
same mixer.

Audition the catalog at `sound/index.html`. Use **Synthesized power fallbacks** to
compare the backup path. **Save WAV** exports any procedural cue for editing.
Run `node --test tests/sfx.test.mjs` and `node sound/check-audio.mjs` for checks.
