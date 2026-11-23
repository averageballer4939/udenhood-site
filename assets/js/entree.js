// Chargé dans la tête de page, avant le premier rendu : il pose l'état « attend » qui couvre la page d'un voile,
// le temps que site.js lance le chargement animé. Sans mouvement demandé (prefers-reduced-motion), rien n'est posé.
// Une sécurité en CSS lève le voile seule au bout de 4 secondes si la suite ne se charge pas.
(function () {
  var h = document.documentElement;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  h.classList.add('js', 'attend');
  try {
    if (!sessionStorage.getItem('uh-entree')) h.classList.add('premiere');
  } catch (e) {
    h.classList.add('premiere');
  }
})();
