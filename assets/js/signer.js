// Udenhood, « Sign your repo » : le fichier udenhood.json s'écrit sous les yeux, puis GitHub s'ouvre sur ce fichier
// prêt à valider. Rien n'est envoyé ni gardé par nous : le développeur valide lui-même le commit chez GitHub.
(() => {
  const { lire, github, CHAINE } = window.UH;
  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#signer');
  const apercu = $('#s-apercu');
  if (!apercu) return;

  const sRepo = $('#s-repo');
  const sWallet = $('#s-wallet');
  const sTicker = $('#s-ticker');
  const sNote = $('#s-note');
  const etatDepot = $('#s-depot');
  const connus = new Map(); // dépôt lu -> sa branche par défaut
  const valeur = (c) => (c ? c.value.trim() : '');
  const walletBon = () => /^0x[0-9a-fA-F]{40}$/.test(valeur(sWallet));
  const tickerBon = () => /^[A-Z0-9]{2,10}$/.test(valeur(sTicker));
  const fichierPreuve = () => JSON.stringify({ udenhood: 1, chain: CHAINE, wallet: valeur(sWallet), ticker: valeur(sTicker) }, null, 2) + '\n';

  function ecrireApercu() {
    const ligne = (cle, v, texte, dernier) => {
      const d = document.createDocumentFragment();
      d.append(`  "${cle}": `);
      const e = document.createElement(texte ? 'i' : 'b');
      e.textContent = texte ? `"${v}"` : String(v);
      d.append(e, dernier ? '\n' : ',\n');
      return d;
    };
    apercu.textContent = '';
    apercu.append('{\n', ligne('udenhood', 1), ligne('chain', CHAINE), ligne('wallet', valeur(sWallet) || '0x…', true), ligne('ticker', valeur(sTicker) || 'COIN', true, true), '}');
  }
  ecrireApercu();
  if (!form) return; // l'accueil ne montre que le fichier

  for (const c of [sWallet, sTicker]) {
    c.addEventListener('input', () => {
      if (c === sTicker) c.value = c.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      c.closest('.field').dataset.bad = 'false';
      ecrireApercu();
    });
  }

  // Étape 1 : le dépôt est lu dès qu'il est tapé en entier, pour dire tout de suite s'il existe.
  let attente = 0;
  async function lireDepot() {
    const d = lire(sRepo.value);
    if (!d) {
      etatDepot.textContent = sRepo.value.trim() ? 'Type it as owner/repo.' : 'Any public GitHub repo.';
      return null;
    }
    const nom = `${d.o}/${d.r}`;
    if (connus.has(nom.toLowerCase())) return nom;
    etatDepot.textContent = 'Asking GitHub…';
    try {
      const depot = await github(`/repos/${nom}`);
      connus.set(depot.full_name.toLowerCase(), depot.default_branch);
      etatDepot.textContent = '';
      etatDepot.append('Found. Default branch: ', Object.assign(document.createElement('b'), { textContent: depot.default_branch }), '. ', Object.assign(document.createElement('a'), { href: `index.html?repo=${encodeURIComponent(depot.full_name)}`, textContent: 'See its proof card' }));
      return depot.full_name;
    } catch (e) {
      etatDepot.textContent = e && e.genre === 'absent' ? 'No public repo at that address.' : e && e.genre === 'limite' ? 'GitHub limits requests from your network. Try again later.' : 'GitHub did not answer. Try again.';
      return null;
    }
  }
  sRepo.addEventListener('input', () => {
    sRepo.closest('.field').dataset.bad = 'false';
    clearTimeout(attente);
    attente = setTimeout(lireDepot, 600);
  });
  const depart = lire(new URL(location.href).searchParams.get('repo') || '');
  if (depart) {
    sRepo.value = `${depart.o}/${depart.r}`;
    lireDepot();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = lire(sRepo.value);
    const fautes = [
      [sRepo, !!d, 'Type your repo as owner/repo.'],
      [sWallet, walletBon(), 'A wallet is 0x followed by 40 characters.'],
      [sTicker, tickerBon(), 'A ticker is 2 to 10 letters or digits.'],
    ];
    const faute = fautes.find((f) => !f[1]);
    for (const [c, bon] of fautes) c.closest('.field').dataset.bad = bon ? 'false' : 'true';
    if (faute) {
      sNote.textContent = faute[2];
      faute[0].focus();
      return;
    }
    // L'onglet s'ouvre dans le geste du clic ; son adresse est posée dès que la branche est connue.
    const onglet = window.open('', '_blank');
    if (onglet) onglet.opener = null;
    const bouton = $('#s-go');
    bouton.disabled = true;
    sNote.textContent = 'Asking GitHub for your default branch…';
    try {
      const nom = `${d.o}/${d.r}`;
      let branche = connus.get(nom.toLowerCase());
      if (!branche) {
        const depot = await github(`/repos/${nom}`);
        branche = depot.default_branch;
        connus.set(depot.full_name.toLowerCase(), branche);
      }
      const url = `https://github.com/${nom}/new/${encodeURIComponent(branche)}?filename=udenhood.json&value=${encodeURIComponent(fichierPreuve())}`;
      if (onglet) onglet.location.replace(url);
      sNote.textContent = '';
      sNote.append(
        onglet ? 'GitHub is open in a new tab. Commit the file, then check your repo. ' : 'Your browser blocked the new tab. ',
        Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener', textContent: 'Open GitHub' }),
      );
    } catch (e) {
      if (onglet) onglet.close();
      sNote.textContent = e && e.genre === 'absent' ? 'No public repo at that address.' : e && e.genre === 'limite' ? 'GitHub limits requests from your network. Try again later.' : 'GitHub did not answer. Try again.';
    } finally {
      bouton.disabled = false;
    }
  });
})();
