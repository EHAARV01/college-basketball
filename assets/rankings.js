(() => {
  const root = document.getElementById('rankings-browser');
  if (!root) return;
  const panels = [...root.querySelectorAll('[data-poll]')];
  const links = [...root.querySelectorAll('[data-poll-link]')];
  const selects = [...root.querySelectorAll('[data-edition-select]')];
  let active = 'ap';
  const render = () => {
    panels.forEach(panel => {
      panel.hidden = panel.dataset.poll !== active;
      const select = panel.querySelector('[data-edition-select]');
      if (select) panel.querySelectorAll('[data-edition]').forEach(edition => {
        edition.hidden = edition.dataset.edition !== select.value;
      });
    });
    links.forEach(link => {
      if (link.dataset.pollLink === active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };
  const restore = () => {
    const params = new URLSearchParams(location.search);
    const hashPanel = panels.find(panel => '#' + panel.id === location.hash);
    active = hashPanel ? hashPanel.dataset.poll : params.get('poll') === 'mine' ? 'mine' : 'ap';
    selects.forEach(select => {
      const match = [...select.options].find(option => option.value === params.get('edition'));
      select.value = match ? match.value : select.options[0].value;
    });
    render();
  };
  const remember = () => {
    const panel = panels.find(item => item.dataset.poll === active);
    const select = panel.querySelector('[data-edition-select]');
    const url = new URL(location.href);
    url.searchParams.set('poll', active);
    select ? url.searchParams.set('edition', select.value) : url.searchParams.delete('edition');
    url.hash = panel.id;
    history.pushState(null, '', url);
    render();
  };
  links.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    active = link.dataset.pollLink;
    remember();
  }));
  selects.forEach(select => {
    select.closest('.poll-filter').hidden = false;
    select.addEventListener('change', remember);
  });
  window.addEventListener('popstate', restore);
  window.addEventListener('hashchange', restore);
  restore();
})();
