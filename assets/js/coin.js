// Udenhood, la page d'un coin : un terminal. Ce que la chaîne dit du coin, le graphique de sa courbe, ses échanges,
// un panneau pour acheter et vendre depuis son wallet, puis la carte de preuve du dépôt que le coin nomme.
// Rien n'est gardé chez nous : l'adresse du coin est dans l'adresse de la page, tout le reste se lit en direct.
// Un échange est rejoué sur l'état réel avant d'ouvrir le wallet ; sans reçu, il est « pas encore confirmé ».
(() => {
  const { el, copier, dire, lire, pause, heure, poserImage } = window.UH;
  const C = window.UHC;
  const M = window.UHM;
  const W = window.UHW;
  const { controler, carte } = window.UHP;
  const $ = (s, r = document) => r.querySelector(s);
  const page = $('#k');
  if (!page) return;

  const token = (new URL(location.href).searchParams.get('t') || '').trim();
  const cible = $('#cible');
  const voyants = carte();
  const PHASES = ['On the curve', 'Graduating', 'Graduated', 'Rescued'];
  const RAPIDES = ['0.01', '0.05', '0.1', '0.5']; // achats rapides, en ETH
  const PARTS = [25, 50, 75, 100]; // ventes rapides, en % du solde
  const RESERVE_GAZ = 300000000000000n; // 0,0003 ETH gardés pour le réseau quand on mise tout son solde
  let k = null; // la fiche du coin (chaîne)
  let e = null; // l'état de la courbe et du wallet
  // mot : ce que le panneau dit sous son bouton après un geste ({ texte, mauvais }), jusqu'au geste suivant.
  // pasChoisi : il a choisi lui-même un pas de temps ; sinon la page le règle sur l'âge du coin.
  const ui = { sens: 'achat', tolerance: 300, exact: null, occupe: false, pas: 60, pasChoisi: false, unite: 'cap', mot: null };
  let liste = []; // les échanges
  let base = null; // les réserves au bloc où s'arrête la liste : le point de départ du prix reconstruit
  let graphe = null;

  // ---------- nombres
  const unite = (texte) => el('small', { text: ` ${texte}` });
  const pourcent = (pb) => `${Number(pb) / 100} %`;
  const il_y_a = (t) => {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
    return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
  };

  // ---------- la fiche (ce qui ne bouge pas)
  function absent(titre, erreur) {
    page.dataset.etat = erreur ? 'erreur' : 'absent';
    $('#k-absent').textContent = titre;
    voyants.repos('No coin to check.');
    cible.textContent = 'No coin to check.';
    document.title = 'No coin at this address · Udenhood';
  }

  function montrer() {
    $('#k-nom').textContent = k.nom;
    document.title = `${k.nom} ($${k.ticker}) · Udenhood`;
    $('#k-ticker').textContent = `$${k.ticker}`;
    $('#k-adr').textContent = C.court(k.token);
    $('#k-texte').textContent = C.texteSans(k.description);
    $('#k-img').alt = `${k.nom} logo`;
    poserImage($('#k-img'), C.images(k.logo), $('#k-cadre'));
    for (const id of ['#k-pons', '#m-pons']) $(id).href = C.PONS.page(k.token);
    $('#k-explo').href = `${C.CHAINE.explorateur}/token/${k.token}`;
    // Les liens que le créateur a donnés : https seulement.
    const liens = $('#k-liens');
    for (const [nom, u] of [['X', k.reseaux.twitter], ['Website', k.reseaux.site]]) {
      const bon = C.lien(u);
      if (bon) liens.prepend(el('a', { class: 'mini', href: bon, rel: 'noopener nofollow', target: '_blank', text: nom }));
    }
    $('#k-taxe').replaceChildren(String(k.taxe / 100), unite('%'));
    const createur = $('#k-createur');
    createur.textContent = C.court(k.createur);
    createur.href = `${C.CHAINE.explorateur}/address/${k.createur}`;
    $('#m-unite').textContent = 'ETH';
    page.dataset.etat = 'ok';
  }

  async function prouver() {
    const nomDepot = C.depotDe(k);
    const lienDepot = $('#k-depot');
    const d = nomDepot && lire(nomDepot);
    if (!d) {
      lienDepot.replaceWith(el('span', { text: 'None named' }));
      voyants.repos('This coin names no repo.');
      cible.textContent = 'This coin names no GitHub repo, so there is nothing to check.';
      return;
    }
    lienDepot.textContent = nomDepot;
    lienDepot.href = `https://github.com/${nomDepot}`;
    lienDepot.rel = 'noopener';
    lienDepot.target = '_blank';
    cible.replaceChildren('Checking ', el('b', { text: nomDepot }), '…');
    voyants.attente();
    try {
      const poses = [];
      const preuve = await controler(d.o, d.r, { coin: k, surEtape: (cle, v) => poses.push([cle, v]) });
      for (const [cle, v] of poses) {
        voyants.poser(cle, v);
        await pause(120);
      }
      cible.replaceChildren(el('b', { text: preuve.depot.full_name }), ` · ${preuve.allumes} of 4 lights on. Each light opens its proof.`);
    } catch (err) {
      const message = err && err.genre === 'absent' ? 'The repo this coin names is not public, or does not exist.' : err && err.genre === 'limite' ? `GitHub limits checks from your network. Try again at ${heure(err.retour)}.` : 'GitHub did not answer. Reload to try again.';
      voyants.repos(message);
      cible.textContent = message;
    }
  }

  // ---------- le marché : chiffres du haut, courbe, panneau
  const ferme = () => !e || e.gradue || !e.natif || k.phase !== 0;
  function peindreChiffres() {
    if (!e) return;
    if (ferme()) {
      $('#k-cap').textContent = '—';
      $('#k-prix').textContent = '—';
    } else {
      $('#k-cap').replaceChildren(M.petit(M.capitalisation(e.Q, e.T, e.offre)), unite('ETH'));
      $('#k-prix').replaceChildren(M.petit(M.prix(e.Q, e.T)), unite('ETH'));
    }
    $('#k-phase').textContent = e.gradue ? 'Graduated' : PHASES[k.phase] || 'On the curve';
    const leve = e.leve ?? k.leve;
    const part = k.graduation > 0n ? Number((leve * 1000n) / k.graduation) / 10 : 0;
    $('#k-leve').replaceChildren(e.gradue ? 'Graduated' : `${C.ether(leve, 3)} of ${C.ether(k.graduation, 2)}`, e.gradue ? '' : unite('ETH'));
    $('#k-jauge').style.width = `${e.gradue ? 100 : Math.min(100, part)}%`;
  }

  // Ce que l'utilisateur a tapé, en wei (achat) ou en jetons (vente). null : pas un montant.
  const champ = $('#m-montant');
  function montant() {
    if (ui.exact !== null) return ui.exact;
    return ui.sens === 'achat' ? C.wei(champ.value) : M.jetonsDe(champ.value);
  }
  const ecrire = (v) => {
    champ.value = v;
  };
  // Un nombre de jetons dans le champ : sans séparateur, 4 décimales au plus.
  const enClair = (n) => {
    const entier = n / 10n ** 18n;
    const reste = (n % 10n ** 18n).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    return reste ? `${entier}.${reste}` : `${entier}`;
  };

  function peindrePanneau() {
    const w = W.etat();
    const achat = ui.sens === 'achat';
    $('#m-acheter').setAttribute('aria-selected', String(achat));
    $('#m-vendre').setAttribute('aria-selected', String(!achat));
    $('#m-corps').dataset.sens = ui.sens;
    $('#m-corps').hidden = !!e && ferme();
    $('#m-ferme').hidden = !e || !ferme();
    document.querySelector('.tm-onglets').hidden = !!e && ferme();
    if (e && ferme()) {
      $('#m-ferme-t').textContent = !e.natif ? 'This coin is not quoted in ETH. Udenhood trades ETH curves only.' : 'This coin left its curve. It trades in a pool now.';
      return;
    }
    $('#m-label').textContent = achat ? 'You pay' : 'You sell';
    $('#m-unite').textContent = achat ? 'ETH' : k ? k.ticker : '';
    for (const b of document.querySelectorAll('#m-tol button')) b.setAttribute('aria-checked', String(Number(b.dataset.pb) === ui.tolerance));
    // Montants rapides : des ETH à l'achat, des parts du solde à la vente.
    const rapides = $('#m-rapides');
    if (rapides.dataset.sens !== ui.sens) {
      rapides.dataset.sens = ui.sens;
      rapides.replaceChildren(...(achat ? RAPIDES.map((v) => el('button', { type: 'button', text: v, data: { mise: v } })) : PARTS.map((p) => el('button', { type: 'button', text: `${p} %`, data: { part: String(p) } }))));
    }
    const solde = $('#m-solde');
    const tenu = e && w.connecte ? (achat ? e.eth : e.jetons) : null;
    solde.textContent = tenu === null ? 'Balance —' : achat ? `Balance ${M.eth(tenu)} ETH` : `Balance ${M.court(tenu)} ${k.ticker}`;
    solde.disabled = tenu === null || tenu === 0n;
    for (const b of rapides.querySelectorAll('button[data-part]')) b.disabled = !tenu;

    // Le devis
    const m = montant();
    const bon = e && m !== null && m > 0n;
    const d = bon ? (achat ? M.devisAchat(e, m) : M.devisVente(e, m)) : null;
    const sortie = (n) => (achat ? `${M.court(n)} ${k.ticker}` : `${M.eth(n)} ETH`);
    $('#m-recu').textContent = d ? `≈ ${sortie(d.recu)}` : '—';
    $('#m-min').textContent = d ? sortie(M.minimum(d.recu, ui.tolerance)) : '—';
    $('#m-impact').textContent = d ? `${d.impact.toFixed(2)} %` : '—';
    $('#m-frais').textContent = e ? (d ? `${pourcent(e.frais)} · ${M.eth(d.frais)} ETH` : pourcent(e.frais)) : '—';
    $('#m-taxe').textContent = e ? (d ? `${pourcent(e.taxe)} · ${M.eth(d.taxe)} ETH` : pourcent(e.taxe)) : '—';
    const autoriser = !achat && bon && w.connecte && e.autorisation !== null && e.autorisation < m;
    const gaz = e && e.prixGaz ? ((achat ? M.GAZ.achat : M.GAZ.vente) + (autoriser ? M.GAZ.autoriser : 0n)) * e.prixGaz : null;
    $('#m-gaz').textContent = gaz === null ? '—' : `≈ ${M.eth(gaz)} ETH`;

    // Un seul bouton : il dit ce qu'il fera, ou ce qui manque.
    const go = $('#m-go');
    const face = go.firstElementChild;
    const note = $('#m-note');
    let texte;
    let bloque = false;
    let mot = '';
    if (!e) {
      texte = 'Reading the curve…';
      bloque = true;
    } else if (!w.connecte) texte = 'Log in';
    else if (!w.bonneChaine) texte = 'Switch to Robinhood Chain';
    else if (m === null && champ.value.trim()) {
      texte = 'Not an amount';
      bloque = true;
    } else if (!bon) {
      texte = 'Enter an amount';
      bloque = true;
    } else if (tenu !== null && (achat ? m + (gaz || 0n) > tenu : m > tenu)) {
      texte = achat ? 'Not enough ETH' : `Not enough ${k.ticker}`;
      bloque = true;
    } else if (d.recu === 0n) {
      texte = 'Amount too small';
      bloque = true;
    } else {
      texte = achat ? `Buy ${k.ticker}` : `Sell ${k.ticker}`;
      if (autoriser) mot = `First sale of ${k.ticker} from this wallet: two confirmations. One lets the curve take your ${k.ticker} (asked once), one sells.`;
      else if (e.sniper > 0n) mot = `This coin just launched: an early-buyer tax of ${pourcent(e.sniper)} applies for a few seconds.`;
    }
    if (ui.occupe) bloque = true;
    face.textContent = texte;
    go.disabled = bloque;
    note.dataset.kind = !ui.occupe && ui.mot && ui.mot.mauvais ? 'bad' : '';
    note.textContent = ui.occupe ? '' : ui.mot ? ui.mot.texte : mot;
  }

  // ---------- les échanges et le graphique
  const boite = $('#graphe');
  const legende = $('#g-legende');
  function motGraphe(etat, texte, relance) {
    boite.dataset.etat = etat;
    $('#g-mot').textContent = texte || '';
    $('#g-encore').hidden = !relance;
  }
  function decrire(b) {
    if (!b) {
      legende.replaceChildren();
      return;
    }
    const f = formatGraphe();
    const jour = new Date(b.t * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    legende.replaceChildren(jour, '  O ', el('b', { text: f(b.o) }), '  H ', el('b', { text: f(b.h) }), '  L ', el('b', { text: f(b.l) }), '  C ', el('b', { text: f(b.c) }), '  Vol ', el('b', { text: M.petit(b.v) }), ' ETH');
  }
  // L'unité du graphique : la valeur de toute l'offre (en ETH), ou le prix d'un jeton (en ETH).
  const facteur = () => (ui.unite === 'cap' && e ? Number(e.offre || 10n ** 27n) / 1e18 : 1);
  const formatGraphe = () => (v) => M.petit(v);
  // Le pas de temps de départ suit l'âge du coin : des bougies d'une minute pour un coin de l'heure, d'une heure
  // pour un coin de plusieurs jours. Dès qu'il choisit lui-même, on n'y touche plus.
  function reglerPas() {
    if (ui.pasChoisi || !liste.length) return;
    const age = Date.now() / 1000 - liste[0].heure;
    ui.pas = age < 3 * 3600 ? 60 : age < 15 * 3600 ? 300 : age < 2 * 86400 ? 900 : 3600;
    for (const x of document.querySelectorAll('#g-pas button')) x.setAttribute('aria-checked', String(Number(x.dataset.pas) === ui.pas));
  }
  function peindreGraphe(garderVue = true, cadrer = false) {
    if (!e) return;
    if (ferme()) return motGraphe('ferme', e.natif ? 'This coin left its curve. Its chart is on Pons.' : 'This coin is not quoted in ETH. Its chart is on Pons.');
    if (!liste.length) return motGraphe('vide', 'No trade yet. The first buy draws the first candle.');
    const points = M.cours(liste, base ? base.Q : e.Q, base ? base.T : e.T);
    const fois = facteur();
    const bougies = M.bougies(points, ui.pas).map((b) => ({ t: b.t, o: b.o * fois, h: b.h * fois, l: b.l * fois, c: b.c * fois, v: b.v, n: b.n }));
    if (!bougies.length) return motGraphe('vide', 'No trade yet. The first buy draws the first candle.');
    boite.dataset.etat = 'ok';
    const premier = !graphe;
    if (!graphe) graphe = window.UHG.creer($('#g-toile'), { format: formatGraphe(), surSurvol: (b) => decrire(b || (graphe && graphe.derniere())) });
    graphe.poser(bougies, { garderVue, nouveauFormat: formatGraphe(), cadrer: cadrer || premier });
  }

  const lignes = $('#e-lignes');
  let vus = new Set();
  function peindreEchanges() {
    const mot = $('#e-mot');
    if (!liste.length) {
      lignes.replaceChildren();
      mot.textContent = 'No trade yet.';
      return;
    }
    mot.textContent = '';
    const premiers = vus.size === 0;
    lignes.replaceChildren(
      ...liste
        .slice(-60)
        .reverse()
        .map((x) => {
          const cle = `${x.tx}-${x.rang}`;
          const neuf = !premiers && !vus.has(cle);
          vus.add(cle);
          return el(
            'tr',
            { class: neuf ? 'neuf' : '' },
            el('td', { text: il_y_a(x.heure), title: new Date(x.heure * 1000).toLocaleString('en-US') }),
            el('td', {}, el('span', { class: 'tm-sens', data: { etat: x.achat ? 'on' : 'faux' } }, el('i', { class: 'lampe' }), x.achat ? 'Buy' : 'Sell')),
            el('td', { text: M.eth(x.eth) }),
            el('td', { text: M.court(x.jetons) }),
            el('td', {}, el('a', { href: `${C.CHAINE.explorateur}/tx/${x.tx}`, rel: 'noopener', target: '_blank', text: C.court(x.qui) })),
          );
        }),
    );
  }

  let lecture = 0;
  async function lireEchanges() {
    if (!e || ferme()) {
      $('#e-mot').textContent = e && ferme() ? 'This coin left its curve. Its trades are on Pons.' : '';
      peindreGraphe();
      return;
    }
    const moi = ++lecture;
    try {
      const r = await M.echanges(k.courbe, e.lanceA);
      const reserves = await M.reservesA(k.courbe, r.tete).catch(() => null);
      if (moi !== lecture) return;
      liste = r.liste;
      base = reserves ? { Q: reserves[0], T: reserves[1] } : null;
      reglerPas();
      peindreGraphe();
      peindreEchanges();
    } catch {
      if (moi !== lecture) return;
      if (!liste.length) {
        motGraphe('erreur', 'The chain node did not answer.', true);
        $('#e-mot').textContent = 'The chain node did not answer.';
      }
    }
  }

  // L'état de la courbe et du wallet, relu d'un coup. Si les réserves ont bougé, les échanges se relisent.
  let tour = 0;
  async function relire({ echangesAussi = false } = {}) {
    const moi = ++tour;
    const w = W.etat();
    try {
      const neuf = await M.etat(k.token, k.courbe, w.connecte ? w.adresse : null);
      if (moi !== tour) return;
      const bouge = !e || neuf.Q !== e.Q || neuf.T !== e.T;
      e = neuf;
      peindreChiffres();
      peindrePanneau();
      if (bouge || echangesAussi) await lireEchanges();
    } catch {
      if (moi !== tour || e) return;
      motGraphe('erreur', 'The chain node did not answer.', true);
      $('#m-go').firstElementChild.textContent = 'The curve did not answer';
    }
  }

  // ---------- acheter, vendre
  const suivi = $('#m-suivi');
  const lienTx = $('#m-tx');
  function etapes(noms) {
    suivi.replaceChildren(...noms.map(([cle, texte]) => el('li', { data: { k: cle, etat: 'off' } }, el('i', { class: 'lampe', 'aria-hidden': 'true' }), el('span', { text: texte }))));
    suivi.hidden = false;
  }
  function etape(cle, genre, texte) {
    const li = suivi.querySelector(`[data-k="${cle}"]`);
    if (!li) return;
    li.dataset.etat = genre;
    if (texte) li.lastElementChild.textContent = texte;
  }
  function arreter(message, mauvais = true) {
    ui.occupe = false;
    ui.mot = { texte: message, mauvais };
    peindrePanneau();
  }
  // Attend le reçu d'une transaction. Rend le reçu, ou null si rien n'est venu en une minute et demie.
  async function attendre(hash) {
    lienTx.href = `${C.CHAINE.explorateur}/tx/${hash}`;
    lienTx.hidden = false;
    const debut = Date.now();
    while (Date.now() - debut < 90000) {
      const recu = await C.recu(hash).catch(() => null);
      if (recu) return recu;
      await pause(1500);
    }
    return null;
  }

  async function agir() {
    const w = W.etat();
    if (!w.connecte) {
      if (typeof W.ouvrir === 'function') W.ouvrir();
      else location.assign(`connect.html?next=${encodeURIComponent(`coin.html?t=${token}`)}`);
      return;
    }
    if (!w.bonneChaine) {
      try {
        await W.changerDeChaine();
      } catch (err) {
        dire(W.direErreur(err));
      }
      return;
    }
    if (ui.occupe || !e || ferme()) return;
    const achat = ui.sens === 'achat';
    const m = montant();
    if (m === null || m <= 0n) return;
    ui.occupe = true;
    ui.mot = null;
    lienTx.hidden = true;
    peindrePanneau();
    const de = w.adresse;
    try {
      // Tout est relu juste avant : le prix a pu bouger depuis le devis affiché.
      e = await M.etat(k.token, k.courbe, de);
      // Une lecture manquée n'est pas « aucune autorisation » : on s'arrête plutôt que d'en demander une pour rien.
      if (!achat && (e.autorisation === null || e.jetons === null)) throw { genre: 'reseau' };
      const autoriser = !achat && e.autorisation < m;
      etapes([...(autoriser ? [['autorise', `Allow the curve to take your ${k.ticker}`]] : []), ['signe', 'Checking the trade against the chain'], ['envoye', 'Sent to Robinhood Chain'], ['confirme', 'Confirmed on chain']]);
      if (autoriser) {
        // Le coin doit laisser sa courbe prendre les jetons vendus : une première confirmation, une fois par coin.
        etape('autorise', 'wait', `Confirm in your wallet: allow the curve to take your ${k.ticker}`);
        const txA = M.txAutoriser(k.token, k.courbe);
        const limiteA = ((await M.gaz(txA, de)) * 125n) / 100n;
        const hashA = await W.envoyer(txA, limiteA);
        etape('autorise', 'wait', 'Allowance sent. Waiting for the chain…');
        const recuA = await attendre(hashA);
        if (!recuA) return arreter('The allowance is not confirmed yet. It can still go through: follow the transaction, then sell again.');
        if (recuA.status !== '0x1') {
          etape('autorise', 'faux', 'The allowance was refused on chain');
          return arreter('The chain refused the allowance. Nothing was sold.');
        }
        etape('autorise', 'on', `The curve can take your ${k.ticker}`);
        // Le nœud qui répond aux lectures peut avoir un bloc de retard sur celui qui a confirmé : on lui laisse
        // quelques secondes pour voir l'autorisation avant de préparer la vente.
        for (let essai = 0; essai < 5; essai++) {
          e = await M.etat(k.token, k.courbe, de);
          if (e.autorisation !== null && e.autorisation >= m) break;
          await pause(1200);
        }
      }
      etape('signe', 'wait');
      const d = achat ? M.devisAchat(e, m) : M.devisVente(e, m);
      const min = M.minimum(d.recu, ui.tolerance);
      const tx = achat ? M.txAchat(k.courbe, m, min, de) : M.txVente(k.courbe, m, min, de);
      await M.simuler(tx, de);
      const limite = ((await M.gaz(tx, de)) * 125n) / 100n;
      etape('signe', 'wait', 'Confirm in your wallet');
      let hash;
      try {
        hash = await W.envoyer(tx, limite);
      } catch (err) {
        etape('signe', 'faux', 'Not signed');
        return arreter(W.direErreur(err));
      }
      etape('signe', 'on', 'Signed in your wallet');
      etape('envoye', 'on');
      etape('confirme', 'wait');
      const recu = await attendre(hash);
      if (!recu) {
        etape('confirme', 'wait', 'Not confirmed yet');
        return arreter('Not confirmed yet. It can still go through: follow the transaction before you try again.', false);
      }
      if (recu.status !== '0x1') {
        etape('confirme', 'faux', 'Refused on chain');
        return arreter(`The chain refused the trade. Nothing was ${achat ? 'bought' : 'sold'}. The network fee was spent.`);
      }
      etape('confirme', 'on');
      const fait = M.echangeDuRecu(recu, k.courbe);
      dire(fait ? (fait.achat ? `Bought ${M.court(fait.jetons)} ${k.ticker}` : `Sold for ${M.eth(fait.eth)} ETH`) : achat ? 'Bought' : 'Sold');
      ui.exact = null;
      ecrire('');
      ui.occupe = false;
      ui.mot = { texte: fait ? (fait.achat ? `You bought ${M.court(fait.jetons)} ${k.ticker} for ${M.eth(fait.eth)} ETH.` : `You sold ${M.court(fait.jetons)} ${k.ticker} for ${M.eth(fait.eth)} ETH.`) : 'Done.', mauvais: false };
      peindrePanneau();
      await relire({ echangesAussi: true });
    } catch (err) {
      if (err && (err.code === 4001 || /user rejected|user denied/i.test(String(err.message)))) {
        etape('autorise', 'faux');
        return arreter(W.direErreur(err));
      }
      arreter(err && err.genre ? M.direRefus(err) : W.direErreur(err));
    }
  }

  // ---------- gestes
  for (const b of [$('#m-acheter'), $('#m-vendre')]) {
    b.addEventListener('click', () => {
      if (ui.occupe || ui.sens === b.dataset.sens) return;
      ui.sens = b.dataset.sens;
      ui.exact = null;
      ecrire('');
      suivi.hidden = true;
      lienTx.hidden = true;
      ui.mot = null;
      peindrePanneau();
    });
  }
  champ.addEventListener('input', () => {
    ui.exact = null;
    ui.mot = null;
    peindrePanneau();
  });
  $('#m-rapides').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled || ui.occupe) return;
    ui.mot = null;
    if (b.dataset.mise) {
      ui.exact = null;
      ecrire(b.dataset.mise);
    } else if (e && e.jetons) {
      // Une part du solde, au jeton près : 100 % vend tout, sans reste.
      ui.exact = (e.jetons * BigInt(b.dataset.part)) / 100n;
      ecrire(enClair(ui.exact));
    }
    peindrePanneau();
  });
  $('#m-solde').addEventListener('click', () => {
    if (!e || ui.occupe) return;
    ui.mot = null;
    if (ui.sens === 'achat') {
      const gaz = e.prixGaz ? M.GAZ.achat * e.prixGaz * 2n : 0n;
      const tout = e.eth - gaz - RESERVE_GAZ;
      ui.exact = null;
      ecrire(tout > 0n ? C.ether(tout, 5) : '0');
    } else {
      ui.exact = e.jetons;
      ecrire(enClair(e.jetons));
    }
    peindrePanneau();
  });
  $('#m-tol').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-pb]');
    if (!b) return;
    ui.tolerance = Number(b.dataset.pb);
    peindrePanneau();
  });
  $('#m-go').addEventListener('click', agir);
  $('#g-pas').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-pas]');
    if (!b) return;
    ui.pas = Number(b.dataset.pas);
    ui.pasChoisi = true;
    for (const x of document.querySelectorAll('#g-pas button')) x.setAttribute('aria-checked', String(x === b));
    peindreGraphe(false, true);
  });
  $('#g-unite').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-unite]');
    if (!b) return;
    ui.unite = b.dataset.unite;
    for (const x of document.querySelectorAll('#g-unite button')) x.setAttribute('aria-checked', String(x === b));
    peindreGraphe();
  });
  $('#g-moins').addEventListener('click', () => graphe && graphe.zoom(-1));
  $('#g-plus').addEventListener('click', () => graphe && graphe.zoom(1));
  $('#g-encore').addEventListener('click', () => {
    motGraphe('charge', 'Reading the trades…');
    relire({ echangesAussi: true });
  });
  $('#k-copier').addEventListener('click', () => k && copier(k.token, 'Address copied'));
  document.addEventListener('uh:wallet', () => {
    if (k) relire();
  });
  // La page reste à jour : la courbe est relue toutes les 12 secondes, onglet visible, hors d'un échange en cours.
  setInterval(() => {
    if (k && e && !ui.occupe && document.visibilityState === 'visible' && !ferme()) relire();
  }, 12000);
  // Les « il y a » des échanges avancent.
  setInterval(() => {
    if (liste.length && document.visibilityState === 'visible') peindreEchanges();
  }, 30000);

  async function ouvrir() {
    page.dataset.etat = 'charge';
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return absent('This page needs a coin address.');
    try {
      k = await C.coin(token);
      if (!k) return absent('This address is not a coin launched on Pons.');
    } catch {
      return absent('The chain node did not answer.', true);
    }
    montrer();
    prouver();
    await W.pret;
    relire({ echangesAussi: true });
  }
  $('#k-encore').addEventListener('click', ouvrir);
  peindrePanneau();
  ouvrir();
})();
