import { CHARACTER_INFO } from '../entities/characters';
import { T_ALIVE, T_LAUNCHED, T_SPIN, type PlayerInfo, type TopSnap } from '../game/RoundManager';
import qrcode from 'qrcode-generator';
import { TOPS, statsOf, topById } from '../sim/data';
import { QUICK_CHAT } from '../systems/AudioSystem';

import { PLAYER_COLORS } from './colors';

export { PLAYER_COLORS };

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing UI element ${sel}`);
  return el;
}

type Chip = { el: HTMLElement; name: HTMLElement; spin: HTMLElement; fill: HTMLElement; wins: HTMLElement; lastScore: number; out: boolean };

type LobbyHandlers = {
  solo: (name: string, char: string, power: string) => void;
  host: (name: string, char: string, power: string) => void;
  join: (name: string, char: string, power: string, code: string) => void;
};

/** DOM overlay: lobby, HUD, throw widget, labels, podium. Reads game state, holds no rules. */
export class Ui {
  char = 'lola';
  power = 'kidlat';
  abilityHandler: () => void = () => {};
  private readonly lobby = $('#lobby');
  private readonly hud = $('#hud');
  private readonly podium = $('#podium');
  private readonly status = $('#lobby-status');
  private readonly scoreboard = $('#scoreboard');
  private readonly clock = $('#clock');
  private readonly roomCode = $('#room-code');
  private readonly banner = $('#banner');
  private readonly hint = $('#hint');
  private readonly spinPanel = $('#spin-panel');
  private readonly throwPanel = $('#throw-panel');
  private readonly powerBtn = $('#power-btn') as HTMLButtonElement;
  private readonly pairPanel = $('#pair-panel');
  private pairUrl: string | null = null;
  private readonly spinMeter = $('#spin-meter');
  private readonly labels = $('#labels');
  private readonly buttons = ['#btn-solo', '#btn-host', '#btn-join'].map((s) => $(s) as HTMLButtonElement);
  private readonly chips = new Map<number, Chip>();
  private readonly motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private revealTimers: number[] = [];
  private lastSpin = -1;
  private readonly tags = new Map<number, { tag: HTMLElement; bubble: HTMLElement | null; bubbleT: number }>();
  muteHandler: (muted: boolean) => void = () => {};
  /** Called as each podium place is revealed (4th to 1st) so the game can play a tick. */
  revealHandler: (place: number, winner: boolean) => void = () => {};

  constructor(handlers: LobbyHandlers) {
    const nameInput = $('#name-input') as HTMLInputElement;
    const codeInput = $('#code-input') as HTMLInputElement;
    try {
      nameInput.value = localStorage.getItem('trompow-name') ?? '';
      this.char = localStorage.getItem('trompow-char') ?? 'lola';
      this.power = localStorage.getItem('trompow-power') ?? 'kidlat';
    } catch {
      // Storage unavailable: defaults are fine.
    }

    const grid = $('#char-grid');
    for (const [id, info] of Object.entries(CHARACTER_INFO)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'char-btn';
      b.setAttribute('role', 'radio');
      b.dataset.char = id;
      const st = statsOf(id);
      const dots = (n: number) => '●'.repeat(n) + '○'.repeat(5 - n);
      b.innerHTML = `<b>${info.label}</b><small>${info.blurb}</small><small class="stats">Power ${dots(st.str)} · Endurance ${dots(st.lon)} · Balance ${dots(st.sta)}</small>`;
      b.addEventListener('click', () => this.pickChar(id));
      grid.append(b);
    }
    this.pickChar(this.char);

    const topGrid = $('#top-grid');
    for (const t of TOPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'char-btn top-btn';
      b.setAttribute('role', 'radio');
      b.dataset.power = t.id;
      b.style.setProperty('--c1', t.colors[0]);
      b.style.setProperty('--c2', t.colors[1]);
      b.innerHTML = `<i class="swatch"></i><b>${t.name}</b><small>${t.desc}</small>`;
      b.addEventListener('click', () => this.pickPower(t.id));
      topGrid.append(b);
    }
    this.pickPower(this.power);
    this.powerBtn.addEventListener('click', () => this.abilityHandler());
    $('#pair-btn').addEventListener('click', () => this.togglePair(true));
    $('#pair-close').addEventListener('click', () => this.togglePair(false));

    const read = () => {
      const name = nameInput.value.trim() || CHARACTER_INFO[this.char].label;
      try {
        localStorage.setItem('trompow-name', nameInput.value.trim());
        localStorage.setItem('trompow-char', this.char);
        localStorage.setItem('trompow-power', this.power);
      } catch {
        // Ignore.
      }
      return name;
    };
    $('#btn-solo').addEventListener('click', () => handlers.solo(read(), this.char, this.power));
    $('#btn-host').addEventListener('click', () => handlers.host(read(), this.char, this.power));
    $('#btn-join').addEventListener('click', () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length !== 4) return this.setStatus('Enter the 4-letter room code.');
      handlers.join(read(), this.char, this.power, code);
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#btn-join').click();
    });

    const mute = $('#mute-btn');
    let muted = false;
    mute.addEventListener('click', () => {
      muted = !muted;
      mute.textContent = muted ? '🔇' : '🔊';
      mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
      this.muteHandler(muted);
    });

    $('#chat-legend').innerHTML = QUICK_CHAT.map((t, i) => `<div><kbd>${i + 1}</kbd>${t}</div>`).join('');
  }

  setBusy(busy: boolean): void {
    for (const b of this.buttons) b.disabled = busy;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  showLobby(show: boolean): void {
    this.lobby.hidden = !show;
    this.hud.hidden = show;
    if (show) {
      this.clearLabels();
      this.scoreboard.innerHTML = '';
      this.chips.clear();
    }
  }

  setRoomCode(code: string | null): void {
    this.roomCode.hidden = !code;
    this.roomCode.textContent = code ? `ROOM: ${code}` : '';
  }

  setClock(minutes: number): void {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    this.clock.textContent = `${((h + 11) % 12) + 1}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  setHint(text: string): void {
    if (this.hint.textContent === text) return;
    this.hint.textContent = text;
    this.animate(this.hint, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], 220);
  }

  /** Web Animations on the separate translate/scale properties so CSS transforms stay intact. */
  private animate(el: Element, frames: Keyframe[], duration: number, delay = 0, easing = 'cubic-bezier(.2,1.4,.4,1)'): void {
    if (this.motion) el.animate(frames, { duration, delay, easing, fill: 'backwards' });
  }

  private shake(el: Element, strength: number): void {
    const d = Math.round(3 + strength * 3);
    this.animate(el, [0, -d, d, -d * 0.6, d * 0.6, 0].map((x) => ({ translate: x + 'px 0' })), 320, 0, 'linear');
  }

  /** Persistent chips: slide in, pop a star on a win, shake and grey out when their top is out. */
  scores(players: PlayerInfo[], tops: TopSnap[], localId: number, live: boolean): void {
    const byId = new Map(tops.map((t) => [t[0], t]));
    const seen = new Set<number>();
    players.forEach((p, i) => {
      seen.add(p.id);
      let c = this.chips.get(p.id);
      if (!c) {
        const el = document.createElement('div');
        el.className = 'score-chip';
        el.innerHTML = `<i class="cap" style="background:${PLAYER_COLORS[p.color]}"></i><span class="name"></span><span class="spin"><i></i></span><span class="wins"></span>`;
        c = {
          el,
          name: el.querySelector('.name')!,
          spin: el.querySelector('.spin')!,
          fill: el.querySelector('.spin i')!,
          wins: el.querySelector('.wins')!,
          lastScore: p.score,
          out: false,
        };
        this.chips.set(p.id, c);
        this.animate(el, [{ translate: '-120% 0', opacity: 0 }, { translate: '0 0', opacity: 1 }], 420, i * 70);
      }
      if (this.scoreboard.children[i] !== c.el) this.scoreboard.insertBefore(c.el, this.scoreboard.children[i] ?? null);
      const name = `${p.name}${p.bot ? ' 🤖' : ''}`;
      if (c.name.textContent !== name) c.name.textContent = name;
      c.el.classList.toggle('me', p.id === localId);
      const t = byId.get(p.id);
      // A top counts as out once it has been thrown and is no longer spinning.
      const out = live && !!t && t[T_LAUNCHED] > 0 && t[T_ALIVE] === 0;
      if (out && !c.out) this.shake(c.el, 1.5);
      c.out = out;
      c.el.classList.toggle('out', out);
      c.spin.hidden = !live;
      c.fill.style.width = `${live && t ? Math.round(Math.min(1, t[T_SPIN]) * 100) : 0}%`;
      const pts = `${p.score} pts`;
      if (c.wins.textContent !== pts) c.wins.textContent = pts;
      if (p.score > c.lastScore) {
        this.animate(c.wins, [{ scale: '2.4', rotate: '-20deg' }, { scale: '1', rotate: '0deg' }], 600);
        this.animate(c.el, [{ backgroundColor: '#ffd23f' }, {}], 900, 0, 'ease-out');
      }
      c.lastScore = p.score;
    });
    for (const [id, c] of this.chips) {
      if (seen.has(id)) continue;
      c.el.remove();
      this.chips.delete(id);
    }
  }

  /** Round start: the scoreboard deals itself back in. */
  introChips(): void {
    [...this.chips.values()].forEach((c, i) => this.animate(c.el, [{ translate: '-30px 0', opacity: 0.2 }, { translate: '0 0', opacity: 1 }], 380, i * 60));
  }

  /** A player's top took a hit: nudge their chip. */
  hitChip(id: number, power: number): void {
    const c = this.chips.get(id);
    if (c) this.shake(c.el, Math.min(1, power / 3));
  }

  /** The local top took a hit: shake the spin meter and flash it red. */
  shakeSpin(power: number): void {
    this.shake(this.spinMeter, 1 + Math.min(1.5, power / 2));
    this.animate(this.spinMeter, [{ backgroundColor: '#ff8a80' }, {}], 450, 0, 'ease-out');
  }

  /** PAIKOT: the circle pad (drawn by DesktopBattleInput) and its power/steadiness meters. */
  spinState(show: boolean, power: number, stability: number, note: string | null): void {
    if (show && this.spinPanel.hidden) this.animate(this.spinPanel, [{ translate: '0 60px', opacity: 0 }, { translate: '0 0', opacity: 1 }], 380);
    this.spinPanel.hidden = !show;
    if (!show) return;
    $('#sp-power').style.width = `${Math.round(power * 100)}%`;
    $('#sp-stab').style.width = `${Math.round(stability * 100)}%`;
    const n = $('#sp-note');
    n.hidden = !note;
    if (note && n.textContent !== note) n.textContent = note;
  }

  /** BITAW: countdown words, then the aim arrow and how to throw. */
  throwState(show: boolean, count: string, aim: number, text: string): void {
    if (show && this.throwPanel.hidden) this.animate(this.throwPanel, [{ translate: '0 60px', opacity: 0 }, { translate: '0 0', opacity: 1 }], 380);
    this.throwPanel.hidden = !show;
    if (!show) return;
    const c = $('#tp-count');
    if (c.textContent !== count) {
      c.textContent = count;
      this.animate(c, [{ scale: '1.6', opacity: 0.3 }, { scale: '1', opacity: 1 }], 300);
    }
    $('#tp-arrow').style.rotate = `${aim}rad`;
    const t = $('#tp-text');
    if (t.textContent !== text) t.textContent = text;
  }

  /** LABAN: your spin meter, the power button's charge ring, and the Bakunawa warning. */
  fightState(spin: number | null, charge: number, power: string, invert: boolean, wobble = 0): void {
    if (spin !== null && this.spinMeter.hidden) {
      this.animate(this.spinMeter, [{ translate: '0 50px', opacity: 0 }, { translate: '0 0', opacity: 1 }], 380);
      this.animate(this.powerBtn, [{ scale: '0.4', opacity: 0 }, { scale: '1', opacity: 1 }], 380);
      this.lastSpin = -1;
    }
    this.spinMeter.hidden = spin === null;
    this.powerBtn.hidden = spin === null;
    $('#invert-warn').hidden = !(invert && spin !== null);
    if (spin === null) return;
    const width = `${Math.min(1, spin) * 100}%`;
    $('#spin-fill').style.width = width;
    // Wobble is the second way to lose (you topple at full); it was invisible before.
    const wob = $('#wobble-fill');
    wob.style.width = `${Math.min(1, wobble) * 100}%`;
    wob.classList.toggle('danger', wobble > 0.7);
    // Damage bar: the red lag trails the fill down after a hit, like a fighting game.
    const lag = $('#spin-lag');
    lag.style.transition = this.lastSpin < 0 || spin > this.lastSpin ? 'none' : '';
    lag.style.width = width;
    this.lastSpin = spin;
    const t = topById(power);
    this.powerBtn.style.setProperty('--c1', t.colors[0]);
    this.powerBtn.style.setProperty('--c2', t.colors[1]);
    const name = $('#power-name');
    if (name.textContent !== t.name) name.textContent = t.name;
    const ready = charge >= 1;
    $('#power-state').textContent = ready ? 'READY! (Space)' : 'charging…';
    if (ready && !this.powerBtn.classList.contains('ready')) this.animate(this.powerBtn, [{ scale: '1.25' }, { scale: '1' }], 400);
    this.powerBtn.classList.toggle('ready', ready);
    ($('#power-ring') as unknown as SVGCircleElement).style.strokeDashoffset = String(276.5 * (1 - Math.min(1, charge)));
    $('#palo-ready').textContent = ready ? 'POWER ✓' : '';
  }

  /** A label that floats up and fades at a screen point. */
  floatText(x: number, y: number, text: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    this.labels.append(el);
    el.animate([{ translate: '-50% 0', opacity: 1 }, { translate: '-50% -40px', opacity: 0 }], { duration: 900, easing: 'ease-out' });
    setTimeout(() => el.remove(), 900);
  }

  /** Phone pairing: the QR and link for this player's controller page. */
  setPairing(url: string | null, paired: boolean, unavailable: string | null): void {
    if (url !== this.pairUrl) {
      this.pairUrl = url;
      const qr = $('#pair-qr');
      if (url) {
        const code = qrcode(0, 'M');
        code.addData(url);
        code.make();
        qr.innerHTML = code.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      } else qr.innerHTML = '';
      $('#pair-link').textContent = url ?? '';
    }
    $('#pair-status').textContent = paired ? '✓ Your phone is connected!' : unavailable ?? 'Waiting for your phone…';
    $('#pair-btn').classList.toggle('paired', paired);
  }

  /** Podium: the card drops in, then places are revealed from last to first, the champion last. */
  showPodium(players: PlayerInfo[] | null, winnerId: number): void {
    const wasHidden = this.podium.hidden;
    this.podium.hidden = !players;
    if (!players) {
      for (const t of this.revealTimers) clearTimeout(t);
      this.revealTimers = [];
      return;
    }
    if (!wasHidden) return;
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const champ = players.find((p) => p.id === winnerId);
    const winnerLine = $('#podium-winner');
    winnerLine.textContent = champ ? `${champ.name} is this afternoon's trompo champion!` : '';
    winnerLine.style.visibility = 'hidden';
    const list = $('#podium-list');
    list.innerHTML = sorted
      .map(
        (p, i) => `<li class="${i === 0 ? 'champ' : ''}" style="visibility:hidden">
          <i class="cap" style="background:${PLAYER_COLORS[p.color]}"></i>
          <span class="place">${i === 0 ? '👑' : `#${i + 1}`}</span>
          <span class="who">${escapeHtml(p.name)}</span>
          <span class="stars">${p.score} pts</span>
        </li>`,
      )
      .join('');
    this.animate(this.podium.querySelector('.podium-card')!, [{ translate: '0 -120%', rotate: '-6deg' }, { translate: '0 0', rotate: '0deg' }], 650);
    const items = [...list.children] as HTMLElement[];
    const step = this.motion ? 520 : 0;
    items
      .slice()
      .reverse()
      .forEach((li, k) => {
        const place = items.length - k;
        const winner = place === 1;
        const at = (this.motion ? 700 : 0) + k * step + (winner ? step * 0.6 : 0);
        this.revealTimers.push(
          window.setTimeout(() => {
            li.style.visibility = '';
            if (winner) {
              this.animate(li, [{ scale: '1.6', opacity: 0 }, { scale: '1', opacity: 1 }], 600);
              winnerLine.style.visibility = '';
              this.animate(winnerLine, [{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], 500, 250);
            } else {
              this.animate(li, [{ translate: '40px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }], 380);
            }
            this.revealHandler(place, winner);
          }, at),
        );
      });
  }

  /** Name tags and speech bubbles, positioned in screen pixels by the game. */
  label(id: number, name: string, color: string, x: number, y: number, visible: boolean, dt: number): void {
    let entry = this.tags.get(id);
    if (!entry) {
      const tag = document.createElement('div');
      tag.className = 'tag';
      this.labels.append(tag);
      entry = { tag, bubble: null, bubbleT: 0 };
      this.tags.set(id, entry);
    }
    if (entry.tag.textContent !== name) entry.tag.textContent = name;
    entry.tag.style.borderColor = color;
    entry.tag.style.display = visible ? '' : 'none';
    entry.tag.style.left = `${x}px`;
    entry.tag.style.top = `${y}px`;
    if (entry.bubble) {
      entry.bubbleT -= dt;
      entry.bubble.style.display = visible ? '' : 'none';
      entry.bubble.style.left = `${x}px`;
      entry.bubble.style.top = `${y - 26}px`;
      if (entry.bubbleT <= 0) {
        entry.bubble.remove();
        entry.bubble = null;
      }
    }
  }

  say(id: number, text: string): void {
    const entry = this.tags.get(id);
    if (!entry) return;
    entry.bubble?.remove();
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = text;
    this.labels.append(b);
    entry.bubble = b;
    entry.bubbleT = 2.6;
  }

  pruneLabels(alive: Set<number>): void {
    for (const [id, e] of this.tags) {
      if (alive.has(id)) continue;
      e.tag.remove();
      e.bubble?.remove();
      this.tags.delete(id);
    }
  }

  private clearLabels(): void {
    this.pruneLabels(new Set());
  }

  private pickPower(id: string): void {
    this.power = TOPS.some((t) => t.id === id) ? id : 'kidlat';
    for (const b of document.querySelectorAll<HTMLElement>('.top-btn')) b.setAttribute('aria-checked', String(b.dataset.power === this.power));
  }

  private togglePair(open: boolean): void {
    this.pairPanel.hidden = !open;
  }

  private pickChar(id: string): void {
    this.char = CHARACTER_INFO[id] ? id : 'lola';
    for (const b of document.querySelectorAll<HTMLElement>('.char-btn')) {
      b.setAttribute('aria-checked', String(b.dataset.char === this.char));
    }
  }

}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
