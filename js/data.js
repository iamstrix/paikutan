// Characters set the throw (stats). Trumpos set the special power.
// Every character spends the same 9-point budget so none is strictly better.
export const CHARACTERS = [
  { id: 'bata', emoji: '🧒', name: 'Bata', title: 'Batang Kalye', str: 2, lon: 3, sta: 4, color: '#f4a261',
    blurb: 'Grew up spinning trumpo on the street. Hard to topple.' },
  { id: 'lola', emoji: '👵', name: 'Lola Basyang', title: 'Ang Kuwentista', str: 1, lon: 5, sta: 3, color: '#b5838d',
    blurb: 'Her trumpo spins as long as her stories.' },
  { id: 'tambay', emoji: '😎', name: 'Tambay', title: 'Hari ng Kanto', str: 4, lon: 2, sta: 3, color: '#457b9d',
    blurb: 'Throws hard, hits harder, gets tired fast.' },
  { id: 'kapitana', emoji: '👩🏽‍💼', name: 'Kapitana', title: 'Barangay Captain', str: 3, lon: 3, sta: 3, color: '#2a9d8f',
    blurb: 'Balanced in everything. Serves the whole barangay.' },
  { id: 'tindera', emoji: '🛒', name: 'Aling Nena', title: 'Sari-sari Store Boss', str: 5, lon: 2, sta: 2, color: '#e76f51',
    blurb: 'Heaviest hits in the barangay. Wobbles when tired.' },
];

export const TOPS = [
  { id: 'kidlat', name: 'Kidlat', power: 'Lightning Strike', colors: ['#ffd23f', '#1d3557'],
    desc: 'A bolt from the sky zaps your rival: knockback and lost spin.' },
  { id: 'tikbalang', name: 'Tikbalang', power: 'Tikbalang Dash', colors: ['#8d5524', '#e63946'],
    desc: 'Charge straight at your rival with extra weight. Aim matters.' },
  { id: 'agimat', name: 'Agimat', power: 'Amulet Shield', colors: ['#2a9d8f', '#e9c46a'],
    desc: 'For 5 seconds, hits barely hurt and you are harder to push.' },
  { id: 'diwata', name: 'Diwata', power: "Diwata's Blessing", colors: ['#f6bdc0', '#7b2cbf'],
    desc: 'Restores spin and steadies your wobble.' },
  { id: 'bakunawa', name: 'Bakunawa', power: 'Eclipse', colors: ['#0b132b', '#5bc0be'],
    desc: 'The sea serpent swallows the moon: rival steering is reversed for 5 seconds.' },
];

export const PLAYER_COLORS = ['#e63946', '#3a86ff'];
export const STAT_LABELS = { str: 'Lakas (hit)', lon: 'Tagal (spin time)', sta: 'Tatag (balance)' };

export const byId = (list, id) => list.find(x => x.id === id) || list[0];
