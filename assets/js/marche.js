// Udenhood : acheter et vendre un coin sur sa courbe Pons v2, et lire ses échanges. Aucune dépendance.
// Signatures relevées sur le contrat déployé d'une vraie courbe et sur de vraies transactions (outils/essais/essai-marche.mjs) :
//   buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable, la valeur envoyée = quoteIn
//   sell(uint256 tokensIn, uint256 minQuoteOut, address recipient), après approve(courbe) sur le coin
//   CurveBuy(buyer, recipient, quoteIn, tokensOut, fee, tax) et CurveSell(seller, recipient, tokensIn, quoteOut, fee, tax)
// Le devis se calcule ici, avec la formule de la courbe (vérifiée au wei près contre la chaîne) ; avant d'ouvrir le
// wallet, l'échange est quand même rejoué sur l'état réel : s'il ne passe pas, rien n'est envoyé.
(typeof window !== 'undefined' ? window : globalThis).UHM = (() => {
  const C = (typeof window !== 'undefined' ? window : globalThis).UHC;
  const S = {
    buy: '0x59a87bc1', sell: '0xd04c6983', getReserves: '0x0902f1ac', realQuoteReserve: '0x4f1f58fd', feeBps: '0x24a9d853', creatorTaxBps: '0xc1bb8901',
    graduated: '0xe7c2b772', pairToken: '0x3de35b79', currentSnipeTaxBps: '0xd7e1ef39', launchedAt: '0xbf56b371',
    balanceOf: '0x70a08231', allowance: '0xdd62ed3e', approve: '0x095ea7b3', totalSupply: '0x18160ddd',
  };
  const TOPIC_ACHAT = '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455'; // CurveBuy
  const TOPIC_VENTE = '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df'; // CurveSell
  const MAX = (1n << 256n) - 1n;
  // Gaz mesuré sur la chaîne pour un achat, une vente et une autorisation : sert au « ≈ » des frais de réseau.
  const GAZ = { achat: 100000n, vente: 90000n, autoriser: 50000n };
  const adr = (mot) => '0x' + mot.slice(-40);

  // ---------- plusieurs lectures en une seule requête
  // Le nœud rapide d'abord ; s'il ne répond pas, le nœud officiel. Chaque appel rend sa valeur, ou null.
  async function lot(appels) {
    const corps = appels.map((a, i) => ({ jsonrpc: '2.0', id: i, method: a[0], params: a[1] }));
    for (const url of C.CHAINE.rpc) {
      try {
        const rep = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
        if (!rep.ok) continue;
        const j = await rep.json();
        if (!Array.isArray(j) || j.length !== appels.length) continue;
        const sortie = Array(appels.length).fill(null);
        for (const r of j) if (r && Number.isInteger(r.id) && r.result != null) sortie[r.id] = r.result;
        return sortie;
      } catch {}
    }
    throw { genre: 'reseau' };
  }
  const vue = (a, selecteur, types = [], valeurs = []) => ['eth_call', [{ to: a, data: C.appel(selecteur, types, valeurs) }, 'latest']];
  const nombre = (hex) => (typeof hex === 'string' && hex !== '0x' ? BigInt(hex) : null);

  // ---------- l'état d'une courbe, et ce que tient un wallet
  // Rend des BigInt ; une lecture manquée rend null (un tiret à l'écran, jamais un faux 0).
  async function etat(token, courbe, wallet) {
    const appels = [
      vue(courbe, S.getReserves), vue(courbe, S.realQuoteReserve), vue(courbe, S.feeBps), vue(courbe, S.creatorTaxBps), vue(courbe, S.graduated),
      vue(courbe, S.pairToken), vue(courbe, S.launchedAt), vue(token, S.totalSupply), ['eth_gasPrice', []],
    ];
    if (wallet) appels.push(['eth_getBalance', [wallet, 'latest']], vue(token, S.balanceOf, ['address'], [wallet]), vue(token, S.allowance, ['address', 'address'], [wallet, courbe]), vue(courbe, S.currentSnipeTaxBps, ['address'], [wallet]));
    const r = await lot(appels);
    if (typeof r[0] !== 'string' || r[0].length < 130 || !r[2] || !r[3]) throw { genre: 'reseau' };
    const [Q, T] = C.reponse(['uint256', 'uint256'], r[0]);
    return {
      Q, T, leve: nombre(r[1]), frais: nombre(r[2]), taxe: nombre(r[3]), gradue: r[4] ? nombre(r[4]) !== 0n : false,
      natif: r[5] ? nombre(r[5]) === 0n : true, lanceA: r[6] ? Number(nombre(r[6])) : 0, offre: nombre(r[7]), prixGaz: nombre(r[8]),
      eth: wallet ? nombre(r[9]) : null, jetons: wallet ? nombre(r[10]) : null, autorisation: wallet ? nombre(r[11]) : null, sniper: wallet ? nombre(r[12]) ?? 0n : 0n,
    };
  }

  // ---------- devis : la formule de la courbe, au wei près
  // Achat : les frais et la taxe sortent de la mise, le reste entre dans la réserve.
  function devisAchat(e, mise) {
    const frais = (mise * e.frais) / 10000n;
    const taxe = (mise * e.taxe) / 10000n;
    const net = mise - frais - taxe;
    if (net <= 0n) return { recu: 0n, frais, taxe, impact: 0 };
    const recu = (e.T * net) / (e.Q + net);
    return { recu, frais, taxe, impact: Number((net * 10000n) / (e.Q + net)) / 100 };
  }
  // Vente : la courbe rend sa part, puis les frais et la taxe en sortent.
  function devisVente(e, jetons) {
    if (jetons <= 0n) return { recu: 0n, frais: 0n, taxe: 0n, impact: 0 };
    const brut = (e.Q * jetons) / (e.T + jetons);
    const frais = (brut * e.frais) / 10000n;
    const taxe = (brut * e.taxe) / 10000n;
    return { recu: brut - frais - taxe, frais, taxe, impact: Number((jetons * 10000n) / (e.T + jetons)) / 100 };
  }
  // Le prix d'un jeton en ETH, et la valeur de toute l'offre à ce prix (en ETH).
  const prix = (Q, T) => (T > 0n ? Number(Q) / Number(T) : 0);
  const capitalisation = (Q, T, offre) => prix(Q, T) * (Number(offre || 10n ** 27n) / 1e18);
  const minimum = (attendu, tolerancePb) => (attendu * BigInt(10000 - tolerancePb)) / 10000n;

  // ---------- transactions
  const txAchat = (courbe, mise, min, wallet) => ({ to: courbe, data: C.appel(S.buy, ['uint256', 'uint256', 'address'], [mise, min, wallet]), value: mise });
  const txVente = (courbe, jetons, min, wallet) => ({ to: courbe, data: C.appel(S.sell, ['uint256', 'uint256', 'address'], [jetons, min, wallet]), value: 0n });
  // L'autorisation : le coin laisse sa courbe prendre les jetons qu'on lui vend. Donnée une fois par coin.
  const txAutoriser = (token, courbe) => ({ to: token, data: C.appel(S.approve, ['address', 'uint256'], [courbe, MAX]), value: 0n });
  const versNoeud = (tx, de) => ({ from: de, to: tx.to, data: tx.data, value: '0x' + tx.value.toString(16) });
  // Rejoue l'échange sur l'état réel, sans rien envoyer : rend ce que la chaîne donnerait.
  const simuler = async (tx, de) => BigInt(await C.rpc('eth_call', [versNoeud(tx, de), 'latest']));
  const gaz = async (tx, de) => BigInt(await C.rpc('eth_estimateGas', [versNoeud(tx, de)]));

  // Les refus de la courbe, relevés sur la chaîne ou calculés. Un refus inconnu est rendu tel quel.
  const REFUS = {
    '0xfb8f41b2': 'The coin has not allowed its curve to take your tokens yet.', // ERC20InsufficientAllowance, relevé
    '0xe450d38c': 'You hold fewer tokens than that.', // ERC20InsufficientBalance
    '0x1f2a2005': 'That amount is too small to trade.', // relevé sur une vente d'un wei
    '0x8199f5f3': 'The price moved past your tolerance. Try again.', // SlippageExceeded
  };
  function direRefus(e) {
    if (e && e.genre === 'refus') {
      if (/insufficient funds|insufficient balance/i.test(e.message)) return 'Not enough ETH in this wallet.';
      const cle = (e.donnees || '').slice(0, 10).toLowerCase();
      if (REFUS[cle]) return REFUS[cle];
      return `The curve refused the trade (${cle && cle !== '0x' ? cle : e.message.slice(0, 80) || 'no reason given'}).`;
    }
    return C.direRefus(e);
  }

  // ---------- les échanges d'une courbe
  // Un journal d'achat ou de vente, mis à plat. net : ce qui entre dans la réserve (achat) ou en sort (vente).
  // L'heure vient après, du bloc : le nœud laisse à zéro le champ d'heure de ses journaux (relevé le 23/11/2026).
  function lireJournal(l) {
    const achat = l.topics[0] === TOPIC_ACHAT;
    if (!achat && l.topics[0] !== TOPIC_VENTE) return null;
    const d = l.data.slice(2);
    const m = (i) => BigInt('0x' + d.slice(i * 64, i * 64 + 64));
    const frais = m(2);
    const taxe = m(3);
    return achat
      ? { achat: true, eth: m(0), jetons: m(1), net: m(0) - frais - taxe, qui: adr(l.topics[2]), bloc: Number(BigInt(l.blockNumber)), heure: 0, tx: l.transactionHash, rang: Number(BigInt(l.logIndex || '0x0')) }
      : { achat: false, eth: m(1), jetons: m(0), net: m(1) + frais + taxe, qui: adr(l.topics[1]), bloc: Number(BigInt(l.blockNumber)), heure: 0, tx: l.transactionHash, rang: Number(BigInt(l.logIndex || '0x0')) };
  }
  // L'échange qu'un reçu contient, pour dire ce qui vient d'être acheté ou vendu.
  function echangeDuRecu(recu, courbe) {
    for (const l of (recu && recu.logs) || []) {
      if (!C.egal(l.address, courbe)) continue;
      const e = lireJournal(l);
      if (e) return e;
    }
    return null;
  }

  // L'heure des échanges : celle de leur bloc, lue par requêtes groupées. Jusqu'à 300 blocs, chacun est lu ; au-delà,
  // 240 blocs repères le sont et les autres sont placés entre deux repères, au prorata de leur numéro.
  async function dater(liste) {
    const sans = [...new Set(liste.filter((e) => !e.heure).map((e) => e.bloc))].sort((a, b) => a - b);
    if (!sans.length) return;
    const reperes = sans.length <= 300 ? sans : [...new Set(Array.from({ length: 240 }, (_, i) => sans[Math.round((i * (sans.length - 1)) / 239)]))];
    const heures = new Map();
    for (let i = 0; i < reperes.length; i += 100) {
      const part = reperes.slice(i, i + 100);
      const r = await lot(part.map((b) => ['eth_getBlockByNumber', ['0x' + b.toString(16), false]]));
      part.forEach((b, k) => {
        if (r[k] && r[k].timestamp) heures.set(b, Number(BigInt(r[k].timestamp)));
      });
    }
    const connusTries = [...heures.keys()].sort((a, b) => a - b);
    if (!connusTries.length) throw { genre: 'reseau' };
    const heureDe = (bloc) => {
      if (heures.has(bloc)) return heures.get(bloc);
      // Entre deux repères : au prorata. Avant le premier ou après le dernier : l'heure du repère voisin.
      let bas = connusTries[0];
      let haut = connusTries[connusTries.length - 1];
      for (const b of connusTries) {
        if (b <= bloc) bas = b;
        if (b >= bloc) {
          haut = b;
          break;
        }
      }
      if (haut === bas || bloc <= bas) return heures.get(bas);
      if (bloc >= haut) return heures.get(haut);
      return Math.round(heures.get(bas) + ((bloc - bas) * (heures.get(haut) - heures.get(bas))) / (haut - bas));
    };
    for (const e of liste) if (!e.heure) e.heure = heureDe(e.bloc);
  }

  const MEMOIRE = 2500; // échanges gardés par courbe dans ce navigateur
  const TRANCHE = 10000000; // le nœud rend au plus 10 millions de blocs pour un filtre par adresse
  const cle = (courbe) => `uh-echanges-${courbe.toLowerCase()}`;
  const ranger = (e) => [e.achat ? 1 : 0, e.eth.toString(), e.jetons.toString(), e.net.toString(), e.qui, e.bloc, e.heure, e.tx, e.rang];
  const sortir = (a) => ({ achat: a[0] === 1, eth: BigInt(a[1]), jetons: BigInt(a[2]), net: BigInt(a[3]), qui: a[4], bloc: a[5], heure: a[6], tx: a[7], rang: a[8] });
  function connus(courbe) {
    try {
      const lu = JSON.parse(sessionStorage.getItem(cle(courbe)) || 'null');
      if (lu && Number.isInteger(lu.jusqua) && Array.isArray(lu.liste)) return { jusqua: lu.jusqua, complet: !!lu.complet, liste: lu.liste.map(sortir) };
    } catch {}
    return null;
  }
  // Les échanges d'une courbe, du plus ancien au plus récent. La première lecture remonte depuis la tête de la chaîne
  // jusqu'au lancement du coin (lanceA, en secondes) ; les suivantes ne lisent que les blocs nouveaux.
  // Rend { liste, complet, tete } : complet dit que l'histoire remonte jusqu'au lancement, tete est le bloc où la
  // lecture s'arrête.
  async function echanges(courbe, lanceA) {
    const tete = Number(BigInt(await C.rpc('eth_blockNumber', [], { journaux: true })));
    const lire = async (bas, haut) => {
      const logs = await C.rpc('eth_getLogs', [{ address: courbe, fromBlock: '0x' + bas.toString(16), toBlock: '0x' + haut.toString(16) }], { journaux: true });
      return logs.map(lireJournal).filter(Boolean);
    };
    const memoire = connus(courbe);
    let liste;
    let complet;
    if (memoire && memoire.jusqua <= tete && tete - memoire.jusqua < TRANCHE) {
      liste = memoire.liste.concat(memoire.jusqua < tete ? await lire(memoire.jusqua + 1, tete) : []);
      complet = memoire.complet;
    } else {
      // Jusqu'où remonter : l'âge du coin, à 11 blocs par seconde au plus (la chaîne en fait 9 à 10), 6 tranches au plus.
      const age = lanceA ? Math.max(0, Date.now() / 1000 - lanceA) : 0;
      const plancher = lanceA ? Math.max(0, tete - Math.ceil(age * 11) - 20000) : Math.max(0, tete - TRANCHE + 1);
      liste = [];
      complet = true;
      let tranches = 0;
      for (let haut = tete; haut >= plancher; haut -= TRANCHE) {
        if (tranches++ >= 6 || liste.length >= MEMOIRE) {
          complet = false;
          break;
        }
        liste = (await lire(Math.max(plancher, haut - TRANCHE + 1), haut)).concat(liste);
      }
    }
    liste.sort((a, b) => a.bloc - b.bloc || a.rang - b.rang);
    if (liste.length > MEMOIRE) {
      liste = liste.slice(-MEMOIRE);
      complet = false;
    }
    await dater(liste);
    try {
      sessionStorage.setItem(cle(courbe), JSON.stringify({ jusqua: tete, complet, liste: liste.map(ranger) }));
    } catch {}
    return { liste, complet, tete };
  }

  // Les réserves de la courbe à un bloc donné : celui où s'arrête la liste des échanges. Le prix reconstruit est
  // alors exact, même si un échange tombe pendant la lecture.
  async function reservesA(courbe, bloc) {
    return C.reponse(['uint256', 'uint256'], await C.rpc('eth_call', [{ to: courbe, data: S.getReserves }, '0x' + bloc.toString(16)], { journaux: true }));
  }

  // Le prix après chaque échange. On part des réserves d'aujourd'hui et on remonte : avant un achat la réserve avait
  // « net » d'ETH en moins et les jetons vendus en plus ; avant une vente, l'inverse. Rend, du plus ancien au plus
  // récent, { heure, avant, apres, eth, achat } avec les prix en ETH par jeton.
  function cours(liste, Q, T) {
    const points = Array(liste.length);
    let q = Q;
    let t = T;
    for (let i = liste.length - 1; i >= 0; i--) {
      const e = liste[i];
      const apres = prix(q, t);
      if (e.achat) {
        q -= e.net;
        t += e.jetons;
      } else {
        q += e.net;
        t -= e.jetons;
      }
      if (q <= 0n || t <= 0n) {
        // Une histoire incomplète ne peut pas remonter plus loin : on s'arrête là.
        return points.slice(i + 1);
      }
      points[i] = { heure: e.heure, avant: prix(q, t), apres, eth: Number(e.eth) / 1e18, achat: e.achat };
    }
    return points;
  }
  // Les bougies d'un pas donné (en secondes). Un pas sans échange garde le dernier prix : le temps reste continu.
  function bougies(points, pas, maintenant = Math.floor(Date.now() / 1000), maximum = 1500) {
    if (!points.length) return [];
    const sortie = [];
    let courante = null;
    for (const p of points) {
      const debut = Math.floor(p.heure / pas) * pas;
      if (courante && debut > courante.t) {
        sortie.push(courante);
        for (let t = courante.t + pas; t < debut && sortie.length < 20000; t += pas) sortie.push({ t, o: courante.c, h: courante.c, l: courante.c, c: courante.c, v: 0, n: 0 });
        courante = null;
      }
      if (!courante) courante = { t: debut, o: p.avant, h: Math.max(p.avant, p.apres), l: Math.min(p.avant, p.apres), c: p.apres, v: 0, n: 0 };
      courante.h = Math.max(courante.h, p.apres);
      courante.l = Math.min(courante.l, p.apres);
      courante.c = p.apres;
      courante.v += p.eth;
      courante.n += 1;
    }
    sortie.push(courante);
    const fin = Math.floor(maintenant / pas) * pas;
    for (let t = courante.t + pas; t <= fin && sortie.length < 20000; t += pas) sortie.push({ t, o: courante.c, h: courante.c, l: courante.c, c: courante.c, v: 0, n: 0 });
    return sortie.slice(-maximum);
  }

  // ---------- nombres à l'écran
  // Un très petit nombre : les zéros après la virgule sont comptés en indice (0.0₈1739), le reste garde 4 chiffres.
  const INDICES = '₀₁₂₃₄₅₆₇₈₉';
  function petit(x, chiffres = 4) {
    if (!Number.isFinite(x)) return '—';
    if (x === 0) return '0';
    const signe = x < 0 ? '−' : '';
    const v = Math.abs(x);
    if (v >= 1000) return signe + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (v >= 1) return signe + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (v >= 0.0001) return signe + v.toPrecision(chiffres).replace(/0+$/, '').replace(/\.$/, '');
    const e = Math.floor(Math.log10(v));
    const zeros = -e - 1;
    const mantisse = Math.round(v * 10 ** (-e + chiffres - 1)).toString().replace(/0+$/, '');
    return `${signe}0.0${String(zeros).split('').map((c) => INDICES[c]).join('')}${mantisse}`;
  }
  // Un grand nombre de jetons, court : 5.49M, 12.3K.
  function court(n) {
    const v = Number(n) / 1e18;
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v >= 1 ? v.toFixed(0) : petit(v);
  }
  // Un montant en ETH lisible quelle que soit sa taille.
  const eth = (wei) => petit(Number(wei) / 1e18);
  // « 1,234.5 » tapé à la main devient des jetons (18 décimales). Rend null si ce n'est pas un nombre.
  function jetonsDe(texte) {
    const t = String(texte).trim().replace(/,/g, '');
    if (!/^\d{0,12}(\.\d{0,18})?$/.test(t) || t === '' || t === '.') return null;
    const [e, f = ''] = t.split('.');
    return BigInt(e || '0') * 10n ** 18n + BigInt(f.padEnd(18, '0'));
  }

  return { S, TOPIC_ACHAT, TOPIC_VENTE, GAZ, MAX, lot, etat, devisAchat, devisVente, prix, capitalisation, minimum, txAchat, txVente, txAutoriser, simuler, gaz, direRefus, lireJournal, echangeDuRecu, echanges, reservesA, cours, bougies, petit, court, eth, jetonsDe };
})();
