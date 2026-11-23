// Udenhood : le graphique en bougies de la page d'un coin. Dessiné à la main dans un canvas, sans bibliothèque.
// Les couleurs, les polices et les épaisseurs viennent de la feuille de style (variables de la page) : rien n'est
// choisi ici. Hausse en or, baisse en corail, grille en trait de la DA, chiffres en mono à largeur fixe.
// Gestes : survol (réticule et valeurs), glisser pour remonter le temps, deux boutons pour serrer ou desserrer.
window.UHG = (() => {
  const MARGE = { haut: 10, droite: 74, bas: 24 };
  const VOLUME = 0.16; // part du bas réservée au volume

  function creer(toile, { format = String, surSurvol = () => {} } = {}) {
    const ctx = toile.getContext('2d');
    let bougies = [];
    let largeur = 0;
    let hauteur = 0;
    let pas = 9; // largeur d'une bougie, en pixels d'écran
    let recul = 0; // bougies cachées à droite : 0 montre la plus récente
    let survol = null; // { x, y }
    let attente = 0;
    let aCadrer = false; // au prochain dessin, serrer les bougies pour que toute l'histoire tienne
    let tons = {};
    let police = '';

    function lireStyle() {
      const s = getComputedStyle(toile);
      const v = (nom) => s.getPropertyValue(nom).trim();
      tons = { fond: v('--bg'), trait: v('--line'), texte: v('--ink-2'), discret: v('--ink-3'), clair: v('--ink'), hausse: v('--or'), hausseBord: v('--or-fonce'), baisse: v('--corail'), baisseBord: v('--accent') };
      police = `500 11px ${v('--mono') || 'monospace'}`;
    }

    function mesurer() {
      const r = toile.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      largeur = Math.max(120, Math.round(r.width));
      hauteur = Math.max(120, Math.round(r.height));
      if (toile.width !== Math.round(largeur * dpr) || toile.height !== Math.round(hauteur * dpr)) {
        toile.width = Math.round(largeur * dpr);
        toile.height = Math.round(hauteur * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Les bougies visibles, et la place de chacune.
    function fenetre() {
      const zone = largeur - MARGE.droite;
      const combien = Math.max(1, Math.floor(zone / pas));
      recul = Math.max(0, Math.min(recul, Math.max(0, bougies.length - Math.min(combien, bougies.length))));
      const fin = bougies.length - recul;
      const debut = Math.max(0, fin - combien);
      return { debut, fin, zone, x: (i) => zone - (fin - i) * pas + pas / 2 };
    }

    const net = (x) => Math.round(x) + 0.5; // un trait d'un pixel tombe sur un pixel

    function heureCourte(t, avecJour) {
      const d = new Date(t * 1000);
      const h = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      return avecJour ? `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${h}` : h;
    }

    function dessiner() {
      attente = 0;
      mesurer();
      ctx.clearRect(0, 0, largeur, hauteur);
      if (!bougies.length) return;
      if (aCadrer) {
        aCadrer = false;
        pas = Math.max(3, Math.min(14, Math.floor((largeur - MARGE.droite) / bougies.length)));
        recul = 0;
      }
      const f = fenetre();
      const vues = bougies.slice(f.debut, f.fin);
      let bas = Infinity;
      let haut = -Infinity;
      let volMax = 0;
      for (const b of vues) {
        if (b.l < bas) bas = b.l;
        if (b.h > haut) haut = b.h;
        if (b.v > volMax) volMax = b.v;
      }
      if (!(haut > bas)) {
        haut = bas * 1.05 || 1;
        bas *= 0.95;
      }
      const jeu = (haut - bas) * 0.1;
      haut += jeu;
      bas = Math.max(0, bas - jeu);
      const hPlot = hauteur - MARGE.haut - MARGE.bas;
      const hPrix = hPlot * (1 - VOLUME) - 6;
      const y = (v) => MARGE.haut + ((haut - v) / (haut - bas)) * hPrix;
      const yVol = (v) => hauteur - MARGE.bas - (volMax ? (v / volMax) * hPlot * VOLUME : 0);

      ctx.font = police;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;

      // Grille : quatre traits de valeur, et un trait de temps toutes les ~110 px.
      ctx.strokeStyle = tons.trait;
      ctx.fillStyle = tons.discret;
      ctx.textAlign = 'left';
      for (let i = 0; i <= 4; i++) {
        const v = bas + ((haut - bas) * i) / 4;
        const yy = net(y(v));
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(f.zone, yy);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(format(v), f.zone + 8, yy);
      }
      const chaque = Math.max(1, Math.round(110 / pas));
      const duree = vues.length > 1 ? vues[vues.length - 1].t - vues[0].t : 0;
      ctx.textAlign = 'center';
      for (let i = f.fin - 1; i >= f.debut; i -= chaque) {
        const xx = net(f.x(i));
        if (xx < 30) break;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(xx, MARGE.haut);
        ctx.lineTo(xx, hauteur - MARGE.bas);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(heureCourte(bougies[i].t, duree > 86400), xx, hauteur - MARGE.bas / 2 + 1);
      }
      // Le bord droit du graphique : un seul trait, de haut en bas.
      ctx.strokeStyle = tons.trait;
      ctx.beginPath();
      ctx.moveTo(net(f.zone), 0);
      ctx.lineTo(net(f.zone), hauteur - MARGE.bas);
      ctx.moveTo(0, net(hauteur - MARGE.bas));
      ctx.lineTo(largeur, net(hauteur - MARGE.bas));
      ctx.stroke();

      // Volume, puis bougies.
      const corps = Math.max(1, Math.min(pas - 2, Math.round(pas * 0.68)));
      for (let i = f.debut; i < f.fin; i++) {
        const b = bougies[i];
        if (!b.v) continue;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = b.c >= b.o ? tons.hausse : tons.baisse;
        const yy = yVol(b.v);
        ctx.fillRect(Math.round(f.x(i) - corps / 2), yy, corps, hauteur - MARGE.bas - yy);
      }
      ctx.globalAlpha = 1;
      for (let i = f.debut; i < f.fin; i++) {
        const b = bougies[i];
        const xx = f.x(i);
        const monte = b.c >= b.o;
        if (!b.n) {
          // Un pas sans échange : un tiret au dernier prix.
          ctx.strokeStyle = tons.discret;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(Math.round(xx - corps / 2), net(y(b.c)));
          ctx.lineTo(Math.round(xx + corps / 2), net(y(b.c)));
          ctx.stroke();
          ctx.globalAlpha = 1;
          continue;
        }
        ctx.strokeStyle = monte ? tons.hausseBord : tons.baisseBord;
        ctx.fillStyle = monte ? tons.hausse : tons.baisse;
        ctx.beginPath();
        ctx.moveTo(net(xx), y(b.h));
        ctx.lineTo(net(xx), y(b.l));
        ctx.stroke();
        const y1 = y(Math.max(b.o, b.c));
        const y2 = y(Math.min(b.o, b.c));
        ctx.fillRect(Math.round(xx - corps / 2), Math.round(y1), corps, Math.max(1, Math.round(y2 - y1)));
      }

      // Le dernier prix : un trait en pointillé et son étiquette sur l'axe.
      const dernier = bougies[bougies.length - 1];
      const yd = net(y(dernier.c));
      if (yd > MARGE.haut - 4 && yd < MARGE.haut + hPrix + 8) {
        const monte = dernier.c >= dernier.o;
        ctx.strokeStyle = tons.texte;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(0, yd);
        ctx.lineTo(f.zone, yd);
        ctx.stroke();
        ctx.setLineDash([]);
        etiquette(f.zone + 3, yd, format(dernier.c), monte ? tons.hausse : tons.baisse, tons.fond);
      }

      // Réticule
      if (survol && survol.x < f.zone && survol.y > MARGE.haut && survol.y < hauteur - MARGE.bas) {
        const i = Math.max(f.debut, Math.min(f.fin - 1, f.fin - 1 - Math.floor((f.zone - survol.x) / pas)));
        const xx = net(f.x(i));
        ctx.strokeStyle = tons.discret;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(xx, MARGE.haut);
        ctx.lineTo(xx, hauteur - MARGE.bas);
        ctx.moveTo(0, net(survol.y));
        ctx.lineTo(f.zone, net(survol.y));
        ctx.stroke();
        ctx.setLineDash([]);
        if (survol.y < MARGE.haut + hPrix) etiquette(f.zone + 3, net(survol.y), format(haut - ((survol.y - MARGE.haut) / hPrix) * (haut - bas)), tons.clair, tons.fond);
        const texte = heureCourte(bougies[i].t, true);
        const l = ctx.measureText(texte).width + 12;
        const gx = Math.max(0, Math.min(f.zone - l, xx - l / 2));
        ctx.fillStyle = tons.clair;
        ctx.fillRect(gx, hauteur - MARGE.bas + 2, l, MARGE.bas - 4);
        ctx.fillStyle = tons.fond;
        ctx.textAlign = 'center';
        ctx.fillText(texte, gx + l / 2, hauteur - MARGE.bas / 2 + 1);
        surSurvol(bougies[i]);
      } else {
        surSurvol(null);
      }
    }

    function etiquette(x, yy, texte, fond, encre) {
      ctx.font = police;
      const l = Math.min(MARGE.droite - 5, ctx.measureText(texte).width + 10);
      ctx.fillStyle = fond;
      ctx.fillRect(x, yy - 9, l, 18);
      ctx.fillStyle = encre;
      ctx.textAlign = 'left';
      ctx.fillText(texte, x + 5, yy + 0.5, l - 8);
    }

    // Un seul dessin par image, même si dix choses changent.
    function demander() {
      if (!attente) attente = requestAnimationFrame(dessiner);
    }

    // Gestes
    let glisse = null;
    const lieu = (ev) => {
      const r = toile.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    toile.addEventListener('pointerdown', (ev) => {
      glisse = { x: ev.clientX, recul };
      toile.setPointerCapture(ev.pointerId);
      toile.dataset.glisse = 'true';
    });
    toile.addEventListener('pointermove', (ev) => {
      if (glisse) recul = Math.max(0, glisse.recul + Math.round((ev.clientX - glisse.x) / pas));
      survol = lieu(ev);
      demander();
    });
    const lacher = () => {
      glisse = null;
      toile.dataset.glisse = 'false';
    };
    toile.addEventListener('pointerup', lacher);
    toile.addEventListener('pointercancel', lacher);
    toile.addEventListener('pointerleave', () => {
      survol = null;
      demander();
    });
    // Au clavier : les flèches remontent et redescendent le temps, plus et moins serrent ou desserrent.
    toile.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft') recul += 5;
      else if (ev.key === 'ArrowRight') recul = Math.max(0, recul - 5);
      else if (ev.key === '+' || ev.key === '=') pas = Math.min(28, pas + 2);
      else if (ev.key === '-') pas = Math.max(3, pas - 2);
      else return;
      ev.preventDefault();
      demander();
    });
    const observe = new ResizeObserver(demander);
    observe.observe(toile);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(demander);
    lireStyle();

    return {
      // Pose de nouvelles bougies. garderVue : on ne bouge pas si l'on regardait le passé. cadrer : toute l'histoire
      // tient dans la largeur (bougies de 3 à 14 px).
      poser(nouvelles, { garderVue = true, nouveauFormat, cadrer = false } = {}) {
        if (nouveauFormat) format = nouveauFormat;
        if (cadrer) aCadrer = true;
        if (garderVue && recul > 0 && bougies.length && nouvelles.length >= bougies.length) recul += nouvelles.length - bougies.length;
        else if (!garderVue) recul = 0;
        bougies = nouvelles;
        demander();
      },
      zoom(sens) {
        pas = Math.max(3, Math.min(28, pas + (sens > 0 ? 2 : -2)));
        demander();
      },
      redessiner() {
        lireStyle();
        demander();
      },
      derniere: () => bougies[bougies.length - 1] || null,
    };
  }

  return { creer };
})();
