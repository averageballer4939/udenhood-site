// Doc d'Udenhood : quatre conforts. Sans ce script la doc se lit et se parcourt entière (menu, palette, pager).
// 1. Ctrl K ou Cmd K ouvre la palette, Échap la ferme. 2. Un champ filtre la palette.
// 3. « Copy link » et « Copy for AI ». 4. Le sommaire suit la section lue.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const doc = $('main.doc');
  if (!doc) return;
  doc.classList.add('js');

  // 1 et 2 : la palette
  const palette = $('#search');
  const ouverte = () => location.hash === '#search';
  // Ouverte pendant cette visite : Échap revient en arrière et rend la place dans la page. Sinon on repasse par #main.
  let viaIci = false;
  const fermer = () => {
    if (viaIci) {
      viaIci = false;
      history.back();
    } else {
      location.hash = '#main';
    }
  };
  let champ = null;
  if (palette) {
    champ = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Filter pages and sections', autocomplete: 'off', spellcheck: false });
    champ.setAttribute('aria-label', 'Filter pages and sections');
    $('.d-search-t', palette).after(champ);
    const lignes = $$('li', palette);
    champ.addEventListener('input', () => {
      const q = champ.value.trim().toLowerCase();
      let vus = 0;
      for (const li of lignes) {
        const garde = !q || `${li.textContent} ${li.dataset.mots || ''}`.toLowerCase().includes(q);
        li.hidden = !garde;
        if (garde) vus += 1;
      }
      palette.dataset.vide = vus ? 'false' : 'true';
    });
    champ.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const premier = $('li:not([hidden]) .d-res', palette);
      if (premier) location.href = premier.href;
    });
    addEventListener('hashchange', () => {
      if (!ouverte()) return;
      viaIci = true;
      champ.value = '';
      champ.dispatchEvent(new Event('input'));
      champ.focus();
    });
    if (ouverte()) champ.focus();
    for (const a of $$('.d-search-voile, .d-search-x', palette)) {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        fermer();
      });
    }
  }
  addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      if (ouverte()) fermer();
      else location.hash = '#search';
    } else if (ev.key === 'Escape' && ouverte()) {
      fermer();
    }
  });

  // 3 : copier le lien, copier la page pour une IA
  const copier = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte);
      return true;
    } catch {
      const zone = Object.assign(document.createElement('textarea'), { value: texte });
      zone.setAttribute('readonly', '');
      zone.className = 'sr';
      document.body.append(zone);
      zone.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      zone.remove();
      return ok;
    }
  };
  const dire = (bouton, ok) => {
    const repos = bouton.dataset.repos || bouton.textContent;
    bouton.dataset.repos = repos;
    bouton.textContent = ok ? 'Copied' : 'Copy failed';
    bouton.dataset.ok = ok ? 'true' : 'false';
    setTimeout(() => {
      bouton.textContent = repos;
      bouton.dataset.ok = 'false';
    }, 1400);
  };
  const propre = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const pourIA = () => {
    const lignes = [`# ${propre($('.d-h1'))}`, '', propre($('.d-dek')), ''];
    for (const el of $$('.d-body > *')) {
      if (el.matches('h2')) lignes.push(`## ${propre(el)}`, '');
      else if (el.matches('p')) lignes.push(propre(el), '');
      else if (el.matches('.d-hint')) lignes.push(`> ${propre(el)}`, '');
      else if (el.matches('ol, ul')) {
        $$(':scope > li', el).forEach((li, i) => lignes.push(`${el.matches('ol') ? `${i + 1}.` : '-'} ${propre(li)}`));
        lignes.push('');
      } else if (el.matches('pre')) lignes.push('```', el.textContent.replace(/\s+$/, ''), '```', '');
      else if (el.matches('.d-table-w')) {
        for (const tr of $$('tr', el)) lignes.push(`| ${$$('th, td', tr).map(propre).join(' | ')} |`);
        lignes.push('');
      } else if (el.matches('figure')) {
        const scene = $('.scene', el);
        if (scene) lignes.push(`[Preview: ${scene.getAttribute('aria-label')}]`, '');
      }
    }
    lignes.push(`Source: ${location.origin}${location.pathname}`);
    return lignes.join('\n');
  };
  const bLien = $('#d-lien');
  const bIA = $('#d-ia');
  if (bLien) bLien.addEventListener('click', async () => dire(bLien, await copier(location.origin + location.pathname)));
  if (bIA) bIA.addEventListener('click', async () => dire(bIA, await copier(pourIA())));

  // 4 : le sommaire suit la section lue
  const liens = new Map($$('.d-toc a').map((a) => [a.getAttribute('href').slice(1), a]));
  const titres = $$('.d-body h2[id]');
  if (liens.size && titres.length && 'IntersectionObserver' in window) {
    const marquer = (id) => {
      for (const [cle, a] of liens) a.setAttribute('aria-current', cle === id ? 'true' : 'false');
    };
    const vu = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) if (e.isIntersecting) marquer(e.target.id);
      },
      { rootMargin: '-88px 0px -65% 0px' },
    );
    for (const h of titres) vu.observe(h);
  }
})();
