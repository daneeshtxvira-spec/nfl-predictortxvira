import { CONFIG } from './config.js';

async function request(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export async function getJSON(url) {
  try {
    return await request(url);
  } catch (firstError) {
    if (!CONFIG.PROXY_URL) throw firstError;
    try {
      return await request(CONFIG.PROXY_URL + encodeURIComponent(url));
    } catch {
      throw firstError;
    }
  }
}

const num = value => Number(value && typeof value === 'object' ? (value.value ?? value.displayValue) : value);

export async function fetchSchedule(teamId, season) {
  const endpoint = `${CONFIG.ESPN}/teams/${teamId}/schedule?season=${season}&seasontype=2`;
  const data = await getJSON(endpoint);
  return (data.events || []).map(ev => {
    const c = ev.competitions?.[0];
    if (!c) return null;
    const home = c.competitors?.find(x => x.homeAway === 'home');
    const away = c.competitors?.find(x => x.homeAway === 'away');
    if (!home || !away) return null;
    const status = c.status?.type?.name || '';
    const homeScore = num(home.score), awayScore = num(away.score);
    const completed = /^STATUS_FINAL/.test(status) && Number.isFinite(homeScore) && Number.isFinite(awayScore);
    return {
      id: ev.id,
      date: ev.date,
      week: ev.week?.number ?? null,
      homeId: String(home.team.id),
      awayId: String(away.team.id),
      homeScore,
      awayScore,
      status,
      completed,
      canceled: status === 'STATUS_CANCELED'
    };
  }).filter(Boolean);
}
