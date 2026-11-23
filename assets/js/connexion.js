// Udenhood, « Log in » : choisir un wallet, passer sur Robinhood Chain, revenir d'où l'on venait.
// Le wallet est le login : aucune signature n'est demandée ici, seule l'adresse publique est lue.
(() => {
  const { el, dire } = window.UH;
  const W = window.UHW;
  const $ = (s, r = document) => r.querySelector(s);
  const guichet = $('#c-guichet');
  if (!guichet) return;

  const liste = $('#c-wallets');
  const note = $('#c-note');
  const rail = Object.fromEntries([...document.querySelectorAll('#c-rail li')].map((li) => [li.dataset.k, li]));
  const suite = $('#c-suite');

  // Où aller ensuite : une page de ce site, jamais une adresse venue d'ailleurs.
  const voulu = new URL(location.href).searchParams.get('next') || '';
  const retour = /^(docs\/)?[a-z0-9-]+\.html(\?[^#\\]*)?$/.test(voulu) ? voulu : 'account.html';
  suite.href = retour;
  let enCours = ''; // le wallet dont on attend la réponse
  let cherche = true;
  let vientDeSeConnecter = false;
  let parti = false;

  function dessinerWallets(trouves) {
    liste.replaceChildren(
      ...trouves.map((w) => {
        const attend = enCours === w.id;
        const bouton = el(
          'button',
          { class: 'w-choix', type: 'button', disabled: !!enCours, data: { etat: attend ? 'wait' : 'off' } },
          el('img', { src: w.icone || 'assets/icons/vault.png', alt: '', width: 44, height: 44 }),
          el('span', { class: 'w-nom', text: w.nom }),
          el('span', { class: 'w-geste' }, attend ? el('i', { class: 'lampe', data: { etat: 'wait' } }) : null, attend ? 'Waiting' : 'Connect'),
        );
        bouton.addEventListener('click', () => connecter(w.id));
        return el('li', { class: 'wallet' }, bouton);
      }),
    );
  }

  async function connecter(id) {
    enCours = id;
    note.textContent = 'Answer the request in your wallet.';
    peindre();
    try {
      vientDeSeConnecter = true;
      await W.entrer(id); // connecte, puis passe tout de suite sur Robinhood Chain
      note.textContent = '';
    } catch (e) {
      note.textContent = W.direErreur(e);
    } finally {
      enCours = '';
      peindre();
    }
  }

  function peindre() {
    const e = W.etat();
    const vue = e.connecte ? (e.bonneChaine ? 'dedans' : 'reseau') : cherche ? 'cherche' : e.trouves.length ? 'choix' : 'aucun';
    if (guichet.dataset.vue !== vue) guichet.dataset.vue = vue;
    if (vue === 'choix') dessinerWallets(e.trouves);
    rail.wallet.dataset.etat = e.connecte ? 'on' : 'wait';
    rail.reseau.dataset.etat = e.bonneChaine ? 'on' : e.connecte ? 'wait' : 'off';
    rail.dedans.dataset.etat = e.bonneChaine ? 'on' : 'off';
    // Arrivé au bout dans cette visite : on repart tout seul vers la page d'où l'on venait.
    if (vue === 'dedans' && vientDeSeConnecter && !parti && retour !== 'account.html') {
      parti = true; // un seul départ, même si le wallet annonce deux fois son réseau
      note.textContent = 'Taking you back…';
      setTimeout(() => location.assign(retour), 900);
    }
  }

  $('#c-reseau').addEventListener('click', async (ev) => {
    const bouton = ev.currentTarget;
    bouton.disabled = true;
    note.textContent = 'Confirm the network in your wallet…';
    try {
      const bon = await W.changerDeChaine();
      note.textContent = bon ? '' : 'Your wallet stayed on the other network.';
    } catch (e) {
      note.textContent = W.direErreur(e);
    } finally {
      bouton.disabled = false;
      peindre();
    }
  });
  for (const b of document.querySelectorAll('[data-sortir]')) {
    b.addEventListener('click', () => {
      W.deconnecter();
      note.textContent = '';
      dire('Logged out');
    });
  }
  $('#c-encore').addEventListener('click', () => {
    cherche = true;
    peindre();
    W.chercher();
    setTimeout(() => {
      cherche = false;
      peindre();
    }, 500);
  });

  document.addEventListener('uh:wallet', peindre);
  document.addEventListener('uh:wallets', peindre);
  // La recherche dure une demi-seconde : le temps qu'un wallet ancien, qui ne se déclare pas, soit vu.
  Promise.all([W.pret, new Promise((ok) => setTimeout(ok, 520))]).then(() => {
    cherche = false;
    peindre();
  });
  peindre();
})();
