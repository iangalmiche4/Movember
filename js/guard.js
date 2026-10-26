/**
 * ==========================================================================
 * GUARD.JS - INITIALISATION SUPABASE (SANS PROTECTION DE PAGE)
 * Le site est désormais entièrement public. L'authentification n'est requise
 * que pour poster une photo ou voter (géré dans contest.js / auth.js).
 * Ce fichier se contente de créer le client Supabase le plus tôt possible
 * afin que auth.js et contest.js puissent l'utiliser.
 * ==========================================================================
 */

(function () {
  'use strict';

  const cfg = window.SUPABASE_CONFIG;

  if (!window.supabase || !cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('votre-identifiant')) {
    console.warn('⚠️ Guard : Supabase non configuré — mode démo local actif.');
    return;
  }

  // Crée (ou réutilise) le client Supabase
  window._supabaseClient = window._supabaseClient || window.supabase.createClient(
    cfg.SUPABASE_URL.trim().replace(/\/+$/, ''),
    cfg.SUPABASE_ANON_KEY.trim()
  );

})();
