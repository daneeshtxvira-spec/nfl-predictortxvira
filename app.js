import { fetchSchedule } from './api.js';
import { analyze, teamSamples } from './model.js';

const TEAMS = [
  ['ARI','Arizona Cardinals','Arizona Cardinals',22],['ATL','Atlanta Falcons','Atlanta Falcons',1],['BAL','Baltimore Ravens','Baltimore Ravens',33],['BUF','Buffalo Bills','Buffalo Bills',2],
  ['CAR','Carolina Panthers','Carolina Panthers',29],['CHI','Chicago Bears','Chicago Bears',3],['CIN','Cincinnati Bengals','Cincinnati Bengals',4],['CLE','Cleveland Browns','Cleveland Browns',5],
  ['DAL','Dallas Cowboys','Dallas Cowboys',6],['DEN','Denver Broncos','Denver Broncos',7],['DET','Detroit Lions','Detroit Lions',8],['GB','Green Bay Packers','Green Bay Packers',9],
  ['HOU','Houston Texans','Houston Texans',34],['IND','Indianapolis Colts','Indianapolis Colts',11],['JAX','Jacksonville Jaguars','Jacksonville Jaguars',30],['KC','Kansas City Chiefs','Kansas City Chiefs',12],
  ['LV','Las Vegas Raiders','Las Vegas Raiders',13],['LAC','Los Angeles Chargers','Los Angeles Chargers',24],['LAR','Los Angeles Rams','Los Angeles Rams',14],['MIA','Miami Dolphins','Miami Dolphins',15],
  ['MIN','Minnesota Vikings','Minnesota Vikings',16],['NE','New England Patriots','New England Patriots',17],['NO','New Orleans Saints','New Orleans Saints',18],['NYG','New York Giants','New York Giants',19],
  ['NYJ','New York Jets','New York Jets',20],['PHI','Philadelphia Eagles','Philadelphia Eagles',21],['PIT','Pittsburgh Steelers','Pittsburgh Steelers',23],['SF','San Francisco 49ers','San Francisco 49ers',25],
  ['SEA','Seattle Seahawks','Seattle Seahawks',26],['TB','Tampa Bay Buccaneers','Tampa Bay Buccaneers',27],['TEN','Tennessee Titans','Tennessee Titans',10],['WSH','Washington Commanders','Washington Commanders',28]
].map(([abbr, name, displayName, id]) => ({ abbr, name, displayName, id: String(id), logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${id}.png` }));

const $ = id => document.getElementById(id);
let selected = [];
const pct = x => `${(x * 100).toFixed(1)}%`;
const f1 = x => Number(x).toFixed(1);
const teamName = t => String(t?.name ?? t?.displayName ?? t?.shortName ?? t?.abbr ?? 'Equipo');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function currentSeason(date = new Date()) {
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
}

function renderTeams() {
  $('teams').innerHTML = TEAMS.map(t => `
    <button class="team-card" data-id="${t.id}" type="button" aria-label="Seleccionar ${esc(teamName(t))}">
      <img src="${t.logo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span>${esc(t.name.replace('Los Angeles ', 'LA '))}</span>
      <small>${t.abbr}</small>
    </button>`).join('');
  document.querySelectorAll('.team-card').forEach(btn => btn.addEventListener('click', () => selectTeam(btn.dataset.id)));
}

function selectTeam(id) {
  const team = TEAMS.find(t => t.id === id);
  if (!team) return;
  if (selected.length === 2) selected = [];
  if (selected.some(t => t.id === id)) return;
  selected.push(team);
  syncSelection();
}

function syncSelection() {
  document.querySelectorAll('.team-card').forEach(btn => btn.classList.toggle('selected', selected.some(t => t.id === btn.dataset.id)));
  for (let i = 0; i < 2; i++) {
    const slot = $(`slot${i + 1}`), t = selected[i];
    slot.classList.toggle('filled', !!t);
    slot.innerHTML = t ? `<img src="${t.logo}" alt=""><span>${esc(teamName(t))}</span><b>${i === 0 ? 'Equipo 1' : 'Equipo 2'}</b>` : `<span>Equipo ${i + 1}</span><b>Selecciona</b>`;
  }
  $('analizar').disabled = selected.length !== 2;
}

function findGame(aGames, bGames, a, b, dateValue) {
  const all = [...aGames, ...bGames];
  const unique = [...new Map(all.map(g => [g.id, g])).values()].filter(g => !g.canceled && ((g.homeId === a.id && g.awayId === b.id) || (g.homeId === b.id && g.awayId === a.id)));
  if (!unique.length) return null;
  if (!dateValue) return unique.find(g => !g.completed) || unique[unique.length - 1];
  const target = new Date(`${dateValue}T12:00:00`).getTime();
  return unique.sort((x, y) => Math.abs(new Date(x.date) - target) - Math.abs(new Date(y.date) - target))[0];
}

function sampleTable(name, s) {
  const row = (label, x) => `<tr><td>${label}</td><td>${x.n}</td><td>${x.n ? f1(x.ppg) : '—'}</td><td>${x.n ? f1(x.papg) : '—'}</td><td>${x.n ? (x.diff >= 0 ? '+' : '') + f1(x.diff) : '—'}</td><td>${x.n ? pct(x.pyth) : '—'}</td></tr>`;
  return `<div class="table-wrap"><h3>${esc(name)}</h3><table><thead><tr><th>Muestra</th><th>PJ</th><th>PF/J</th><th>PC/J</th><th>Dif.</th><th>Pyth.</th></tr></thead><tbody>${row('Temporada',s.season)}${row('Últimos 10',s.last10)}${row('Primeras 3',s.first3)}</tbody></table></div>`;
}

function render(ctx, r) {
  const { home, away, hs, as, game, notes } = ctx;
  const dateText = game ? new Date(game.date).toLocaleString('es-MX',{dateStyle:'full',timeStyle:'short'}) : 'Partido no encontrado en el calendario';
  const sorted = [...r.picks].sort((a,b)=>b.p-a.p);
  $('resultado').innerHTML = `
    ${notes.map(n=>`<div class="notice">${esc(n)}</div>`).join('')}
    <section class="game-card card">
      <div class="game-date">${esc(dateText)}</div>
      <div class="matchup">
        <div class="side"><span class="home-tag">LOCAL</span><img src="${home.logo}" alt=""><strong>${esc(teamName(home))}</strong><b>${f1(r.projHome)}</b></div>
        <div class="versus">VS</div>
        <div class="side"><span class="away-tag">VISITANTE</span><img src="${away.logo}" alt=""><strong>${esc(teamName(away))}</strong><b>${f1(r.projAway)}</b></div>
      </div>
      <div class="total-line"><span>Total proyectado</span><b>${f1(r.total)}</b></div>
    </section>

    <section class="best card"><div class="eyebrow">DANEESHTXVIRA PICKS</div><h2>PICK DEL MODELO</h2><div class="best-pick">${esc(r.best.label)}</div><div class="best-percent">${pct(r.best.p)}</div><p>Es la mayor probabilidad calculada entre las seis opciones del modelo.</p></section>

    <section class="card"><div class="eyebrow">01</div><h2>Nivel real de cada equipo</h2>${sampleTable(teamName(home)+' · Local',hs)}${sampleTable(teamName(away)+' · Visitante',as)}<div class="duo"><span>${esc(home.abbr)} <b>${pct(r.pHome)}</b></span><span>${esc(away.abbr)} <b>${pct(r.pAway)}</b></span></div></section>

    <section class="card"><div class="eyebrow">02</div><h2>Cruce · Log5</h2><div class="stat-row"><div><small>Cancha neutral</small><strong>${pct(r.neutralHome)}</strong><span>${esc(teamName(home))}</span></div><div><small>Cancha neutral</small><strong>${pct(1-r.neutralHome)}</strong><span>${esc(teamName(away))}</span></div></div></section>

    <section class="card"><div class="eyebrow">03</div><h2>Ventaja de local</h2><div class="stat-row"><div><small>Local</small><strong>${pct(r.homeWin)}</strong><span>${esc(teamName(home))}</span></div><div><small>Visitante</small><strong>${pct(1-r.homeWin)}</strong><span>${esc(teamName(away))}</span></div></div></section>

    <section class="card"><div class="eyebrow">04</div><h2>Puntos proyectados</h2><div class="score-grid"><div><img src="${home.logo}" alt=""><span>${esc(home.abbr)}</span><b>${f1(r.projHome)}</b></div><div><img src="${away.logo}" alt=""><span>${esc(away.abbr)}</span><b>${f1(r.projAway)}</b></div></div><div class="total-big"><span>Total</span><b>${f1(r.total)}</b></div></section>

    <section class="card"><div class="eyebrow">05</div><h2>Over / Under y spread</h2><div class="market-grid"><div><small>Línea del modelo</small><strong>${r.line}</strong></div><div><small>Over ${r.line}</small><strong>${pct(r.pOver)}</strong></div><div><small>Under ${r.line}</small><strong>${pct(1-r.pOver)}</strong></div></div><div class="spread-box"><span>Spread</span><b>${esc(teamName(r.favorite === 'home' ? home : away))} -1.5</b><strong>${pct(r.pFavoriteCover)}</strong><b>${esc(teamName(r.favorite === 'home' ? away : home))} +1.5</b><strong>${pct(1-r.pFavoriteCover)}</strong></div><p class="muted">La línea de total es calculada por el modelo; no representa una línea real de sportsbook.</p></section>

    <section class="card"><div class="eyebrow">06</div><h2>Las 6 opciones</h2><div class="bars">${sorted.map(p=>`<div class="bar ${p.key===r.best.key?'winner':''}"><div><span>${esc(p.label)}</span>${p.key===r.best.key?'<em> PICK</em>':''}</div><b>${pct(p.p)}</b><i style="width:${Math.max(2,p.p*100)}%"></i></div>`).join('')}</div></section>
  `;
}

async function run() {
  const btn = $('analizar');
  const status = $('estado');
  if (selected.length !== 2) return;
  btn.disabled = true;
  $('resultado').innerHTML = '';
  status.className = '';
  status.textContent = 'Cargando calendario y estadísticas reales de NFL…';
  try {
    const dateValue = $('fecha').value;
    const ref = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
    const season = currentSeason(ref);
    const [aGames, bGames] = await Promise.all([fetchSchedule(selected[0].id, season), fetchSchedule(selected[1].id, season)]);
    const game = findGame(aGames, bGames, selected[0], selected[1], dateValue);
    const notes = [];
    let home = selected[0], away = selected[1];
    if (game) {
      if (game.homeId === selected[1].id) [home, away] = [selected[1], selected[0]];
      if (game.completed) notes.push('El partido seleccionado ya aparece como finalizado; la predicción se calcula con las estadísticas disponibles.');
    } else {
      notes.push('No encontré un enfrentamiento entre estos dos equipos en la fecha indicada. Se tomó el primer equipo como local para generar una simulación.');
    }

    let homeGames = home.id === selected[0].id ? aGames : bGames;
    let awayGames = away.id === selected[0].id ? aGames : bGames;
    let homeSamples = teamSamples(homeGames, home.id);
    let awaySamples = teamSamples(awayGames, away.id);

    // Early-season fallback: if either team has too few current-season games, use last season.
    if (homeSamples.season.n < 3 || awaySamples.season.n < 3) {
      const prev = season - 1;
      const [oldA, oldB] = await Promise.all([fetchSchedule(selected[0].id, prev), fetchSchedule(selected[1].id, prev)]);
      homeGames = home.id === selected[0].id ? oldA : oldB;
      awayGames = away.id === selected[0].id ? oldA : oldB;
      homeSamples = teamSamples(homeGames, home.id);
      awaySamples = teamSamples(awayGames, away.id);
      notes.push(`Hay pocos partidos de la temporada ${season}; se usaron estadísticas de ${prev} como respaldo.`);
    }

    if (!homeSamples.season.n || !awaySamples.season.n) throw new Error('Datos insuficientes');
    const r = analyze(homeSamples, awaySamples, teamName(home), teamName(away));
    status.textContent = `Datos NFL · temporada ${season} · fuente: ESPN`;
    render({home,away,hs:homeSamples,as:awaySamples,game,notes},r);
    window.scrollTo({top: document.getElementById('resultado').offsetTop - 10, behavior:'smooth'});
  } catch (err) {
    console.error(err);
    status.className = 'error';
    status.textContent = 'No se pudieron cargar los datos. Revisa tu conexión e inténtalo de nuevo.';
  } finally {
    btn.disabled = selected.length !== 2;
  }
}

$('analizar').addEventListener('click', run);
$('resetBtn').addEventListener('click', () => { selected=[]; syncSelection(); $('resultado').innerHTML=''; $('estado').textContent=''; $('estado').className=''; });
renderTeams();
syncSelection();
