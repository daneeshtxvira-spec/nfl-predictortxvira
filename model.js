import { CONFIG } from './config.js';

const W = CONFIG.WEIGHTS;
const teamName = t => String(t?.name ?? t?.displayName ?? t?.shortName ?? t?.abbr ?? 'Equipo');
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function cdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

export const pyth = (pf, pa) => {
  const a = Math.pow(Math.max(pf, .1), CONFIG.EXPONENT);
  const b = Math.pow(Math.max(pa, .1), CONFIG.EXPONENT);
  return a / (a + b);
};

export const log5 = (A, B) => {
  const den = A + B - 2 * A * B;
  return den ? (A - A * B) / den : 0.5;
};

export const homeAdjust = neutral => {
  const p = neutral * CONFIG.HOME;
  const q = (1 - neutral) * (1 - CONFIG.HOME);
  return p / (p + q);
};

function aggregate(games) {
  if (!games.length) return { n: 0, ppg: 0, papg: 0, diff: 0, pyth: 0.5 };
  const pf = games.reduce((s, g) => s + g.pf, 0) / games.length;
  const pa = games.reduce((s, g) => s + g.pa, 0) / games.length;
  return { n: games.length, ppg: pf, papg: pa, diff: pf - pa, pyth: pyth(pf, pa) };
}

export function teamSamples(schedule, id) {
  const completed = schedule
    .filter(g => !g.canceled && g.completed)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const games = completed.map(g => {
    const isHome = String(g.homeId) === String(id);
    return { pf: isHome ? g.homeScore : g.awayScore, pa: isHome ? g.awayScore : g.homeScore, date: g.date };
  });
  return {
    season: aggregate(games),
    last10: aggregate(games.slice(-10)),
    first3: aggregate(games.slice(0, 3))
  };
}

function weighted(sample, field) {
  const parts = [
    ['season', W.season], ['last10', W.last10], ['first3', W.first3]
  ].filter(([key]) => sample[key].n > 0);
  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  return parts.reduce((s, [key, w]) => s + sample[key][field] * w, 0) / totalW;
}

export function analyze(home, away) {
  const pHome = weighted(home, 'pyth');
  const pAway = weighted(away, 'pyth');
  const neutralHome = log5(pHome, pAway);
  const homeWin = homeAdjust(neutralHome);

  const homeOff = weighted(home, 'ppg');
  const homeDef = weighted(home, 'papg');
  const awayOff = weighted(away, 'ppg');
  const awayDef = weighted(away, 'papg');

  // Average of offense and opponent defense, bounded to keep projections realistic.
  const projHome = clamp((homeOff + awayDef) / 2, CONFIG.PTS_MIN, CONFIG.PTS_MAX);
  const projAway = clamp((awayOff + homeDef) / 2, CONFIG.PTS_MIN, CONFIG.PTS_MAX);
  const total = projHome + projAway;
  const line = Math.round(total * 2) / 2;
  const pOver = 1 - cdf((line - total) / CONFIG.SD_TOTAL);

  const margin = projHome - projAway;
  const favoriteIsHome = homeWin >= 0.5;
  const favoriteMargin = favoriteIsHome ? margin : -margin;
  const pFavoriteCover = 1 - cdf((CONFIG.SPREAD - favoriteMargin) / CONFIG.SD_MARGIN);
  const favorite = favoriteIsHome ? 'home' : 'away';

  const picks = [
    { key: 'homeML', label: `${teamName(home)} ML`, p: homeWin },
    { key: 'awayML', label: `${teamName(away)} ML`, p: 1 - homeWin },
    { key: 'over', label: `Over ${line}`, p: pOver },
    { key: 'under', label: `Under ${line}`, p: 1 - pOver },
    { key: 'fav', label: `${teamName(favoriteIsHome ? home : away)} -1.5`, p: pFavoriteCover },
    { key: 'dog', label: `${teamName(favoriteIsHome ? away : home)} +1.5`, p: 1 - pFavoriteCover }
  ];
  const best = picks.reduce((a, b) => b.p > a.p ? b : a);
  return { pHome, pAway, neutralHome, homeWin, projHome, projAway, total, line, pOver, margin, favorite, pFavoriteCover, picks, best };
}
