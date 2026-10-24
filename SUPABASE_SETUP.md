# 🗄️ Guide d'installation Supabase — Movember Saint Loup

Ce guide contient le script SQL définitif et la configuration complète pour connecter la base de données et le stockage d'images Supabase.

---

## 🚀 Étape 1 : Le Script SQL Global (Tout-en-un)

Pour éviter toute erreur de politique de sécurité (RLS ou Storage), ouvrez le **SQL Editor** sur [Supabase](https://supabase.com) > **"New query"**, collez ce script complet et cliquez sur **"Run"** :

```sql
-- =========================================================================
-- 1. CRÉATION DE LA TABLE DES PARTICIPANTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.contest_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pseudo TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    votes INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Si la table existait déjà, ajouter la colonne pseudo :
ALTER TABLE public.contest_entries ADD COLUMN IF NOT EXISTS pseudo TEXT;
ALTER TABLE public.contest_entries ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE public.contest_entries ALTER COLUMN last_name DROP NOT NULL;

-- Activation de la sécurité RLS sur la table
ALTER TABLE public.contest_entries ENABLE ROW LEVEL SECURITY;

-- Suppression des anciennes politiques si existantes pour éviter les doublons
DROP POLICY IF EXISTS "Lecture publique des participants" ON public.contest_entries;
DROP POLICY IF EXISTS "Ajout public de participants" ON public.contest_entries;
DROP POLICY IF EXISTS "Vote public" ON public.contest_entries;

-- Politiques RLS pour la table
CREATE POLICY "Lecture publique des participants"
ON public.contest_entries FOR SELECT
TO public
USING (true);

CREATE POLICY "Ajout public de participants"
ON public.contest_entries FOR INSERT
TO public
WITH CHECK (true);

-- NOTE : La colonne `votes` de contest_entries n'est plus utilisée.
-- Le comptage se fait via COUNT(*) sur la table `votes`.
-- La politique UPDATE ci-dessus a été supprimée.

-- =========================================================================
-- 2. TABLE DES VOTES (SYSTÈME AUTH) — 1 vote par utilisateur par photo
-- =========================================================================
-- Recréation complète de la table votes avec ses politiques RLS
-- (à exécuter si la table n'existe pas encore ou si vous avez une erreur 403)
DROP TABLE IF EXISTS public.votes CASCADE;

CREATE TABLE public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES public.contest_entries(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT votes_user_entry_unique UNIQUE (user_id, entry_id)
);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Reset des politiques
DROP POLICY IF EXISTS "Lecture des votes utilisateur" ON public.votes;
DROP POLICY IF EXISTS "Lecture publique des votes" ON public.votes;
DROP POLICY IF EXISTS "Ajout d'un vote" ON public.votes;
DROP POLICY IF EXISTS "Suppression d'un vote" ON public.votes;

-- SELECT : lecture publique des votes, nécessaire pour que le compteur global
-- (votes(count)) soit identique pour tous les visiteurs. Le site filtre ensuite
-- par user_id pour savoir si l'utilisateur courant a voté.
CREATE POLICY "Lecture publique des votes"
ON public.votes FOR SELECT
TO public
USING (true);

-- INSERT : un utilisateur connecté peut voter (user_id doit correspondre à son uid)
CREATE POLICY "Ajout d'un vote"
ON public.votes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- DELETE : un utilisateur peut supprimer uniquement ses propres votes
CREATE POLICY "Suppression d'un vote"
ON public.votes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- =========================================================================
-- 3. CRÉATION DU BUCKET ET POLITIQUES STORAGE (POUR LES PHOTOS)
-- =========================================================================
-- Création automatique du bucket public 'movember-photos'
INSERT INTO storage.buckets (id, name, public)
VALUES ('movember-photos', 'movember-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Suppression des anciennes politiques storage si existantes
DROP POLICY IF EXISTS "Upload public des photos movember" ON storage.objects;
DROP POLICY IF EXISTS "Lecture publique des photos movember" ON storage.objects;

-- Autorisation d'upload anonyme (INSERT) pour le bucket movember-photos
CREATE POLICY "Upload public des photos movember"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'movember-photos');

-- Autorisation de lecture publique (SELECT) pour le bucket movember-photos
CREATE POLICY "Lecture publique des photos movember"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'movember-photos');
```

> **Base déjà en production ?** Le script ci-dessus supprime la table `votes` (`DROP TABLE`) et donc tous les votes existants. Pour corriger uniquement le compteur global sans perdre de données, exécutez seulement :
>
> ```sql
> DROP POLICY IF EXISTS "Lecture des votes utilisateur" ON public.votes;
> DROP POLICY IF EXISTS "Lecture publique des votes" ON public.votes;
> CREATE POLICY "Lecture publique des votes"
> ON public.votes FOR SELECT
> TO public
> USING (true);
> ```


---

## 🔑 Étape 2 : Vérification des clés dans `js/config.js`

Dans Supabase > **Project Settings** > **API** :
1. Copiez **Project URL** (attention : uniquement l'URL racine `https://xxxx.supabase.co`, sans `/rest/v1/`).
2. Copiez **Project API keys > `anon` `public`**.
3. Vérifiez qu'elles sont bien collées dans [`js/config.js`](js/config.js) :

```javascript
const SUPABASE_CONFIG = {
  SUPABASE_URL: 'https://votre-projet.supabase.co', // SANS /rest/v1/ à la fin
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  STORAGE_BUCKET: 'movember-photos',
  TABLE_NAME: 'contest_entries'
};

window.SUPABASE_CONFIG = SUPABASE_CONFIG;
```

---

## 🔐 Étape 3 : Activer l'Authentification Email dans Supabase

1. Dans Supabase > **Authentication** > **Providers**, vérifiez que **Email** est activé.
2. Dans **Authentication** > **Settings**, vous pouvez désactiver la confirmation par email pour les tests (option "Confirm email").
3. Pour la production, laissez la confirmation par email activée.

---

## 🧪 Étape 4 : Test & Vérification

1. Ouvrez `concours.html` dans le navigateur.
2. Ouvrez la console (`F12` > Console) : vous verrez `✅ Supabase (contest) : réutilise l'instance auth.`
3. Cliquez sur **"Se connecter"** dans la navbar → la modale s'ouvre.
4. Créez un compte via l'onglet "S'inscrire", puis connectez-vous.
5. Le formulaire de dépôt photo devient accessible une fois connecté.
6. Soumettez une photo — la galerie se rafraîchit automatiquement.
7. Cliquez sur **"Voter"** → vote enregistré en BDD dans la table `votes`.
8. Recliquez → vote retiré (toggle).
9. En étant déconnecté, cliquer sur "Voter" ouvre directement la modale de connexion.
