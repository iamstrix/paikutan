// Semantic triggers live here so UI work only needs the two state/snapshot hooks.
export function resultCue(state, slot = -1) {
  const result = state.result;
  if (!result) return null;
  if (state.phase === 'roundEnd') {
    if (result.winner < 0) return 'draw';
    if (slot >= 0 && !state.players[slot]?.inRound) return null;
    return slot < 0 || result.winner === slot ? 'roundWin' : 'roundLose';
  }
  if (state.phase === 'matchEnd') return slot < 0 || result.champion === slot ? 'champion' : 'matchLose';
  return null;
}

export function createMatchAudio({ play, schedule, cancel }) {
  let previous = null, slot = -1, mutedDemo = false, lastTop = null;
  let countdown = [];
  const cancelCountdown = () => { countdown.forEach(cancel); countdown = []; };
  return {
    state(next, options = {}) {
      slot = options.slot ?? -1; mutedDemo = !!options.silent;
      const changed = !previous || previous.session !== next.session || previous.phase !== next.phase || previous.round !== next.round;
      if (previous?.session !== next.session) lastTop = null;
      if (changed) {
        cancelCountdown();
        if (!mutedDemo) {
          const cue = ({ pick: 'pickStart', vs: 'versus', charge: 'charge', throw: 'throwReady', fight: 'fight', counter: 'pickStart' })[next.phase] || resultCue(next, slot);
          if (cue) play(cue);
          if (next.phase === 'countdown') {
            for (const second of [3,2,1]) {
              const delay = (next.timer - second) * 1000;
              if (delay >= -120) countdown.push(schedule(() => play('countdown'), Math.max(0, delay)));
            }
          }
        }
      }
      if (!mutedDemo && previous?.session === next.session) {
        const before = previous.players.filter(Boolean).length, after = next.players.filter(Boolean).length;
        if (next.phase === 'lobby' && after !== before) play(after > before ? 'join' : 'leave');
        if ((next.phase === 'charge' || previous.phase === 'charge') && next.players[slot]?.spun && !previous.players[slot]?.spun) play('spinLock', { intensity: next.players[slot].spinPower });
      }
      previous = next;
    },
    snapshot(snapshot) {
      const top = snapshot.tops[slot];
      if (!top || mutedDemo || !previous || !['throw','fight'].includes(previous.phase)) { lastTop = null; return; }
      if (lastTop && top.alive && top.launched) {
        if (lastTop.charge < 1 && top.charge >= 1) play('powerReady');
        if (lastTop.boostCd > 0 && top.boostCd <= 0) play('dashReady');
        if (lastTop.shield && !top.shield) play('wardEnd');
        if (lastTop.invert && !top.invert) play('curseEnd');
        if (lastTop.spin >= 0.2 && top.spin < 0.2) play('lowSpin');
      }
      if (!lastTop && top.alive && top.launched && top.charge >= 1) play('powerReady');
      lastTop = { ...top };
    },
    get managedCountdown() { return previous?.phase === 'countdown'; },
    get phase() { return previous?.phase; },
    get result() { return previous && resultCue(previous, slot); },
    reset() { cancelCountdown(); previous = null; lastTop = null; slot = -1; mutedDemo = false; },
  };
}

export function buttonCue(button) {
  if (button.disabled || button.getAttribute('aria-disabled') === 'true') return null;
  const id = button.id || '', action = button.dataset.act || '';
  if (button.matches('[data-chat]')) return null; // the character's voice is the feedback
  if (['power','dash'].includes(action)) return button.classList.contains('ready') ? null : 'error';
  if (action === 'center') return 'recenter';
  if (button.matches('.car-arrow') || action === 'unready') return 'pick';
  if (['ready','confirm','rematch'].includes(action) || /start|rematch/.test(id)) return 'confirm';
  if (/back|cancel|exit|leave|spectate/.test(id) || /back|cancel|exit|leave/i.test(button.textContent)) return 'uiBack';
  return 'uiTap';
}

export function installAudioUI(audio, document) {
  if (document.body.dataset.audioPreview === 'true') return () => {};
  let lastButton = null, lastAt = -Infinity;
  const press = event => {
    const button = event.target.closest?.('button, a.btn');
    if (!button) { if (event.type === 'pointerdown') audio.unlock(); return; }
    const now = performance.now();
    if (event.type === 'click' && lastButton === button && now - lastAt < 500) return;
    lastButton = button; lastAt = now;
    audio.unlock();
    const cue = buttonCue(button);
    if (cue) audio.uiCue(cue);
  };
  document.addEventListener('pointerdown', press, true);
  document.addEventListener('click', press, true);
  // Report connection errors once when their text changes, including full / missing rooms.
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target.parentElement?.closest('#join-msg, #net-status') || record.target.matches?.('#join-msg, #net-status'))) {
      const text = [document.querySelector('#join-msg')?.textContent, document.querySelector('#net-status')?.textContent].join(' ');
      if (/could not|full\.|no host|ended the room|invalid|enter the 4/i.test(text)) audio.cue('error');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => { document.removeEventListener('pointerdown', press, true); document.removeEventListener('click', press, true); observer.disconnect(); };
}
