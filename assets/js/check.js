// Udenhood, « Check a repo » : la page d'accueil. Les quatre contrôles vivent dans preuve.js ; ici, le formulaire,
// le coq qui laisse la place au capot levé, et la ligne de résultat.
(() => {
  const { lire, pause, heure, el } = window.UH;
  const { controler, carte } = window.UHP;
  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#form');
  if (!form) return;

  const champ = $('#repo');
  const boite = champ.closest('.field');
  const bouton = $('#go');
  const note = $('#note');
  const art = $('#art');
  const cible = $('#cible');
  const suite = $('#suite');
  const NOTE_REPOS = note.textContent;
  const CIBLE_REPOS = cible.textContent;
  const voyants = carte();

  function repos(message, mauvais) {
    voyants.repos();
    art.dataset.open = 'false';
    cible.textContent = CIBLE_REPOS;
    note.textContent = message || NOTE_REPOS;
    note.dataset.kind = mauvais ? 'bad' : '';
  }

  async function verifier(o, r) {
    bouton.disabled = true;
    boite.dataset.bad = 'false';
    note.dataset.kind = '';
    note.textContent = 'Asking GitHub…';
    art.dataset.open = 'true';
    cible.replaceChildren('Checking ', el('b', { text: `${o}/${r}` }), '…');
    voyants.attente();

    try {
      // Les voyants s'allument l'un après l'autre, dans l'ordre de la carte.
      const poses = [];
      const preuve = await controler(o, r, { surEtape: (k, v) => poses.push([k, v]) });
      for (const [k, v] of poses) {
        voyants.poser(k, v);
        await pause(120);
      }
      const depot = preuve.depot.full_name;
      cible.replaceChildren(el('b', { text: depot }), ` · ${preuve.allumes} of 4 lights on. Each light opens its proof.`);
      if (preuve.coin) cible.append(' ', el('a', { href: `coin.html?t=${preuve.coin.token}`, text: `See $${preuve.coin.ticker}` }));
      note.textContent = NOTE_REPOS;
      if (suite) suite.href = `launch.html?repo=${encodeURIComponent(depot)}`;
      const u = new URL(location.href);
      u.searchParams.set('repo', depot);
      history.replaceState(null, '', u);
    } catch (e) {
      if (e && e.genre === 'absent') repos('No public repo at that address.', true);
      else if (e && e.genre === 'limite') repos(`GitHub limits checks from your network. Try again at ${heure(e.retour)}.`, true);
      else repos('GitHub did not answer. Try again.', true);
    } finally {
      bouton.disabled = false;
    }
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = lire(champ.value);
    if (!d) {
      boite.dataset.bad = 'false';
      void boite.offsetWidth;
      boite.dataset.bad = 'true';
      note.textContent = 'Type it as owner/repo.';
      note.dataset.kind = 'bad';
      champ.focus();
      return;
    }
    champ.value = `${d.o}/${d.r}`;
    verifier(d.o, d.r);
  });
  champ.addEventListener('input', () => {
    boite.dataset.bad = 'false';
  });

  const depart = lire(new URL(location.href).searchParams.get('repo') || '');
  if (depart) {
    champ.value = `${depart.o}/${depart.r}`;
    verifier(depart.o, depart.r);
  }
})();
