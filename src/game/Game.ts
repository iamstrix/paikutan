import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { Avatar, lerpAngle } from '../entities/Avatar';
import { Critters } from '../entities/Critters';
import { DogView } from '../entities/DogView';
import { TrompoView } from '../entities/TrompoView';
import { DesktopBattleInput } from '../input/DesktopBattleInput';
import { ClientNet, HostNet, makeRoomCode, netMode, randomId, type HostMsg, type PhoneMsg } from '../net/Net';
import { botSteer } from '../sim/Bot';
import { RING_RADIUS } from '../sim/TrompoSim';
import { ChaosView } from '../entities/ChaosView';
import { AudioSystem, QUICK_CHAT } from '../systems/AudioSystem';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Effects } from '../systems/Effects';
import { PLAYER_COLORS, Ui } from '../ui/Ui';
import { createSeededRandom } from '../utils/random';
import { Atmosphere } from '../world/Atmosphere';
import { BOUNDS, SPAWN, buildBarangay, type Barangay } from '../world/Barangay';
import {
  AV_DASH,
  AV_MOVING,
  AV_TUMBLE,
  CLOCK_DUSK,
  CLOCK_START,
  READY_RADIUS,
  RoundManager,
  T_ALIVE,
  T_CHARGE,
  T_DASH,
  T_INVERT,
  T_LAUNCHED,
  T_OUT,
  T_SHIELD,
  T_SPIN,
  T_WOBBLE,
  T_X,
  T_Z,
  WINDUP,
  slotPos,
  type ClientMsg,
  type GameEvent,
  type Phase,
  type PlayerInfo,
  type Snapshot,
  type TopSnap,
} from './RoundManager';

type Role = 'none' | 'solo' | 'host' | 'client';

const CHAR_PITCH: Record<string, number> = { lola: 1.35, totoy: 0.6, binata: 0.9, marites: 1.25, tanod: 0.75, bata: 1.8 };
const DASH_TIME = 0.35;
const DASH_COOLDOWN = 1.1;
/** paikutan's countdown words by whole seconds left. */
const COUNT_WORDS: Record<number, string> = { 3: 'One!', 2: 'Two!', 1: 'Three!' };
/** Messages a paired phone may send for its player. */
const PHONE_MSGS = new Set<ClientMsg['t']>(['spin', 'throw', 'steer', 'ability', 'palo', 'flick', 'chat']);
const PHONE_STALE_MS = 7000;
/** Where alitaptap gather at dusk: the mango tree and the gumamela bushes. */
const FIREFLY_SPOTS: [number, number][] = [[-4.6, -4.2], [-6, -6.3], [6, -6.5], [-11.5, -6.4], [11.5, -6.6], [-3, 11.6], [3, 11.6]];
const CLASH_WORDS = ['PAK!', 'POW!', 'TSUG!', 'BLAG!', 'BOGSH!'];
const POWER_WORDS: Record<string, string> = { kidlat: 'ZAP!', tikbalang: 'CHARGE!', agimat: 'SHIELD!', diwata: 'BLESSED!', bakunawa: 'ECLIPSE!' };
// 'dusk' = a fight round late in the match, for checking the evening lighting.
const TEST_STATES = ['lobby', 'hub', 'charge', 'throw', 'fight', 'dusk', 'podium'];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  private readonly input = new InputController();
  private readonly audio = new AudioSystem();
  private readonly ui: Ui;
  private readonly battleInput: DesktopBattleInput;
  private readonly atmosphere: Atmosphere;
  private readonly world: Barangay;
  private readonly critters: Critters;
  private readonly effects: Effects;
  private readonly dog = new DogView();
  /** Warm fill from the camera side so the podium winner reads against a dusk backlight. */
  private readonly podiumFill = new THREE.PointLight('#ffd9a8', 0, 9, 1.5);
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );
  private readonly tuning: DebugTuning = { walkSpeed: 4.4, cameraLag: 0.12, exposure: 1.0, maxDpr: 2, timeScale: 1 };
  private readonly debugTools: DebugTools;

  private role: Role = 'none';
  private rm: RoundManager | null = null;
  private hostNet: HostNet | null = null;
  private clientNet: ClientNet | null = null;
  private readonly peers = new Map<string, number>();
  /** Host only: each player's phone pairing key, and when their phone last pinged. */
  private readonly pairKeys = new Map<number, string>();
  private readonly phonePing = new Map<number, number>();
  private pairKey = '';
  private room = '';
  private localId = -1;
  private snap: Snapshot | null = null;
  private pendingEvents: GameEvent[] = [];
  private readonly avatars = new Map<number, Avatar>();
  private readonly tops = new Map<number, TrompoView>();
  private extras: Avatar[] = [];

  private lastPhase = '';
  private lastCount = '';
  private lastLaps = 0;
  private netTimer = 0;
  private sendTimer = 0;
  private readonly localVel = new THREE.Vector3();
  private dashT = 0;
  private dashCd = 0;
  /** Seconds left on a bot power aimed at the local top. */
  private targetedT = 0;
  private clockShown = CLOCK_START;
  private shake = 0;
  private snapCamera = true;
  /** fp = first person while spinning/casting; ride = chasing your thrown top; ant = low behind your top. */
  private camMode: 'fp' | 'ride' | 'ant' | 'other' = 'other';
  private readonly tmp2 = new THREE.Vector3();
  private readonly chaos: ChaosView;
  private frame = 0;
  private elapsed = 0;
  // Route ALL gameplay randomness through this.rng (never Math.random) so the
  // seed() test hook keeps screenshot baselines and bot playtests deterministic.
  private rng = createSeededRandom(1);
  private seed = 1;
  private paused = false;
  private reducedMotion = false;
  private autoplay = false;
  private autoTimer = 0;
  private lastTickAt = 0;
  // Browsers pause requestAnimationFrame in background tabs; a worker timer keeps a backgrounded host simulating.
  private readonly bgTicker = new Worker(
    URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' })),
  );

  private readonly move = new THREE.Vector2();
  private readonly camTarget = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly look = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  /** Multo tsinelas meshes, pooled; positions come from the snapshot. */
  private readonly flickMeshes: THREE.Mesh[] = [];
  private powerWasReady = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    this.ui = new Ui({
      solo: (name, char, power) => void this.startHost(name, char, power, true),
      host: (name, char, power) => void this.startHost(name, char, power, false),
      join: (name, char, power, code) => void this.join(name, char, power, code),
    });
    this.ui.muteHandler = (muted) => this.audio.setMuted(muted);
    this.ui.revealHandler = (_place, winner) => (winner ? this.audio.win() : this.audio.beat(false));
    this.ui.abilityHandler = () => this.sendLocal({ t: 'ability' });

    const pad = document.querySelector<HTMLCanvasElement>('#spin-pad');
    if (!pad) throw new Error('Missing #spin-pad');
    this.battleInput = new DesktopBattleInput(canvas, pad);
    this.battleInput.onSpin((r) => this.sendLocal({ t: 'spin', power: r.power, stability: r.stability }));
    this.battleInput.onThrow((r) => this.sendLocal({ t: 'throw', power: r.power, angle: r.angle }));
    this.battleInput.onSteer((x, y) => this.sendLocal({ t: 'steer', x: round2(x), y: round2(y) }));
    this.battleInput.onAbility(() => this.sendLocal({ t: 'ability' }));
    this.battleInput.onPalo((c) => this.sendLocal({ t: 'palo', c: round2(c) }));
    this.battleInput.onFlick((cx, cy) => {
      const g = this.pickGround(cx, cy);
      if (g) this.sendLocal({ t: 'flick', x: round2(g.x), z: round2(g.z) });
    });

    this.atmosphere = new Atmosphere(this.scene);
    this.atmosphere.setClock(CLOCK_START);
    this.world = buildBarangay();
    this.scene.add(this.world.group);
    this.critters = new Critters(createSeededRandom(5));
    this.effects = new Effects(createSeededRandom(9));
    this.chaos = new ChaosView(this.effects);
    this.scene.add(this.critters.group, this.effects.group, this.dog.group, this.podiumFill, this.chaos.group);

    this.spawnExtras();

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.bgTicker.onmessage = () => {
      const now = performance.now();
      // Only when rAF has stalled (hidden/background tab); a live loop ticks every ~16 ms.
      if (!this.hostNet || now - this.lastTickAt < 120) return;
      this.tick(Math.min(0.1, (now - this.lastTickAt) / 1000), now / 1000);
    };

    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.bgTicker.terminate();
    this.leave();
    this.input.dispose();
    this.battleInput.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  // ---------- session setup ----------

  /** Solo with no network at all (no phone pairing). Used offline and by tests. */
  private startOffline(name: string, char: string, power: string): void {
    this.leave();
    this.rm = new RoundManager(this.seed);
    this.localId = this.rm.addHuman(name, char, power);
    this.role = 'solo';
    this.enterGame();
  }

  /** Host a room. Solo also opens one when the network is configured, so a phone can pair. */
  private async startHost(name: string, char: string, power: string, solo: boolean): Promise<void> {
    if (solo && netMode() === 'none') return this.startOffline(name, char, power);
    if (!solo && netMode() === 'none') {
      this.ui.setStatus('Online play needs a Supabase config (see the README), or add ?net=local to the URL.');
      return;
    }
    this.ui.setBusy(true);
    this.ui.setStatus(solo ? 'Setting up the barangay...' : 'Creating a room...');
    const code = makeRoomCode();
    let net: HostNet | null = null;
    try {
      net = await HostNet.create(code);
    } catch (err) {
      this.ui.setBusy(false);
      if (solo) return this.startOffline(name, char, power);
      this.ui.setStatus(`Couldn't create a room: ${(err as Error).message}`);
      return;
    }
    this.ui.setBusy(false);
    this.leave();
    this.hostNet = net;
    this.room = code;
    this.rm = new RoundManager(this.seed);
    this.localId = this.rm.addHuman(name, char, power);
    this.pairKey = randomId();
    this.pairKeys.set(this.localId, this.pairKey);
    this.role = solo ? 'solo' : 'host';
    net.onHello = (peer, hello) => {
      const id = this.rm?.addHuman(hello.name, hello.char, hello.power) ?? -1;
      if (id < 0) return net.send(peer, 'full', null);
      this.peers.set(peer, id);
      this.pairKeys.set(id, String(hello.key).slice(0, 32));
      net.send(peer, 'welcome', id);
    };
    net.onMessage = (peer, msg) => {
      const id = this.peers.get(peer);
      // Only the host may force-start a match.
      if (id !== undefined && msg.t !== 'start') this.rm?.handle(id, msg);
    };
    net.onLeave = (peer) => {
      const id = this.peers.get(peer);
      if (id !== undefined) {
        this.rm?.removePlayer(id);
        this.pairKeys.delete(id);
      }
      this.peers.delete(peer);
    };
    net.onPhone = (m, kind) => this.onPhone(m, kind);
    this.ui.setRoomCode(solo ? null : code);
    this.enterGame();
  }

  private async join(name: string, char: string, power: string, code: string): Promise<void> {
    if (netMode() === 'none') {
      this.ui.setStatus('Online play needs a Supabase config (see the README), or add ?net=local to the URL.');
      return;
    }
    this.ui.setBusy(true);
    this.ui.setStatus(`Joining room ${code}...`);
    const key = randomId();
    try {
      const net = await ClientNet.join(code, { name, char, power, key });
      this.leave();
      this.clientNet = net;
      this.role = 'client';
      this.room = code;
      this.pairKey = key;
      net.onMessage = (msg: HostMsg) => {
        if (msg.ev === 'welcome') this.localId = msg.id;
        else if (msg.ev === 'snap') this.snap = msg.s;
        else if (msg.ev === 'ev') this.pendingEvents.push(...msg.e);
        else if (msg.ev === 'full') this.backToLobby('The room is full (6 max).');
      };
      net.onClose = () => this.backToLobby('Lost the host. Back to the start.');
      this.ui.setRoomCode(code);
      this.enterGame();
    } catch (err) {
      this.ui.setStatus(`Couldn't join: ${(err as Error).message}`);
    } finally {
      this.ui.setBusy(false);
    }
  }

  /** A paired phone's message, accepted only with that player's key (trust boundary). */
  private onPhone(m: PhoneMsg, kind: 'pair' | 'ctl' | 'ping'): void {
    const pid = Number(m?.pid);
    const key = this.pairKeys.get(pid);
    if (!key || key !== m.key || !this.rm) return;
    this.phonePing.set(pid, performance.now());
    if (kind === 'pair') this.rm.setPaired(pid, true);
    if (kind === 'ctl' && m.msg && PHONE_MSGS.has(m.msg.t)) {
      this.rm.setPaired(pid, true);
      this.rm.handle(pid, m.msg);
    }
  }

  private enterGame(): void {
    for (const e of this.extras) e.dispose();
    this.extras = [];
    this.ui.setStatus('');
    this.ui.showLobby(false);
    this.lastPhase = '';
    this.snapCamera = true;
  }

  private backToLobby(message: string): void {
    this.leave();
    this.ui.showLobby(true);
    this.ui.setStatus(message);
    this.spawnExtras();
  }

  private leave(): void {
    this.hostNet?.close();
    this.clientNet?.close();
    this.hostNet = null;
    this.clientNet = null;
    this.peers.clear();
    this.pairKeys.clear();
    this.phonePing.clear();
    this.room = '';
    this.rm = null;
    this.snap = null;
    this.role = 'none';
    this.localId = -1;
    this.pendingEvents = [];
    for (const a of this.avatars.values()) a.dispose();
    for (const t of this.tops.values()) t.dispose();
    this.avatars.clear();
    this.tops.clear();
    this.battleInput.setStage('idle');
    this.ui.setRoomCode(null);
    this.ui.showPodium(null, -1);
    this.audio.setHum(0);
  }

  private sendLocal(msg: ClientMsg): void {
    if (this.rm) this.rm.handle(this.localId, msg);
    else this.clientNet?.send(msg);
  }

  /** The URL a phone opens to become this player's controller, or null without a room. */
  private pairUrl(): string | null {
    if (!this.room || this.localId < 0) return null;
    const base = location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
    const local = netMode() === 'local' ? '&net=local' : '';
    return `${base}controller.html?room=${this.room}&pid=${this.localId}&key=${this.pairKey}${local}`;
  }

  // ---------- frame ----------

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    if (this.paused) {
      this.publishDiagnostics();
      return;
    }
    this.tick(delta, elapsed);
  }

  private tick(dt: number, elapsed: number): void {
    this.lastTickAt = performance.now();
    this.elapsed += dt;
    let events: GameEvent[] = [];
    if (this.rm) {
      this.rm.timeScale = this.tuning.timeScale;
      this.rm.step(dt);
      events = this.rm.drainEvents();
      this.snap = this.rm.snapshot();
      if (this.hostNet) {
        if (events.length) this.hostNet.broadcast('ev', events);
        this.netTimer -= dt;
        if (this.netTimer <= 0) {
          this.netTimer = 1 / 12;
          this.hostNet.broadcast('snap', this.snap);
        }
        const now = performance.now();
        for (const [pid, at] of this.phonePing) {
          if (now - at < PHONE_STALE_MS) continue;
          this.phonePing.delete(pid);
          this.rm.setPaired(pid, false);
        }
      }
    } else {
      events = this.pendingEvents;
      this.pendingEvents = [];
    }

    const snap = this.snap;
    if (snap && this.role !== 'none') {
      if (snap.phase !== this.lastPhase) this.onPhase(snap);
      this.countdown(snap);
      this.syncAvatars(snap, dt, elapsed);
      this.syncTops(snap, dt);
      this.handleEvents(events, snap);
      this.updateLocal(snap, dt);
      this.updateHud(snap, dt);
      if (this.autoplay) this.autoplayTick(snap, dt);
      if (snap.phase === 'podium' && this.rng() < dt * 2.5) {
        const w = this.avatars.get(snap.winner);
        if (w) this.effects.confetti(w.group.position.x, 2.6, w.group.position.z, 25);
      }
      this.hotkeys(snap);
    } else {
      for (const e of this.extras) e.update(dt, elapsed);
    }

    this.battleInput.update(dt);
    this.dog.set(snap && this.role !== 'none' ? snap.dog : null);
    this.dog.update(dt, elapsed);
    this.updateCamera(dt, elapsed);
    const ambient = this.reducedMotion ? 0 : elapsed;
    this.world.update(ambient, snap && this.role !== 'none' ? snap.ring : RING_RADIUS);
    this.syncFlicks(snap && this.role !== 'none' ? snap.flicks : []);
    this.chaos.sync(snap && this.role !== 'none' ? snap : null, this.reducedMotion ? 0 : dt, ambient);
    this.updateEdgeArrows(snap && this.role !== 'none' ? snap : null);
    if (!this.reducedMotion) {
      const local = this.avatars.get(this.localId);
      const people = [...this.avatars.values(), ...this.extras].map((a) => a.group.position);
      const tripped = this.critters.update(dt, elapsed, people, local && this.dashT > 0 ? local.group.position : null);
      if (tripped && local) {
        local.tumble();
        this.audio.cluck();
        this.audio.boing();
      }
    }
    const dusk = THREE.MathUtils.clamp((this.clockShown - 1040) / 60, 0, 1);
    if (!this.reducedMotion && dusk > 0.3 && this.rng() < dt * dusk * 8) {
      const [fx, fz] = FIREFLY_SPOTS[Math.floor(this.rng() * FIREFLY_SPOTS.length)];
      this.effects.firefly(fx + (this.rng() - 0.5) * 3, 0.6 + this.rng() * 2.2, fz + (this.rng() - 0.5) * 3);
    }
    this.effects.update(this.reducedMotion ? 0 : dt, this.camera, this.canvas.clientHeight);
    this.audio.update(dt);
    this.atmosphere.follow(this.camera.position);
    this.updateLabels(dt);
    this.input.endFrame();
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onPhase(snap: Snapshot): void {
    const prev = this.lastPhase;
    this.lastPhase = snap.phase;
    this.lastCount = '';
    const seated = snap.seats.includes(this.localId);
    if (snap.phase !== 'podium') this.ui.showPodium(null, -1);
    switch (snap.phase) {
      case 'charge':
        this.battleInput.setStage(seated ? 'spin' : 'idle');
        this.lastLaps = 0;
        this.ui.showBanner(`Round ${snap.round}`);
        this.ui.introChips();
        break;
      case 'throw':
        this.battleInput.setStage(seated ? 'throw' : 'idle');
        this.ui.showBanner('THROW!');
        this.audio.beat(true);
        break;
      case 'fight': {
        const mine = this.topOf(snap, this.localId);
        this.battleInput.setStage(!seated ? 'idle' : mine && mine[T_LAUNCHED] && !mine[T_ALIVE] ? 'out' : 'fight');
        break;
      }
      case 'podium':
        this.battleInput.setStage('idle');
        this.ui.showPodium(snap.players, snap.winner);
        this.audio.say('Time to go home!', 1.3);
        break;
      case 'hub':
        this.battleInput.setStage('idle');
        if (prev && prev !== 'hub') this.ui.showBanner('See you tomorrow!');
        break;
      default:
        this.battleInput.setStage('idle');
    }
  }

  /** "One! Two! Three!" during the countdown, as in paikutan. */
  private countdown(snap: Snapshot): void {
    if (snap.phase !== 'countdown') return;
    const word = COUNT_WORDS[Math.max(1, Math.min(3, Math.ceil(snap.left)))];
    if (word === this.lastCount) return;
    this.lastCount = word;
    this.ui.showBanner(word.toUpperCase());
    this.audio.beat(false);
    this.audio.say(word);
  }

  private handleEvents(events: GameEvent[], snap: Snapshot): void {
    for (const e of events) {
      switch (e.type) {
        case 'launch': {
          const v = this.tops.get(e.id);
          const hand = this.handOf(e.id);
          if (v && hand) v.throwFrom(hand);
          this.avatars.get(e.id)?.release();
          this.audio.whoosh();
          break;
        }
        case 'hit': {
          const power = e.i * 4;
          this.effects.spark(e.x, 0.3, e.z, 8 + Math.floor(power * 5), power);
          this.effects.puff(e.x, 0.05, e.z, { n: 4 + Math.floor(power * 2), size: 0.35 });
          this.effects.ring(e.x, e.z, '#fff3c8', 0.6 + power * 0.35, 0.4);
          if (e.i > 0.45) this.effects.pow(e.x, 1.1, e.z, CLASH_WORDS[Math.floor(this.rng() * CLASH_WORDS.length)]);
          for (const id of [e.a, e.b]) {
            this.tops.get(id)?.kick(power * 0.3);
            this.ui.hitChip(id, power);
          }
          if (e.a === this.localId || e.b === this.localId) this.ui.shakeSpin(power);
          this.audio.clash(power);
          this.shake = Math.min(0.35, this.shake + power * 0.06);
          break;
        }
        case 'out':
        case 'fall': {
          const ring = e.type === 'out';
          this.effects.puff(e.x, 0.05, e.z, { n: 14, speed: 1.8, size: 0.5 });
          this.effects.ring(e.x, e.z, ring ? '#d6453d' : '#9a8a70', 1.4, 0.6);
          if (ring) this.effects.pow(e.x, 1.0, e.z, 'BLAG!');
          this.audio.out();
          if (e.id === this.localId) {
            // Out of the round, but not out of the fight: aim your multo flicks.
            this.battleInput.setStage(snap.phase === 'fight' ? 'out' : 'idle');
            this.ui.showBanner(ring ? 'OUT!' : 'TOPPLED!');
          }
          break;
        }
        case 'ability': {
          const p = snap.players.find((pl) => pl.id === e.id);
          const color = PLAYER_COLORS[p?.color ?? 0];
          if (e.power === 'kidlat') {
            this.effects.lightning(e.tx, e.tz);
            this.audio.zap();
            this.shake = Math.min(0.4, this.shake + 0.25);
          } else if (e.power === 'tikbalang') {
            this.effects.puff(e.x, 0.05, e.z, { n: 12, speed: 2.2, size: 0.45 });
            this.effects.ring(e.x, e.z, color, 1.1, 0.4);
            this.audio.whoosh();
          } else if (e.power === 'agimat') {
            this.effects.ring(e.x, e.z, '#5ff2d6', 1.0, 0.6);
            this.audio.chime();
          } else if (e.power === 'diwata') {
            this.effects.sparkle(e.x, e.z);
            this.audio.chime();
          } else if (e.power === 'bakunawa') {
            this.effects.ring(e.tx, e.tz, '#3a1f6b', 1.6, 0.8);
            this.effects.puff(e.tx, 0.05, e.tz, { n: 10, color: '#3a2a5a', size: 0.5 });
            this.audio.warn();
          }
          const strike = e.power === 'kidlat' || e.power === 'bakunawa';
          this.effects.pow(strike ? e.tx : e.x, 1.2, strike ? e.tz : e.z, POWER_WORDS[e.power] ?? 'POW!', 1.2);
          const mine = this.tops.get(this.localId);
          if (strike && mine && Math.hypot(mine.group.position.x - e.tx, mine.group.position.z - e.tz) < 0.6) this.ui.shakeSpin(3);
          break;
        }
        case 'windup': {
          const v = this.tops.get(e.id);
          if (!v) break;
          this.effects.telegraph(v.group.position.x, v.group.position.z, e.x, e.z, WINDUP);
          const mine = this.tops.get(this.localId);
          if (mine && e.id !== this.localId && Math.hypot(mine.group.position.x - e.x, mine.group.position.z - e.z) < 0.9) {
            this.targetedT = WINDUP + 0.15;
            this.audio.warn();
          }
          break;
        }
        case 'dog':
          this.ui.showBanner('STRAY DOG!');
          this.audio.bark();
          break;
        case 'bark':
          this.effects.puff(e.x, 0.05, e.z, { n: 8, size: 0.4 });
          this.tops.get(e.id)?.kick(1.2);
          this.audio.bark();
          break;
        case 'chat': {
          const text = QUICK_CHAT[e.i];
          const p = snap.players.find((pl) => pl.id === e.id);
          this.ui.say(e.id, text);
          this.audio.say(text, CHAR_PITCH[p?.char ?? ''] ?? 1);
          break;
        }
        case 'tumble': {
          if (e.id === this.localId) this.avatars.get(this.localId)?.tumble();
          const av = this.avatars.get(e.id);
          if (av) this.effects.puff(av.group.position.x, 0.1, av.group.position.z, { n: 10, size: 0.6, speed: 1.4 });
          this.audio.boing();
          break;
        }
        case 'palo':
          this.effects.puff(e.x, 0.05, e.z, { n: 6 + Math.round(e.c * 10), speed: 1.4 + e.c, size: 0.35 });
          if (e.c > 0.6) this.effects.pow(e.x, 0.7, e.z, 'BWELO!', 1);
          this.audio.whoosh();
          break;
        case 'coin':
          this.effects.sparkle(e.x, e.z);
          this.floatText(e.x, e.z, '+1 PISO', '#f2c230', 0.5);
          this.audio.chime();
          break;
        case 'mangoWarn':
          this.audio.warn();
          break;
        case 'mango': {
          this.effects.pow(e.x, 0.6, e.z, 'PLOK!', 1);
          this.effects.puff(e.x, 0.05, e.z, { n: 10, speed: 1.2, size: 0.35 });
          this.effects.ring(e.x, e.z, '#f5b02e', 0.8, 0.4);
          const mv = this.tops.get(this.localId);
          if (mv && mv.group.position.distanceTo(this.tmp.set(e.x, mv.group.position.y, e.z)) < 1) this.shake = Math.min(0.4, this.shake + 0.2);
          this.audio.land(false);
          break;
        }
        case 'windWarn':
          this.ui.showBanner('HANGIN!');
          this.audio.warn();
          break;
        case 'wind':
          this.audio.whoosh();
          break;
        case 'steal':
          this.floatText(e.x, e.z, `+${Math.round(e.amount * 100)} spin`, e.id === this.localId ? '#2f9e6f' : '#f3e2c0');
          break;
        case 'strike':
          this.effects.pow(e.x, 1.1, e.z, 'STRIKE!', 1.3);
          this.effects.ring(e.x, e.z, '#ffd23f', 1.4, 0.5);
          this.shake = Math.min(0.4, this.shake + 0.25);
          this.audio.clash(3);
          break;
        case 'flick':
          this.audio.whoosh();
          break;
        case 'flickHit':
          this.effects.puff(e.x, 0.05, e.z, { n: 8, size: 0.35, color: '#c9c2e8' });
          this.effects.pow(e.x, 0.9, e.z, 'BOINK!', 0.9);
          this.tops.get(e.id)?.kick(1);
          this.audio.boing();
          break;
        case 'squeeze':
          this.ui.showBanner('THE CIRCLE IS SHRINKING!');
          this.audio.warn();
          break;
        case 'ko': {
          const hitter = snap.players.find((pl) => pl.id === e.id);
          if (e.id === this.localId) this.ui.showBanner(e.how === 'out' ? `+${e.pts} RING-OUT!` : `+${e.pts} KO!`);
          const av = this.avatars.get(e.id);
          if (av && hitter) this.floatText(av.group.position.x, av.group.position.z, `+${e.pts} ${e.how === 'out' ? 'RING-OUT' : 'KO'}`, PLAYER_COLORS[hitter.color], 2.4);
          break;
        }
        case 'roundWin': {
          const p = snap.players.find((pl) => pl.id === e.id);
          this.ui.showBanner(p ? `${p.name.toUpperCase()} WINS +3!` : 'DRAW!');
          if (e.id === this.localId) this.audio.win();
          const w = this.tops.get(e.id);
          if (w) this.effects.confetti(w.group.position.x, 0.5, w.group.position.z);
          break;
        }
        default:
          break;
      }
    }
  }

  /** World position of a player's throwing hand, if their avatar exists. */
  private handOf(id: number): THREE.Vector3 | null {
    const av = this.avatars.get(id);
    return av ? av.rig.hand.getWorldPosition(new THREE.Vector3()) : null;
  }

  private topOf(snap: Snapshot, id: number): TopSnap | undefined {
    return snap.tops.find((t) => t[0] === id);
  }

  private me(snap: Snapshot): PlayerInfo | undefined {
    return snap.players.find((p) => p.id === this.localId);
  }

  private syncAvatars(snap: Snapshot, dt: number, elapsed: number): void {
    const ids = new Set(snap.players.map((p) => p.id));
    for (const p of snap.players) {
      if (this.avatars.has(p.id)) continue;
      const av = new Avatar(p.char, PLAYER_COLORS[p.color]);
      const held = new TrompoView(PLAYER_COLORS[p.color]);
      held.setState(0, 0, { spin: 0, wobble: 0, launched: true, alive: true, out: false, shield: false, invert: false }, true);
      held.group.scale.setScalar(0.7);
      held.group.rotation.x = Math.PI;
      av.rig.hand.add(held.group);
      av.held = held.group;
      const pose = snap.avatars[p.id];
      if (p.id === this.localId) av.setTarget(SPAWN.x + ((p.id % 6) - 2.5) * 0.9, SPAWN.z, Math.PI, true);
      else if (pose) av.setTarget(pose[0], pose[1], pose[2], true);
      this.scene.add(av.group);
      this.avatars.set(p.id, av);
    }
    for (const [id, av] of this.avatars) {
      if (ids.has(id)) continue;
      av.dispose();
      this.avatars.delete(id);
    }

    for (const [id, av] of this.avatars) {
      if (id !== this.localId) {
        const pose = snap.avatars[id];
        if (pose) {
          av.setTarget(pose[0], pose[1], pose[2]);
          if (pose[3] & AV_TUMBLE && !av.tumbling) av.tumble();
        }
        av.followTarget(dt);
      }
      this.applyMode(av, id, snap);
      av.update(dt, elapsed);
      // Running kicks up dust from the dirt.
      if (av.speed > 6 && this.rng() < 0.5) this.effects.puff(av.group.position.x, 0.05, av.group.position.z, { n: 1, size: 0.3, speed: 0.4, life: 0.6 });
    }
  }

  private applyMode(av: Avatar, id: number, snap: Snapshot): void {
    const top = this.topOf(snap, id);
    switch (snap.phase) {
      case 'charge':
      case 'countdown':
        // Winding the string = drawing circles.
        av.mode = 'wind';
        break;
      case 'throw':
        if (!top || !top[T_LAUNCHED]) av.mode = 'wind';
        else if (av.mode === 'wind') av.release();
        break;
      case 'fight':
        if (av.mode !== 'release') av.mode = top && top[T_ALIVE] ? 'watch' : 'sad';
        break;
      case 'roundEnd':
        av.mode = id === snap.winner ? 'cheer' : 'sad';
        break;
      case 'podium':
        av.mode = id === snap.winner ? 'cheer' : 'idle';
        break;
      default:
        av.mode = 'idle';
    }
  }

  private updateLocal(snap: Snapshot, dt: number): void {
    const av = this.avatars.get(this.localId);
    if (!av) return;
    const seat = snap.seats.indexOf(this.localId);
    const top = this.topOf(snap, this.localId);
    const inMatch = snap.phase === 'charge' || snap.phase === 'countdown' || snap.phase === 'throw' || snap.phase === 'fight';
    // Stay at your seat while your top is in play; walk off once it's down.
    const locked = seat >= 0 && inMatch && (!top || !top[T_LAUNCHED] || top[T_ALIVE] === 1);
    const pos = av.group.position;

    this.dashT -= dt;
    this.dashCd -= dt;
    if (locked) {
      const s = slotPos(seat, snap.seats.length);
      this.tmp.set(s.x, 0, s.y);
      pos.lerp(this.tmp, 1 - Math.exp(-dt * 10));
      av.group.rotation.y = lerpAngle(av.group.rotation.y, Math.atan2(-s.x, -s.y), 1 - Math.exp(-dt * 10));
      this.localVel.set(0, 0, 0);
      av.speed = 0;
    } else if (!av.tumbling) {
      this.input.readMovement(this.move);
      // Camera-relative: W walks away from the camera.
      const yaw = Math.atan2(this.camera.position.x - this.look.x, this.camera.position.z - this.look.z);
      const mx = this.move.x * Math.cos(yaw) + this.move.y * Math.sin(yaw);
      const mz = -this.move.x * Math.sin(yaw) + this.move.y * Math.cos(yaw);
      if (this.input.isDashHeld() && this.dashCd <= 0 && this.move.lengthSq() > 0) {
        this.dashT = DASH_TIME;
        this.dashCd = DASH_COOLDOWN;
      }
      const speed = this.tuning.walkSpeed * (this.dashT > 0 ? 2.1 : 1) * (av.char === 'bata' ? 1.12 : 1);
      this.tmp.set(mx * speed, 0, mz * speed);
      this.localVel.lerp(this.tmp, 1 - Math.exp(-dt * 14));
      pos.addScaledVector(this.localVel, dt);
      this.collide(pos);
      if (this.localVel.lengthSq() > 0.2) {
        av.group.rotation.y = lerpAngle(av.group.rotation.y, Math.atan2(this.localVel.x, this.localVel.z), 1 - Math.exp(-dt * 12));
      }
      av.speed = this.localVel.length();
    } else {
      this.localVel.multiplyScalar(0.9);
      av.speed = 0;
    }

    const flags = (av.speed > 0.4 ? AV_MOVING : 0) | (this.dashT > 0 ? AV_DASH : 0) | (av.tumbling ? AV_TUMBLE : 0);
    const pose: [number, number, number, number] = [round2(pos.x), round2(pos.z), round2(av.group.rotation.y), flags];
    if (this.rm) {
      this.rm.handle(this.localId, { t: 'av', p: pose });
    } else {
      this.sendTimer -= dt;
      if (this.sendTimer <= 0) {
        this.sendTimer = 0.1;
        this.clientNet?.send({ t: 'av', p: pose });
      }
    }
  }

  private collide(pos: THREE.Vector3): void {
    const r = 0.35;
    for (const c of this.world.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const px = c.hw + r - Math.abs(dx);
      const pz = c.hd + r - Math.abs(dz);
      if (px <= 0 || pz <= 0) continue;
      if (px < pz) pos.x += Math.sign(dx) * px;
      else pos.z += Math.sign(dz) * pz;
    }
    pos.x = THREE.MathUtils.clamp(pos.x, BOUNDS.minX, BOUNDS.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, BOUNDS.minZ, BOUNDS.maxZ);
  }

  private syncTops(snap: Snapshot, dt: number): void {
    const ids = new Set(snap.tops.map((t) => t[0]));
    for (const [id, view] of this.tops) {
      if (ids.has(id)) continue;
      view.dispose();
      this.tops.delete(id);
    }
    for (const t of snap.tops) {
      let view = this.tops.get(t[0]);
      const fresh = !view;
      const p = snap.players.find((pl) => pl.id === t[0]);
      if (!view) {
        view = new TrompoView(PLAYER_COLORS[p?.color ?? 0]);
        this.scene.add(view.group);
        this.tops.set(t[0], view);
      }
      const before = view.group.position.clone();
      view.setState(
        t[T_X],
        t[T_Z],
        { spin: t[T_SPIN], wobble: t[T_WOBBLE], launched: !!t[T_LAUNCHED], alive: !!t[T_ALIVE], out: !!t[T_OUT], shield: !!t[T_SHIELD], invert: !!t[T_INVERT] },
        fresh,
      );
      view.update(this.reducedMotion ? 0 : dt);
      const pos = view.group.position;
      if (view.flying) {
        const hand = this.handOf(t[0]);
        if (hand) this.effects.trackThrow(t[0], hand, pos.clone().setY(pos.y + 0.3), PLAYER_COLORS[p?.color ?? 0]);
      } else if (view.justLanded) {
        this.effects.landThrow(t[0], this.handOf(t[0]) ?? pos);
        this.effects.puff(pos.x, 0.05, pos.z, { n: 10, speed: 1.3 });
        this.effects.ring(pos.x, pos.z, '#f3e2c0', 0.9);
        this.audio.land(false);
      } else if (t[T_LAUNCHED] && t[T_ALIVE]) {
        const moved = before.distanceTo(pos);
        if (moved > 0.03 && this.rng() < 0.6) this.effects.puff(pos.x, 0.04, pos.z, { n: 1, size: 0.22, speed: 0.3, up: 0.3, life: 0.7 });
        if (t[T_DASH]) this.effects.puff(pos.x, 0.05, pos.z, { n: 2, size: 0.4, speed: 0.6 });
      }
    }
    const mine = this.topOf(snap, this.localId);
    const mineAlive = !!mine && !!mine[T_LAUNCHED] && !!mine[T_ALIVE];
    this.audio.setHum(mineAlive ? mine![T_SPIN] : 0);

    // Danger telegraph: a stronger rival close by, or a power already aimed at you.
    this.targetedT = Math.max(0, this.targetedT - dt);
    let danger = 0;
    const view = this.tops.get(this.localId);
    if (mine && view && mineAlive && snap.phase === 'fight') {
      for (const t of snap.tops) {
        if (t[0] === this.localId || !t[T_LAUNCHED] || !t[T_ALIVE] || t[T_SPIN] <= mine[T_SPIN]) continue;
        const d = Math.hypot(t[T_X] - mine[T_X], t[T_Z] - mine[T_Z]);
        danger = Math.max(danger, THREE.MathUtils.clamp(1 - d / 1.8, 0, 1) * 0.55);
      }
      if (this.targetedT > 0) danger = 1;
    }
    this.effects.setDanger(view?.group.position.x ?? 0, view?.group.position.z ?? 0, danger);
  }

  private updateHud(snap: Snapshot, dt: number): void {
    const targetClock = snap.phase === 'hub' ? CLOCK_START : snap.clock;
    this.clockShown += (targetClock - this.clockShown) * Math.min(1, dt * 0.8);
    this.atmosphere.setClock(this.clockShown);
    this.audio.setDusk(THREE.MathUtils.clamp((this.clockShown - 1040) / 60, 0, 1));
    this.ui.setClock(this.clockShown);

    const live = snap.phase !== 'hub' && snap.phase !== 'podium';
    this.ui.scores(snap.players, snap.tops, this.localId, live);

    const seated = snap.seats.includes(this.localId);
    const me = this.me(snap);
    const paired = !!me?.paired;

    // PAIKOT: draw circles (or on the paired phone).
    const pr = this.battleInput.progress;
    const drawing = snap.phase === 'charge' && seated && !!me && !me.spun;
    if (drawing && Math.floor(pr.laps) > this.lastLaps) this.audio.lap();
    this.lastLaps = drawing ? Math.floor(pr.laps) : 0;
    const spunNote = me?.spun ? 'Nice spin! Waiting for the others…' : paired ? '📱 Or draw on your phone.' : null;
    this.ui.spinState(snap.phase === 'charge' && seated, me?.spun ? me.spinPower : pr.power, me?.spun ? me.steadiness : pr.stability, spunNote);

    // BITAW: countdown, then throw.
    const throwing = seated && (snap.phase === 'countdown' || (snap.phase === 'throw' && !me?.thrown));
    const count = snap.phase === 'countdown' ? (this.lastCount || 'One!') : 'THROW!';
    const how =
      snap.phase === 'countdown'
        ? 'Get ready…'
        : paired
          ? 'Flick your phone forward! (or drag the mouse up)'
          : 'Drag the mouse up and let go! (Space = medium throw)';
    this.ui.throwState(throwing, count, this.battleInput.aim, how);

    // LABAN: spin meter, power button, Bakunawa warning.
    const mine = this.topOf(snap, this.localId);
    const alive = (snap.phase === 'fight' || snap.phase === 'throw') && !!mine && !!mine[T_LAUNCHED] && !!mine[T_ALIVE];
    this.ui.fightState(alive ? mine![T_SPIN] : null, mine ? mine[T_CHARGE] : 0, me?.power ?? 'kidlat', !!mine?.[T_INVERT], mine ? mine[T_WOBBLE] : 0);
    // Powers were getting forgotten: call it out the moment it's ready.
    const ready = alive && mine![T_CHARGE] >= 1;
    if (ready && !this.powerWasReady) {
      this.ui.showBanner('POWER READY!');
      this.audio.chime();
    }
    this.powerWasReady = ready;
    this.ui.paloCharge(alive && snap.phase === 'fight' ? this.battleInput.paloCharge : null);
    this.ui.windArrow(this.windAngle(snap), !!snap.wind && snap.wind[2] > 0);

    this.ui.setPairing(this.pairUrl(), paired, this.room ? null : 'Phones need an online room (Supabase) or ?net=local.');
    this.ui.setHint(this.hintFor(snap, alive, paired));
  }

  private hintFor(snap: Snapshot, alive: boolean, paired: boolean): string {
    const seated = snap.seats.includes(this.localId);
    switch (snap.phase) {
      case 'hub': {
        if (snap.startIn > 0) return `Ready! Starting in ${Math.ceil(snap.startIn)}...`;
        const av = this.avatars.get(this.localId);
        const inside = av && Math.hypot(av.group.position.x, av.group.position.z) < READY_RADIUS;
        const host = this.role !== 'client' ? ' · Enter: start now' : '';
        return inside
          ? `Waiting for the others in the circle...${host}`
          : `Step into the ring of stones to play · WASD walk · Shift run · 📱 phone controller${host}`;
      }
      case 'charge':
        return seated ? '' : 'You\'re watching this one. You\'ll join the next match.';
      case 'countdown':
      case 'throw':
        return seated ? '' : 'Watching...';
      case 'fight':
        if (alive) return paired ? 'Tilt to steer · tap the pad = PALO, hold = charged · power button' : 'WASD steer · tap Space/click = PALO, HOLD = charged palo · E / right-click power';
        return seated ? 'You\'re out — click the circle to flick your tsinelas at someone!' : 'Watching...';
      case 'roundEnd':
        return '';
      case 'podium':
        return 'Time to go home! It\'s getting dark...';
    }
  }

  private hotkeys(snap: Snapshot): void {
    for (let i = 0; i < QUICK_CHAT.length; i += 1) {
      if (this.input.consume(`Digit${i + 1}`)) this.sendLocal({ t: 'chat', i });
    }
    if (this.input.consume('Enter') && this.role !== 'client' && snap.phase === 'hub') this.sendLocal({ t: 'start' });
  }

  /** Test hook: a bot plays the local seat through the real message path. */
  private autoplayTick(snap: Snapshot, dt: number): void {
    const av = this.avatars.get(this.localId);
    const me = this.me(snap);
    if (snap.phase === 'hub' && av) av.group.position.set(0, 0, 3);
    if (snap.phase === 'charge' && me && !me.spun && snap.t > 0.5) this.sendLocal({ t: 'spin', power: 0.8, stability: 0.7 });
    if (snap.phase === 'throw' && me && !me.thrown && snap.t > 0.3) this.sendLocal({ t: 'throw', power: 0.6, angle: (this.rng() - 0.5) * 0.3 });
    this.autoTimer -= dt;
    if (snap.phase === 'fight' && this.rm?.battle && this.autoTimer <= 0) {
      this.autoTimer = 0.2;
      const top = this.rm.battle.top(this.localId);
      if (top && top.alive && top.launched) {
        const d = botSteer(this.rm.battle, top, this.rng);
        this.sendLocal({ t: 'steer', x: d.x, y: d.y });
        if (d.ability) this.sendLocal({ t: 'ability' });
        if (d.palo) this.sendLocal({ t: 'palo', c: round2(d.paloCharge) });
      }
    }
  }

  private updateCamera(dt: number, elapsed: number): void {
    const snap = this.role === 'none' ? null : this.snap;
    const local = this.avatars.get(this.localId);
    const phase: Phase | 'lobby' = snap ? snap.phase : 'lobby';
    const free = !!snap && (phase === 'hub' || (phase === 'fight' && !snap.seats.includes(this.localId)));

    if (phase === 'lobby') {
      const a = elapsed * 0.05;
      this.camTarget.set(Math.sin(a) * 15, 6.5, Math.cos(a) * 15 + 2);
      this.lookTarget.set(0, 1.4, -3);
    } else if (free && local) {
      this.camTarget.copy(local.group.position).add(this.tmp.set(0, 6.2, 7.2));
      this.lookTarget.copy(local.group.position).add(this.tmp.set(0, 1.0, -1.2));
    } else if (phase === 'roundEnd' && snap) {
      const w = this.tops.get(snap.winner);
      const center = this.tmp.set(0, 0, 0);
      if (w) center.lerp(w.group.position, 0.6);
      const a = elapsed * 0.4;
      this.lookTarget.set(center.x, 0.3, center.z);
      // Slow orbit inside the ring of seated players, above heads and below the banderitas.
      this.camTarget.set(center.x + Math.sin(a) * 2.6, 4.2, center.z + Math.cos(a) * 2.6);
    } else if (phase === 'podium' && snap) {
      const w = this.avatars.get(snap.winner) ?? local;
      if (w) {
        // Winner on the left third, the podium card on the right.
        const fx = Math.sin(w.group.rotation.y);
        const fz = Math.cos(w.group.rotation.y);
        this.camTarget.copy(w.group.position).add(this.tmp.set(fx * 4.6, 2.0, fz * 4.6));
        this.lookTarget.copy(w.group.position).add(this.tmp.set(fz * 1.4, 1.0, -fx * 1.4));
        this.podiumFill.position.copy(w.group.position).add(this.tmp.set(fx * 2.2, 2.2, fz * 2.2));
      }
    }
    let mode: typeof this.camMode = 'other';
    let fov = 50;
    let lag = this.tuning.cameraLag * (phase === 'lobby' ? 4 : 1);
    const myView = this.tops.get(this.localId);
    const mineTop = snap ? this.topOf(snap, this.localId) : undefined;
    const seated = !!snap && snap.seats.includes(this.localId);
    if (snap && seated && local && (phase === 'charge' || phase === 'countdown' || (phase === 'throw' && !mineTop?.[T_LAUNCHED]))) {
      // First person: you're the one winding the string and casting it.
      mode = 'fp';
      fov = 65;
      lag = 0.04;
      const ry = local.group.rotation.y;
      const fx = Math.sin(ry);
      const fz = Math.cos(ry);
      local.rig.head.getWorldPosition(this.camTarget);
      this.camTarget.add(this.tmp.set(fx * 0.12, 0.34, fz * 0.12));
      const down = phase === 'charge' ? 1.05 : 0.75;
      this.lookTarget.copy(this.camTarget).add(this.tmp.set(fx * 1.3, -down, fz * 1.3));
    } else if (snap && seated && myView && mineTop?.[T_LAUNCHED] && mineTop[T_ALIVE] && (phase === 'throw' || phase === 'fight')) {
      // Ant cam: low behind your top, still on your seat's yaw so W stays "away from you".
      const seat = snap.seats.indexOf(this.localId);
      const s = slotPos(seat, snap.seats.length);
      const len = Math.hypot(s.x, s.y) || 1;
      const dx = s.x / len;
      const dz = s.y / len;
      const p = myView.group.position;
      const c = this.battleInput.paloCharge;
      mode = myView.flying ? 'ride' : 'ant';
      fov = 62 - c * 10;
      lag = myView.flying ? 0.09 : 0.06;
      const back = 1.7 + c * 0.6;
      this.camTarget.set(p.x + dx * back, Math.max(0.55 + c * 0.2, p.y + 0.35), p.z + dz * back);
      this.lookTarget.set(p.x - dx * 1.1, Math.max(0.1, p.y), p.z - dz * 1.1);
    } else if (snap && !(phase === 'roundEnd' || phase === 'podium' || free)) {
      // Behind your seat: W/tilt-forward steers away from you, as in paikutan. The camera never
      // rotates off that angle, so steering stays consistent; it only slides and zooms.
      const seat = snap.seats.indexOf(this.localId);
      const s = seat >= 0 ? slotPos(seat, snap.seats.length) : { x: 0, y: 1 };
      const len = Math.hypot(s.x, s.y) || 1;
      const dx = s.x / len;
      const dz = s.y / len;
      const mine = this.topOf(snap, this.localId);
      if (phase === 'fight' && mine && mine[T_LAUNCHED] && mine[T_ALIVE]) {
        // Follow: frame your top and its nearest rival.
        let rx = mine[T_X];
        let rz = mine[T_Z];
        let best = Infinity;
        for (const t of snap.tops) {
          if (t[0] === this.localId || !t[T_LAUNCHED] || !t[T_ALIVE]) continue;
          const d = Math.hypot(t[T_X] - mine[T_X], t[T_Z] - mine[T_Z]);
          if (d < best) {
            best = d;
            rx = t[T_X];
            rz = t[T_Z];
          }
        }
        const cx = mine[T_X] * 0.65 + rx * 0.35;
        const cz = mine[T_Z] * 0.65 + rz * 0.35;
        const dist = THREE.MathUtils.clamp(4.6 + (Number.isFinite(best) ? best : 0) * 0.9, 4.6, 7.5);
        this.camTarget.set(cx + dx * dist, 2.4 + dist * 0.42, cz + dz * dist);
        this.lookTarget.set(cx, 0.2, cz);
      } else {
        // Before the throw, or out of the round: the whole bilog (aim your flicks from here).
        const out = phase === 'fight';
        this.camTarget.set(dx * (out ? 7.4 : 8.4), out ? 7 : 5.8, dz * (out ? 7.4 : 8.4));
        this.lookTarget.set(0, 0.2, 0);
      }
    }
    if (mode !== this.camMode) {
      this.camMode = mode;
      document.body.classList.toggle('fp', mode === 'fp');
    }
    // Your own head would fill the first-person view; your whole body would block the ant cam.
    if (local) {
      local.rig.head.visible = mode !== 'fp';
      local.group.visible = mode !== 'ant' && mode !== 'ride';
    }
    const near = mode === 'other' ? 0.1 : 0.03;
    if (Math.abs(this.camera.fov - fov) > 0.05 || this.camera.near !== near) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    this.podiumFill.intensity = phase === 'podium' ? 4 : 0;
    const k = this.snapCamera ? 1 : 1 - Math.exp(-dt / Math.max(0.01, lag));
    this.camera.position.lerp(this.camTarget, k);
    this.look.lerp(this.lookTarget, this.snapCamera ? 1 : Math.min(1, k * 1.5));
    this.snapCamera = false;
    if (this.shake > 0.001 && !this.reducedMotion) {
      // Down at ant height the same shake reads several times bigger.
      const amp = this.shake * (mode === 'ant' || mode === 'ride' ? 0.3 : 1);
      this.camera.position.x += (this.rng() - 0.5) * amp;
      this.camera.position.y += (this.rng() - 0.5) * amp;
      this.shake *= Math.exp(-dt * 7);
    }
    this.camera.lookAt(this.look);
  }

  private updateLabels(dt: number): void {
    const snap = this.snap;
    const alive = new Set<number>();
    if (snap && this.role !== 'none') {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      for (const p of snap.players) {
        const av = this.avatars.get(p.id);
        if (!av) continue;
        alive.add(p.id);
        this.tmp.copy(av.group.position);
        this.tmp.y += p.char === 'bata' ? 1.65 : 2.0;
        const dist = this.tmp.distanceTo(this.camera.position);
        this.tmp.project(this.camera);
        const visible = this.tmp.z < 1 && dist < 32 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1;
        const name = p.paired ? `📱 ${p.name}` : p.name;
        const self = p.id === this.localId && this.camMode !== 'other';
        this.ui.label(p.id, name, PLAYER_COLORS[p.color], (this.tmp.x * 0.5 + 0.5) * w, (-this.tmp.y * 0.5 + 0.5) * h, visible && !self, dt);
      }
    }
    this.ui.pruneLabels(alive);
  }

  private pickGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  /** A short floating label at a world spot (spin stolen, KO points). */
  private floatText(x: number, z: number, text: string, color: string, y = 0.9): void {
    this.tmp.set(x, y, z).project(this.camera);
    if (this.tmp.z > 1) return;
    this.ui.floatText((this.tmp.x * 0.5 + 0.5) * this.canvas.clientWidth, (-this.tmp.y * 0.5 + 0.5) * this.canvas.clientHeight, text, color);
  }

  /** On-screen direction of the wind (radians, screen space, y down), or null. */
  private windAngle(snap: Snapshot): number | null {
    if (!snap.wind) return null;
    const a = this.tmp.copy(this.look).project(this.camera);
    const b = this.tmp2.set(this.look.x + snap.wind[0], this.look.y, this.look.z + snap.wind[1]).project(this.camera);
    return Math.atan2(-(b.y - a.y), b.x - a.x);
  }

  /** Down at ant height you can't see who's coming: arrows on the screen edge for close rivals and mango shadows. */
  private updateEdgeArrows(snap: Snapshot | null): void {
    const items: { x: number; y: number; angle: number; color: string; danger: boolean }[] = [];
    const mine = snap ? this.topOf(snap, this.localId) : undefined;
    if (snap && mine && (this.camMode === 'ant' || this.camMode === 'ride')) {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      const add = (x: number, z: number, color: string, danger: boolean) => {
        this.tmp.set(x, 0.2, z).project(this.camera);
        let sx = this.tmp.x;
        let sy = this.tmp.y;
        const behind = this.tmp.z > 1;
        if (!behind && Math.abs(sx) < 0.9 && Math.abs(sy) < 0.9) return;
        if (behind) {
          sx = -sx;
          sy = -sy;
        }
        const angle = Math.atan2(-sy, sx);
        items.push({ x: w / 2 + Math.cos(angle) * (w / 2 - 36), y: h / 2 + Math.sin(angle) * (h / 2 - 36), angle, color, danger });
      };
      for (const t of snap.tops) {
        if (t[0] === this.localId || !t[T_LAUNCHED] || !t[T_ALIVE]) continue;
        if (Math.hypot(t[T_X] - mine[T_X], t[T_Z] - mine[T_Z]) > 2) continue;
        const p = snap.players.find((pl) => pl.id === t[0]);
        add(t[T_X], t[T_Z], PLAYER_COLORS[p?.color ?? 0], !!t[T_DASH]);
      }
      for (const m of snap.mangoes) {
        if (m[2] < 0 && Math.hypot(m[0] - mine[T_X], m[1] - mine[T_Z]) < 1) add(m[0], m[1], '#f2c230', true);
      }
    }
    this.ui.edgeArrows(items);
  }

  /** Ghostly tsinelas flicked by knocked-out players. */
  private syncFlicks(flicks: [number, number][]): void {
    while (this.flickMeshes.length < flicks.length) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.04, 0.34),
        new THREE.MeshBasicMaterial({ color: '#c9c2e8', transparent: true, opacity: 0.75 }),
      );
      this.scene.add(m);
      this.flickMeshes.push(m);
    }
    this.flickMeshes.forEach((m, i) => {
      const f = flicks[i];
      m.visible = !!f;
      if (!f) return;
      m.position.set(f[0], 0.12, f[1]);
      m.rotation.y += 0.4;
    });
  }

  /** Townsfolk for the title screen backdrop. */
  private spawnExtras(): void {
    for (const [char, color, x, z, ry] of [
      ['lola', '#e94b8a', -0.8, -4.7, 0.2],
      ['totoy', '#2f6fd1', 1.4, -4.6, -0.3],
      ['bata', '#d6453d', 1.2, 1.2, 2.6],
      ['marites', '#3aa35b', -7.4, -4.4, 0.8],
    ] as [string, string, number, number, number][]) {
      const a = new Avatar(char, color);
      a.setTarget(x, z, ry, true);
      this.scene.add(a.group);
      this.extras.push(a);
    }
  }

  // ---------- test hooks & diagnostics ----------

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.seed = value;
        this.rng = createSeededRandom(value);
        this.rm?.reseed(value);
      },
      setState: (name: string) => {
        if (!TEST_STATES.includes(name)) throw new Error(`Unknown test state: ${name}`);
        if (name === 'lobby') {
          this.backToLobby('');
        } else {
          if (this.role === 'none' || !this.rm) this.startOffline('You', 'lola', 'kidlat');
          this.rm!.forcePhase(name === 'dusk' ? 'fight' : (name as Phase));
          if (name === 'dusk') this.rm!.clock = CLOCK_DUSK + 10;
          this.clockShown = name === 'hub' ? CLOCK_START : this.rm!.clock;
        }
        this.snapCamera = true;
        // Settle a few frames so avatars, tops and camera reflect the state.
        for (let i = 0; i < 30; i += 1) this.tick(1 / 60, this.elapsed + 1 / 60);
        this.snapCamera = true;
        this.tick(1 / 60, this.elapsed);
        this.render();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.paused = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
        this.render();
      },
      hideDebugUi: (hidden: boolean) => {
        this.debugTools.setHidden(hidden);
      },
      setTimeScale: (scale: number) => {
        this.tuning.timeScale = scale;
      },
      setAutoplay: (enabled: boolean) => {
        this.autoplay = enabled;
      },
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const local = this.avatars.get(this.localId);
    const snap = this.snap;
    const mine = snap ? this.topOf(snap, this.localId) : undefined;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      role: this.role,
      phase: this.role === 'none' ? 'lobby' : (snap?.phase ?? 'connecting'),
      round: snap?.round ?? 0,
      clock: this.clockShown,
      localId: this.localId,
      players: (snap?.players ?? []).map((p) => ({ id: p.id, name: p.name, bot: p.bot, score: p.score })),
      alive: snap ? snap.tops.filter((t) => t[T_LAUNCHED] && t[T_ALIVE]).length : 0,
      localSpin: mine && mine[T_ALIVE] ? mine[T_SPIN] : 0,
      player: {
        position: { x: local?.group.position.x ?? 0, y: 0, z: local?.group.position.z ?? 0 },
        speed: local?.speed ?? 0,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
    };
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
