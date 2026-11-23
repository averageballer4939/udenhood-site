// Udenhood, « Your account » : le wallet connecté, son solde, les coins qu'il a lancés chez Pons, et le lancement
// laissé en cours dans ce navigateur. Tout est lu sur la chaîne ; une lecture qui échoue montre un tiret, jamais un 0.
(() => {
  const { el, dire, copier, memoire, pl, poserImage } = window.UH;
  const C = window.UHC;
  const W = window.UHW;
  const $ = (s, r = document) => r.querySelector(s);
  const page = $('#a');
  if (!page) return;

  const etat = $('#a-etat');
  const liste = $('#a-coins');
  const actions = $('#a-actions');
  const solde = $('#a-solde');
  const nombre = $('#a-nombre');
  let lu = ''; // l'adresse dont les coins sont à l'écran
  let tour = 0;

  const dire2 = (genre, ...contenu) => {
    etat.dataset.etat = genre;
    etat.lastElementChild.replaceChildren(...contenu);
    etat.hidden = false;
  };
  // « 0.0421 ETH », l'unité en petit.
  const montant = (wei) => [C.ether(wei), el('small', { text: ' ETH' })];

  function ligne(k) {
    const cadre = el('span', { class: 'coin-img petit' }, el('img', { alt: '', width: 46, height: 46 }));
    poserImage(cadre.firstChild, C.images(k.logo), cadre);
    const part = k.graduation > 0n ? Number((k.leve * 1000n) / k.graduation) / 10 : 0;
    const jauge = el('i');
    requestAnimationFrame(() => {
      jauge.style.width = `${Math.min(100, part)}%`;
    });
    return el(
      'li',
      {},
      el(
        'a',
        { class: 'mon-coin', href: `coin.html?t=${k.token}` },
        cadre,
        el('span', {}, el('span', { class: 'm-nom', text: k.nom }), el('span', { class: 'm-sous', text: `$${k.ticker}` })),
        el('span', { class: 'm-courbe' }, k.gradue ? 'Graduated' : `${C.ether(k.leve, 3)} of ${C.ether(k.graduation, 2)} ETH`, el('span', { class: 'jauge' }, jauge)),
        el('span', { class: 'm-va', text: 'Open' }),
      ),
    );
  }

  async function lireCoins(adresse) {
    const moi = ++tour;
    lu = adresse;
    liste.replaceChildren();
    actions.hidden = true;
    nombre.textContent = '—';
    solde.textContent = '—';
    dire2('wait', 'Reading the chain…');
    C.solde(adresse)
      .then((s) => moi === tour && solde.replaceChildren(...montant(s)))
      .catch(() => {});
    try {
      const lances = await C.coinsDe(adresse);
      if (moi !== tour) return;
      nombre.textContent = String(lances.length);
      if (!lances.length) {
        dire2('off', 'No coin launched from this wallet yet.');
        actions.hidden = false;
        return;
      }
      dire2('wait', `Reading ${pl(lances.length, 'coin')}…`);
      // Un coin à la fois : le nœud public demande de ne pas le presser.
      let illisibles = 0;
      for (const l of lances.slice(0, 30)) {
        const k = await C.coin(l.token).catch(() => null);
        if (moi !== tour) return;
        if (k) liste.append(ligne(k));
        else illisibles++;
      }
      if (illisibles) dire2('faux', `${pl(illisibles, 'coin')} could not be read just now.`);
      else etat.hidden = true;
      actions.hidden = false;
    } catch {
      if (moi !== tour) return;
      dire2('faux', 'The chain node did not answer.');
      actions.hidden = false;
    }
  }

  function reprise() {
    const b = memoire.lire('uh-lancement');
    const bloc = $('#a-reprise');
    bloc.hidden = !(b && b.depot);
    if (b && b.depot) {
      $('#a-reprise-t').textContent = b.nom ? `${b.nom} · ${b.depot}` : b.depot;
      $('#a-reprendre').href = `launch.html?repo=${encodeURIComponent(b.depot)}`;
    }
  }

  function peindre() {
    const e = W.etat();
    page.dataset.etat = e.connecte ? 'dans' : 'hors';
    if (!e.connecte) {
      lu = '';
      tour++;
      return;
    }
    $('#a-explo').href = `${C.CHAINE.explorateur}/address/${e.adresse}`;
    $('#a-changer').hidden = e.bonneChaine;
    reprise();
    if (lu !== e.adresse) lireCoins(e.adresse);
  }

  $('#a-copier').addEventListener('click', () => copier(W.etat().adresse, 'Address copied'));
  $('#a-relire').addEventListener('click', () => {
    lu = '';
    peindre();
  });
  $('#a-sortir').addEventListener('click', () => {
    W.deconnecter();
    dire('Logged out');
  });
  $('#a-changer').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    try {
      await W.changerDeChaine();
    } catch (e) {
      dire(W.direErreur(e));
    } finally {
      b.disabled = false;
    }
  });

  document.addEventListener('uh:wallet', peindre);
  W.pret.then(peindre);
})();
