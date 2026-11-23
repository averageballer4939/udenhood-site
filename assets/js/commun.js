// Udenhood : ce que « Check a repo » et « Sign your repo » partagent. Le navigateur du visiteur interroge GitHub
// lui-même, sans clé et sans serveur à nous.
window.UH = (() => {
  const JOUR = 86400000;
  const nb = (n) => n.toLocaleString('en-US');

  // « owner/repo », ou une adresse GitHub entière : rend { o, r } ou null.
  function lire(valeur) {
    const v = String(valeur || '').trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/[#?].*$/, '').replace(/\/+$/, '');
    const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:\/.*)?$/.exec(v);
    return m ? { o: m[1], r: m[2] } : null;
  }

  // Une lecture de l'API publique de GitHub. Les échecs sont nommés : réseau, limite, absent, http.
  async function github(chemin) {
    let rep;
    try {
      rep = await fetch(`https://api.github.com${chemin}`, { headers: { Accept: 'application/vnd.github+json' } });
    } catch {
      throw { genre: 'reseau' };
    }
    if ((rep.status === 403 || rep.status === 429) && rep.headers.get('x-ratelimit-remaining') === '0') {
      throw { genre: 'limite', retour: Number(rep.headers.get('x-ratelimit-reset')) * 1000 };
    }
    if (rep.status === 404) throw { genre: 'absent' };
    if (!rep.ok) throw { genre: 'http', code: rep.status };
    return rep.json();
  }

  return {
    lire,
    github,
    // Une lecture secondaire qui échoue rend null, sauf la limite de GitHub, qui arrête tout.
    ouVide: (p) => p.catch((e) => (e && e.genre === 'limite' ? Promise.reject(e) : null)),
    jours: (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / JOUR),
    pl: (n, mot) => `${nb(n)} ${mot}${n === 1 ? '' : 's'}`,
    court: (a) => `${a.slice(0, 6)}…${a.slice(-4)}`,
    pause: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    heure: (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    JOUR,
    CHAINE: 4663, // Robinhood Chain
  };
})();
