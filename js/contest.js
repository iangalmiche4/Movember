/**
 * ==========================================================================
 * CONTEST.JS - GESTION DU CONCOURS DE LA MOUSTACHE & VOTES
 * Supabase Cloud Storage & Database avec Système de Vote Toggle (Ajouter/Retirer)
 * ==========================================================================
 */

const STORAGE_KEY_CONTEST = 'movember_contest_entries_v1';
const STORAGE_KEY_VOTES = 'movember_user_voted_entries_v1';


let supabaseClient = null;
let isSupabaseActive = false;

document.addEventListener('DOMContentLoaded', async () => {
  // Garde : ne s'exécute que sur les pages contenant les éléments du concours
  const galleryElem = document.getElementById('contestGallery');
  const formElem = document.getElementById('contestUploadForm');
  if (!galleryElem && !formElem) {
    return;
  }

  initSupabaseClient();
  await loadAndRenderGallery();
  initCardLightbox();
  initUploadForm();
  initUploadFormAuthGate();
  _updateUploadCardTitle();
});

/**
 * Initialisation du client Supabase
 */
function initSupabaseClient() {
  // Réutilise l'instance créée par auth.js si disponible
  if (window._supabaseClient) {
    supabaseClient = window._supabaseClient;
    isSupabaseActive = true;
    console.log('✅ Supabase (contest) : réutilise l\'instance auth.');
    return;
  }
  const cfg = window.SUPABASE_CONFIG;
  if (window.supabase && cfg && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_URL.startsWith('http') && !cfg.SUPABASE_URL.includes('votre-identifiant')) {
    try {
      const cleanUrl = cfg.SUPABASE_URL
        .trim()
        .replace(/\/rest\/v1\/?$/i, '')
        .replace(/\/+$/, '');

      supabaseClient = window.supabase.createClient(cleanUrl, cfg.SUPABASE_ANON_KEY.trim());
      isSupabaseActive = true;
      console.log(`✅ Supabase connecté avec succès (${cleanUrl}) : Mode Cloud actif.`);
    } catch (err) {
      console.error('❌ Échec d\'initialisation Supabase:', err);
      isSupabaseActive = false;
    }
  } else {
    console.warn('⚠️ Supabase non configuré dans js/config.js. Fonctionnement en mode local (démo).');
    isSupabaseActive = false;
  }
}

/**
 * Récupération des données depuis Supabase.
 * Le total global des votes de chaque photo vient d'une jointure sur la table
 * `votes` (`votes(count)`). Cela suppose que la politique RLS SELECT de `votes`
 * soit publique (voir SUPABASE_SETUP.md), sinon chaque utilisateur ne compte
 * que ses propres votes.
 */
async function fetchEntries() {
  if (isSupabaseActive && supabaseClient) {
    try {
      const { data: entries, error: entriesErr } = await supabaseClient
        .from(window.SUPABASE_CONFIG.TABLE_NAME)
        .select('id, pseudo, photo_url, created_at, votes(count)')
        .order('created_at', { ascending: false });

      if (entriesErr) {
        console.error('❌ Erreur chargement des participants:', entriesErr);
        if (window.showToast) window.showToast(`Erreur base de données : ${entriesErr.message}`, 'warning');
        return [];
      }

      return (entries || []).map(item => ({
        id: item.id,
        pseudo: item.pseudo || 'Anonyme',
        photoUrl: item.photo_url,
        votes: (item.votes && item.votes[0] && item.votes[0].count) || 0,
        date: item.created_at ? new Date(item.created_at).toLocaleDateString('fr-FR') : 'Aujourd\'hui'
      }));

    } catch (err) {
      console.error('❌ Exception Supabase fetchEntries:', err);
      return [];
    }
  }

  return getLocalEntries();
}

function getLocalEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONTEST);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY_CONTEST, JSON.stringify(entries));
  } catch (e) {
    console.error('Erreur stockage local:', e);
  }
}

/**
 * Gestion des votes
 * - Mode Supabase + auth : table `votes` (user_id, entry_id)
 * - Mode local / démo : localStorage
 */

/**
 * Récupère la liste des entry_id votés par l'utilisateur connecté.
 * Retourne un tableau d'ids (strings).
 */
async function getUserVotes() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (isSupabaseActive && supabaseClient && user) {
    try {
      const { data, error } = await supabaseClient
        .from('votes')
        .select('entry_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map(r => String(r.entry_id));
    } catch (err) {
      console.warn('⚠️ Impossible de récupérer les votes Supabase, fallback localStorage:', err);
    }
  }
  // Fallback localStorage (mode démo ou non connecté)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOTES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function recordUserVote(id) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (isSupabaseActive && supabaseClient && user) {
    const { error } = await supabaseClient.from('votes').insert({ user_id: user.id, entry_id: id });
    // 23505 = vote déjà existant (contrainte unique) : considéré comme réussi
    if (error && error.code !== '23505') throw error;
    return;
  }
  // Fallback localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOTES);
    const votes = raw ? JSON.parse(raw) : [];
    if (!votes.includes(id)) {
      votes.push(id);
      localStorage.setItem(STORAGE_KEY_VOTES, JSON.stringify(votes));
    }
  } catch (e) {}
}

async function removeUserVote(id) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (isSupabaseActive && supabaseClient && user) {
    const { error } = await supabaseClient.from('votes').delete().eq('user_id', user.id).eq('entry_id', id);
    if (error) throw error;
    return;
  }
  // Fallback localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOTES);
    const votes = (raw ? JSON.parse(raw) : []).filter(v => v !== id);
    localStorage.setItem(STORAGE_KEY_VOTES, JSON.stringify(votes));
  } catch (e) {}
}

// Animation d'apparition (AOS) : appliquée uniquement au chargement initial de la
// galerie, pas à chaque re-rendu (vote), pour éviter que les cartes clignotent.
let _galleryFirstRenderAt = 0;
// Id de la participation qui vient de recevoir un vote (pour l'animation du cœur)
let _pulseEntryId = null;

/**
 * Rebond du cœur de vote (Animate.css)
 */
function _pulseHeart(el) {
  if (!el) return;
  const cls = ['animate__animated', 'animate__bounceIn'];
  el.classList.remove(...cls);
  void el.getBoundingClientRect(); // force le recalcul pour relancer l'animation
  el.classList.add(...cls);
  el.addEventListener('animationend', () => el.classList.remove(...cls), { once: true });
}

/**
 * Affichage / Rendu dynamique de la galerie
 */
async function loadAndRenderGallery() {
  const gallery = document.getElementById('contestGallery');
  const countBadge = document.getElementById('contestCountBadge');
  if (!gallery) return;

  const entries = await fetchEntries();
  const userVotes = await getUserVotes();

  if (countBadge) {
    countBadge.textContent = `${entries.length} participant${entries.length > 1 ? 's' : ''}`;
  }

  if (entries.length === 0) {
    gallery.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--color-bg-card); border-radius: var(--radius-md); border: var(--border-subtle);">
        <p style="font-size: 1.1rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 0.5rem;">Aucune moustache déposée pour l'instant !</p>
        <p style="font-size: 0.875rem; color: var(--color-text-muted);">Soyez le tout premier candidat à participer au grand concours.</p>
      </div>
    `;
    return;
  }

  // Tri par votes décroissants
  const sorted = [...entries].sort((a, b) => b.votes - a.votes);

  // AOS n'est ajouté que si la bibliothèque est chargée (sinon les cartes resteraient invisibles)
  // et seulement pendant la phase de chargement initial.
  if (!_galleryFirstRenderAt) _galleryFirstRenderAt = Date.now();
  const useAos = !!window.AOS && (Date.now() - _galleryFirstRenderAt < 2500);
  const pulseId = _pulseEntryId;
  _pulseEntryId = null;

  gallery.innerHTML = sorted.map((entry, index) => {
    const hasVoted = userVotes.includes(entry.id);
    const isLeader = index === 0 && entry.votes > 0;
    const initial = escapeHtml((Array.from((entry.pseudo || '?').trim())[0] || '?').toUpperCase());
    const heartAnim = entry.id === pulseId ? ' animate__animated animate__bounceIn' : '';

    return `
      <article class="contest-card ${isLeader ? 'leader-card' : ''}" data-id="${entry.id}" tabindex="0" aria-label="Agrandir la photo de ${escapeHtml(entry.pseudo)}"${useAos ? ' data-aos="fade-up"' : ''}>
        <header class="contest-card-header">
          <span class="contest-avatar" aria-hidden="true">${initial}</span>
          <div class="contest-participant-info">
            <h4 class="contest-participant-name">${escapeHtml(entry.pseudo)}</h4>
            <span class="contest-participant-tag">Candidat officiel</span>
          </div>
        </header>
        <div class="contest-img-wrapper">
          ${isLeader ? '<div class="leader-badge">★ En tête du vote</div>' : ''}
          <img src="${escapeHtml(entry.photoUrl)}" alt="Moustache de ${escapeHtml(entry.pseudo)}" loading="lazy" class="contest-img" onerror="this.src='https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80'" />
        </div>
        <footer class="contest-card-footer">
          <div class="contest-card-actions">
            <button class="btn-vote ${hasVoted ? 'voted' : ''}" onclick="handleVote('${entry.id}')" aria-label="${hasVoted ? 'Retirer mon vote pour ' : 'Voter pour '}${escapeHtml(entry.pseudo)}" title="${hasVoted ? 'Cliquez pour retirer votre vote' : (typeof getCurrentUser === 'function' && getCurrentUser() ? 'Cliquez pour voter' : 'Connectez-vous pour voter')}">
              <svg class="heart-icon${heartAnim}" viewBox="0 0 24 24" fill="${hasVoted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              <span>${hasVoted ? 'Voté !' : 'Voter'}</span>
              <span class="vote-count" id="vote-count-${entry.id}">${entry.votes}</span>
            </button>
          </div>
        </footer>
      </article>
    `;
  }).join('');

  // Les cartes sont créées dynamiquement : AOS doit réanalyser le DOM
  if (window.AOS) window.AOS.refreshHard();
}

/**
 * Agrandissement d'une carte au clic.
 * Un clic n'importe où (ou la touche Échap) ferme la vue agrandie et ramène à la galerie.
 * Délégation d'événement sur la galerie : fonctionne malgré les re-rendus (votes).
 */
function initCardLightbox() {
  const gallery = document.getElementById('contestGallery');
  if (!gallery || gallery.dataset.lightboxBound) return;
  gallery.dataset.lightboxBound = '1';

  let overlay = null;

  function closeLightbox() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
  }

  // Échap uniquement : Entrée/Espace ouvrent la vue, les réutiliser pour fermer
  // la refermerait immédiatement (même événement clavier).
  function onKeydown(e) {
    if (e.key === 'Escape') closeLightbox();
  }

  function openLightbox(card) {
    const img = card.querySelector('.contest-img');
    if (!img) return;

    const pseudo = card.querySelector('.contest-participant-name')?.textContent || '';
    const votes = card.querySelector('.vote-count')?.textContent || '0';
    const hasVoted = !!card.querySelector('.btn-vote.voted');

    overlay = document.createElement('div');
    overlay.className = 'card-lightbox animate__animated animate__fadeIn animate__faster';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Photo de ${pseudo}`);

    const box = document.createElement('div');
    box.className = 'card-lightbox-box animate__animated animate__zoomIn animate__faster';

    const photo = document.createElement('img');
    photo.className = 'card-lightbox-img';
    photo.src = img.currentSrc || img.src;
    photo.alt = img.alt;

    const info = document.createElement('div');
    info.className = 'card-lightbox-info';

    const name = document.createElement('span');
    name.className = 'card-lightbox-name';
    name.textContent = pseudo;

    const count = document.createElement('span');
    count.className = 'card-lightbox-votes' + (hasVoted ? ' voted' : '');
    count.textContent = `${hasVoted ? '❤️' : '♡'} ${votes} vote${Number(votes) > 1 ? 's' : ''}`;

    const hint = document.createElement('span');
    hint.className = 'card-lightbox-hint';
    hint.textContent = 'Touchez n\'importe où pour revenir à la galerie';

    info.append(name, count);
    box.append(photo, info, hint);
    overlay.append(box);

    // Un clic n'importe où, y compris sur la photo, ferme la vue
    overlay.addEventListener('click', closeLightbox);

    document.body.append(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
  }

  gallery.addEventListener('click', (e) => {
    // Le bouton de vote garde son propre comportement
    if (e.target.closest('.btn-vote')) return;
    const card = e.target.closest('.contest-card');
    if (card) openLightbox(card);
  });

  // Accessibilité clavier : Entrée / Espace sur une carte focalisée
  gallery.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('contest-card')) {
      e.preventDefault();
      openLightbox(e.target);
    }
  });
}

// Garde pour éviter les doubles clics pendant qu'une requête de vote est en cours
const _votingInProgress = new Set();

/**
 * Mise à jour immédiate du bouton et du compteur (+1 / -1) sans rechargement.
 * La galerie est ensuite re-synchronisée avec les totaux réels de la base.
 */
function _updateVoteButtonDom(entryId, voted) {
  const btn = document.querySelector(`.btn-vote[onclick="handleVote('${entryId}')"]`);
  if (!btn) return;
  btn.classList.toggle('voted', voted);
  const heart = btn.querySelector('svg');
  heart?.setAttribute('fill', voted ? 'currentColor' : 'none');
  if (voted) {
    _pulseHeart(heart);
    _pulseEntryId = entryId; // rejoue le rebond après le re-rendu de la galerie
  }
  const label = btn.querySelector('span:not(.vote-count)');
  if (label) label.textContent = voted ? 'Voté !' : 'Voter';
  const countEl = document.getElementById(`vote-count-${entryId}`);
  if (countEl) {
    const current = parseInt(countEl.textContent, 10) || 0;
    countEl.textContent = Math.max(0, current + (voted ? 1 : -1));
  }
}

/**
 * Système TOGGLE de Vote (Ajouter / Retirer un vote)
 * Nécessite d'être connecté. Ouvre la modale sinon.
 */
window.handleVote = async function(entryId) {
  // Vérification authentification
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) {
    if (window.showToast) window.showToast('Connectez-vous pour voter !', 'warning');
    if (typeof openAuthModal === 'function') openAuthModal('signin');
    return;
  }

  // Bloquer si un vote est déjà en cours pour cette entrée
  if (_votingInProgress.has(entryId)) return;
  _votingInProgress.add(entryId);

  // Désactiver visuellement le bouton immédiatement
  const btn = document.querySelector(`.btn-vote[onclick="handleVote('${entryId}')"]`);
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

  try {
    const userVotes = await getUserVotes();
    const isCurrentlyVoted = userVotes.includes(String(entryId));

    if (isSupabaseActive && supabaseClient) {
      // Récupérer juste le pseudo pour le toast
      const { data: currentEntry, error: fetchErr } = await supabaseClient
        .from(window.SUPABASE_CONFIG.TABLE_NAME)
        .select('pseudo')
        .eq('id', entryId)
        .single();

      if (fetchErr || !currentEntry) {
        console.error('❌ Erreur récupération du participant:', fetchErr);
        if (window.showToast) window.showToast('Impossible d\'enregistrer votre vote.', 'warning');
        return;
      }

      // Insert ou delete dans la table votes — le compteur est déduit automatiquement
      const displayName = currentEntry.pseudo || 'ce participant';
      if (isCurrentlyVoted) {
        await removeUserVote(entryId);
        _updateVoteButtonDom(entryId, false);
        if (window.showToast) window.showToast(`Vote retiré pour ${displayName}.`, 'info');
      } else {
        await recordUserVote(entryId);
        _updateVoteButtonDom(entryId, true);
        if (window.showToast) window.showToast(`❤️ Vote enregistré pour ${displayName} ! Merci !`, 'success');
      }

    } else {
      // Mode local de secours
      const entries = getLocalEntries();
      const entry = entries.find(e => e.id === entryId);
      if (entry) {
        const displayName = entry.pseudo || 'ce participant';
        if (isCurrentlyVoted) {
          entry.votes = Math.max(0, (entry.votes || 0) - 1);
          await removeUserVote(entryId);
          if (window.showToast) window.showToast(`Vote retiré pour ${displayName}.`, 'info');
        } else {
          entry.votes = (entry.votes || 0) + 1;
          await recordUserVote(entryId);
          if (window.showToast) window.showToast(`❤️ Vote enregistré pour ${displayName} ! Merci !`, 'success');
        }
        saveLocalEntries(entries);
      }
    }
  } catch (err) {
    console.error('❌ Exception handleVote:', err);
    if (window.showToast) window.showToast('Erreur inattendue lors du vote.', 'warning');
  } finally {
    // Toujours libérer le verrou et re-rendre la galerie (bouton dans le bon état)
    _votingInProgress.delete(entryId);
    await loadAndRenderGallery();
  }
};

/**
 * Formulaire de dépôt de candidature photo avec vérification stricte
 */
function initUploadForm() {
  const form = document.getElementById('contestUploadForm');
  const fileInput = document.getElementById('photoInput');
  const dropZone = document.getElementById('dropZone');
  const previewContainer = document.getElementById('photoPreviewContainer');
  const previewImg = document.getElementById('photoPreview');
  const removeBtn = document.getElementById('removePhotoBtn');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  if (!form || !fileInput) return;

  let currentImageDataUrl = '';
  let currentFileBlob = null;

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      if (window.showToast) window.showToast('Veuillez sélectionner une image valide (JPG, PNG).', 'warning');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      if (window.showToast) window.showToast('L\'image est trop volumineuse (max 10 Mo).', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      compressImage(e.target.result, 800, 800, 0.85, (compressedUrl, blob) => {
        currentImageDataUrl = compressedUrl;
        currentFileBlob = blob;
        if (previewImg && previewContainer && dropZone) {
          previewImg.src = compressedUrl;
          previewContainer.style.display = 'block';
          dropZone.style.display = 'none';
        }
      });
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  // Drag and drop
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-active');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      currentImageDataUrl = '';
      currentFileBlob = null;
      fileInput.value = '';
      if (previewContainer && dropZone) {
        previewContainer.style.display = 'none';
        dropZone.style.display = 'flex';
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Récupère le pseudo depuis le compte connecté
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const pseudo = user?.user_metadata?.pseudo
      || user?.email?.split('@')[0]
      || 'Anonyme';

    if (!currentImageDataUrl || !currentFileBlob) {
      if (window.showToast) window.showToast('Veuillez ajouter une photo de votre moustache !', 'warning');
      return;
    }

    // Indicateur visuel de chargement
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
        </svg>
        <span>Envoi en cours sur le Cloud...</span>
      `;
    }

    let finalPhotoUrl = '';

    // =========================================================================
    // CAS 1 : SUPABASE EST CONFIGURÉ ET ACTIF
    // =========================================================================
    if (isSupabaseActive && supabaseClient) {
      try {
        const timestamp = Date.now();
        const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().replace(/-/g, '').substring(0, 10)
          : Math.random().toString(36).substring(2, 10);
        
        const fileName = `${timestamp}-${uniqueId}.jpg`;
        const filePath = fileName;

        console.log(`📤 [1/2] Téléversement de l'image vers Supabase Storage (${window.SUPABASE_CONFIG.STORAGE_BUCKET}/${filePath})...`);

        // ÉTAPE 1 : Upload de l'image dans le Storage Supabase
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from(window.SUPABASE_CONFIG.STORAGE_BUCKET)
          .upload(filePath, currentFileBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('❌ ERREUR SUPABASE STORAGE (Upload refusé) :', uploadError);
          const errorMsg = uploadError.message || JSON.stringify(uploadError);
          if (window.showToast) {
            window.showToast(`Échec upload photo : ${errorMsg}`, 'warning');
          }
          alert(`Erreur Supabase Storage : ${errorMsg}\n\nVérifiez que le bucket "${window.SUPABASE_CONFIG.STORAGE_BUCKET}" est bien créé en mode Public et que la police INSERT est active.`);
          resetSubmitButton();
          return;
        }

        console.log('✅ [1/2] Photo uploadée avec succès sur Supabase Storage:', uploadData);

        // ÉTAPE 2 : Récupération de l'URL publique de l'image
        const { data: publicUrlData } = supabaseClient.storage
          .from(window.SUPABASE_CONFIG.STORAGE_BUCKET)
          .getPublicUrl(filePath);

        if (!publicUrlData || !publicUrlData.publicUrl) {
          console.error('❌ Impossible de générer l\'URL publique de l\'image.');
          if (window.showToast) window.showToast('Erreur génération lien image.', 'warning');
          resetSubmitButton();
          return;
        }

        finalPhotoUrl = publicUrlData.publicUrl;
        console.log(`🔗 [2/2] URL publique obtenue : ${finalPhotoUrl}`);

        // ÉTAPE 3 : Insertion dans la table SQL contest_entries (Initialisé à 0 votes)
        console.log('📝 Insertion des informations du candidat dans la table contest_entries...');
        const { data: insertedData, error: dbError } = await supabaseClient
          .from(window.SUPABASE_CONFIG.TABLE_NAME)
          .insert([
            {
              pseudo: pseudo,
              photo_url: finalPhotoUrl,
              votes: 0
            }
          ])
          .select();

        if (dbError) {
          console.error('❌ ERREUR SUPABASE BDD (Insertion SQL refusée) :', dbError);
          const errorMsg = dbError.message || JSON.stringify(dbError);
          if (window.showToast) {
            window.showToast(`Échec enregistrement BDD : ${errorMsg}`, 'warning');
          }
          alert(`Erreur Base de Données : ${errorMsg}\n\nSi vous aviez créé la table avec first_name/last_name, exécutez dans le SQL Editor :\nALTER TABLE public.contest_entries ADD COLUMN IF NOT EXISTS pseudo TEXT;`);
          resetSubmitButton();
          return;
        }

        console.log('✅ Candidat enregistré avec succès dans Supabase :', insertedData);
        // NOTE : On ne marque PAS la participation comme votée par défaut pour l'auteur

      } catch (exception) {
        console.error('❌ Exception inattendue lors de l\'envoi Supabase :', exception);
        if (window.showToast) {
          window.showToast(`Erreur inattendue : ${exception.message || exception}`, 'warning');
        }
        resetSubmitButton();
        return;
      }
    } else {
      // =========================================================================
      // CAS 2 : MODE LOCAL DE SECOURS (LocalStorage)
      // =========================================================================
      console.log('💾 Enregistrement en mode LocalStorage...');
      finalPhotoUrl = currentImageDataUrl;

      const newEntry = {
        id: 'entry-' + Date.now(),
        pseudo: pseudo,
        photoUrl: finalPhotoUrl,
        votes: 0,
        date: 'À l\'instant'
      };

      const entries = getLocalEntries();
      entries.unshift(newEntry);
      saveLocalEntries(entries);
    }

    // =========================================================================
    // SUCCÈS CONFIRMÉ : Nettoyage du formulaire et rafraîchissement immédiat
    // =========================================================================
    form.reset();
    currentImageDataUrl = '';
    currentFileBlob = null;
    fileInput.value = '';

    if (previewContainer && dropZone) {
      previewContainer.style.display = 'none';
      dropZone.style.display = 'flex';
    }

    resetSubmitButton();

    // Rechargement immédiat des données depuis Supabase pour mettre à jour la galerie
    await loadAndRenderGallery();

    if (window.showToast) {
      window.showToast(`🎉 Félicitations ${pseudo} ! Votre moustache a été publiée avec succès.`, 'success');
    }

    const gallerySection = document.getElementById('contestGalleryAnchor');
    if (gallerySection) {
      gallerySection.scrollIntoView({ behavior: 'smooth' });
    }

    function resetSubmitButton() {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>Publier ma candidature</span>
        `;
      }
    }
  });
}

/**
 * Gate le formulaire de dépôt derrière l'authentification.
 * Affiche un message et masque le formulaire si non connecté.
 */
function initUploadFormAuthGate() {
  const form = document.getElementById('contestUploadForm');
  if (!form) return;

  function updateFormGate() {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    let gateEl = document.getElementById('uploadAuthGate');

    if (!user) {
      // Masquer le formulaire, afficher l'invite de connexion
      form.style.display = 'none';
      if (!gateEl) {
        gateEl = document.createElement('div');
        gateEl.id = 'uploadAuthGate';
        gateEl.className = 'upload-auth-gate';
        gateEl.innerHTML = `
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <p class="gate-title">Connectez-vous pour concourir !</p>
          <p class="gate-hint">
            Pas de vraie adresse ? Utilisez une adresse <strong>factice</strong> (ex&nbsp;: <code>pseudo@movember.fr</code>).<br>
            Mot de passe&nbsp;: <strong>4 caractères minimum</strong> — c'est tout ce qu'il faut&nbsp;!
          </p>
          <button class="btn btn-primary" id="gateLoginBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Se connecter / S'inscrire
          </button>
        `;
        form.parentNode.insertBefore(gateEl, form);
      }
      gateEl.style.display = 'flex';
      document.getElementById('gateLoginBtn')?.addEventListener('click', () => {
        if (typeof openAuthModal === 'function') openAuthModal('signin');
      });
    } else {
      // Afficher le formulaire
      form.style.display = '';
      if (gateEl) gateEl.style.display = 'none';
    }
  }

  updateFormGate();

  // Ré-évaluer à chaque changement d'état auth
  if (window._supabaseClient) {
    window._supabaseClient.auth.onAuthStateChange(() => updateFormGate());
  }
}

/**
 * Compression client-side d'image
 */
function compressImage(src, maxWidth, maxHeight, quality, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    canvas.toBlob((blob) => {
      callback(dataUrl, blob);
    }, 'image/jpeg', quality);
  };
  img.src = src;
}

/**
 * Met à jour le titre de la carte upload avec le prénom de l'utilisateur connecté.
 * Se re-déclenche aussi à chaque changement de session.
 */
function _updateUploadCardTitle() {
  const titleEl = document.getElementById('uploadCardTitle');
  if (!titleEl) return;

  function setTitle() {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const pseudo = user?.user_metadata?.pseudo || user?.email?.split('@')[0] || null;
    titleEl.textContent = pseudo ? `Salut ${pseudo}, dépose ta photo 📸` : 'Dépose ta photo 📸';
  }

  setTitle();

  // Ré-évaluer si la session change (ex: refresh de token)
  if (window._supabaseClient) {
    window._supabaseClient.auth.onAuthStateChange(() => setTitle());
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
