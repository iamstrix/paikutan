// Rebuild the five compact CC0 power textures. Requires Node 22+, ffmpeg, and network on first run.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd(), cache = resolve(root, 'node_modules/.sfx-build'), output = resolve(root, 'assets/audio/sfx');
await mkdir(cache, { recursive: true }); await mkdir(output, { recursive: true });
const sources = JSON.parse(await readFile(resolve(root, 'sound/sources.json'), 'utf8'));
const run = args => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true, maxBuffer: 16000000 });
  if (result.status !== 0) throw Error(result.stderr?.toString() || result.error?.message || 'ffmpeg failed');
  return result.stdout;
};
const download = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
};
const records = await Promise.all(sources.map(async source => {
  const path = resolve(cache, source.id + '.mp3'), htmlPath = resolve(cache, source.id + '.html');
  let html;
  try { html = await readFile(htmlPath, 'utf8'); } catch { html = (await download(source.page)).toString(); await writeFile(htmlPath, html); }
  if (!/creativecommons\.org\/publicdomain\/zero\/1\.0/.test(html)) throw Error(`CC0 license could not be verified: ${source.page}`);
  const urls = [...html.matchAll(/https?:[^\s"'<>]+?\.(?:mp3|ogg)/g)].map(m => m[0].replaceAll('\\/', '/').replaceAll('&amp;', '&')).filter(url => url.startsWith('https://cdn.freesound.org/previews/'));
  const preview = urls.find(url => url.includes(source.soundId + '_') && url.endsWith(`-${source.previewQuality || 'hq'}.mp3`))
    || urls.find(url => url.includes(source.soundId + '_') && url.endsWith('.mp3'));
  if (!preview) throw Error('Public preview missing: ' + source.page);
  try { await stat(path); } catch { await writeFile(path, await download(preview)); }
  // Locate the strongest short event, excluding sub-bass/wind for selection only.
  const pcm = run(['-i', path, '-af', 'highpass=f=180,lowpass=f=4500', '-ac', '1', '-ar', '12000', '-f', 'f32le', '-']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let peak = 0, peakAt = 0;
  const window = 1200;
  for (let i = 0; i < samples.length - window; i += window) {
    let energy = 0; for (let j = i; j < i + window; j++) energy += samples[j] ** 2;
    if (energy > peak) { peak = energy; peakAt = i / 12000; }
  }
  const length = samples.length / 12000;
  const start = Math.max(0, Math.min(length - source.duration, peakAt - (source.id === 'thunder' ? 0.03 : 0.2)));
  const segment = resolve(cache, source.id + '-cut.wav');
  run(['-y', '-ss', String(start), '-i', path, '-t', String(source.duration), '-af', `highpass=f=65,loudnorm=I=-20:TP=-4:LRA=7,afade=t=in:d=0.008,afade=t=out:st=${source.duration - 0.12}:d=0.12,alimiter=limit=0.65:level=false`, '-ac', '1', '-ar', '44100', segment]);
  if (source.power) run(['-y', '-i', segment, '-codec:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', resolve(output, source.power + '.mp3')]);
  console.log(`Prepared ${source.id}: ${start.toFixed(2)}s + ${source.duration}s`);
  return { ...source, preview, start: +start.toFixed(4), license: 'CC0-1.0', checked: '2026-10-25' };
}));
run(['-y', '-i', resolve(cache, 'growl-cut.wav'), '-i', resolve(cache, 'kulintang-cut.wav'), '-filter_complex', '[0:a][1:a]acrossfade=d=0.12:c1=tri:c2=tri,alimiter=limit=0.65:level=false[out]', '-map', '[out]', '-codec:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', resolve(output, 'bakunawa.mp3')]);
const files = await Promise.all(['kidlat','tikbalang','agimat','diwata','bakunawa'].map(async id => ({ id, bytes: (await stat(resolve(output, id + '.mp3'))).size })));
await writeFile(resolve(root, 'sound/source-manifest.json'), JSON.stringify({ sources: records, files, totalBytes: files.reduce((sum, f) => sum + f.bytes, 0) }, null, 2) + '\n');
console.log(JSON.stringify(files));
