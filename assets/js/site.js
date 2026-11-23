// Udenhood : le chargement de page et les entrées. Aucune dépendance.
// 1. Le voile : un canevas plein écran. Première visite de la session : le signe U se pose, des rayons tournent.
//    Puis le voile se défait en trame de points depuis le centre, en deux temps (Nuit, puis Royal), comme une
//    trame d'imprimerie qui s'éclaircit.
// 2. Sous le voile, la page entre : les éléments marqués data-e prennent leur place (CSS, html.pret).
// 3. Au défilement, les éléments marqués data-v entrent quand ils arrivent à l'écran.
(() => {
  const h = document.documentElement;
  const racine = (document.currentScript ? document.currentScript.src : '').replace(/assets\/js\/site\.js.*$/, '');

  // --- entrées au défilement
  const aVoir = [...document.querySelectorAll('[data-v]')];
  const voir = (el) => el.classList.add('vu');
  if (!h.classList.contains('js') || !('IntersectionObserver' in window)) aVoir.forEach(voir);
  else {
    const oeil = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (e.isIntersecting) {
            voir(e.target);
            oeil.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    aVoir.forEach((el) => oeil.observe(el));
  }

  if (!h.classList.contains('attend')) return;

  // --- le voile
  const premiere = h.classList.contains('premiere');
  const rideau = document.createElement('div');
  rideau.className = 'rideau';
  rideau.setAttribute('aria-hidden', 'true');
  const toile = document.createElement('canvas');
  rideau.append(toile);
  if (premiere) {
    const u = document.createElement('div');
    u.className = 'rideau-u';
    const image = new Image();
    image.src = `${racine}assets/brand/u.png`;
    image.alt = '';
    u.append(document.createElement('i'), image);
    rideau.append(u);
  }
  document.body.append(rideau);

  const ctx = toile.getContext('2d');
  const style = getComputedStyle(h);
  const NUIT = style.getPropertyValue('--bg').trim();
  const ROYAL = style.getPropertyValue('--royal').trim();
  const PAS = 22; // grille de la trame, en px
  let L = 0;
  let H = 0;
  const tailler = () => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    L = window.innerWidth;
    H = window.innerHeight;
    toile.width = Math.round(L * d);
    toile.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  tailler();
  const plein = () => {
    ctx.fillStyle = NUIT;
    ctx.fillRect(0, 0, L, H);
  };
  plein();

  const doux = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const DUREE = premiere ? 820 : 560;
  const ETALE = 0.55; // part de la durée prise par l'onde qui va du centre aux coins
  const RETARD = 0.14; // la couche Royal suit la couche Nuit

  function dessiner(p) {
    ctx.clearRect(0, 0, L, H);
    const cx = L / 2;
    const cy = H / 2;
    const loin = Math.hypot(cx, cy);
    const R = PAS * 0.76;
    for (const [couleur, decalage] of [[ROYAL, RETARD], [NUIT, 0]]) {
      ctx.fillStyle = couleur;
      ctx.beginPath();
      for (let y = PAS / 2, j = 0; y < H + PAS; y += PAS * 0.87, j++) {
        for (let x = (j % 2 ? PAS / 2 : 0); x < L + PAS; x += PAS) {
          const d = Math.hypot(x - cx, y - cy) / loin;
          const local = (p - decalage - d * ETALE) / (1 - ETALE - RETARD);
          const r = R * (1 - doux(local));
          if (r <= 0.3) continue;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, 6.2832);
        }
      }
      ctx.fill();
    }
  }

  const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const visuel = document.querySelector('.coq') || document.querySelector('main img');
  const pret = Promise.race([
    Promise.all([document.fonts ? document.fonts.ready : null, visuel && visuel.decode ? visuel.decode().catch(() => null) : null]),
    attendre(1400),
  ]);

  Promise.all([pret, attendre(premiere ? 620 : 60)]).then(() => {
    h.classList.remove('attend');
    h.classList.add('pret');
    rideau.classList.add('part');
    const debut = performance.now();
    const pas = (maintenant) => {
      const p = (maintenant - debut) / DUREE;
      if (p >= 1) {
        rideau.remove();
        window.removeEventListener('resize', surTaille);
        try {
          sessionStorage.setItem('uh-entree', '1');
        } catch (e) {}
        return;
      }
      dessiner(p);
      requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  });
  const surTaille = () => {
    tailler();
    if (h.classList.contains('attend')) plein();
  };
  window.addEventListener('resize', surTaille);
})();
