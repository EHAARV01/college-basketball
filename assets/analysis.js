(() => {
  const form = document.getElementById('analysis-filters');
  if (!form) return;
  const search = document.getElementById('recap-search');
  const weeks = document.getElementById('recap-week');
  const count = document.getElementById('recap-count');
  const empty = document.getElementById('recap-empty');
  const entries = Array.from(document.querySelectorAll('.recap-entry'));
  const iso = date => date.toISOString().slice(0, 10);
  const weekOf = value => {
    const date = new Date(value + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return iso(date);
  };
  const formatDate = value => new Date(value + 'T00:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
  entries.forEach(entry => { entry.dataset.week = weekOf(entry.dataset.date); });
  Array.from(new Set(entries.map(entry => entry.dataset.week))).sort().reverse().forEach(week => {
    const end = new Date(week + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 6);
    weeks.add(new Option(formatDate(week) + ' – ' + formatDate(iso(end)), week));
  });
  const params = new URLSearchParams(location.search);
  search.value = params.get('q') || '';
  if (Array.from(weeks.options).some(option => option.value === params.get('week'))) weeks.value = params.get('week');
  const update = () => {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    entries.forEach(entry => {
      const matches = terms.every(term => entry.dataset.search.toLocaleLowerCase().includes(term)) && (!weeks.value || entry.dataset.week === weeks.value);
      entry.hidden = !matches;
      if (matches) visible++;
    });
    count.textContent = visible + ' recap' + (visible === 1 ? '' : 's') + ' · Newest first';
    empty.hidden = visible !== 0;
    const url = new URL(location.href);
    search.value.trim() ? url.searchParams.set('q', search.value.trim()) : url.searchParams.delete('q');
    weeks.value ? url.searchParams.set('week', weeks.value) : url.searchParams.delete('week');
    history.replaceState(null, '', url);
  };
  form.addEventListener('submit', event => event.preventDefault());
  search.addEventListener('input', update);
  weeks.addEventListener('change', update);
  form.addEventListener('reset', () => { search.value = ''; weeks.value = ''; update(); });
  form.hidden = false;
  update();
})();
