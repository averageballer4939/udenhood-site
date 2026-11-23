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

  // Un élément : el('a', { class: 'x', href: '…', text: '…' }, enfant, 'texte'). Jamais de HTML injecté.
  function el(nom, props = {}, ...enfants) {
    const e = document.createElement(nom);
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v == null) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k === 'data') Object.assign(e.dataset, v);
      else if (k in e && k !== 'list' && k !== 'form') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    e.append(...enfants.flat().filter((x) => x != null && x !== false));
    return e;
  }

  // Un mot en bas de l'écran, deux secondes : la réponse à un geste (copié, déconnecté).
  let mot;
  let fin;
  function dire(texte) {
    if (!mot) {
      mot = el('p', { class: 'mot-bas', role: 'status' });
      document.body.append(mot);
    }
    mot.textContent = texte;
    mot.dataset.vu = 'false';
    void mot.offsetWidth;
    mot.dataset.vu = 'true';
    clearTimeout(fin);
    fin = setTimeout(() => {
      mot.dataset.vu = 'false';
    }, 2000);
  }

  async function copier(texte, message = 'Copied') {
    try {
      await navigator.clipboard.writeText(texte);
      dire(message);
      return true;
    } catch {
      dire('Your browser blocked the copy.');
      return false;
    }
  }

  // Pose une image venue d'ailleurs (le visuel d'un coin). liens : les adresses à essayer dans l'ordre. Si aucune
  // ne s'affiche, l'image se retire et le cadre montre sa tuile de trame.
  function poserImage(img, liens, cadre) {
    const reste = [...liens];
    const suivant = () => {
      const lien = reste.shift();
      if (lien) {
        img.src = lien;
        return;
      }
      img.hidden = true;
      img.removeAttribute('src');
      if (cadre) cadre.dataset.vide = 'true';
    };
    img.referrerPolicy = 'no-referrer';
    img.onerror = suivant;
    img.hidden = !reste.length;
    if (cadre) cadre.dataset.vide = String(!reste.length);
    suivant();
  }

  // Mémoire du navigateur : un brouillon, jamais une donnée qui compte. Illisible ou pleine, on s'en passe.
  const memoire = {
    lire(cle) {
      try {
        return JSON.parse(localStorage.getItem(cle) || 'null');
      } catch {
        return null;
      }
    },
    ecrire(cle, v) {
      try {
        v == null ? localStorage.removeItem(cle) : localStorage.setItem(cle, JSON.stringify(v));
      } catch {}
    },
  };

  return {
    lire,
    github,
    el,
    dire,
    copier,
    poserImage,
    memoire,
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
