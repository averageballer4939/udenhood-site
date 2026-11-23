// Udenhood, « Check a repo » : quatre voyants lus chez GitHub depuis le navigateur. Rien n'est inventé : une donnée
// illisible éteint le voyant et dit pourquoi.
// Seuils du contrôle : provisoires.
(() => {
  const SEUILS = { compteJours: 30, depotJours: 14, joursDePush: 3, etendueJours: 14, pushRecentJours: 14 };
  const { lire, github, ouVide, jours, pl, court, pause, heure, JOUR } = window.UH;
  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#form');
  if (!form) return;

  const champ = $('#repo');
  const boite = champ.closest('.field');
  const bouton = $('#go');
  const note = $('#note');
  const art = $('#art');
  const cible = $('#cible');
  const pop = $('#pop');
  const suite = $('#suite');
  const NOTE_REPOS = note.textContent;
  const CIBLE_REPOS = cible.textContent;
  const voyants = Object.fromEntries([...document.querySelectorAll('.light')].map((b) => [b.dataset.k, b]));
  const LIGNES = Object.fromEntries(Object.entries(voyants).map(([k, b]) => [k, $('.light-line', b).textContent]));
  const etat = Object.fromEntries(Object.keys(voyants).map((k) => [k, { detail: 'Paste a repo to check.', lien: '' }]));

  function poser(k, state, ligne, detail, lien) {
    const b = voyants[k];
    b.dataset.state = state;
    $('.light-line', b).textContent = ligne;
    etat[k] = { detail, lien: lien || '' };
  }

  function repos(message, mauvais) {
    for (const k of Object.keys(voyants)) poser(k, 'idle', LIGNES[k], 'Paste a repo to check.', '');
    art.dataset.open = 'false';
    cible.textContent = CIBLE_REPOS;
    note.textContent = message || NOTE_REPOS;
    note.dataset.kind = mauvais ? 'bad' : '';
  }

  async function preuveFichier(o, r, branche) {
    const url = `https://raw.githubusercontent.com/${o}/${r}/${encodeURIComponent(branche)}/udenhood.json`;
    try {
      const rep = await fetch(url, { cache: 'no-store' });
      if (!rep.ok) return { url, wallet: null };
      const j = JSON.parse(await rep.text());
      // Le fichier est là : s'il ne nomme pas un wallet bien formé, on le dit (« illisible »), on ne dit pas « absent ».
      const bon = typeof j.wallet === 'string' && /^0x[0-9a-fA-F]{40}$/.test(j.wallet);
      return { url, wallet: bon ? j.wallet : null, illisible: !bon };
    } catch {
      return { url, wallet: null, illisible: true };
    }
  }

  // Une adresse que GitHub rattache lui-même à ce dépôt : un déploiement réussi, ou GitHub Pages.
  // Une adresse sur github.com (un journal d'Actions) n'est pas un produit en ligne : on ne la compte pas.
  async function enLigne(depot, deploiements) {
    const horsGithub = (u) => {
      try {
        const hote = new URL(u).host;
        return hote !== 'github.com' && !hote.endsWith('.github.com') && !hote.endsWith('githubusercontent.com');
      } catch {
        return false;
      }
    };
    const candidats = [...(deploiements || [])].sort((a, b) => /prod/i.test(b.environment || '') - /prod/i.test(a.environment || '')).slice(0, 2);
    for (const d of candidats) {
      const statuts = await ouVide(github(`/repos/${depot.full_name}/deployments/${d.id}/statuses?per_page=5`));
      const ok = (statuts || []).find((s) => s.state === 'success' && horsGithub(s.environment_url));
      if (ok) return { url: ok.environment_url, source: `deployment to ${d.environment || 'production'}` };
    }
    if (depot.has_pages) return { url: `https://${depot.owner.login}.github.io/${depot.name}/`, source: 'GitHub Pages site' };
    return null;
  }

  // Sans droit de lire la réponse d'un autre site : une requête opaque qui aboutit dit seulement « joignable ».
  async function repond(url) {
    try {
      const stop = new AbortController();
      const t = setTimeout(() => stop.abort(), 7000);
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: stop.signal });
      clearTimeout(t);
      return true;
    } catch {
      return false;
    }
  }

  async function verifier(o, r) {
    bouton.disabled = true;
    boite.dataset.bad = 'false';
    note.dataset.kind = '';
    note.textContent = 'Asking GitHub…';
    art.dataset.open = 'true';
    cible.textContent = '';
    cible.append('Checking ', Object.assign(document.createElement('b'), { textContent: `${o}/${r}` }), '…');
    for (const k of Object.keys(voyants)) poser(k, 'wait', 'Checking…', 'Still checking.', '');

    try {
      const depot = await github(`/repos/${o}/${r}`);
      const api = `https://api.github.com/repos/${depot.full_name}`;
      const [compte, evenements, deploiements, fichier] = await Promise.all([
        github(`/users/${depot.owner.login}`),
        ouVide(github(`/repos/${depot.full_name}/events?per_page=100`)),
        ouVide(github(`/repos/${depot.full_name}/deployments?per_page=10`)),
        preuveFichier(depot.owner.login, depot.name, depot.default_branch),
      ]);

      // Owner : le dépôt nomme le wallet. L'autre moitié (la transaction de lancement) n'existe pas encore.
      if (fichier.wallet) {
        poser('owner', 'half', `The repo names ${court(fichier.wallet)}.`, `udenhood.json names this wallet:\n${fichier.wallet}\nThe on-chain half opens with launch.`, fichier.url);
      } else {
        poser('owner', 'off', 'No proof file yet.', fichier.illisible ? 'udenhood.json is there, but it names no valid wallet.' : `No udenhood.json on branch ${depot.default_branch}.\nThe repo has not signed a coin.`, `https://github.com/${depot.full_name}`);
      }
      await pause(120);

      // History : ce que GitHub a enregistré, jamais les dates écrites dans les commits.
      const ageCompte = jours(compte.created_at);
      const ageDepot = jours(depot.created_at);
      const etendue = Math.max(0, Math.floor((new Date(depot.pushed_at) - new Date(depot.created_at)) / JOUR));
      const joursPush = new Set((evenements || []).filter((e) => e.type === 'PushEvent').map((e) => e.created_at.slice(0, 10))).size;
      const faits = `Account: ${pl(ageCompte, 'day')}\nRepo: ${pl(ageDepot, 'day')}${depot.fork ? ', a fork' : ''}\nCreation to last push: ${pl(etendue, 'day')}`;
      const histoire = !depot.fork && ageCompte >= SEUILS.compteJours && ageDepot >= SEUILS.depotJours && (joursPush >= SEUILS.joursDePush || etendue >= SEUILS.etendueJours);
      poser('history', histoire ? 'on' : 'off', depot.fork ? 'This repo is a fork.' : `Repo ${pl(ageDepot, 'day')} old, account ${pl(ageCompte, 'day')}.`, `${faits}\nNeeds: no fork, account ${SEUILS.compteJours}+ days, repo ${SEUILS.depotJours}+ days.`, api);
      await pause(120);

      // Running : une adresse rattachée au dépôt par GitHub, et qui répond.
      const site = await enLigne(depot, deploiements);
      if (site) {
        const hote = new URL(site.url).host;
        const vivant = await repond(site.url);
        poser('running', vivant ? 'on' : 'off', vivant ? `${hote} answers.` : `${hote} does not answer.`, `GitHub records a ${site.source} from this repo.\n${site.url}\n${vivant ? 'It answered just now.' : 'It did not answer just now.'}`, site.url);
      } else {
        poser('running', 'off', 'No deployment on record.', `GitHub records no live deployment and no Pages site for this repo.${depot.homepage ? `\n${depot.homepage} is declared by hand, not proven from the repo.` : ''}`, `${api}/deployments`);
      }
      await pause(120);

      // Shipping : le dernier push enregistré.
      const dernier = jours(depot.pushed_at);
      const livre = !depot.archived && dernier <= SEUILS.pushRecentJours;
      poser('shipping', livre ? 'on' : 'off', depot.archived ? 'This repo is archived.' : `Last push ${dernier === 0 ? 'today' : `${pl(dernier, 'day')} ago`}.`, `Last push recorded by GitHub: ${depot.pushed_at.slice(0, 10)}\nNeeds a push in the last ${SEUILS.pushRecentJours} days.`, `${api}/events`);

      const allumes = Object.values(voyants).filter((b) => b.dataset.state === 'on').length;
      cible.textContent = '';
      cible.append(Object.assign(document.createElement('b'), { textContent: depot.full_name }), ` · ${allumes} of 4 lights on. Each light opens its proof.`);
      note.textContent = NOTE_REPOS;
      if (suite) suite.href = `launch.html?repo=${encodeURIComponent(depot.full_name)}`;
      const u = new URL(location.href);
      u.searchParams.set('repo', depot.full_name);
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

  // Une fenêtre dit une chose : une icône, un titre, une ligne, la preuve, un bouton.
  for (const [k, b] of Object.entries(voyants)) {
    b.addEventListener('click', () => {
      $('#pop-i').src = $('img', b).getAttribute('src');
      $('#pop-t').textContent = $('.light-name', b).textContent;
      $('#pop-l').textContent = LIGNES[k];
      $('#pop-d').textContent = etat[k].detail;
      const a = $('#pop-a');
      a.hidden = !etat[k].lien;
      if (etat[k].lien) a.href = etat[k].lien;
      pop.showModal();
    });
  }
  $('#pop-x').addEventListener('click', () => pop.close());
  pop.addEventListener('click', (ev) => {
    if (ev.target === pop) pop.close();
  });

  const depart = lire(new URL(location.href).searchParams.get('repo') || '');
  if (depart) {
    champ.value = `${depart.o}/${depart.r}`;
    verifier(depart.o, depart.r);
  }
})();
