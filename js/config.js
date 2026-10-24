/**
 * ==========================================================================
 * CONFIG.JS - CONFIGURATION SUPABASE (BASE DE DONNÉES & STOCKAGE PHOTOS)
 * ==========================================================================
 * 
 * Instructions :
 * 1. Créez un compte gratuit sur https://supabase.com
 * 2. Créez un projet (ex: "movember-saint-loup")
 * 3. Récupérez vos clés dans : Project Settings > API
 * 4. Remplacez les valeurs ci-dessous par vos identifiants réels.
 * 
 * Si les clés restent vides ou invalides, le site bascule automatiquement
 * sur le mode local (localStorage) sans aucune erreur.
 */

const SUPABASE_CONFIG = {
  // URL racine du projet (sans /rest/v1/ ni slash final)
  SUPABASE_URL: 'https://rvqebmyixdmfzzorypps.supabase.co',

  // Clé publique / anon key
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2cWVibXlpeGRtZnp6b3J5cHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MjMyMjksImV4cCI6MjEwNzk5OTIyOX0.KPJ27inhnidVVG7igJBflUvUc1xMohUH-wkVScUBJgQ',

  // Nom du bucket Supabase Storage pour stocker les photos
  STORAGE_BUCKET: 'movember-photos',

  // Nom de la table SQL pour les participants et les votes
  TABLE_NAME: 'contest_entries'
};

// Export global
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
