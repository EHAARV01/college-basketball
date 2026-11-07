(function () {
  'use strict';
  const ZONE = 'America/New_York';
  const API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
  const CONFERENCES = ['2', '62', '3', '4', '7', '23', '44', '8', '29'];
  const ALIASES = { 'uconn': 'connecticut', 'usc': 'southerncalifornia', 'olemiss': 'mississippi', 'lsu': 'louisianastate', 'pitt': 'pittsburgh', 'miamifl': 'miami', 'miamiflorida': 'miami', 'stjohns': 'saintjohns', 'ncstate': 'northcarolinastate', 'unc': 'northcarolina', 'smu': 'southernmethodist', 'ucf': 'centralflorida', 'vcu': 'virginiacommonwealth', 'byu': 'brighamyoung', 'etsu': 'easttennesseestate' };
  function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function teamKey(value) { const key = normalize(value); return ALIASES[key] || key; }
  function dateKey(value) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value || new Date());
    const get = type => parts.find(part => part.type === type).value;
    return get('year') + '-' + get('month') + '-' + get('day');
  }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value; }
  function shiftDate(value, days) { const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
  function stamp(value) { return new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value)); }
  function dayLabel(value) { return new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value + 'T12:00:00Z')); }
  function external(url, host) { try { const parsed = new URL(url); return parsed.protocol === 'https:' && (parsed.hostname === host || parsed.hostname.endsWith('.' + host)) ? parsed.href : ''; } catch (_) { return ''; } }
  function parseEvents(data) {
    if (!data || !Array.isArray(data.events) || (data.events.length === 0 && !Array.isArray(data.leagues))) throw new Error('Unexpected score response');
    const games = data.events.map(event => {
      const competition = event.competitions && event.competitions[0];
      if (!competition || !Array.isArray(competition.competitors) || competition.competitors.length !== 2 || !Number.isFinite(Date.parse(event.date)) || !/^\d+$/.test(event.id)) return null;
      const status = competition.status || event.status || {};
      const type = status.type || {};
      const abnormal = /postpon|cancel|delay|suspend|abandon/i.test([type.name, type.description, type.detail].join(' '));
      const state = abnormal ? 'other' : type.completed || type.state === 'post' ? 'post' : type.state === 'in' ? 'in' : 'pre';
      const teams = competition.competitors.slice().sort((a, b) => (a.homeAway === 'away' ? -1 : 1) - (b.homeAway === 'away' ? -1 : 1)).map(item => {
        const team = item.team || {};
        const rank = Number(item.curatedRank && item.curatedRank.current);
        const score = item.score === null || item.score === undefined || item.score === '' ? null : Number(item.score);
        return { name: team.shortDisplayName || team.location || team.displayName || 'Team to be announced', names: [team.shortDisplayName, team.location, team.displayName, team.abbreviation].filter(Boolean), conference: String(team.conferenceId || ''), rank: rank > 0 && rank <= 25 ? rank : null, score: Number.isFinite(score) ? score : null, winner: item.winner === true, logo: external(team.logo || '', 'espncdn.com'), record: ((item.records || []).find(record => record.type === 'total') || {}).summary || '' };
      });
      return { id: String(event.id), date: event.date, day: dateKey(new Date(event.date)), state: state, status: state === 'pre' ? stamp(event.date) : type.shortDetail || type.detail || type.description || (state === 'post' ? 'Final' : 'In progress'), teams: teams, broadcast: (competition.broadcasts || []).flatMap(item => item.names || []).join(' · '), ranked: teams.some(team => team.rank !== null), url: 'https://www.espn.com/mens-college-basketball/game/_/gameId/' + event.id };
    }).filter(Boolean);
    if (data.events.length && !games.length) throw new Error('No valid games returned');
    return games;
  }
  function matchingRecap(game, recaps) {
    if (game.state !== 'post') return null;
    return recaps.find(recap => {
      const exactDate = recap.gameDate && validDate(recap.gameDate);
      const age = (Date.parse(recap.published + 'T12:00:00Z') - Date.parse(game.day + 'T12:00:00Z')) / 86400000;
      if (exactDate ? recap.gameDate !== game.day : !(age >= 0 && age <= 7)) return false;
      const same = (team, name, score) => team.names.some(alias => teamKey(alias) === teamKey(name)) && team.score !== null && String(team.score) === String(score);
      return (same(game.teams[0], recap.a, recap.scoreA) && same(game.teams[1], recap.b, recap.scoreB)) || (same(game.teams[1], recap.a, recap.scoreA) && same(game.teams[0], recap.b, recap.scoreB));
    }) || null;
  }
  function filteredGames(games, filter, search, conference) {
    const query = normalize(search);
    return games.filter(game => {
      if (filter === 'ranked' && !game.ranked || filter === 'live' && game.state !== 'in' || filter === 'final' && game.state !== 'post') return false;
      if (query && !game.teams.some(team => team.names.some(name => normalize(name).includes(query) || teamKey(name).includes(teamKey(search))))) return false;
      if (conference && !game.teams.some(team => conference === 'other' ? team.conference && !CONFERENCES.includes(team.conference) : team.conference === conference)) return false;
      return true;
    });
  }
  function orderedGames(games, compact) {
    const order = { in: 0, pre: 1, post: 2, other: 3 };
    return games.slice().sort((a, b) => {
      if (compact && a.ranked !== b.ranked) return a.ranked ? -1 : 1;
      if (a.state === 'in' && b.state !== 'in') return -1;
      if (b.state === 'in' && a.state !== 'in') return 1;
      return order[a.state] - order[b.state] || Date.parse(a.date) - Date.parse(b.date);
    });
  }
  // Export only in the test runtime; no public globals are needed by the site.
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseEvents, matchingRecap, filteredGames, orderedGames, dateKey, validDate, shiftDate, teamKey };
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-scoreboard]').forEach(startBoard);
  function startBoard(root) {
    const compact = root.dataset.scoreboard === 'compact';
    const select = root.querySelector('[data-score-date]');
    const list = root.querySelector('[data-score-games]');
    const message = root.querySelector('[data-score-message]');
    const updated = root.querySelector('[data-score-updated]');
    const refresh = root.querySelector('[data-score-refresh]');
    const search = root.querySelector('[data-score-search]');
    const conference = root.querySelector('[data-score-conference]');
    const provider = root.querySelector('[data-score-provider]');
    const recaps = Array.from(root.querySelectorAll('[data-score-recaps] a')).map(link => ({ a: link.dataset.teamA, b: link.dataset.teamB, scoreA: link.dataset.scoreA, scoreB: link.dataset.scoreB, gameDate: link.dataset.gameDate, published: link.dataset.published, title: link.textContent, url: link.getAttribute('href') }));
    const params = new URLSearchParams(location.search);
    let selectedDate = validDate(params.get('date')) ? params.get('date') : dateKey();
    let filter = ['all', 'ranked', 'live', 'final'].includes(params.get('view')) ? params.get('view') : 'all';
    if (compact && filter === 'final') filter = 'all';
    if (search) search.value = params.get('team') || '';
    if (conference && Array.from(conference.options).some(option => option.value === params.get('conference'))) conference.value = params.get('conference');
    let games = [], fetchedAt = '', stale = false, controller, timer, sequence = 0, loading = false;
    if (select) select.value = selectedDate;
    const allLink = root.querySelector('.scores-all');
    function syncURL() {
      const url = new URL(compact ? allLink.href : location.href);
      url.search = '';
      url.searchParams.set('date', selectedDate);
      if (filter !== 'all') url.searchParams.set('view', filter);
      if (search && search.value.trim()) url.searchParams.set('team', search.value.trim());
      if (conference && conference.value) url.searchParams.set('conference', conference.value);
      if (compact) allLink.href = url.href; else history.replaceState(null, '', url.href);
      provider.href = 'https://www.espn.com/mens-college-basketball/scoreboard/_/date/' + selectedDate.replace(/-/g, '');
    }
    function cacheKey() { return 'fcr-scores-v1-' + selectedDate; }
    function readCache() {
      try {
        const cache = JSON.parse(sessionStorage.getItem(cacheKey()));
        if (!cache || cache.date !== selectedDate || !Number.isFinite(Date.parse(cache.fetchedAt)) || Date.now() - Date.parse(cache.fetchedAt) > 86400000) return null;
        return { games: parseEvents(cache.data), fetchedAt: cache.fetchedAt };
      } catch (_) { return null; }
    }
    function saveCache(data) { try { sessionStorage.setItem(cacheKey(), JSON.stringify({ date: selectedDate, fetchedAt: fetchedAt, data: data })); } catch (_) { /* Storage can be disabled or full. Scores still work. */ } }
    function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function link(text, href, className) { const node = element('a', className, text); node.href = href; return node; }
    function card(game) {
      const article = element('article', 'scorecard' + (game.state === 'in' ? ' is-live' : ''));
      article.setAttribute('aria-label', game.teams.map(team => team.name).join(' vs ') + ', ' + game.status);
      const header = element('div', 'scorecard-header');
      header.append(element('span', 'scorecard-status', (game.state === 'in' ? 'Live · ' : '') + game.status));
      if (game.broadcast) header.append(element('span', 'scorecard-broadcast', game.broadcast));
      article.append(header);
      const teams = element('div', 'scorecard-teams');
      game.teams.forEach(team => {
        const row = element('div', 'scorecard-team' + (game.state === 'post' && team.winner ? ' is-winner' : game.state === 'post' && game.teams.some(t => t.winner) ? ' is-loser' : ''));
        const mark = element('span', 'scorecard-mark');
        if (team.logo) { const image = element('img'); image.src = team.logo; image.alt = ''; image.loading = 'lazy'; image.width = 28; image.height = 28; image.addEventListener('error', () => image.remove(), { once: true }); mark.append(image); }
        const identity = element('span', 'scorecard-name');
        if (team.rank) identity.append(element('span', 'scorecard-rank', String(team.rank)));
        identity.append(document.createTextNode(team.name));
        if (team.record) identity.append(element('span', 'scorecard-record', team.record));
        row.append(mark, identity, element('span', 'scorecard-points', (game.state === 'post' || game.state === 'in') && team.score !== null ? String(team.score) : '–'));
        teams.append(row);
      });
      article.append(teams);
      const bottom = element('div', 'scorecard-bottom');
      const recap = matchingRecap(game, recaps);
      if (recap) bottom.append(link('Read my recap →', recap.url, 'scorecard-recap'));
      else bottom.append(element('span', '', game.state === 'post' ? 'Final score' : game.state === 'in' ? 'In progress' : game.state === 'other' ? 'Schedule update' : 'Tip-off · Eastern'));
      bottom.append(link(game.state === 'post' ? 'Box score ↗' : 'Game details ↗', game.url));
      article.append(bottom);
      return article;
    }
    function render() {
      const matches = orderedGames(filteredGames(games, filter, search ? search.value : '', conference ? conference.value : ''), compact);
      const visible = compact ? matches.slice(0, 10) : matches;
      list.replaceChildren();
      root.querySelectorAll('[data-score-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scoreFilter === filter)));
      if (visible.length) { const fragment = document.createDocumentFragment(); visible.forEach(game => fragment.append(card(game))); list.append(fragment); }
      else if (fetchedAt) list.append(element('div', 'scores-empty', games.length ? 'No games match these filters. Try All games or another team.' : 'No games listed for this date. Choose another day.'));
      message.dataset.error = String(stale);
      if (fetchedAt) {
        message.textContent = stale ? 'The score feed is unavailable. Showing saved results; live scores may have changed. Try Refresh or view ESPN.' : dayLabel(selectedDate) + ' · ' + (visible.length < matches.length ? visible.length + ' of ' : '') + matches.length + (matches.length === 1 ? ' game' : ' games') + (compact ? ' · Swipe or scroll for more' : '');
        updated.textContent = 'ESPN · ' + (stale ? 'Saved ' : 'Updated ') + stamp(fetchedAt) + ' · All times Eastern. Rankings as supplied by the score feed.';
      }
      syncURL();
    }
    function schedule() {
      clearTimeout(timer);
      // Do not poll historical dates. Refresh today's visible board once a minute
      // during games, otherwise every five minutes. Hidden tabs make no requests.
      if (selectedDate === dateKey() && !document.hidden) timer = setTimeout(() => load(false), games.some(game => game.state === 'in') && !stale ? 60000 : 300000);
    }
    async function load(force) {
      const token = ++sequence;
      if (controller) controller.abort();
      clearTimeout(timer);
      controller = new AbortController();
      const signal = controller.signal;
      const cached = readCache();
      games = cached ? cached.games : []; fetchedAt = cached ? cached.fetchedAt : ''; stale = false;
      list.setAttribute('aria-busy', 'true'); refresh.disabled = true; loading = true;
      render();
      if (!fetchedAt) { message.textContent = 'Loading scores for ' + dayLabel(selectedDate) + '…'; updated.textContent = 'Scores from ESPN · All times Eastern.'; }
      else { stale = Date.now() - Date.parse(fetchedAt) > 120000; render(); }
      if (!force && cached && Date.now() - Date.parse(fetchedAt) < 45000) { finish(); schedule(); return; }
      const timeout = setTimeout(() => controller && token === sequence && controller.abort(), 12000);
      try {
        const url = new URL(API); url.searchParams.set('dates', selectedDate.replace(/-/g, '')); url.searchParams.set('groups', '50'); url.searchParams.set('limit', '1000');
        const response = await fetch(url.href, { signal: signal, credentials: 'omit' });
        if (!response.ok) throw new Error('Score feed unavailable');
        const data = await response.json();
        const nextGames = parseEvents(data);
        if (token !== sequence) return;
        games = nextGames; fetchedAt = new Date().toISOString(); stale = false; saveCache(data); render();
      } catch (_) {
        if (token !== sequence) return;
        stale = true;
        if (fetchedAt) render();
        else { list.replaceChildren(element('div', 'scores-empty', 'Scores could not be loaded. Try Refresh, choose another date, or use the ESPN link below.')); message.textContent = 'The score feed is temporarily unavailable.'; message.dataset.error = 'true'; updated.textContent = 'ESPN · No current scores available.'; }
      } finally { clearTimeout(timeout); if (token === sequence) { finish(); schedule(); } }
    }
    function finish() { loading = false; list.setAttribute('aria-busy', 'false'); refresh.disabled = false; }
    function changeDate(value) { if (!validDate(value)) { if (select) select.value = selectedDate; return; } selectedDate = value; if (select) select.value = value; load(false); }
    if (select) select.addEventListener('change', () => changeDate(select.value));
    root.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => changeDate(shiftDate(selectedDate, Number(button.dataset.day)))));
    const todayButton = root.querySelector('[data-today]');
    if (todayButton) todayButton.addEventListener('click', () => changeDate(dateKey()));
    refresh.addEventListener('click', () => load(true));
    root.querySelectorAll('[data-score-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.scoreFilter; render(); }));
    if (search) search.addEventListener('input', render);
    if (conference) conference.addEventListener('change', render);
    root.querySelectorAll('[data-strip-direction]').forEach(button => button.addEventListener('click', () => list.scrollBy({ left: Number(button.dataset.stripDirection) * Math.max(218, list.clientWidth * .8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })));
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (!loading && selectedDate === dateKey()) load(false); });
    window.addEventListener('pagehide', () => { clearTimeout(timer); if (controller) controller.abort(); });
    load(false);
  }
}());
