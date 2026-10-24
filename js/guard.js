/**
 * ==========================================================================
 * GUARD.JS - PROTECTION DES PAGES PAR AUTHENTIFICATION
 * Redirige vers login.html si l'utilisateur n'est pas connecté.
 * Doit être chargé EN PREMIER (avant app.js, auth.js, contest.js).
 * ==========================================================================
 */

(function () {
  'use strict';

  // Pages qui ne nécessitent PAS d'être connecté (liste blanche)
  const PUBLIC_PAGES = ['login.html'];

  // Détermine le nom du fichier courant (ex: "index.html", "concours.html")
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // Si on est déjà sur une page publique, pas besoin de vérifier
  if (PUBLIC_PAGES.includes(currentPage)) return;

  const cfg = window.SUPABASE_CONFIG;

  // Si Supabase n'est pas configuré : on laisse passer (mode démo local)
  if (!window.supabase || !cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('votre-identifiant')) {
    console.warn('⚠️ Guard : Supabase non configuré — protection désactivée (mode démo).');
    return;
  }

  // Crée (ou réutilise) le client Supabase le plus tôt possible
  window._supabaseClient = window._supabaseClient || window.supabase.createClient(
    cfg.SUPABASE_URL.trim().replace(/\/+$/, ''),
    cfg.SUPABASE_ANON_KEY.trim()
  );

  // Masque le contenu de la page pendant la vérification pour éviter le flash
  document.documentElement.style.visibility = 'hidden';

  // Vérifie la session immédiatement
  window._supabaseClient.auth.getSession().then(({ data }) => {
    const session = data.session;

    if (!session) {
      // Pas de session → redirection vers login.html
      window.location.replace('login.html');
    } else {
      // Session valide → affiche la page
      document.documentElement.style.visibility = '';
    }
  }).catch(() => {
    // En cas d'erreur réseau, on laisse passer plutôt que de bloquer
    document.documentElement.style.visibility = '';
  });

})();
