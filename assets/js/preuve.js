// Udenhood : les quatre contrôles d'un dépôt. Tout est lu chez GitHub depuis le navigateur du visiteur, sans clé.
// Rien n'est inventé : une donnée illisible éteint le voyant et dit pourquoi.
// Un contrôle rend, par voyant : etat (on, half, off), ligne (une phrase), detail (la preuve), lien (la source).
window.UHP = (() => {
  // Seuils du contrôle : provisoires.
  const SEUILS = { compteJours: 30, depotJours: 14, joursDePush: 3, etendueJours: 14, pushRecentJours: 14 };
  const { github, ouVide, jours, pl, court, JOUR } = window.UH;
  const { egal } = window.UHC;

  // Le fichier de preuve du dépôt : il nomme un wallet et un ticker, et, après le lancement, le coin.
  // frais : lit par l'API de GitHub, à jour à la seconde (le fichier brut peut dater de 5 minutes). Compte dans
  // la limite de GitHub : réservé au moment où le développeur vient de valider son fichier.
  async function fichier(depot, branche = 'HEAD', { frais = false } = {}) {
    const url = `https://raw.githubusercontent.com/${depot}/${encodeURIComponent(branche)}/udenhood.json`;
    const absent = { url, present: false, wallet: null, ticker: '', coin: null };
    let texte;
    if (frais) {
      try {
        const f = await github(`/repos/${depot}/contents/udenhood.json?ref=${encodeURIComponent(branche)}`);
        texte = new TextDecoder().decode(Uint8Array.from(atob(String(f.content || '').replace(/\s/g, '')), (c) => c.charCodeAt(0)));
      } catch (e) {
        if (e && e.genre === 'absent') return absent;
        throw e;
      }
    }
    try {
      if (texte === undefined) {
        const rep = await fetch(url, { cache: 'no-store' });
        if (!rep.ok) return absent;
        texte = await rep.text();
      }
      const j = JSON.parse(texte);
      // Le fichier est là : s'il ne nomme pas un wallet bien formé, on le dit, on ne dit pas « absent ».
      const adr = (v) => (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : null);
      return { url, present: true, wallet: adr(j.wallet), ticker: typeof j.ticker === 'string' ? j.ticker.trim() : '', coin: adr(j.coin) };
    } catch {
      return { url, present: true, wallet: null, ticker: '', coin: null };
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

  // Owner. La moitié GitHub : le dépôt nomme un wallet. La moitié chaîne : un coin, lancé par ce wallet, nomme ce dépôt.
  // coin : la fiche lue sur la chaîne (UHC.coin), ou rien si aucun coin n'est connu.
  function owner(depot, f, coin) {
    const page = `https://github.com/${depot.full_name}`;
    if (!f.present) return { etat: 'off', ligne: 'No proof file yet.', detail: `No udenhood.json on branch ${depot.default_branch}.\nThe repo has not signed a coin.`, lien: page };
    if (!f.wallet) return { etat: 'off', ligne: 'No proof file yet.', detail: 'udenhood.json is there, but it names no valid wallet.', lien: f.url };
    if (!coin) return { etat: 'half', ligne: `The repo names ${court(f.wallet)}.`, detail: `udenhood.json names this wallet:\n${f.wallet}\nNo coin launched from it yet.`, lien: f.url };
    if (f.coin && !egal(f.coin, coin.token)) return { etat: 'off', ligne: 'The repo names another coin.', detail: `udenhood.json names this coin:\n${f.coin}\nThis one is ${coin.token}.`, lien: f.url };
    const memeWallet = egal(coin.createur, f.wallet);
    const memeTicker = !f.ticker || f.ticker.toUpperCase() === coin.ticker.toUpperCase();
    const memeDepot = egal(window.UHC.depotDe(coin) || '', depot.full_name);
    if (memeWallet && memeTicker && memeDepot) {
      return { etat: 'on', ligne: `${court(f.wallet)} signed and launched.`, detail: `udenhood.json names this wallet:\n${f.wallet}\nThe same wallet launched $${coin.ticker}, and the coin names this repo.`, lien: f.url };
    }
    const pourquoi = !memeWallet ? `The coin was launched by ${court(coin.createur)}, not by the wallet the repo names.` : !memeDepot ? 'The coin does not name this repo.' : `The repo signed $${f.ticker}, not $${coin.ticker}.`;
    return { etat: 'off', ligne: 'The coin and the repo do not match.', detail: `udenhood.json names this wallet:\n${f.wallet}\n${pourquoi}`, lien: f.url };
  }

  // Les quatre contrôles d'un dépôt « owner/repo ». Échoue avec { genre } : absent, limite, reseau, http.
  async function controler(o, r, { coin = null, surEtape = () => {} } = {}) {
    const depot = await github(`/repos/${o}/${r}`);
    const api = `https://api.github.com/repos/${depot.full_name}`;
    const [compte, evenements, deploiements, f] = await Promise.all([
      github(`/users/${depot.owner.login}`),
      ouVide(github(`/repos/${depot.full_name}/events?per_page=100`)),
      ouVide(github(`/repos/${depot.full_name}/deployments?per_page=10`)),
      fichier(depot.full_name, depot.default_branch),
    ]);
    // Le coin que le dépôt nomme lui-même, s'il en nomme un et qu'on ne nous en a pas donné.
    let leCoin = coin;
    if (!leCoin && f.coin) leCoin = await window.UHC.coin(f.coin).catch(() => null);
    const preuve = { depot, fichier: f, coin: leCoin };
    preuve.owner = owner(depot, f, leCoin);
    surEtape('owner', preuve.owner);

    // History : ce que GitHub a enregistré, jamais les dates écrites dans les commits.
    const ageCompte = jours(compte.created_at);
    const ageDepot = jours(depot.created_at);
    const etendue = Math.max(0, Math.floor((new Date(depot.pushed_at) - new Date(depot.created_at)) / JOUR));
    const joursPush = new Set((evenements || []).filter((e) => e.type === 'PushEvent').map((e) => e.created_at.slice(0, 10))).size;
    const faits = `Account: ${pl(ageCompte, 'day')}\nRepo: ${pl(ageDepot, 'day')}${depot.fork ? ', a fork' : ''}\nCreation to last push: ${pl(etendue, 'day')}`;
    const histoire = !depot.fork && ageCompte >= SEUILS.compteJours && ageDepot >= SEUILS.depotJours && (joursPush >= SEUILS.joursDePush || etendue >= SEUILS.etendueJours);
    preuve.history = { etat: histoire ? 'on' : 'off', ligne: depot.fork ? 'This repo is a fork.' : `Repo ${pl(ageDepot, 'day')} old, account ${pl(ageCompte, 'day')}.`, detail: `${faits}\nNeeds: no fork, account ${SEUILS.compteJours}+ days, repo ${SEUILS.depotJours}+ days.`, lien: api };
    surEtape('history', preuve.history);

    // Running : une adresse rattachée au dépôt par GitHub, et qui répond.
    const site = await enLigne(depot, deploiements);
    if (site) {
      const hote = new URL(site.url).host;
      const vivant = await repond(site.url);
      preuve.running = { etat: vivant ? 'on' : 'off', ligne: vivant ? `${hote} answers.` : `${hote} does not answer.`, detail: `GitHub records a ${site.source} from this repo.\n${site.url}\n${vivant ? 'It answered just now.' : 'It did not answer just now.'}`, lien: site.url };
    } else {
      preuve.running = { etat: 'off', ligne: 'No deployment on record.', detail: `GitHub records no live deployment and no Pages site for this repo.${depot.homepage ? `\n${depot.homepage} is declared by hand, not proven from the repo.` : ''}`, lien: `${api}/deployments` };
    }
    surEtape('running', preuve.running);

    // Shipping : le dernier push enregistré.
    const dernier = jours(depot.pushed_at);
    const livre = !depot.archived && dernier <= SEUILS.pushRecentJours;
    preuve.shipping = { etat: livre ? 'on' : 'off', ligne: depot.archived ? 'This repo is archived.' : `Last push ${dernier === 0 ? 'today' : `${pl(dernier, 'day')} ago`}.`, detail: `Last push recorded by GitHub: ${depot.pushed_at.slice(0, 10)}\nNeeds a push in the last ${SEUILS.pushRecentJours} days.`, lien: `${api}/events` };
    surEtape('shipping', preuve.shipping);

    preuve.allumes = ['owner', 'history', 'running', 'shipping'].filter((k) => preuve[k].etat === 'on').length;
    return preuve;
  }

  // Les voyants d'une page : les poser, les remettre au repos, ouvrir la fenêtre de chacun.
  function carte(racine = document) {
    const $ = (s, r = racine) => r.querySelector(s);
    const voyants = Object.fromEntries([...racine.querySelectorAll('.light')].map((b) => [b.dataset.k, b]));
    const LIGNES = Object.fromEntries(Object.entries(voyants).map(([k, b]) => [k, $('.light-line', b).textContent]));
    const etat = Object.fromEntries(Object.keys(voyants).map((k) => [k, { detail: 'Paste a repo to check.', lien: '' }]));
    const pop = document.querySelector('#pop');
    const poser = (k, v) => {
      const b = voyants[k];
      if (!b) return;
      b.dataset.state = v.etat;
      $('.light-line', b).textContent = v.ligne;
      etat[k] = { detail: v.detail, lien: v.lien || '' };
    };
    const repos = (detail = 'Paste a repo to check.') => Object.keys(voyants).forEach((k) => poser(k, { etat: 'idle', ligne: LIGNES[k], detail, lien: '' }));
    const attente = () => Object.keys(voyants).forEach((k) => poser(k, { etat: 'wait', ligne: 'Checking…', detail: 'Still checking.', lien: '' }));
    // Une fenêtre dit une chose : une icône, un titre, une ligne, la preuve, un bouton.
    if (pop) {
      for (const [k, b] of Object.entries(voyants)) {
        b.addEventListener('click', () => {
          document.querySelector('#pop-i').src = $('img', b).getAttribute('src');
          document.querySelector('#pop-t').textContent = $('.light-name', b).textContent;
          document.querySelector('#pop-l').textContent = LIGNES[k];
          document.querySelector('#pop-d').textContent = etat[k].detail;
          const a = document.querySelector('#pop-a');
          a.hidden = !etat[k].lien;
          if (etat[k].lien) a.href = etat[k].lien;
          pop.showModal();
        });
      }
      document.querySelector('#pop-x').addEventListener('click', () => pop.close());
      pop.addEventListener('click', (ev) => {
        if (ev.target === pop) pop.close();
      });
    }
    return { poser, repos, attente };
  }

  return { SEUILS, fichier, controler, owner, carte };
})();
