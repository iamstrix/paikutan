// Characters are cosmetic. Trumpos set both the stats and the special power.
// Every trumpo spends the same 9-point budget so none is strictly better.
export const CHARACTERS = [
  { id: 'bata', emoji: '🧒', name: 'Bata', title: 'Batang Kalye', color: '#f4a261',
    blurb: 'Grew up spinning trumpo on the street.' },
  { id: 'lola', emoji: '👵', name: 'Lola Basyang', title: 'Ang Kuwentista', color: '#b5838d',
    blurb: 'Her trumpo spins as long as her stories.' },
  { id: 'tambay', emoji: '😎', name: 'Tambay', title: 'Hari ng Kanto', color: '#457b9d',
    blurb: 'Never misses a game at the kanto.' },
  { id: 'kapitana', emoji: '👩🏽‍💼', name: 'Kapitana', title: 'Barangay Captain', color: '#2a9d8f',
    blurb: 'Serves the whole barangay, and still finds time to play.' },
  { id: 'tindera', emoji: '🛒', name: 'Aling Nena', title: 'Sari-sari Store Boss', color: '#e76f51',
    blurb: 'Sells the trumpos, and knows how to throw them.' },
];

// strong: the trumpo this one counters (a soft edge, shown to players for counterpicks).
export const TOPS = [
  { id: 'kidlat', name: 'Kidlat', power: 'Lightning Strike', strong: 'diwata', str: 4, lon: 2, sta: 3, colors: ['#ffd23f', '#1d3557'],
    desc: 'A bolt from the sky zaps your rival: knockback and lost spin.' },
  { id: 'tikbalang', name: 'Tikbalang', power: 'Tikbalang Stampede', strong: 'agimat', str: 5, lon: 2, sta: 2, colors: ['#8d5524', '#e63946'],
    desc: 'Stampede for 2 seconds: steerable, heavy, and it breaks through shields. Ends in a stomp that shoves anyone close.' },
  { id: 'agimat', name: 'Agimat', power: 'Amulet Shield', strong: 'kidlat', str: 2, lon: 3, sta: 4, colors: ['#2a9d8f', '#e9c46a'],
    desc: 'For 5 seconds, hits barely hurt and you are harder to push. It also wards off most of an eclipse.' },
  { id: 'diwata', name: 'Diwata', power: "Diwata's Blessing", strong: 'bakunawa', str: 2, lon: 4, sta: 3, colors: ['#f6bdc0', '#7b2cbf'],
    desc: 'Restores spin, steadies your wobble, and lifts an eclipse curse.' },
  { id: 'bakunawa', name: 'Bakunawa', power: 'Eclipse', strong: 'tikbalang', str: 3, lon: 3, sta: 3, colors: ['#0b132b', '#5bc0be'],
    desc: 'The sea serpent swallows the moon: rival steering is reversed for 5 seconds, and a stampede is cut short.' },
];

// One per seat: 1v1 uses the first two; a brawl goes up to eight.
export const PLAYER_COLORS = ['#e63946', '#3a86ff', '#ffbe0b', '#2dc653', '#ff70c8', '#00c2d1', '#ff8c1a', '#a77bff'];
export const STAT_LABELS = { str: 'Lakas (hit)', lon: 'Tagal (spin time)', sta: 'Tatag (balance)' };

export const byId = (list, id) => list.find(x => x.id === id) || list[0];
