// Battle data ported from paikutan (jmdgg/paikutan js/data.js), the source of
// truth for the battle mechanic. Characters set the throw (stats); trompos set
// the mythic power. Every character spends the same 9-point budget.

export type Stats = { str: number; lon: number; sta: number };

/** tromPOW's six barangay characters, each mapped onto a paikutan stat line. */
export const CHARACTER_STATS: Record<string, Stats> = {
  lola: { str: 1, lon: 5, sta: 3 }, // paikutan Lola Basyang: spins as long as her stories
  bata: { str: 2, lon: 3, sta: 4 }, // paikutan Bata: hard to topple
  totoy: { str: 4, lon: 2, sta: 3 }, // paikutan Tambay: throws hard, tires fast
  tanod: { str: 3, lon: 3, sta: 3 }, // paikutan Kapitana: balanced, serves the barangay
  marites: { str: 5, lon: 2, sta: 2 }, // paikutan Aling Nena: heaviest hits, wobbles when tired
  binata: { str: 4, lon: 3, sta: 2 }, // tromPOW addition, same 9-point budget
};

export const STAT_LABELS: Record<keyof Stats, string> = { str: 'Power', lon: 'Endurance', sta: 'Balance' };

export type TopPower = { id: string; name: string; power: string; colors: [string, string]; desc: string };

export const TOPS: TopPower[] = [
  { id: 'kidlat', name: 'Kidlat', power: 'Lightning Strike', colors: ['#ffd23f', '#1d3557'], desc: 'A bolt from the sky zaps your rival: knockback and lost spin.' },
  { id: 'tikbalang', name: 'Tikbalang', power: 'Tikbalang Dash', colors: ['#8d5524', '#e63946'], desc: 'Charge straight at your rival with extra weight. Aim matters!' },
  { id: 'agimat', name: 'Agimat', power: 'Amulet Shield', colors: ['#2a9d8f', '#e9c46a'], desc: 'For 5 seconds, hits barely hurt and you are harder to push.' },
  { id: 'diwata', name: 'Diwata', power: "Diwata's Blessing", colors: ['#f6bdc0', '#7b2cbf'], desc: 'Restores spin and steadies your wobble.' },
  { id: 'bakunawa', name: 'Bakunawa', power: 'Eclipse', colors: ['#0b132b', '#5bc0be'], desc: 'The serpent swallows the moon: rival steering is reversed for 5 seconds.' },
];

export const topById = (id: string): TopPower => TOPS.find((t) => t.id === id) ?? TOPS[0];
export const statsOf = (char: string): Stats => CHARACTER_STATS[char] ?? CHARACTER_STATS.tanod;
