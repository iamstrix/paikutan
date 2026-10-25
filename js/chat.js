// Fixed, family-friendly Tagalog quick chat. Only the slot index crosses the network.
// Switched off for now: no buttons, hotkeys, bubbles or voice clips. Set true to bring it back.
export const CHAT_ENABLED = false;
export const QUICK_CHAT = ['Tara G', 'Aray mo', 'Lala', 'Hehe'];
export const CHAT_COOLDOWN = 2.6;
export const CHAT_CLIPS = QUICK_CHAT.map((_, i) => new URL(`../assets/audio/chat/${i}.mp3`, import.meta.url).href);

// Snapshots repeat recent events so a dropped packet cannot swallow a clash or a taunt.
export function createFxReceiver(play) {
  let last = 0;
  return {
    receive(events = []) {
      for (const event of events) {
        if (!Number.isInteger(event.seq) || event.seq <= last) continue;
        last = event.seq;
        play(event);
      }
    },
    reset() { last = 0; },
  };
}
