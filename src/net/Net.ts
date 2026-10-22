import type { ClientMsg, GameEvent, Snapshot } from '../game/RoundManager';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

// Room transport, following paikutan's net.js: Supabase Realtime broadcast for
// online rooms (HTTPS, works for phones on mobile data), or BroadcastChannel
// with ?net=local for tabs on one PC without internet. The host's tab is the
// authority; players and paired phones send it messages on one shared channel.

export type Hello = { name: string; char: string; power: string; key: string };
type Envelope = { from: string; to?: string; ev: string; p: unknown };
type Raw = { send(env: Envelope): void; close(): void };

export type NetMode = 'online' | 'local' | 'none';

export function netMode(): NetMode {
  if (new URLSearchParams(location.search).get('net') === 'local') return 'local';
  return SUPABASE_URL && SUPABASE_KEY ? 'online' : 'none';
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => alphabet[b % alphabet.length]).join('');
}

export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function open(room: string, onEnvelope: (e: Envelope) => void): Promise<Raw> {
  const name = `trompow-${room.toUpperCase()}`;
  if (netMode() === 'local') {
    const bc = new BroadcastChannel(name);
    bc.onmessage = (e) => onEnvelope(e.data as Envelope);
    return { send: (env) => bc.postMessage(env), close: () => bc.close() };
  }
  if (netMode() === 'none') throw new Error('No Supabase config (see the README) — try ?net=local');
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 40 } },
  });
  const ch = sb.channel(name, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onEnvelope(payload as Envelope));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timed out')), 12000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(status));
      }
    });
  });
  return {
    send: (env) => void ch.send({ type: 'broadcast', event: 'm', payload: env }),
    close: () => void sb.removeChannel(ch),
  };
}

/** A message from a paired phone, authenticated by the player's pairing key. */
export type PhoneMsg = { pid: number; key: string; msg?: ClientMsg };

const STALE_MS = 7000;

export class HostNet {
  onHello: (peer: string, hello: Hello) => void = () => {};
  onMessage: (peer: string, msg: ClientMsg) => void = () => {};
  onLeave: (peer: string) => void = () => {};
  onPhone: (m: PhoneMsg, kind: 'pair' | 'ctl' | 'ping') => void = () => {};
  private readonly seen = new Map<string, number>();
  private readonly timer: number;
  readonly id = 'host';

  private constructor(private readonly raw: Raw) {
    // Broadcast has no disconnect event: a player who goes quiet has left.
    this.timer = window.setInterval(() => {
      const now = performance.now();
      for (const [peer, at] of this.seen) {
        if (now - at > STALE_MS) {
          this.seen.delete(peer);
          this.onLeave(peer);
        }
      }
    }, 1000);
  }

  static async create(room: string): Promise<HostNet> {
    let net: HostNet | null = null;
    const raw = await open(room, (e) => net?.receive(e));
    net = new HostNet(raw);
    return net;
  }

  send(peer: string, ev: string, p: unknown): void {
    this.raw.send({ from: this.id, to: peer, ev, p });
  }

  broadcast(ev: 'snap' | 'ev', p: Snapshot | GameEvent[]): void {
    this.raw.send({ from: this.id, ev, p });
  }

  get count(): number {
    return this.seen.size;
  }

  close(): void {
    clearInterval(this.timer);
    this.raw.close();
  }

  private receive(e: Envelope): void {
    if (e.to && e.to !== this.id) return;
    if (e.ev === 'pair' || e.ev === 'ctl' || e.ev === 'ping') {
      this.onPhone(e.p as PhoneMsg, e.ev);
      return;
    }
    const known = this.seen.has(e.from);
    if (e.ev === 'hello') {
      this.seen.set(e.from, performance.now());
      if (!known) this.onHello(e.from, e.p as Hello);
      return;
    }
    if (!known) return;
    this.seen.set(e.from, performance.now());
    if (e.ev === 'msg') this.onMessage(e.from, e.p as ClientMsg);
    else if (e.ev === 'bye') {
      this.seen.delete(e.from);
      this.onLeave(e.from);
    }
  }
}

export type HostMsg = { ev: 'welcome'; id: number } | { ev: 'snap'; s: Snapshot } | { ev: 'ev'; e: GameEvent[] } | { ev: 'full' };

export class ClientNet {
  onMessage: (msg: HostMsg) => void = () => {};
  onClose: () => void = () => {};
  private lastHost = performance.now();
  private readonly timer: number;

  private constructor(
    private readonly raw: Raw,
    readonly id: string,
  ) {
    this.timer = window.setInterval(() => {
      if (performance.now() - this.lastHost > STALE_MS) this.onClose();
    }, 1000);
  }

  /** Join a room and wait for the host to welcome us. */
  static join(room: string, hello: Hello): Promise<ClientNet> {
    return new Promise((resolve, reject) => {
      const id = randomId();
      let net: ClientNet | null = null;
      let welcomed = false;
      const fail = setTimeout(() => {
        net?.close();
        reject(new Error('No answer. Check the room code.'));
      }, 12000);
      open(room, (e) => {
        if (!net || (e.to && e.to !== id) || e.from !== 'host') return;
        net.lastHost = performance.now();
        if (e.ev === 'welcome' && !welcomed) {
          welcomed = true;
          clearTimeout(fail);
          resolve(net);
        }
        if (e.ev === 'welcome') net.onMessage({ ev: 'welcome', id: e.p as number });
        else if (e.ev === 'snap') net.onMessage({ ev: 'snap', s: e.p as Snapshot });
        else if (e.ev === 'ev') net.onMessage({ ev: 'ev', e: e.p as GameEvent[] });
        else if (e.ev === 'full') net.onMessage({ ev: 'full' });
      })
        .then((raw) => {
          net = new ClientNet(raw, id);
          // Repeat the hello until welcomed: the host may still be subscribing.
          const say = () => {
            if (welcomed) return;
            raw.send({ from: id, to: 'host', ev: 'hello', p: hello });
            setTimeout(say, 1500);
          };
          say();
        })
        .catch((err) => {
          clearTimeout(fail);
          reject(err);
        });
    });
  }

  send(msg: ClientMsg): void {
    this.raw.send({ from: this.id, to: 'host', ev: 'msg', p: msg });
  }

  close(): void {
    clearInterval(this.timer);
    this.raw.send({ from: this.id, to: 'host', ev: 'bye', p: null });
    this.raw.close();
  }
}

/** The phone side: send controls for one player, receive the host's snapshots. */
export class PhoneNet {
  onSnap: (s: Snapshot) => void = () => {};
  onEvents: (e: GameEvent[]) => void = () => {};
  private readonly id = randomId();
  private readonly timer: number;

  private constructor(
    private readonly raw: Raw,
    private readonly pid: number,
    private readonly key: string,
  ) {
    this.timer = window.setInterval(() => this.raw.send({ from: this.id, to: 'host', ev: 'ping', p: { pid, key } }), 2000);
  }

  static async connect(room: string, pid: number, key: string): Promise<PhoneNet> {
    let net: PhoneNet | null = null;
    const raw = await open(room, (e) => {
      if (!net || e.from !== 'host' || e.to) return;
      if (e.ev === 'snap') net.onSnap(e.p as Snapshot);
      else if (e.ev === 'ev') net.onEvents(e.p as GameEvent[]);
    });
    net = new PhoneNet(raw, pid, key);
    raw.send({ from: net.id, to: 'host', ev: 'pair', p: { pid, key } });
    return net;
  }

  send(msg: ClientMsg): void {
    this.raw.send({ from: this.id, to: 'host', ev: 'ctl', p: { pid: this.pid, key: this.key, msg } });
  }

  close(): void {
    clearInterval(this.timer);
    this.raw.close();
  }
}
