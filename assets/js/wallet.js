// Udenhood : la connexion du wallet. Pas de compte, pas de mot de passe : le wallet est le login.
// Les wallets du navigateur se déclarent eux-mêmes (norme EIP-6963), avec leur nom et leur icône.
// Udenhood ne voit jamais de clé : il lit l'adresse publique, et demande une signature seulement pour lancer un coin.
window.UHW = (() => {
  const { CHAINE, court } = window.UHC;
  const CLE = 'uh-wallet';
  const trouves = new Map(); // identifiant -> { info, provider }
  const ecoutes = new WeakSet();
  const retours = []; // les wallets en train de revenir d'une session passée
  let actif = null;
  let adresse = '';
  let chaine = '';

  const norme = (c) => (typeof c === 'string' ? c.toLowerCase() : c == null ? '' : '0x' + Number(c).toString(16));
  const etat = () => ({ connecte: !!adresse, adresse, chaine, bonneChaine: !!adresse && chaine === CHAINE.hex, wallet: actif ? actif.info : null, trouves: [...trouves.values()].map((f) => f.info) });
  const dire = (nom) => document.dispatchEvent(new CustomEvent(nom, { detail: etat() }));
  const souvenir = (v) => {
    try {
      v ? localStorage.setItem(CLE, v) : localStorage.removeItem(CLE);
    } catch {}
  };
  const souvenu = () => {
    try {
      return localStorage.getItem(CLE) || '';
    } catch {
      return '';
    }
  };

  function ecouter(f) {
    if (ecoutes.has(f.provider) || typeof f.provider.on !== 'function') return;
    ecoutes.add(f.provider);
    f.provider.on('accountsChanged', (comptes) => {
      if (actif !== f) return;
      adresse = (comptes && comptes[0]) || '';
      if (!adresse) {
        actif = null;
        souvenir('');
      }
      peindre();
      dire('uh:wallet');
    });
    f.provider.on('chainChanged', (c) => {
      if (actif !== f) return;
      chaine = norme(c);
      peindre();
      dire('uh:wallet');
    });
  }

  // Un wallet déjà autorisé revient sans rien demander (eth_accounts ne déclenche aucune fenêtre).
  async function retrouver(f) {
    if (adresse || souvenu() !== f.info.rdns) return;
    try {
      const comptes = await f.provider.request({ method: 'eth_accounts' });
      if (!comptes || !comptes[0] || adresse) return;
      actif = f;
      adresse = comptes[0];
      chaine = norme(await f.provider.request({ method: 'eth_chainId' }));
      ecouter(f);
      peindre();
      dire('uh:wallet');
    } catch {}
  }

  function annoncer(detail) {
    if (!detail || !detail.info || !detail.provider || typeof detail.provider.request !== 'function') return;
    const i = detail.info;
    const id = String(i.uuid || i.rdns || i.name);
    if (trouves.has(id)) return;
    const icone = typeof i.icon === 'string' && /^data:image\/(png|svg\+xml|jpeg|webp|gif);/.test(i.icon) ? i.icon : '';
    const f = { info: { id, nom: String(i.name || 'Wallet').slice(0, 40), icone, rdns: String(i.rdns || id) }, provider: detail.provider };
    trouves.set(id, f);
    dire('uh:wallets');
    retours.push(retrouver(f));
  }
  window.addEventListener('eip6963:announceProvider', (ev) => annoncer(ev.detail));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Un wallet plus ancien, qui ne se déclare pas : on le prend tel qu'il s'installe dans la page.
  setTimeout(() => {
    if (!trouves.size && window.ethereum && typeof window.ethereum.request === 'function') annoncer({ info: { uuid: 'navigateur', name: 'Browser wallet', rdns: 'navigateur' }, provider: window.ethereum });
    dire('uh:wallets');
  }, 450);

  function direErreur(e) {
    const code = e && (e.code ?? (e.error && e.error.code));
    if (code === 4001 || /user rejected|user denied|rejected the request/i.test(String(e && e.message))) return 'You closed the request in your wallet.';
    if (code === -32002) return 'Your wallet already has a request open. Open it and answer.';
    return 'Your wallet did not answer. Try again.';
  }

  async function connecter(id) {
    const f = trouves.get(id);
    if (!f) throw new Error('wallet');
    const comptes = await f.provider.request({ method: 'eth_requestAccounts' });
    if (!comptes || !comptes[0]) throw new Error('compte');
    actif = f;
    adresse = comptes[0];
    chaine = norme(await f.provider.request({ method: 'eth_chainId' }));
    ecouter(f);
    souvenir(f.info.rdns);
    peindre();
    dire('uh:wallet');
    return etat();
  }

  // Passe le wallet sur Robinhood Chain ; s'il ne la connaît pas, la lui propose avec ses adresses officielles.
  async function changerDeChaine() {
    if (!actif) throw new Error('wallet');
    const p = actif.provider;
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAINE.hex }] });
    } catch (e) {
      const code = e && (e.code ?? (e.data && e.data.originalError && e.data.originalError.code));
      if (code !== 4902 && !/unrecognized chain|not been added|unknown chain/i.test(String(e && e.message))) throw e;
      await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAINE.hex, chainName: CHAINE.nom, nativeCurrency: CHAINE.monnaie, rpcUrls: [CHAINE.rpcJournaux], blockExplorerUrls: [CHAINE.explorateur] }] });
    }
    chaine = norme(await p.request({ method: 'eth_chainId' }));
    peindre();
    dire('uh:wallet');
    return chaine === CHAINE.hex;
  }

  // Demande au wallet de signer et d'envoyer. Rend l'empreinte de la transaction.
  async function envoyer(tx, gaz) {
    if (!actif || !adresse) throw new Error('wallet');
    const corps = { from: adresse, to: tx.to, data: tx.data, value: '0x' + tx.value.toString(16) };
    if (gaz) corps.gas = '0x' + gaz.toString(16);
    return actif.provider.request({ method: 'eth_sendTransaction', params: [corps] });
  }

  function deconnecter() {
    const p = actif && actif.provider;
    actif = null;
    adresse = '';
    chaine = '';
    souvenir('');
    // Certains wallets savent retirer l'autorisation ; les autres ignorent la demande.
    if (p) Promise.resolve(p.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })).catch(() => {});
    peindre();
    dire('uh:wallet');
  }

  // La pastille de l'en-tête : « Log in », ou l'adresse, avec un point qui dit si le réseau est le bon.
  // La page où l'on est, vue depuis la racine du site (« launch.html?repo=… », « docs/owner.html ») : c'est là qu'on
  // revient après le login. Les pages du compte elles-mêmes ne se donnent pas comme retour.
  function ici(connexion) {
    const racine = new URL('.', new URL(connexion, location.href)).pathname;
    const chemin = location.pathname.startsWith(racine) ? location.pathname.slice(racine.length) : '';
    if (/^(connect|account|404)\.html$/.test(chemin)) return '';
    return (chemin || 'index.html') + location.search;
  }
  // Le signe du wallet : l'icône qu'il déclare lui-même. Sans icône, celle du site reste.
  function signe(img) {
    if (!img.dataset.repos) img.dataset.repos = img.getAttribute('src');
    const vrai = !!(adresse && actif && actif.info.icone);
    img.src = vrai ? actif.info.icone : img.dataset.repos;
    img.classList.toggle('vrai', vrai);
  }
  function peindre() {
    const etatReseau = !adresse ? 'off' : chaine === CHAINE.hex ? 'on' : 'faux';
    for (const el of document.querySelectorAll('[data-wallet]')) {
      el.dataset.etat = etatReseau;
      const retour = ici(el.dataset.connexion);
      el.href = adresse ? el.dataset.compte : el.dataset.connexion + (retour ? `?next=${encodeURIComponent(retour)}` : '');
      el.setAttribute('aria-label', adresse ? `Your account, ${adresse}${chaine === CHAINE.hex ? '' : ', wrong network'}` : 'Log in with your wallet');
      const long = el.querySelector('.w-long');
      if (long) long.textContent = adresse ? court(adresse) : 'Log in';
      const ico = el.querySelector('.w-ico');
      if (ico) signe(ico);
    }
    // Toute page peut montrer qui est connecté : il suffit d'un élément qui porte data-w.
    for (const el of document.querySelectorAll('[data-w]')) {
      const quoi = el.dataset.w;
      if (quoi === 'ico') signe(el);
      else if (quoi === 'nom') el.textContent = actif ? actif.info.nom : 'Wallet';
      else if (quoi === 'court') el.textContent = adresse ? court(adresse) : '0x…';
      else if (quoi === 'adresse') el.textContent = adresse || '0x…';
      else if (quoi === 'reseau') {
        el.dataset.etat = etatReseau;
        el.lastElementChild.textContent = etatReseau === 'on' ? CHAINE.nom : etatReseau === 'faux' ? 'Wrong network' : 'Not logged in';
      }
    }
  }
  peindre();

  // Quand la recherche des wallets est finie : ceux qui se déclarent répondent dans la même tâche, un wallet déjà
  // autorisé revient juste après. Une page attend ce moment avant de dire « hors ligne ».
  const pret = souvenu() ? new Promise((ok) => setTimeout(() => Promise.allSettled(retours).then(ok), 500)) : Promise.resolve();

  // Relance la recherche (un wallet installé ou déverrouillé après l'ouverture de la page).
  function chercher() {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    if (!trouves.size && window.ethereum && typeof window.ethereum.request === 'function') annoncer({ info: { uuid: 'navigateur', name: 'Browser wallet', rdns: 'navigateur' }, provider: window.ethereum });
    dire('uh:wallets');
  }

  // Entrer : connecter le wallet puis passer tout de suite sur Robinhood Chain. Un seul geste côté site.
  async function entrer(id) {
    await connecter(id);
    if (chaine !== CHAINE.hex) await changerDeChaine();
    return etat();
  }

  // ---------- la fenêtre de connexion, sur n'importe quelle page
  // Elle s'ouvre depuis la pastille de l'en-tête et depuis tout bouton qui porte data-login. Un seul wallet dans le
  // navigateur : il s'ouvre directement. Connecté sur le bon réseau : la fenêtre se ferme toute seule.
  const { el, dire: mot } = window.UH;
  let fenetre = null;
  let occupe = '';
  let message = '';
  function racine() {
    const pastille = document.querySelector('[data-wallet]');
    return pastille ? pastille.dataset.connexion.replace(/connect\.html$/, '') : '';
  }
  async function choisir(id) {
    occupe = id;
    message = '';
    dessiner();
    try {
      await entrer(id);
    } catch (e) {
      message = direErreur(e);
    }
    occupe = '';
    dessiner();
  }
  function dessiner() {
    if (!fenetre || !fenetre.open) return;
    const corps = fenetre.querySelector('.entree-corps');
    const e = etat();
    if (e.bonneChaine) {
      fenetre.close();
      mot('Logged in');
      return;
    }
    let contenu;
    if (e.connecte) {
      // Connecté, mais le wallet est resté sur un autre réseau.
      const bouton = el('button', { class: 'btn', type: 'button' }, el('span', { class: 'btn-face', text: 'Switch to Robinhood Chain' }));
      bouton.addEventListener('click', async () => {
        bouton.disabled = true;
        message = '';
        try {
          await changerDeChaine();
        } catch (err) {
          message = direErreur(err);
        }
        dessiner();
      });
      contenu = [el('p', { text: 'Your wallet is on another network. Udenhood runs on Robinhood Chain.' }), bouton];
    } else if (!e.trouves.length) {
      const encore = el('button', { class: 'btn bleu', type: 'button' }, el('span', { class: 'btn-face', text: 'Look again' }));
      encore.addEventListener('click', () => {
        chercher();
        dessiner();
      });
      contenu = [
        el('ul', { class: 'pistes' }, el('li', {}, el('b', { text: 'On a computer' }), 'Add a wallet extension to this browser, then come back. Any Ethereum wallet works: Udenhood adds Robinhood Chain to it for you.'), el('li', {}, el('b', { text: 'On a phone' }), 'Open your wallet app and visit udenhood.fun from its built-in browser.')),
        encore,
      ];
    } else {
      contenu = [
        el(
          'ul',
          { class: 'wallets' },
          e.trouves.map((w) => {
            const attend = occupe === w.id;
            const b = el('button', { class: 'w-choix', type: 'button', disabled: !!occupe, data: { etat: attend ? 'wait' : 'off' } }, el('img', { src: w.icone || `${racine()}assets/icons/vault.png`, alt: '', width: 44, height: 44 }), el('span', { class: 'w-nom', text: w.nom }), el('span', { class: 'w-geste' }, attend ? el('i', { class: 'lampe', data: { etat: 'wait' } }) : null, attend ? 'Waiting' : 'Connect'));
            b.addEventListener('click', () => choisir(w.id));
            return el('li', { class: 'wallet' }, b);
          }),
        ),
      ];
    }
    corps.replaceChildren(...contenu, el('p', { class: 'note', role: 'status', text: message || (occupe ? 'Answer the request in your wallet.' : '') }));
  }
  function ouvrir() {
    const e = etat();
    if (e.bonneChaine) return;
    if (!fenetre) {
      const fermer = el('button', { class: 'mini', type: 'button', text: 'Close' });
      fenetre = el(
        'dialog',
        { class: 'pop entree', 'aria-labelledby': 'entree-t' },
        el('img', { src: `${racine()}assets/icons/vault.png`, alt: '', width: 256, height: 256 }),
        el('h2', { class: 'bd petit', id: 'entree-t', text: 'Log in' }),
        el('p', { text: 'Your wallet is your login. No email, no password.' }),
        el('div', { class: 'entree-corps' }),
        fermer,
      );
      fermer.addEventListener('click', () => fenetre.close());
      fenetre.addEventListener('click', (ev) => {
        if (ev.target === fenetre) fenetre.close();
      });
      document.body.append(fenetre);
    }
    message = '';
    fenetre.showModal();
    dessiner();
    // Un seul wallet : inutile de le faire choisir.
    if (!e.connecte && e.trouves.length === 1 && !occupe) choisir(e.trouves[0].id);
  }
  document.addEventListener('uh:wallet', dessiner);
  document.addEventListener('uh:wallets', dessiner);
  document.addEventListener('click', (ev) => {
    const cible = ev.target.closest && ev.target.closest('[data-wallet], [data-login]');
    if (!cible || etat().bonneChaine) return;
    // Hors ligne, ou sur un autre réseau : la fenêtre s'ouvre ici, sans changer de page.
    ev.preventDefault();
    ouvrir();
  });

  return { etat, pret, chercher, connecter, entrer, ouvrir, changerDeChaine, envoyer, deconnecter, direErreur };
})();
