// Real Chromium WebAudio checks: no browser automation dependencies or external test server.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = process.cwd(), output = resolve(root, 'node_modules/.sfx-check');
await mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1'), path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep) || url.pathname.includes('/.git')) throw Error('Forbidden');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.mp3': 'audio/mpeg', '.json': 'application/json', '.md': 'text/plain' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${resolve(output, 'chrome-profile')}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let text = ''; const timer = setTimeout(() => reject(Error('Chrome startup timed out')), 20000);
    browser.on('error', reject);
    browser.stderr.on('data', bytes => { text += bytes; const found = text.match(/DevTools listening on (ws:\/\/\S+)/); if (found) { clearTimeout(timer); resolve(found[1]); } });
  });
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let next = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); clearTimeout(waiter.timer); if (message.error) waiter.reject(Error(JSON.stringify(message.error))); else waiter.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error('Timed out: ' + method)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async code => {
    const result = await send('Runtime.evaluate', { expression: `(async()=>{${code}})()`, returnByValue: true, awaitPromise: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.navigate', { url: base + '/sound/index.html' }, sessionId);
  for (let i=0;i<50;i++) { if (await evaluate('return Boolean(window.soundLab)')) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  const loaded = await evaluate('soundLab.audio.unlock();await soundLab.audio.preload();return soundLab.audio.status');
  assert.equal(loaded.context, 'running'); assert.equal(loaded.loaded.length, 9, 'all five MP3s and four voice clips decode');
  console.log('PASS: audio gesture unlock and all nine bundled clips decode');

  const rendered = await evaluate(`
    const results=[];
    for(const cue of soundLab.catalog){
      const buffer=await soundLab.renderCue(cue.id,1), data=buffer.getChannelData(0);
      let peak=0,sum=0,finite=true,tail=0;
      for(let i=0;i<data.length;i++){const value=data[i];finite&&=Number.isFinite(value);peak=Math.max(peak,Math.abs(value));sum+=value*value;if(i>data.length-1000)tail=Math.max(tail,Math.abs(value));}
      results.push({id:cue.id,seconds:buffer.duration,peak,rms:Math.sqrt(sum/data.length),finite,tail});
    }
    const exported=await soundLab.renderCue('hit');window.wavBytes=(await soundLab.wav(exported).arrayBuffer()).byteLength;
    return results;`);
  for (const cue of rendered) { assert(cue.finite, cue.id); assert(cue.peak > 0.005, cue.id + ' is audible'); assert(cue.peak < 0.98, cue.id + ' does not clip'); assert(cue.tail < 0.0002, cue.id + ' has a clean tail'); }
  assert(await evaluate('return wavBytes>44'));
  console.log(`PASS: ${rendered.length} real offline renders are audible, finite, unclipped, and end in silence; WAV export works`);

  const mix = await evaluate(`
    const {createSynth}=await import('/js/audio-synth.js');const {POWER_SAMPLES}=await import('/js/sfx-catalog.js');
    const context=new OfflineAudioContext(1,44100*5,44100),bus=context.createGain(),master=context.createGain(),compressor=context.createDynamicsCompressor();
    bus.gain.value=.85;master.gain.value=.85;compressor.threshold.value=-10;compressor.knee.value=12;compressor.ratio.value=6;compressor.attack.value=.003;compressor.release.value=.18;
    bus.connect(master).connect(compressor).connect(context.destination);const synth=createSynth(context,bus,{maxVoices:512});
    let at=0;for(const [id,url]of Object.entries(POWER_SAMPLES)){const buffer=await context.decodeAudioData(await(await fetch(url)).arrayBuffer());const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.85;source.connect(gain).connect(bus);source.start(at);at+=.06;}
    for(let i=0;i<16;i++)synth.play('hit',{at:i*.12,intensity:1});synth.play('stomp',{at:1.8});synth.play('squeeze',{at:2.1});
    for(let i=0;i<8;i++){const source=context.createOscillator(),gain=context.createGain();source.type='triangle';source.frequency.value=130+i*9;gain.gain.value=.02;source.connect(gain).connect(bus);source.start();source.stop(3);}
    const data=(await context.startRendering()).getChannelData(0);let peak=0,sum=0;for(const value of data){peak=Math.max(peak,Math.abs(value));sum+=value*value;}return{peak,rms:Math.sqrt(sum/data.length)};`);
  assert(mix.peak < 0.98 && mix.peak > 0.05, 'crowded sampled brawl does not clip');
  console.log('PASS: real sampled brawl mix stays below clipping with five powers, sixteen hard clashes, and eight hums');

  const playback = await evaluate(`
    const audio=soundLab.audio;
    for(const cue of soundLab.catalog)audio.cue(cue.id,{force:true});
    const before=audio.status;
    audio.setMuted(true);const suppressed=audio.cue('hit',{force:true});audio.setMuted(false);
    audio.stop();await new Promise(resolve=>setTimeout(resolve,80));
    return {before,after:audio.status,suppressed};`);
  assert(playback.before.voices <= 160); assert(playback.before.samples <= 12);
  assert.equal(playback.suppressed, false); assert.equal(playback.after.voices, 0); assert.equal(playback.after.samples, 0);
  const fallback = await evaluate(`soundLab.audio.cue('tikbalang',{synthOnly:true,force:true});const result=soundLab.audio.status;soundLab.audio.stop();return result;`);
  assert.equal(fallback.samples, 0); assert(fallback.voices > 0, 'power fallback starts immediately without a sample');
  const loops = await evaluate(`
    const counts={osc:0,noise:0}, proto=AudioContext.prototype, osc=proto.createOscillator, noise=proto.createBufferSource;
    proto.createOscillator=function(...args){counts.osc++;return osc.apply(this,args)};proto.createBufferSource=function(...args){counts.noise++;return noise.apply(this,args)};
    for(let i=0;i<100;i++){soundLab.audio.hum(0,.8,.2);soundLab.audio.whir(.7)}
    soundLab.audio.stop();proto.createOscillator=osc;proto.createBufferSource=noise;return counts;`);
  assert(loops.osc <= 2 && loops.noise <= 1, 'continuous sounds reuse their nodes');
  console.log('PASS: crowded mix voice bounds, mute, stop cleanup, and persistent hum/winding node reuse');

  await evaluate(`document.querySelector('[data-play="tikbalang"]').click();document.querySelector('#fallback').checked=true;document.querySelector('[data-play="bakunawa"]').click();document.querySelector('#stop').click();`);
  const screenshot = await send('Page.captureScreenshot', { captureBeyondViewport: false }, sessionId);
  await writeFile(resolve(output, 'soundboard-desktop.png'), Buffer.from(screenshot.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  assert(await evaluate('return document.documentElement.scrollWidth<=innerWidth'), 'soundboard fits a phone');
  const mobile = await send('Page.captureScreenshot', {}, sessionId); await writeFile(resolve(output, 'soundboard-mobile.png'), Buffer.from(mobile.data, 'base64'));
  assert.deepEqual(errors, []);
  const manifest = JSON.parse(await readFile(resolve(root, 'sound/source-manifest.json'), 'utf8'));
  assert(manifest.totalBytes < 150000);
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ passed: true, rendered, mix, playback, fallback, loops, powerBytes: manifest.totalBytes, errors }, null, 2));
  console.log(`PASS: desktop/phone soundboard, no runtime errors; five power clips total ${manifest.totalBytes} bytes`);
} finally { socket?.close(); browser.kill(); server.close(); }
