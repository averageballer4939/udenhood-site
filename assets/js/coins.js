// Udenhood, « Coins » : la liste se lit en direct, personne ne la tient à la main.
// 1. GitHub : les dépôts publics qui portent le sujet « udenhood ».  2. Chaque dépôt : son fichier udenhood.json, qui
// nomme un coin.  3. La chaîne : le coin existe chez Pons, et c'est le wallet du fichier qui l'a lancé.
// Un dépôt sans fichier, sans coin, ou dont le coin ne correspond pas n'entre pas dans la liste.
(() => {
  const { el, github, jours, pl, heure, poserImage } = window.UH;
  const C = window.UHC;
  const P = window.UHP;
  const $ = (s, r = document) => r.querySelector(s);
  const table = $('#c-table');
  if (!table) return;
  const lignes = $('#c-lignes');
  const attente = $('#c-attente');
  const vide = $('#c-vide');
  const VIDE = vide.textContent;

  function ligne({ depot, k, preuve, pousse }) {
    const cadre = el('span', { class: 'coin-img petit' }, el('img', { alt: '', width: 46, height: 46 }));
    poserImage(cadre.firstChild, C.images(k.logo), cadre);
    const part = k.graduation > 0n ? Number((k.leve * 1000n) / k.graduation) / 10 : 0;
    const jauge = el('i');
    requestAnimationFrame(() => {
      jauge.style.width = `${k.gradue ? 100 : Math.min(100, part)}%`;
    });
    const page = `coin.html?t=${k.token}`;
    const frais = pousse <= P.SEUILS.pushRecentJours;
    return el(
      'tr',
      { class: 'ligne' },
      el('td', {}, el('a', { class: 'l-coin', href: page }, cadre, el('span', {}, el('b', { text: k.nom }), el('small', { text: `$${k.ticker}` })))),
      el('td', {}, el('a', { class: 'l-depot', href: `index.html?repo=${encodeURIComponent(depot.full_name)}`, text: depot.full_name })),
      el('td', {}, el('span', { class: 'l-etat', data: { etat: preuve.etat } }, el('i', { class: 'lampe' }), preuve.etat === 'on' ? 'Signed' : 'No match')),
      el('td', {}, el('span', { class: 'l-etat', data: { etat: frais ? 'on' : 'off' } }, el('i', { class: 'lampe' }), pousse === 0 ? 'Today' : `${pl(pousse, 'day')} ago`)),
      el('td', {}, el('span', { class: 'l-courbe' }, k.gradue ? 'Graduated' : `${C.ether(k.leve, 3)} of ${C.ether(k.graduation, 2)} ETH`, el('span', { class: 'jauge' }, jauge))),
      el('td', {}, el('a', { class: 'mini', href: page, text: 'Open' })),
    );
  }

  async function lire() {
    table.dataset.etat = 'charge';
    attente.textContent = 'Reading the list from GitHub and the chain…';
    let depots;
    try {
      depots = (await github('/search/repositories?q=topic:udenhood+fork:false&sort=updated&order=desc&per_page=30')).items || [];
    } catch (e) {
      vide.textContent = e && e.genre === 'limite' ? `GitHub limits requests from your network. Try again at ${heure(e.retour)}.` : 'GitHub did not answer. Reload to try again.';
      table.dataset.etat = 'vide';
      return;
    }
    const trouves = [];
    // Un dépôt à la fois : le nœud public demande de ne pas le presser.
    for (const depot of depots) {
      if (depot.archived) continue;
      const f = await P.fichier(depot.full_name, depot.default_branch).catch(() => null);
      if (!f || !f.wallet || !f.coin) continue;
      const k = await C.coin(f.coin).catch(() => null);
      if (!k) continue;
      trouves.push({ depot, k, preuve: P.owner(depot, f, k), pousse: jours(depot.pushed_at) });
      attente.textContent = `Reading the list from GitHub and the chain… ${pl(trouves.length, 'coin')} so far.`;
    }
    if (!trouves.length) {
      vide.textContent = VIDE;
      table.dataset.etat = 'vide';
      return;
    }
    // Les coins signés d'abord, puis le dernier push le plus récent.
    trouves.sort((a, b) => (b.preuve.etat === 'on') - (a.preuve.etat === 'on') || a.pousse - b.pousse);
    lignes.replaceChildren(...trouves.map(ligne));
    table.dataset.etat = 'ok';
  }
  lire();
})();
