// Build a portable HTML soundboard: no server, module imports, or network required.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SFX_CATALOG } from '../js/sfx-catalog.js';
import { QUICK_CHAT } from '../js/chat.js';

const root = process.cwd();
const read = name => readFile(resolve(root, name), 'utf8');
const embedded = async name => 'data:audio/mpeg;base64,' + (await readFile(resolve(root, name))).toString('base64');
const powers = Object.fromEntries(await Promise.all(['kidlat','tikbalang','agimat','diwata','bakunawa'].map(async id => [id, await embedded(`assets/audio/sfx/${id}.mp3`)])));
const voices = await Promise.all(QUICK_CHAT.map((_, i) => embedded(`assets/audio/chat/${i}.mp3`)));
const stripExports = source => source.replace(/\bexport\s+(?=(?:async\s+)?(?:const|let|function|class))/g, '');
const imports = {
  './chat.js': '__chat', '../js/chat.js': '__chat',
  './sfx-catalog.js': '__catalog', '../js/sfx-catalog.js': '__catalog',
  './audio-synth.js': '__synth', '../js/audio-synth.js': '__synth',
  './audio-events.js': '__events', '../js/audio.js': '__runtime',
};
const bundle = source => stripExports(source.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*$/gm, (_, names, path) => {
  if (!imports[path]) throw Error('Unknown soundboard dependency: ' + path);
  return `const {${names}} = ${imports[path]};`;
}));
const module = (name, source, names) => `const ${name}=(()=>{\n${bundle(source)}\nreturn {${names}};\n})();`;
let catalog = await read('js/sfx-catalog.js');
catalog = catalog.replace(/export const POWER_SAMPLES =[\s\S]*?;\s/, `export const POWER_SAMPLES = ${JSON.stringify(powers)};\n`);
let preview = await read('sound/preview.js');
preview = preview.replace('for (const group of new Set(', "if (!$('#catalog').children.length) for (const group of new Set(");
preview = preview.replace(' download>MP3', ' download="${cue.id}.mp3">MP3');
const code = [
  `const __chat=${JSON.stringify({ QUICK_CHAT, CHAT_CLIPS: voices })};`,
  module('__catalog', catalog, 'SFX_CATALOG,POWER_SAMPLES,FX_CUES'),
  module('__synth', await read('js/audio-synth.js'), 'createSynth,cueRecipe'),
  module('__events', await read('js/audio-events.js'), 'createMatchAudio,resultCue,buttonCue,installAudioUI'),
  module('__runtime', await read('js/audio-runtime.js'), 'audio,playFx'),
  `(()=>{${bundle(preview)}})();`,
].join('\n');
if (/\bimport\s+(?:\{|[^.\s])|import\.meta/.test(code)) throw Error('An external module dependency remains');
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const cards = [...new Set(SFX_CATALOG.map(cue => cue.group))].map(group => `<section><h2>${escape(group)}</h2><div class="grid">${SFX_CATALOG.filter(cue => cue.group === group).map(cue => `<article class="card" data-cue="${cue.id}"><h3>${escape(cue.label)}${powers[cue.id] ? '<span class="badge">CC0 SAMPLE</span>' : ''}</h3><p>${escape(cue.trigger)}</p><div class="actions"><button class="play" data-play="${cue.id}" aria-label="Play ${escape(cue.label)}">▶ Play</button><a class="save" href="#" data-save="${cue.id}">Save WAV</a>${powers[cue.id] ? `<a class="save" href="${powers[cue.id]}" download="${cue.id}.mp3">MP3</a>` : ''}</div></article>`).join('')}</div></section>`).join('\n');
let html = await read('sound/index.html');
html = html.replace('<title>Paikutan · Sound Lab</title>', '<title>Paikutan · Soundboard</title>');
html = html.replace('<div id="catalog"></div>', `<div id="catalog">${cards}</div>`);
html = html.replace('Tap Enable audio to preload the power and voice clips.', 'All sounds are embedded in this file. Tap Enable audio to begin.');
html = html.replace('<script type="module" src="preview.js"></script>', `<script>\n${code.replaceAll('</script', '<\\/script')}\n</script>`);
await writeFile(resolve(root, 'sound/soundboard.html'), html);
console.log(`Saved sound/soundboard.html: ${Buffer.byteLength(html)} bytes, ${SFX_CATALOG.length} cues, five power clips, four voice clips.`);
