// Udenhood, « Launch from your repo » : le dépôt signe le coin, le wallet le lance. Trois clics sur le site.
// 1. Le dépôt est collé : le coin se remplit tout seul (nom, ticker, texte, image, site), tout reste modifiable.
// 2. Log in (une fenêtre, le wallet), puis « Sign on GitHub » : GitHub s'ouvre sur le fichier udenhood.json prêt.
//    Le fichier nomme le wallet ET l'adresse que le coin aura : cette adresse se calcule avant le lancement
//    (chaine.js, prevoir). Rien à refaire après le lancement.
// 3. Launch : le lancement est rejoué sur l'état réel de la chaîne, puis le wallet s'ouvre.
// Le coin est créé par les contrats de Pons. Une transaction envoyée dont on n'a pas encore le reçu est dite
// « pas encore confirmée », jamais « échouée ».
(() => {
  const { lire, github, el, dire, copier, memoire, poserImage, CHAINE } = window.UH;
  const C = window.UHC;
  const W = window.UHW;
  const P = window.UHP;
  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#lancer');
  if (!form) return;

  const c = { repo: $('#l-repo'), ticker: $('#l-ticker'), nom: $('#l-nom'), texte: $('#l-texte'), image: $('#l-image'), site: $('#l-site'), x: $('#l-x'), achat: $('#l-achat') };
  const ticket = $('#ticket');
  const bouton = $('#t-lancer');
  const note = $('#t-note');
  const preuveLigne = $('#l-preuve');
  // prevu : l'adresse que le coin aura, pour la fiche et le wallet du moment. sel : tiré une fois par brouillon.
  const etat = { depot: null, fichier: null, pons: null, ponsErreur: false, taxe: 0, solde: null, devis: null, occupe: false, sel: C.sel(), prevu: null, prevuPour: '' };
  const v = (champ) => champ.value.trim();
  const boite = (champ) => champ.closest('.field');

  // ---------- ce que le formulaire dit
  const ticker = () => v(c.ticker).toUpperCase();
  const tickerBon = () => /^[A-Z0-9]{2,10}$/.test(ticker());
  const nomBon = () => v(c.nom).length > 0 && C.octets(v(c.nom)) <= C.LIMITES.nom;
  // Sans lien, l'image est celle du compte GitHub du dépôt. Un lien vers un fichier de GitHub devient celui du
  // fichier brut, le seul qu'un navigateur affiche.
  function image() {
    const brut = v(c.image).replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/, 'https://raw.githubusercontent.com/$1/$2/$3');
    if (!brut) return { lien: etat.depot ? etat.depot.avatar : '', bon: true };
    return { lien: brut, bon: C.images(brut).length > 0 && C.octets(brut) <= C.LIMITES.logo };
  }
  function site() {
    const brut = v(c.site);
    if (!brut) return { lien: etat.depot ? etat.depot.site || `https://github.com/${etat.depot.nom}` : '', bon: true };
    return { lien: brut, bon: !!C.lien(brut) && C.octets(brut) <= C.LIMITES.reseau };
  }
  function compteX() {
    const brut = v(c.x).replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
    if (!brut) return { lien: '', bon: true };
    return { lien: `https://x.com/${brut}`, bon: /^[A-Za-z0-9_]{1,15}$/.test(brut) };
  }
  // Le texte du coin finit toujours par la ligne qui nomme le dépôt : c'est elle que la carte de preuve relit.
  function description() {
    const tout = [v(c.texte), etat.depot ? C.marque(etat.depot.nom) : ''].filter(Boolean).join('\n\n');
    return { tout, bon: C.octets(tout) <= C.LIMITES.description, reste: C.LIMITES.description - C.octets(tout) };
  }
  function achat() {
    const brut = v(c.achat);
    if (!brut) return { wei: 0n, bon: true };
    const w = C.wei(brut);
    return { wei: w || 0n, bon: w !== null };
  }
  const coinBon = () => !!etat.depot && nomBon() && tickerBon() && description().bon && image().bon && site().bon && compteX().bon;
  const parametres = () => ({ nom: v(c.nom), ticker: ticker(), logo: image().lien, description: description().tout, reseaux: { twitter: compteX().lien, site: site().lien }, wallet: W.etat().adresse, taxe: etat.taxe, rachat: false, pin: etat.pons.pin, sel: etat.sel });
  const fichierPreuve = () => JSON.stringify({ udenhood: 1, chain: CHAINE, wallet: W.etat().adresse || '0x…', ticker: ticker() || 'COIN', ...(etat.prevu ? { coin: etat.prevu } : {}) }, null, 2) + '\n';

  // Le fichier du dépôt face au wallet connecté, au ticker et à l'adresse prévue du coin.
  function preuve() {
    const w = W.etat();
    const f = etat.fichier;
    if (!etat.depot) return { etat: 'off', texte: 'Paste your repo first.' };
    if (!w.connecte) return { etat: 'off', texte: 'Log in, then sign.' };
    if (!coinBon()) return { etat: 'off', texte: 'Give the coin a name and a ticker first.' };
    if (!etat.prevu) return { etat: 'wait', texte: 'Working out the address your coin will have…' };
    if (!f) return { etat: 'wait', texte: 'Reading your repo…' };
    if (f.erreur) return { etat: 'faux', texte: f.erreur };
    if (!f.present) return { etat: 'off', texte: 'Not signed yet: your repo has no udenhood.json.' };
    if (!f.wallet) return { etat: 'faux', texte: 'udenhood.json is there, but it names no valid wallet.' };
    if (!C.egal(f.wallet, w.adresse)) return { etat: 'faux', texte: `The file names ${C.court(f.wallet)}. You are logged in as ${C.court(w.adresse)}.` };
    if (f.ticker.toUpperCase() !== ticker()) return { etat: 'faux', texte: `The file signs $${f.ticker || '?'}. Your ticker is $${ticker()}.` };
    if (!f.coin || !C.egal(f.coin, etat.prevu)) return { etat: 'faux', texte: f.coin ? 'The coin changed since you signed. Update the file.' : 'The file does not name this coin yet. Update it.' };
    return { etat: 'on', texte: `Signed: the repo names your wallet and $${ticker()}.` };
  }

  // ---------- brouillon : ce navigateur se souvient du formulaire, pas d'un lancement
  let garde = 0;
  function garder() {
    clearTimeout(garde);
    garde = setTimeout(() => memoire.ecrire('uh-lancement', { depot: etat.depot ? etat.depot.nom : v(c.repo), ticker: ticker(), nom: v(c.nom), texte: v(c.texte), image: v(c.image), site: v(c.site), x: v(c.x), achat: v(c.achat), taxe: etat.taxe, sel: etat.sel, auto: Object.fromEntries(Object.entries(c).map(([k, champ]) => [k, champ.dataset.auto === 'true'])) }), 300);
  }
  function reprendre() {
    const b = memoire.lire('uh-lancement') || {};
    const demande = lire(new URL(location.href).searchParams.get('repo') || '');
    const depot = demande ? `${demande.o}/${demande.r}` : b.depot || '';
    // Le brouillon d'un autre dépôt ne se colle pas sur celui-ci.
    const meme = !demande || String(b.depot || '').toLowerCase() === depot.toLowerCase();
    c.repo.value = depot;
    if (!meme) return;
    for (const k of ['ticker', 'nom', 'texte', 'image', 'site', 'x', 'achat']) {
      if (typeof b[k] === 'string') c[k].value = b[k];
      if (b.auto && b.auto[k]) c[k].dataset.auto = 'true';
    }
    if (Number.isInteger(b.taxe)) etat.taxe = b.taxe;
    if (/^0x[0-9a-f]{64}$/.test(b.sel || '')) etat.sel = b.sel;
  }

  // ---------- étape 1 : le dépôt, et le coin rempli depuis lui
  // Un champ rempli par nous porte data-auto : il suit le dépôt tant qu'il n'a pas été retouché à la main.
  function remplir(depot) {
    const poser = (champ, valeur) => {
      if (v(champ) && champ.dataset.auto !== 'true') return;
      champ.value = valeur || '';
      champ.dataset.auto = 'true';
    };
    const mots = depot.name.replace(/[-_.]+/g, ' ').trim();
    poser(c.nom, mots.replace(/\b[a-z]/g, (l) => l.toUpperCase()).slice(0, 40));
    poser(c.ticker, (depot.name.split(/[-_.]+/)[0] || depot.name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
    poser(c.texte, depot.description || '');
    c.site.placeholder = etat.depot.site || `https://github.com/${depot.full_name}`;
  }
  let attente = 0;
  async function lireDepot() {
    const ligne = $('#l-depot');
    const d = lire(c.repo.value);
    etat.depot = null;
    etat.fichier = null;
    etat.prevu = null;
    if (!d) {
      ligne.textContent = v(c.repo) ? 'Type it as owner/repo.' : 'Any public GitHub repo.';
      return peindre();
    }
    ligne.textContent = 'Asking GitHub…';
    peindre();
    const demande = c.repo.value;
    try {
      const depot = await github(`/repos/${d.o}/${d.r}`);
      if (c.repo.value !== demande) return; // il a tapé autre chose entre-temps
      etat.depot = { nom: depot.full_name, branche: depot.default_branch, site: C.lien(depot.homepage), avatar: C.lien(depot.owner.avatar_url) };
      ligne.replaceChildren('Found. ', el('a', { href: `index.html?repo=${encodeURIComponent(depot.full_name)}`, text: 'See its proof card' }));
      remplir(depot);
      garder();
      lireFichier(false);
    } catch (e) {
      ligne.textContent = e && e.genre === 'absent' ? 'No public repo at that address.' : e && e.genre === 'limite' ? 'GitHub limits requests from your network. Try again later.' : 'GitHub did not answer. Try again.';
    }
    peindre();
  }

  // ---------- l'adresse que le coin aura
  let prevoirAttente = 0;
  function prevoir() {
    const w = W.etat();
    if (!w.connecte || !coinBon() || !etat.pons) {
      etat.prevu = null;
      etat.prevuPour = '';
      return;
    }
    const params = parametres();
    const pour = JSON.stringify(params);
    if (pour === etat.prevuPour) return;
    etat.prevu = null;
    etat.prevuPour = pour;
    clearTimeout(prevoirAttente);
    prevoirAttente = setTimeout(async () => {
      let adresse = null;
      try {
        adresse = await C.prevoir(C.transaction(params, etat.pons.frais, 0n, 0n), w.adresse);
      } catch {}
      if (pour !== etat.prevuPour) return; // la fiche a changé pendant le calcul
      if (!adresse) etat.prevuPour = ''; // le nœud n'a pas répondu : on redemandera
      etat.prevu = adresse;
      peindre();
    }, 500);
  }

  // ---------- le fichier de preuve
  let lecture = 0;
  async function lireFichier(frais) {
    if (!etat.depot || !W.etat().connecte) return peindre();
    const moi = ++lecture;
    let f;
    try {
      f = await P.fichier(etat.depot.nom, etat.depot.branche, { frais });
    } catch (e) {
      f = { erreur: e && e.genre === 'limite' ? 'GitHub limits requests from your network. Try again later.' : 'GitHub did not answer. Try again.' };
    }
    if (moi !== lecture) return;
    etat.fichier = f;
    peindre();
  }
  // GitHub s'ouvre dans une petite fenêtre, sur le fichier prêt : il n'y a qu'à valider. Fichier déjà là mais faux :
  // GitHub l'ouvre en édition et le nouveau texte est copié. Au retour, le dépôt est relu tout seul.
  let guet = 0;
  function signer() {
    if (!etat.depot || !etat.prevu) return;
    const f = etat.fichier;
    const base = `https://github.com/${etat.depot.nom}`;
    const branche = encodeURIComponent(etat.depot.branche);
    const corrige = !!(f && f.present);
    const url = corrige ? `${base}/edit/${branche}/udenhood.json` : `${base}/new/${branche}?filename=udenhood.json&value=${encodeURIComponent(fichierPreuve())}`;
    if (corrige) copier(fichierPreuve(), 'File copied: paste it on GitHub');
    window.open(url, 'uh-github', 'popup,width=1060,height=860');
    clearInterval(guet);
    let tours = 0;
    guet = setInterval(() => {
      if (preuve().etat === 'on' || ++tours > 20) return clearInterval(guet);
      lireFichier(true);
    }, 6000);
  }
  const relire = () => {
    if (document.visibilityState === 'visible' && guet && preuve().etat !== 'on') lireFichier(true);
  };
  document.addEventListener('visibilitychange', relire);
  window.addEventListener('focus', relire);

  // ---------- Pons, le solde, le devis
  async function lirePons() {
    const w = W.etat();
    etat.ponsErreur = false;
    try {
      etat.pons = await C.etatPons(w.connecte ? w.adresse : null);
    } catch {
      etat.pons = null;
      etat.ponsErreur = true;
    }
    etat.solde = null;
    if (w.connecte) etat.solde = await C.solde(w.adresse).catch(() => null);
    peindre();
  }
  const pret = () => coinBon() && W.etat().bonneChaine && preuve().etat === 'on' && achat().bon && !!etat.pons && etat.pons.ouvert && etat.pons.peutLancer !== false;

  // Le devis : le lancement rejoué sur l'état réel, pour connaître les jetons du premier achat et les frais de réseau.
  let devisTour = 0;
  let devisAttente = 0;
  function demanderDevis() {
    clearTimeout(devisAttente);
    etat.devis = null;
    devisTour++;
    if (!pret() || etat.occupe) return;
    const moi = devisTour;
    devisAttente = setTimeout(async () => {
      try {
        const tx = C.transaction(parametres(), etat.pons.frais, achat().wei, 0n);
        const de = W.etat().adresse;
        const [sim, gaz, prix] = await Promise.all([C.simuler(tx, de), C.gaz(tx, de), C.prixDuGaz()]);
        if (moi !== devisTour) return;
        etat.devis = { jetons: sim.jetons, reseau: gaz * prix };
      } catch (e) {
        if (moi !== devisTour) return;
        etat.devis = { refus: C.direRefus(e) };
      }
      peindre();
    }, 700);
  }

  // ---------- l'écran
  const eth = (wei) => `${C.ether(wei, 5)} ETH`;
  // Dans le ticket, l'unité porte le logo d'Ethereum. Une valeur pas encore connue reste un tiret, sans logo.
  const unite = () => el('span', { class: 'eth', text: 'ETH' });
  const poserMontant = (cible, wei, { avant = '', apres = '' } = {}) => cible.replaceChildren(...(wei == null ? ['—'] : [`${avant}${C.ether(wei, 5)} `, unite(), apres]));
  function poserEtat(liste, cle, genre, texte) {
    const li = liste.querySelector(`[data-k="${cle}"]`);
    li.dataset.etat = genre;
    if (texte) li.lastElementChild.textContent = texte;
  }
  function peindre() {
    const w = W.etat();
    prevoir();
    const p = preuve();
    const img = image();
    const d = description();
    const a = achat();

    // Étapes
    $('#e-depot').dataset.fait = String(!!etat.depot);
    $('#e-coin').dataset.fait = String(coinBon() && a.bon);
    $('#e-preuve').dataset.fait = String(p.etat === 'on' && w.bonneChaine);
    $('#l-dans').hidden = !w.connecte;
    $('#l-login').hidden = w.connecte;
    $('#l-changer').hidden = !w.connecte || w.bonneChaine;
    $('#l-wallet').textContent = w.connecte && !w.bonneChaine ? 'Your wallet is on another network.' : 'Your wallet launches the coin. One file in your repo names that wallet and the coin.';

    // Le fichier, tel qu'il doit être dans le dépôt
    const cle = (nom, valeur, texte, dernier) => [`  "${nom}": `, el(texte ? 'i' : 'b', { text: texte ? `"${valeur}"` : String(valeur) }), dernier ? '\n' : ',\n'];
    $('#l-apercu').replaceChildren('{\n', ...cle('udenhood', 1), ...cle('chain', CHAINE), ...cle('wallet', w.adresse || '0x…', true), ...cle('ticker', ticker() || 'COIN', true), ...cle('coin', etat.prevu || '0x…', true, true), '}');
    preuveLigne.dataset.etat = p.etat;
    preuveLigne.lastElementChild.textContent = p.texte;
    const ajouter = $('#l-ajouter');
    ajouter.hidden = !w.connecte;
    ajouter.disabled = !etat.prevu || p.etat === 'on' || p.etat === 'wait';
    ajouter.firstElementChild.textContent = p.etat === 'on' ? 'Signed' : etat.fichier && etat.fichier.present ? 'Update on GitHub' : 'Sign on GitHub';
    $('#l-verifier').disabled = !etat.depot || !w.connecte;
    if (p.etat === 'on') clearInterval(guet);

    // Les champs : une faute se voit sur le champ, dès qu'il est rempli
    boite(c.ticker).dataset.bad = String(!!v(c.ticker) && !tickerBon());
    boite(c.nom).dataset.bad = String(!!v(c.nom) && !nomBon());
    boite(c.texte).dataset.bad = String(!d.bon);
    boite(c.image).dataset.bad = String(!img.bon);
    boite(c.site).dataset.bad = String(!site().bon);
    boite(c.x).dataset.bad = String(!compteX().bon);
    boite(c.achat).dataset.bad = String(!a.bon);
    const aide = $('#l-texte-aide');
    aide.dataset.kind = d.bon ? '' : 'bad';
    aide.textContent = d.bon ? 'Udenhood adds one line at the end: the link to your repo.' : `Too long for Pons by ${-d.reste} characters.`;
    for (const b of document.querySelectorAll('#l-taxe button')) {
      const pb = Number(b.dataset.pb);
      b.setAttribute('aria-checked', String(pb === etat.taxe));
      b.disabled = !!etat.pons && pb > etat.pons.taxeMax;
    }

    // Le ticket
    $('#t-nom').textContent = v(c.nom) || 'Your coin';
    $('#t-ticker').textContent = `$${ticker() || 'COIN'}`;
    $('#t-depot').textContent = etat.depot ? etat.depot.nom : 'no repo yet';
    const vignette = $('#t-img');
    const voulue = img.bon ? img.lien : '';
    if (vignette.dataset.lien !== voulue) {
      vignette.dataset.lien = voulue;
      poserImage(vignette, C.images(voulue), $('#t-cadre'));
    }
    const liste = $('#t-liste');
    poserEtat(liste, 'depot', etat.depot ? 'on' : 'off');
    poserEtat(liste, 'coin', coinBon() ? 'on' : 'off');
    poserEtat(liste, 'wallet', w.bonneChaine ? 'on' : w.connecte ? 'faux' : 'off', w.connecte && !w.bonneChaine ? 'Logged in, on another network' : 'Logged in on Robinhood Chain');
    poserEtat(liste, 'preuve', p.etat === 'on' ? 'on' : p.etat === 'faux' ? 'faux' : p.etat === 'wait' ? 'wait' : 'off');
    const pons = etat.pons;
    poserEtat(liste, 'pons', !pons ? (etat.ponsErreur ? 'faux' : 'wait') : !pons.ouvert || pons.peutLancer === false ? 'faux' : 'on', !pons ? (etat.ponsErreur ? 'Pons did not answer' : 'Asking Pons…') : !pons.ouvert ? 'Pons has paused launches' : pons.peutLancer === false ? 'Pons only accepts approved wallets right now' : 'Pons accepts launches');

    // Les coûts : chaque ligne est lue ou calculée ; ce qui n'est pas encore connu reste un tiret
    poserMontant($('#t-frais'), pons ? pons.frais : null);
    poserMontant($('#t-achat'), a.bon ? a.wei : null);
    const dv = etat.devis;
    poserMontant($('#t-gaz'), dv && dv.reseau != null ? dv.reseau : null, { avant: '≈ ' });
    const total = pons && a.bon ? pons.frais + a.wei + (dv && dv.reseau != null ? dv.reseau : 0n) : null;
    poserMontant($('#t-total'), total, { apres: dv && dv.reseau != null ? '' : ' + network' });
    const recoit = $('#t-jetons');
    recoit.hidden = !(dv && dv.jetons > 0n && pons);
    if (!recoit.hidden) recoit.textContent = `Your first buy gets about ${(dv.jetons / 10n ** 18n).toLocaleString('en-US')} $${ticker()}, ${(Number((dv.jetons * 10000n) / pons.supply) / 100).toFixed(2)} % of the supply.`;

    // Le bouton, et la phrase qui dit le prochain geste
    const manque = !etat.depot ? 'Paste your repo.' : !coinBon() ? 'Give the coin a name and a ticker, and fix the fields marked in red.' : !a.bon ? 'The first buy is not an amount.' : !w.connecte ? 'Log in with your wallet.' : !w.bonneChaine ? 'Switch your wallet to Robinhood Chain.' : p.etat !== 'on' ? (p.etat === 'wait' ? p.texte : 'Sign your repo on GitHub.') : !pons ? (etat.ponsErreur ? 'Pons did not answer. Reload to try again.' : 'Asking Pons…') : !pons.ouvert ? 'Pons has paused launches.' : pons.peutLancer === false ? 'Pons only accepts approved wallets right now.' : '';
    const court = !manque && total != null && etat.solde != null && etat.solde < total;
    const refus = !manque && dv && dv.refus;
    bouton.disabled = !!manque || court || !!refus || !dv || etat.occupe;
    note.dataset.kind = court || refus ? 'bad' : '';
    note.textContent = manque || (court ? `This wallet holds ${eth(etat.solde)}. The launch needs about ${eth(total)}.` : refus ? dv.refus : !dv ? 'Checking the launch against the chain…' : 'Ready. Nothing is sent before you confirm in your wallet.');
    if (!manque && !dv) demanderDevis();
  }

  // ---------- lancer
  const suivi = $('#t-suivi');
  const suiviNote = $('#t-suivi-note');
  const lienTx = $('#t-tx');
  const retour = $('#t-retour');
  function vue(nom) {
    ticket.dataset.vue = nom;
  }
  function abandonner(message) {
    etat.occupe = false;
    vue('avant');
    peindre();
    note.dataset.kind = 'bad';
    note.textContent = message;
  }

  async function lancer() {
    if (etat.occupe || !pret()) return;
    etat.occupe = true;
    const de = W.etat().adresse;
    for (const k of ['envoye', 'confirme']) poserEtat(suivi, k, 'off');
    poserEtat(suivi, 'signe', 'wait', 'Checking the launch against the chain');
    suiviNote.textContent = '';
    lienTx.hidden = true;
    retour.hidden = true;
    vue('envoi');
    let tx;
    let limite;
    try {
      // Tout est relu juste avant : les conditions de Pons peuvent avoir changé depuis l'ouverture de la page.
      etat.pons = await C.etatPons(de);
      if (!etat.pons.ouvert) return abandonner('Pons has paused launches.');
      if (etat.pons.peutLancer === false) return abandonner('Pons only accepts approved wallets right now.');
      const params = parametres();
      const premier = achat().wei;
      tx = C.transaction(params, etat.pons.frais, premier, 0n);
      let essai = await C.simuler(tx, de);
      if (premier > 0n) {
        // Le premier achat se fait dans la même transaction que le lancement : personne ne peut passer devant.
        // Le minimum accepté est fixé à 97 % de ce que la chaîne annonce.
        tx = C.transaction(params, etat.pons.frais, premier, (essai.jetons * 97n) / 100n);
        essai = await C.simuler(tx, de);
      }
      // Le coin qui va naître doit être celui que le dépôt a signé.
      if (!C.egal(essai.token, etat.fichier.coin)) return abandonner('The coin address changed since you signed. Sign your repo again.');
      limite = ((await C.gaz(tx, de)) * 125n) / 100n;
    } catch (e) {
      return abandonner(C.direRefus(e));
    }

    poserEtat(suivi, 'signe', 'wait', 'Confirm in your wallet');
    let hash;
    try {
      hash = await W.envoyer(tx, limite);
    } catch (e) {
      return abandonner(W.direErreur(e));
    }
    memoire.ecrire('uh-envoi', { hash, depot: etat.depot.nom, nom: v(c.nom), ticker: ticker(), wallet: de, quand: Date.now() });
    suivre(hash);
  }

  // Attend le reçu. Tant qu'il n'est pas là, la transaction est « pas encore confirmée » : elle peut encore passer.
  let suiviTour = 0;
  async function suivre(hash) {
    etat.occupe = true;
    vue('envoi');
    poserEtat(suivi, 'signe', 'on', 'Signed in your wallet');
    poserEtat(suivi, 'envoye', 'on');
    poserEtat(suivi, 'confirme', 'wait');
    lienTx.href = `${C.CHAINE.explorateur}/tx/${hash}`;
    lienTx.hidden = false;
    suiviNote.textContent = 'Waiting for the chain…';
    const debut = Date.now();
    const moi = ++suiviTour;
    for (;;) {
      const recu = await C.recu(hash).catch(() => null);
      if (moi !== suiviTour) return; // il est revenu au formulaire
      if (recu && recu.status === '0x1') {
        const ne = C.lance(recu);
        if (ne) return fini(ne.token, hash);
        poserEtat(suivi, 'confirme', 'faux', 'Confirmed, but no coin was created');
        suiviNote.textContent = 'The transaction went through without a launch. Open it to see what it did.';
        break;
      }
      if (recu && recu.status === '0x0') {
        poserEtat(suivi, 'confirme', 'faux', 'Refused on chain');
        suiviNote.textContent = 'The chain refused the transaction. No coin was created. The network fee was spent.';
        break;
      }
      const attendu = Date.now() - debut;
      if (attendu > 90000) {
        // Pas de reçu après une minute et demie : ce n'est pas un échec. Il peut attendre ici, ou revenir au
        // formulaire ; la transaction reste visible sur l'explorateur.
        suiviNote.textContent = 'Not confirmed yet. It can still go through: keep this page open, or follow the transaction before you try again.';
        retour.hidden = false;
      }
      await new Promise((ok) => setTimeout(ok, attendu > 90000 ? 5000 : 1500));
      if (moi !== suiviTour) return;
    }
    memoire.ecrire('uh-envoi', null);
    etat.occupe = false;
    retour.hidden = false;
  }

  function fini(token, hash) {
    const envoi = memoire.lire('uh-envoi') || {};
    const depot = envoi.depot || (etat.depot && etat.depot.nom) || '';
    memoire.ecrire('uh-envoi', null);
    memoire.ecrire('uh-lancement', null);
    etat.occupe = false;
    $('#f-nom').textContent = `${envoi.nom || v(c.nom)} ($${envoi.ticker || ticker()})`;
    $('#f-adr').textContent = C.court(token);
    $('#f-page').href = `coin.html?t=${token}`;
    $('#f-pons').href = C.PONS.page(token);
    $('#f-tx').href = `${C.CHAINE.explorateur}/tx/${hash}`;
    $('#f-depot').href = `https://github.com/${depot}`;
    vue('fini');
    ticket.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- l'image envoyée depuis l'ordinateur
  // Elle est recadrée en carré et ramenée à 512 px dans le navigateur, puis rangée par le site (api/image), qui
  // rend son adresse. C'est la seule chose que le site garde.
  const imageAide = $('#l-image-aide');
  const direImage = (texte, mauvais) => {
    imageAide.textContent = texte;
    imageAide.dataset.kind = mauvais ? 'bad' : '';
  };
  async function preparer(fichier) {
    const source = await createImageBitmap(fichier);
    const cote = Math.min(source.width, source.height);
    const taille = Math.min(512, cote);
    const toile = document.createElement('canvas');
    toile.width = taille;
    toile.height = taille;
    const ctx = toile.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (source.width - cote) / 2, (source.height - cote) / 2, cote, cote, 0, 0, taille, taille);
    const versFichier = (type, qualite) => new Promise((ok) => toile.toBlob(ok, type, qualite));
    let image = await versFichier('image/webp', 0.92);
    if (!image || image.type !== 'image/webp') image = await versFichier('image/png'); // navigateur sans WebP
    if (image && image.size > 580 * 1024) image = await versFichier('image/jpeg', 0.9);
    return image;
  }
  let envoiTour = 0;
  async function envoyerImage(fichier) {
    if (!fichier) return;
    const moi = ++envoiTour;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(fichier.type)) return direImage('That file is not a PNG, JPEG, WebP or GIF image.', true);
    if (fichier.size > 12 * 1024 * 1024) return direImage('That image is over 12 MB.', true);
    direImage('Uploading…');
    $('#l-envoyer').disabled = true;
    try {
      const image = await preparer(fichier);
      if (!image) throw new Error('image');
      const rep = await fetch('api/image', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: image });
      const j = await rep.json().catch(() => ({}));
      if (moi !== envoiTour) return;
      if (!rep.ok || !C.lien(j.url)) {
        direImage(rep.status === 429 ? 'Too many images in a row. Try again in a few minutes.' : rep.status === 413 ? 'That image is too heavy, even resized.' : 'The upload did not go through. Try again, or paste a link.', true);
        return;
      }
      c.image.value = j.url;
      c.image.dataset.auto = 'false';
      direImage('Uploaded. The coin will carry this image.');
      garder();
      etat.devis = null;
      peindre();
    } catch {
      if (moi === envoiTour) direImage('That image could not be read. Try another file.', true);
    } finally {
      $('#l-envoyer').disabled = false;
    }
  }
  const choix = $('#l-image-fichier');
  $('#l-envoyer').addEventListener('click', () => choix.click());
  choix.addEventListener('change', () => {
    envoyerImage(choix.files[0]);
    choix.value = '';
  });
  // Une image lâchée sur l'étape, ou collée dans le champ.
  const zone = $('#e-coin');
  const porteUnFichier = (ev) => !!ev.dataTransfer && [...ev.dataTransfer.types].includes('Files');
  zone.addEventListener('dragover', (ev) => {
    if (!porteUnFichier(ev)) return;
    ev.preventDefault();
    zone.dataset.depose = 'true';
  });
  zone.addEventListener('dragleave', () => {
    zone.dataset.depose = 'false';
  });
  zone.addEventListener('drop', (ev) => {
    if (!porteUnFichier(ev)) return;
    ev.preventDefault();
    zone.dataset.depose = 'false';
    envoyerImage(ev.dataTransfer.files[0]);
  });
  c.image.addEventListener('paste', (ev) => {
    const fichier = [...((ev.clipboardData && ev.clipboardData.files) || [])].find((f) => f.type.startsWith('image/'));
    if (!fichier) return;
    ev.preventDefault();
    envoyerImage(fichier);
  });

  // ---------- gestes
  c.repo.addEventListener('input', () => {
    clearTimeout(attente);
    attente = setTimeout(lireDepot, 600);
  });
  c.ticker.addEventListener('input', () => {
    c.ticker.value = c.ticker.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  for (const champ of Object.values(c)) {
    if (champ === c.repo) continue;
    champ.addEventListener('input', () => {
      champ.dataset.auto = 'false'; // retouché à la main : il ne suit plus le dépôt
      garder();
      etat.devis = null;
      peindre();
    });
  }
  $('#l-taxe').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-pb]');
    if (!b || b.disabled) return;
    etat.taxe = Number(b.dataset.pb);
    etat.devis = null;
    garder();
    peindre();
  });
  $('#l-ajouter').addEventListener('click', signer);
  $('#l-verifier').addEventListener('click', () => lireFichier(true));
  $('#l-copier').addEventListener('click', () => copier(fichierPreuve(), 'File copied'));
  $('#l-changer').addEventListener('click', async (ev) => {
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
  bouton.addEventListener('click', lancer);
  retour.addEventListener('click', () => {
    suiviTour++; // on arrête de suivre cette transaction
    memoire.ecrire('uh-envoi', null);
    etat.occupe = false;
    etat.devis = null;
    vue('avant');
    peindre();
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
  // Un devis refusé (pas assez d'ETH, Pons muet) se redemande tout seul toutes les 20 secondes, page visible :
  // il recharge son wallet dans un autre onglet, et le bouton s'ouvre sans rien retaper.
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || etat.occupe || ticket.dataset.vue !== 'avant') return;
    if (etat.ponsErreur) return lirePons();
    const w = W.etat();
    const bloque = !!etat.devis && (!!etat.devis.refus || (etat.solde != null && etat.pons && etat.solde < etat.pons.frais + achat().wei));
    if (!w.connecte || !bloque) return;
    etat.solde = await C.solde(w.adresse).catch(() => etat.solde);
    etat.devis = null;
    peindre();
  }, 20000);

  // Le wallet change (login, autre compte, autre réseau) : le fichier, Pons et le solde se relisent.
  let dernier = '';
  document.addEventListener('uh:wallet', () => {
    const w = W.etat();
    const cleW = `${w.adresse}|${w.chaine}`;
    if (cleW === dernier) return;
    dernier = cleW;
    etat.devis = null;
    etat.fichier = null;
    peindre();
    lireFichier(false);
    lirePons();
  });

  reprendre();
  peindre();
  if (lire(c.repo.value)) lireDepot();
  W.pret.then(() => {
    const w = W.etat();
    dernier = `${w.adresse}|${w.chaine}`;
    lirePons();
    lireFichier(false);
    // Une transaction envoyée avant un rechargement de la page : on reprend son suivi.
    const envoi = memoire.lire('uh-envoi');
    if (envoi && /^0x[0-9a-f]{64}$/i.test(envoi.hash || '') && Date.now() - envoi.quand < 3600000) suivre(envoi.hash);
  });
})();
