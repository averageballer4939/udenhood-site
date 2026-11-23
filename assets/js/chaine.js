// Udenhood : tout ce qui parle à Robinhood Chain et aux contrats de Pons. Aucune dépendance.
// Les lectures passent par les nœuds publics de la chaîne, depuis le navigateur du visiteur. Rien ne passe par nous.
// Adresses, signatures et sélecteurs : relevés sur les contrats déployés (Pons v2, docs.ponsfamily.com/v2).
// Un lancement n'est jamais envoyé sans avoir été simulé juste avant sur l'état réel de la chaîne.
(typeof window !== 'undefined' ? window : globalThis).UHC = (() => {
  const CHAINE = {
    id: 4663,
    hex: '0x1237',
    nom: 'Robinhood Chain',
    monnaie: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    // Le premier nœud répond le plus vite ; le second est le seul à rendre les journaux d'événements.
    rpc: ['https://robinhood-rpc.publicnode.com', 'https://rpc.mainnet.chain.robinhood.com'],
    rpcJournaux: 'https://rpc.mainnet.chain.robinhood.com',
    explorateur: 'https://robinhoodchain.blockscout.com',
  };
  const PONS = {
    factory: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
    launchAndBuy: '0xe33e9e479df8802cb0866d5d05258bec4cf62948',
    page: (token) => `https://www.ponsfamily.com/launchpad/${token}`,
    config: 0n, // la seule configuration de lancement active
    journauxParAppel: 10000000, // le nœud refuse une recherche de plus de 10 millions de blocs
    depuis: 37000000, // premier lancement relevé de la factory v2 : bloc 37 648 338, le 16/08/2026
  };
  const ZERO = '0x0000000000000000000000000000000000000000';
  const S = {
    launchAndBuy: '0xf85f8e41', launchToken: '0xa72101af', launchFee: '0xcf3cf573', launchEnabled: '0x236a4afb', canLaunch: '0x58373f04',
    previewLaunchEconomics: '0xf718b78c', getLaunchConfig: '0x1cad862d', maxCreatorTaxBps: '0xf325a5fb', getLaunchedToken: '0x3cf28b5a',
    name: '0x06fdde03', symbol: '0x95d89b41', logo: '0xfb7f21eb', description: '0x7284e416', deployer: '0xd5f39488', socials: '0x53cd512a',
    getReserves: '0x0902f1ac', realQuoteReserve: '0x4f1f58fd', graduated: '0xe7c2b772',
  };
  const TOPIC_LANCE = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'; // TokenLaunched

  // ---------- types des contrats
  const RESEAUX = { tuple: ['string', 'string', 'string', 'string', 'string'] };
  const PARAMS = { tuple: ['string', 'string', 'string', 'string', RESEAUX, 'address', 'uint16', 'bool', 'bytes32', 'bytes32'] };
  const CONFIG = { tuple: ['uint256', 'uint256', 'uint256', 'uint256', 'uint24', 'int24', 'bool'] };
  const FICHE = { tuple: ['address', 'address', 'address', 'address', 'address', 'uint256', 'uint24', 'int24', 'uint16', 'bool', 'uint8', 'uint256', 'uint256', 'uint256', 'bool'] };

  // ---------- codage ABI, juste ce qu'il faut : entiers, adresses, booléens, bytes32, textes, tuples, tableaux
  const mot = (n) => {
    const v = BigInt(n);
    if (v < 0n || v >= 1n << 256n) throw new Error('nombre hors des 256 bits');
    return v.toString(16).padStart(64, '0');
  };
  const dyn = (t) => t === 'string' || (typeof t === 'object' && (t.array !== undefined || t.tuple.some(dyn)));
  const mots = (t) => (typeof t === 'object' && t.tuple ? t.tuple.reduce((n, x) => n + (dyn(x) ? 1 : mots(x)), 0) : 1);
  function coderListe(types, valeurs) {
    if (types.length !== valeurs.length) throw new Error('nombre de valeurs inattendu');
    const tete = types.reduce((n, t) => n + (dyn(t) ? 32 : mots(t) * 32), 0);
    let debut = '';
    let suite = '';
    types.forEach((t, i) => {
      if (dyn(t)) {
        debut += mot(tete + suite.length / 2);
        suite += coder(t, valeurs[i]);
      } else debut += coder(t, valeurs[i]);
    });
    return debut + suite;
  }
  function coder(t, v) {
    if (t === 'string') {
      const o = new TextEncoder().encode(String(v));
      const h = Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
      return mot(o.length) + h.padEnd(Math.ceil(h.length / 64) * 64, '0');
    }
    if (typeof t === 'object' && t.array !== undefined) return mot(v.length) + coderListe(v.map(() => t.array), v);
    if (typeof t === 'object') return coderListe(t.tuple, v);
    if (t === 'address') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error('adresse mal formée');
      return v.slice(2).toLowerCase().padStart(64, '0');
    }
    if (t === 'bool') return mot(v ? 1 : 0);
    if (t === 'bytes32') {
      if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error('bytes32 mal formé');
      return v.slice(2).toLowerCase();
    }
    return mot(v);
  }
  function decoderListe(types, d, base = 0) {
    const sortie = [];
    let p = base;
    for (const t of types) {
      if (dyn(t)) {
        sortie.push(decoder(t, d, base + Number(BigInt('0x' + lireMot(d, p)))));
        p += 32;
      } else {
        sortie.push(decoder(t, d, p));
        p += mots(t) * 32;
      }
    }
    return sortie;
  }
  function lireMot(d, p) {
    const m = d.substr(p * 2, 64);
    if (m.length !== 64) throw new Error('réponse du contrat trop courte');
    return m;
  }
  function decoder(t, d, p) {
    if (t === 'string') {
      const n = Number(BigInt('0x' + lireMot(d, p)));
      const h = d.substr((p + 32) * 2, n * 2);
      if (h.length !== n * 2) throw new Error('texte du contrat tronqué');
      return new TextDecoder().decode(Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)));
    }
    if (typeof t === 'object' && t.array !== undefined) return decoderListe(Array(Number(BigInt('0x' + lireMot(d, p)))).fill(t.array), d, p + 32);
    if (typeof t === 'object') return decoderListe(t.tuple, d, p);
    const m = lireMot(d, p);
    if (t === 'address') return '0x' + m.slice(24);
    if (t === 'bool') return BigInt('0x' + m) !== 0n;
    if (t === 'bytes32') return '0x' + m;
    const v = BigInt('0x' + m);
    return t.startsWith('int') && v >= 1n << 255n ? v - (1n << 256n) : v;
  }
  const appel = (selecteur, types = [], valeurs = []) => selecteur + coderListe(types, valeurs);
  const reponse = (types, hex) => decoderListe(types, String(hex).replace(/^0x/, ''));

  // ---------- montants
  function ether(wei, chiffres = 4) {
    const v = BigInt(wei);
    const entier = v / 10n ** 18n;
    const reste = (v % 10n ** 18n).toString().padStart(18, '0').slice(0, chiffres).replace(/0+$/, '');
    return reste ? `${entier}.${reste}` : `${entier}`;
  }
  // « 0.05 » devient des wei. Rend null si le texte n'est pas un montant.
  function wei(texte) {
    const t = String(texte).trim().replace(',', '.');
    if (!/^\d{0,9}(\.\d{0,18})?$/.test(t) || t === '' || t === '.') return null;
    const [e, f = ''] = t.split('.');
    return BigInt(e || '0') * 10n ** 18n + BigInt(f.padEnd(18, '0'));
  }
  const egal = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const court = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  // ---------- nœuds
  // Une erreur rendue par le contrat (un refus) est une réponse : on ne la rejoue pas sur l'autre nœud.
  let numero = 0;
  async function rpc(methode, params = [], { journaux = false } = {}) {
    let derniere = { genre: 'reseau' };
    let essais = 0;
    const urls = journaux ? [CHAINE.rpcJournaux] : [...CHAINE.rpc];
    while (urls.length) {
      const url = urls.shift();
      let rep;
      try {
        rep = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++numero, method: methode, params }) });
      } catch {
        derniere = { genre: 'reseau' };
        // Quand le nœud officiel demande de ralentir, le navigateur ne voit qu'une requête perdue (sa réponse 429
        // n'a pas d'en-tête lisible depuis une page). S'il est le seul à pouvoir répondre, on attend et on redemande.
        if (journaux && essais < 3) {
          essais++;
          await new Promise((ok) => setTimeout(ok, 1400 * essais));
          urls.unshift(url);
        }
        continue;
      }
      if (rep.status === 429 && essais < 2) {
        // Le nœud demande de ralentir : on attend, puis on redemande au même.
        essais++;
        await new Promise((ok) => setTimeout(ok, 1500 * essais));
        urls.unshift(url);
        continue;
      }
      if (!rep.ok) {
        derniere = { genre: 'http', code: rep.status };
        continue;
      }
      let j;
      try {
        j = await rep.json();
      } catch {
        derniere = { genre: 'reseau' };
        continue;
      }
      if (j.error) throw { genre: 'refus', code: j.error.code, message: String(j.error.message || ''), donnees: typeof j.error.data === 'string' ? j.error.data : '' };
      return j.result;
    }
    throw derniere;
  }
  const lire = async (a, selecteur, types, valeurs, sortie) => reponse(sortie, await rpc('eth_call', [{ to: a, data: appel(selecteur, types, valeurs) }, 'latest']));

  // Les refus que Pons documente, par leurs 4 premiers octets. Un refus inconnu est rendu tel quel.
  const REFUS = {
    '0x7e6d78a5': 'The launch fee changed a moment ago. Try again.', // LaunchFeeNotPaid, relevé
    '0x9ad465dc': 'The creator tax is above the cap set by Pons.', // CreatorTaxTooHigh, relevé
    '0xbc760cfe': 'The amount sent does not match the first buy.', // valeur envoyée fausse, relevé
    '0x374852ca': 'A coin needs a name and a ticker.', // nom ou ticker vide, relevé
    '0x85b8e2f4': 'One of the texts is too long for Pons.', // texte trop long, relevé
    '0x584a7938': 'Pons only accepts approved wallets right now.', // NotWhitelisted, calculé
    '0x8199f5f3': 'The price moved. Try again.', // SlippageExceeded, calculé
    '0x3cba147e': 'Pons changed its launch terms a moment ago. Try again.', // LaunchEconomicsMismatch, calculé
    '0xecb27319': 'Pons changed its launch terms a moment ago. Try again.',
    '0x6cd08908': 'Pons has paused launches.', // LaunchDisabled, calculé
  };
  function direRefus(e) {
    if (!e || e.genre !== 'refus') return e && e.genre === 'http' ? 'The chain node did not answer. Try again.' : 'The network did not answer. Try again.';
    if (/insufficient funds|insufficient balance/i.test(e.message)) return 'Not enough ETH in this wallet.';
    const cle = (e.donnees || '').slice(0, 10).toLowerCase();
    return REFUS[cle] || `The contract refused the launch (${cle && cle !== '0x' ? cle : e.message.slice(0, 80) || 'no reason given'}).`;
  }

  // ---------- Pons : lire
  async function etatPons(wallet) {
    const F = PONS.factory;
    const [ouvert, frais, taxeMax, config, pin, peut] = await Promise.all([
      lire(F, S.launchEnabled, [], [], ['bool']),
      lire(F, S.launchFee, [], [], ['uint256']),
      lire(F, S.maxCreatorTaxBps, [], [], ['uint256']),
      lire(F, S.getLaunchConfig, ['uint256'], [PONS.config], [CONFIG]),
      lire(F, S.previewLaunchEconomics, ['uint256', 'address'], [PONS.config, ZERO], ['bytes32']),
      wallet ? lire(F, S.canLaunch, ['address'], [wallet], ['bool']) : Promise.resolve([null]),
    ]);
    const [supply, fraisCourbe, fantome, graduation, , , active] = config[0];
    return { ouvert: ouvert[0] && active, frais: frais[0], taxeMax: Number(taxeMax[0]), pin: pin[0], peutLancer: peut[0], supply, fraisCourbe: Number(fraisCourbe), fantome, graduation };
  }
  const solde = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));

  // Un sel neuf à chaque lancement : il entre dans l'adresse du coin.
  function sel() {
    const o = new Uint8Array(32);
    crypto.getRandomValues(o);
    return '0x' + Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Pons : lancer
  // c : { nom, ticker, logo, description, reseaux: { twitter, telegram, discord, site, farcaster }, wallet, taxe, rachat, pin, sel }
  // achat : premier achat du créateur en wei (0n pour aucun), minimum : jetons attendus au moins.
  function transaction(c, frais, achat = 0n, minimum = 0n) {
    const r = c.reseaux || {};
    const params = [c.nom, c.ticker, c.logo || '', c.description || '', [r.twitter || '', r.telegram || '', r.discord || '', r.site || '', r.farcaster || ''], c.wallet, c.taxe || 0, !!c.rachat, c.pin, c.sel];
    if (achat > 0n) {
      return {
        to: PONS.launchAndBuy,
        data: appel(S.launchAndBuy, [PARAMS, 'uint256', 'address', 'uint256', 'uint256', 'address', { array: 'address' }], [params, PONS.config, ZERO, achat, minimum, c.wallet, []]),
        value: frais + achat,
        avecAchat: true,
      };
    }
    return { to: PONS.factory, data: appel(S.launchToken, [PARAMS, 'uint256', 'address', { array: 'address' }], [params, PONS.config, ZERO, []]), value: frais, avecAchat: false };
  }
  const versNoeud = (tx, de) => ({ from: de, to: tx.to, data: tx.data, value: '0x' + tx.value.toString(16) });
  // Rejoue le lancement sur l'état réel, sans rien envoyer : rend l'adresse que le coin aura, et les jetons du premier achat.
  async function simuler(tx, de) {
    const r = reponse(tx.avecAchat ? ['address', 'address', 'uint256'] : ['address', 'address'], await rpc('eth_call', [versNoeud(tx, de), 'latest']));
    return { token: r[0], courbe: r[1], jetons: tx.avecAchat ? r[2] : 0n };
  }
  // L'adresse que le coin aura. Elle ne dépend que du wallet qui lance, du sel et de la fiche du coin (nom, ticker,
  // image, texte, liens, taxe) : relevé par simulation, le premier achat ne la change pas. Le rejeu prête un solde au
  // wallet, pour qu'un wallet encore vide connaisse l'adresse de son coin avant de signer son dépôt.
  async function prevoir(tx, de) {
    const r = reponse(['address', 'address'], await rpc('eth_call', [versNoeud(tx, de), 'latest', { [de]: { balance: '0x56bc75e2d63100000' } }]));
    return r[0];
  }
  const gaz = async (tx, de) => BigInt(await rpc('eth_estimateGas', [versNoeud(tx, de)]));
  const prixDuGaz = async () => BigInt(await rpc('eth_gasPrice', []));
  const recu = (hash) => rpc('eth_getTransactionReceipt', [hash]);
  // Le coin né d'un reçu : l'événement TokenLaunched de la factory.
  function lance(r) {
    const l = ((r && r.logs) || []).find((x) => egal(x.address, PONS.factory) && x.topics && x.topics[0] === TOPIC_LANCE);
    return l ? { token: '0x' + l.topics[1].slice(26), courbe: '0x' + l.topics[2].slice(26), createur: '0x' + l.topics[3].slice(26) } : null;
  }

  // ---------- un coin
  // Tout est lu sur le contrat du coin et sur la factory de Pons : nom, image, texte, créateur, courbe.
  async function coin(token) {
    const F = PONS.factory;
    const [fiche] = await lire(F, S.getLaunchedToken, ['address'], [token], [FICHE]);
    if (!fiche[14]) return null; // pas un coin lancé chez Pons
    const courbe = fiche[1];
    const [nom, ticker, logo, description, reseaux, reserves, reel, gradue] = await Promise.all([
      lire(token, S.name, [], [], ['string']),
      lire(token, S.symbol, [], [], ['string']),
      lire(token, S.logo, [], [], ['string']),
      lire(token, S.description, [], [], ['string']),
      lire(token, S.socials, [], [], ['string', 'string', 'string', 'string', 'string']),
      lire(courbe, S.getReserves, [], [], ['uint256', 'uint256']),
      lire(courbe, S.realQuoteReserve, [], [], ['uint256']),
      lire(courbe, S.graduated, [], [], ['bool']),
    ]);
    return {
      token: token.toLowerCase(), courbe, createur: fiche[2], beneficiaire: fiche[3], paire: fiche[4], graduation: fiche[5], taxe: Number(fiche[8]), rachat: fiche[9], phase: Number(fiche[10]),
      nom: nom[0], ticker: ticker[0], logo: logo[0], description: description[0],
      reseaux: { twitter: reseaux[0], telegram: reseaux[1], discord: reseaux[2], site: reseaux[3], farcaster: reseaux[4] },
      reserveCotee: reserves[0], reserveJetons: reserves[1], leve: reel[0], gradue: gradue[0],
    };
  }
  // Le dépôt qu'un coin nomme. Un coin lancé ici finit son texte par « Repo: github.com/owner/repo » : cette ligne
  // passe d'abord. Sinon son site, sinon le premier lien GitHub de son texte.
  const DEPOT = /github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?=[\s"'<>)\],;]|\/|$)/;
  const MARQUE = 'Repo: github.com/';
  const marque = (depot) => `${MARQUE}${depot}`;
  function depotDe(c) {
    const texte = String(c.description || '');
    const site = String((c.reseaux && c.reseaux.site) || '');
    const ligne = texte.split('\n').reverse().find((l) => l.trim().startsWith(MARQUE));
    const m = (ligne && DEPOT.exec(ligne.trim())) || DEPOT.exec(site) || DEPOT.exec(texte);
    return m ? `${m[1]}/${m[2].replace(/\.$/, '')}` : null;
  }
  // Le texte d'un coin sans sa ligne « Repo: », pour l'afficher.
  const texteSans = (description) => String(description || '').split('\n').filter((l) => !l.trim().startsWith(MARQUE)).join('\n').trim();
  const octets = (t) => new TextEncoder().encode(String(t)).length;
  // Ce que Pons accepte, relevé par simulation sur le contrat (outils/essais/limites-pons.mjs), en octets.
  const LIMITES = { nom: 64, ticker: 16, logo: 512, description: 2048, reseau: 256 };
  // Un lien qu'on peut ouvrir : https seulement.
  const lien = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u || '').trim()) ? String(u).trim() : '');
  // Une image de coin qu'on peut afficher : https, ou ipfs:// par une passerelle publique. Rien d'autre.
  // Les passerelles sont essayées dans l'ordre : certaines refusent qu'un autre site affiche leurs images.
  const PASSERELLES = ['https://4everland.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/'];
  function images(logo) {
    const l = String(logo || '').trim();
    if (/^https:\/\/[^\s"'<>]+$/.test(l)) return [l];
    const m = /^(?:ipfs:\/\/)?((?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{50,})(?:\/[^\s"'<>]*)?)$/.exec(l);
    return m ? PASSERELLES.map((p) => p + m[1]) : [];
  }
  const image = (logo) => images(logo)[0] || '';
  // Les coins qu'un wallet a lancés chez Pons, du plus récent au plus ancien. La recherche part de la tête de la
  // chaîne et remonte par tranches jusqu'au premier lancement de Pons v2. Ce navigateur retient jusqu'où il a lu :
  // la visite suivante ne relit que les blocs nouveaux.
  async function coinsDe(wallet) {
    const cle = `uh-coins-${wallet.toLowerCase()}`;
    let connu = { jusqua: PONS.depuis - 1, coins: [] };
    try {
      const lu = JSON.parse(sessionStorage.getItem(cle) || 'null');
      if (lu && Number.isInteger(lu.jusqua) && Array.isArray(lu.coins)) connu = lu;
    } catch {}
    // La tête est lue sur le nœud qui fait la recherche : un autre nœud peut avoir un bloc d'avance, et la recherche
    // d'un bloc qu'il n'a pas encore est refusée.
    const tete = Number(BigInt(await rpc('eth_blockNumber', [], { journaux: true })));
    const sujet = '0x' + wallet.slice(2).toLowerCase().padStart(64, '0');
    const neufs = [];
    for (let haut = tete; haut > connu.jusqua; haut -= PONS.journauxParAppel) {
      const bas = Math.max(connu.jusqua + 1, haut - PONS.journauxParAppel + 1);
      const logs = await rpc('eth_getLogs', [{ address: PONS.factory, topics: [TOPIC_LANCE, null, null, sujet], fromBlock: '0x' + bas.toString(16), toBlock: '0x' + haut.toString(16) }], { journaux: true });
      for (const l of logs.reverse()) neufs.push({ token: '0x' + l.topics[1].slice(26), courbe: '0x' + l.topics[2].slice(26), bloc: Number(BigInt(l.blockNumber)), tx: l.transactionHash });
    }
    const trouves = [...neufs, ...connu.coins];
    try {
      sessionStorage.setItem(cle, JSON.stringify({ jusqua: tete, coins: trouves }));
    } catch {}
    return trouves;
  }

  return { CHAINE, PONS, ZERO, LIMITES, rpc, etatPons, solde, sel, transaction, simuler, prevoir, gaz, prixDuGaz, recu, lance, coin, depotDe, marque, texteSans, octets, lien, image, images, coinsDe, ether, wei, egal, court, direRefus, appel, reponse, _types: { PARAMS, CONFIG, FICHE }, _S: S };
})();
