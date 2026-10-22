// Room transport. Online rooms use Supabase Realtime broadcast (no database tables).
// Add ?net=local to the URL to use BroadcastChannel instead (tabs on one PC, no internet).
import { CONFIG } from './config.js';

export const isLocalNet = () => new URLSearchParams(location.search).get('net') === 'local';

export async function connect(room, onMessage) {
  if (isLocalNet()) {
    const bc = new BroadcastChannel('paikutan-' + room);
    bc.onmessage = e => onMessage(e.data.ev, e.data.p);
    return { kind: 'local', send: (ev, p) => bc.postMessage({ ev, p }), close: () => bc.close() };
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm');
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 30 } },
  });
  const ch = sb.channel('paikutan-' + room, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMessage(payload.ev, payload.p));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timed out')), 12000);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(status)); }
    });
  });
  return {
    kind: 'online',
    send: (ev, p) => ch.send({ type: 'broadcast', event: 'm', payload: { ev, p } }),
    close: () => sb.removeChannel(ch),
  };
}

// Four letters, without ones that are easy to misread (I, O, L).
export function makeRoomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

export function playerId() {
  // Per tab, so two tabs on one PC count as two players when testing.
  let id = sessionStorage.getItem('paikutan-id');
  if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('paikutan-id', id); }
  return id;
}
