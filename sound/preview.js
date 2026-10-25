import { audio } from '../js/audio.js';
import { SFX_CATALOG, POWER_SAMPLES } from '../js/sfx-catalog.js';
import { createSynth, cueRecipe } from '../js/audio-synth.js';
import { QUICK_CHAT } from '../js/chat.js';

const $ = selector => document.querySelector(selector), timers = new Set();
let live = null, music = false;
const later = (fn, delay) => { const id = setTimeout(() => { timers.delete(id); fn(); }, delay); timers.add(id); };
function stop() {
  timers.forEach(clearTimeout); timers.clear(); clearInterval(live); live = null;
  audio.stop(); music = false; $('#music').setAttribute('aria-pressed', 'false');
  document.querySelectorAll('.playing').forEach(card => card.classList.remove('playing'));
  $('#spin').value = $('#whir').value = 0;
}
function unlock() { audio.unlock(); audio.setSfxVolume(+$('#volume').value / 100); $('#unlock').textContent = 'Audio enabled'; }
function play(id) {
  unlock(); audio.cue(id, { intensity: +$('#strength').value / 100, synthOnly: $('#fallback').checked, force: true });
  const card = document.querySelector(`[data-cue="${id}"]`);
  if (card) { card.classList.add('playing'); later(() => card.classList.remove('playing'), 550); }
}

export async function renderCue(id, intensity = 0.6) {
  const events = cueRecipe(id, intensity), seconds = Math.max(...events.map(e => e.at + (e.attack || 0.003) + e.decay)) + 0.15;
  const context = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100);
  const gain = context.createGain(); gain.gain.value = 0.75; gain.connect(context.destination);
  createSynth(context, gain).play(id, { intensity, variation: 0.5 });
  return context.startRendering();
}
export function wav(buffer) {
  const data = buffer.getChannelData(0), bytes = new ArrayBuffer(44 + data.length * 2), view = new DataView(bytes);
  const text = (at, value) => [...value].forEach((letter, i) => view.setUint8(at + i, letter.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, data.length * 2, true);
  data.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true));
  return new Blob([bytes], { type: 'audio/wav' });
}

for (const group of new Set(SFX_CATALOG.map(cue => cue.group))) {
  const section = document.createElement('section');
  section.innerHTML = `<h2>${group}</h2><div class="grid">${SFX_CATALOG.filter(cue => cue.group === group).map(cue => `<article class="card" data-cue="${cue.id}"><h3>${cue.label}${POWER_SAMPLES[cue.id] ? '<span class="badge">CC0 SAMPLE</span>' : ''}</h3><p>${cue.trigger}</p><div class="actions"><button class="play" data-play="${cue.id}" aria-label="Play ${cue.label}">▶ Play</button><a class="save" href="#" data-save="${cue.id}">Save WAV</a>${POWER_SAMPLES[cue.id] ? `<a class="save" href="${POWER_SAMPLES[cue.id]}" download>MP3</a>` : ''}</div></article>`).join('')}</div>`;
  $('#catalog').append(section);
}
$('#count').textContent = `${SFX_CATALOG.length} one-shot cues · 2 live textures · 4 voice lines`;
$('#catalog').addEventListener('click', async event => {
  const button = event.target.closest('[data-play]'), save = event.target.closest('[data-save]');
  if (button) play(button.dataset.play);
  if (save) {
    event.preventDefault(); const buffer = await renderCue(save.dataset.save, +$('#strength').value / 100);
    const link = document.createElement('a'); link.href = URL.createObjectURL(wav(buffer)); link.download = `paikutan-${save.dataset.save}.wav`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
});
$('#unlock').onclick = async () => { unlock(); $('#status').textContent = 'Loading clips…'; await audio.preload({ retry: true }); updateStatus(); $('#unlock').textContent = 'Audio enabled'; };
$('#stop').onclick = stop;
$('#tour').onclick = () => { stop(); unlock(); let at = 0; for (const cue of SFX_CATALOG) { later(() => play(cue.id), at); at += POWER_SAMPLES[cue.id] ? 2700 : cue.id === 'champion' ? 2200 : 1100; } };
$('#brawl').onclick = () => {
  stop(); unlock(); audio.hum(0, 0.85, 0.2, 0.55); audio.hum(1, 0.6, 0.5, 0.55);
  ['land','hit','dash','hit','steal','tikbalang','stomp','agimat','wardHit','bakunawa','squeeze','out','champion'].forEach((id, i) => later(() => play(id), i * 300));
  later(() => { audio.hum(0, 0, 0); audio.hum(1, 0, 0); }, 4400);
};
$('#music').onclick = () => { unlock(); music = !music; audio.music(music, 0.25); $('#music').setAttribute('aria-pressed', String(music)); };
$('#volume').oninput = () => { $('#volume-label').value = $('#volume').value + '%'; audio.setSfxVolume(+$('#volume').value / 100); };
$('#strength').oninput = () => { $('#strength-label').value = $('#strength').value + '%'; };
for (const id of ['spin','wobble','whir']) $('#' + id).oninput = () => {
  unlock();
  if (!live) live = setInterval(() => { audio.hum(0, +$('#spin').value / 100, +$('#wobble').value / 100); audio.whir(+$('#whir').value / 100); }, 50);
};
QUICK_CHAT.forEach((text, i) => { const button = document.createElement('button'); button.lang = 'fil'; button.textContent = text; button.onclick = () => { unlock(); audio.chat(i); }; $('#chat').append(button); });
function updateStatus() { const status = audio.status; $('#status').textContent = `${status.loaded.filter(key => POWER_SAMPLES[key]).length}/5 power clips · ${status.loaded.filter(key => key.startsWith('chat-')).length}/4 voices · ${status.voices} synth voices · ${status.samples} samples · ${status.context}`; }
setInterval(updateStatus, 500);
addEventListener('pagehide', stop);
window.soundLab = { audio, play, renderCue, wav, catalog: SFX_CATALOG };
