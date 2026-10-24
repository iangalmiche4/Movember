/**
 * ==========================================================================
 * AUTH.JS - AUTHENTIFICATION SUPABASE (EMAIL + MOT DE PASSE)
 * Gestion connexion / inscription / déconnexion + mise à jour UI
 * ==========================================================================
 */

// État de session courant
let currentUser = null;

/**
 * Initialise le système d'authentification sur toutes les pages.
 * À appeler depuis app.js après DOMContentLoaded.
 */
function initAuth() {
  const cfg = window.SUPABASE_CONFIG;
  const isLoginPage = (window.location.pathname.split('/').pop() || 'index.html') === 'login.html';

  if (!window.supabase || !cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('votre-identifiant')) {
    // Supabase non configuré : mode démo — on affiche le notice sur login.html
    if (isLoginPage) {
      const notice = document.getElementById('demoNotice');
      if (notice) notice.style.display = '';
      _bindLoginPage();
    } else {
      renderAuthButton(null);
    }
    return;
  }

  // Crée (ou réutilise) le client Supabase
  window._supabaseClient = window._supabaseClient || window.supabase.createClient(
    cfg.SUPABASE_URL.trim().replace(/\/+$/, ''),
    cfg.SUPABASE_ANON_KEY.trim()
  );

  if (isLoginPage) {
    // Sur login.html : si déjà connecté → aller sur index.html
    window._supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.replace('index.html');
      }
    });
    _bindLoginPage();
    return;
  }

  // Pages protégées : écoute les changements de session
  window._supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    renderAuthButton(currentUser);
    // Si la galerie est présente, la re-rendre pour mettre à jour les boutons de vote
    if (typeof loadAndRenderGallery === 'function') {
      loadAndRenderGallery();
    }
  });

  // Récupère la session existante au chargement
  window._supabaseClient.auth.getSession().then(({ data }) => {
    currentUser = data.session ? data.session.user : null;
    renderAuthButton(currentUser);
  });

  // Bindings modale (pages qui en ont encore une)
  _bindAuthModal();
}

/**
 * Retourne l'utilisateur connecté (ou null)
 */
function getCurrentUser() {
  return currentUser;
}

/**
 * Met à jour le bouton dans la navbar selon l'état de connexion
 */
function renderAuthButton(user) {
  const slot = document.getElementById('authNavSlot');
  const slotMobile = document.getElementById('authNavSlotMobile');
  if (!slot) return;

  if (user) {
    const email = user.email || '';
    const display = user.user_metadata?.pseudo || email.split('@')[0] || 'Moi';
    const avatarLetter = display.charAt(0).toUpperCase();

    const html = `
      <div class="auth-user-chip">
        <span class="auth-avatar">${avatarLetter}</span>
        <span class="auth-username">${escapeHtmlAuth(display)}</span>
        <button class="auth-signout-btn" id="signOutBtn" aria-label="Se déconnecter" title="Se déconnecter">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    `;
    slot.innerHTML = html;
    if (slotMobile) slotMobile.innerHTML = html;

    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    slotMobile?.querySelector('#signOutBtn')?.addEventListener('click', handleSignOut);
  } else {
    const html = `
      <button class="btn btn-auth btn-sm" id="openAuthModalBtn" aria-haspopup="dialog">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Se connecter</span>
      </button>
    `;
    slot.innerHTML = html;
    if (slotMobile) slotMobile.innerHTML = html;

    document.getElementById('openAuthModalBtn')?.addEventListener('click', openAuthModal);
    slotMobile?.querySelectorAll('#openAuthModalBtn')?.forEach(b => b.addEventListener('click', openAuthModal));
  }
}

/**
 * Ouvre la modale d'authentification (accessible depuis l'extérieur)
 */
function openAuthModal(tabOverride) {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('is-open');
  // Micro-interaction à l'ouverture (Animate.css, ignoré s'il n'est pas chargé)
  const dialog = modal.querySelector('.auth-modal');
  if (dialog) {
    const cls = ['animate__animated', 'animate__fadeInUp', 'animate__faster'];
    dialog.classList.remove(...cls);
    void dialog.offsetWidth; // relance l'animation à chaque ouverture
    dialog.classList.add(...cls);
    dialog.addEventListener('animationend', () => dialog.classList.remove(...cls), { once: true });
  }
  document.body.style.overflow = 'hidden';
  if (tabOverride === 'signup') {
    _switchTab('signup');
  } else {
    _switchTab('signin');
  }
  modal.querySelector('#authEmailInput')?.focus();
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  document.body.style.overflow = '';
  _clearAuthErrors();
}

function _switchTab(tab) {
  const signinTab = document.getElementById('tabSignin');
  const signupTab = document.getElementById('tabSignup');
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  if (!signinTab) return;
  if (tab === 'signup') {
    signupTab.classList.add('active');
    signinTab.classList.remove('active');
    signupForm.style.display = 'flex';
    signinForm.style.display = 'none';
  } else {
    signinTab.classList.add('active');
    signupTab.classList.remove('active');
    signinForm.style.display = 'flex';
    signupForm.style.display = 'none';
  }
  _clearAuthErrors();
}

function _clearAuthErrors() {
  document.querySelectorAll('.auth-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
}

function _showAuthError(formId, message) {
  const errEl = document.querySelector(`#${formId} .auth-error`);
  if (errEl) { errEl.textContent = message; errEl.style.display = 'block'; }
}

function _setAuthLoading(formId, loading) {
  const btn = document.querySelector(`#${formId} .auth-submit-btn`);
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
  btn.innerHTML = loading
    ? '<span class="auth-spinner"></span><span>Chargement…</span>'
    : btn.dataset.originalText;
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('authEmailInput')?.value.trim();
  const password = document.getElementById('authPasswordInput')?.value;
  if (!email || !password) return _showAuthError('signinForm', 'Veuillez remplir tous les champs.');

  _setAuthLoading('signinForm', true);
  const { error } = await window._supabaseClient.auth.signInWithPassword({ email, password });
  _setAuthLoading('signinForm', false);

  if (error) {
    const msg = error.message.includes('Invalid login') ? 'Email ou mot de passe incorrect.' : error.message;
    return _showAuthError('signinForm', msg);
  }
  // Connexion réussie → redirection vers l'accueil si on est sur login.html
  const isLoginPage = (window.location.pathname.split('/').pop() || 'index.html') === 'login.html';
  if (isLoginPage) {
    window.location.replace('index.html');
    return;
  }
  closeAuthModal();
  if (window.showToast) window.showToast('Connexion réussie ! Bienvenue.', 'success');
}

async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById('signupEmailInput')?.value.trim();
  const password = document.getElementById('signupPasswordInput')?.value;
  const pseudo = document.getElementById('signupPseudoInput')?.value.trim();

  if (!email || !password || !pseudo) return _showAuthError('signupForm', 'Veuillez remplir tous les champs.');
  if (password.length < 6) return _showAuthError('signupForm', 'Le mot de passe doit faire au moins 6 caractères.');

  _setAuthLoading('signupForm', true);
  const { error } = await window._supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { pseudo } }
  });
  _setAuthLoading('signupForm', false);

  if (error) return _showAuthError('signupForm', error.message);
  // Inscription réussie → si email confirmation désactivée, Supabase crée la session directement
  const isLoginPage = (window.location.pathname.split('/').pop() || 'index.html') === 'login.html';
  if (isLoginPage) {
    window.location.replace('index.html');
    return;
  }
  closeAuthModal();
  if (window.showToast) window.showToast('Inscription réussie ! Bienvenue.', 'success');
}

async function handleSignOut() {
  await window._supabaseClient.auth.signOut();
  // Après déconnexion, toujours revenir sur login.html
  window.location.replace('login.html');
}

function _bindAuthModal() {
  // Tabs
  document.getElementById('tabSignin')?.addEventListener('click', () => _switchTab('signin'));
  document.getElementById('tabSignup')?.addEventListener('click', () => _switchTab('signup'));

  // Fermeture
  document.getElementById('authModalClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModalOverlay')?.addEventListener('click', closeAuthModal);

  // Touche Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAuthModal();
  });

  // Formulaires
  document.getElementById('signinForm')?.addEventListener('submit', handleSignIn);
  document.getElementById('signupForm')?.addEventListener('submit', handleSignUp);

  // Liens switch de tab dans les formulaires
  document.getElementById('switchToSignup')?.addEventListener('click', (e) => { e.preventDefault(); _switchTab('signup'); });
  document.getElementById('switchToSignin')?.addEventListener('click', (e) => { e.preventDefault(); _switchTab('signin'); });
}

/**
 * Bindings spécifiques à la page login.html (formulaires pleine page, sans modale)
 */
function _bindLoginPage() {
  const tabSignin = document.getElementById('tabSignin');
  const tabSignup = document.getElementById('tabSignup');
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  const switchSigninText = document.getElementById('switchSigninText');
  const switchSignupText = document.getElementById('switchSignupText');

  function showTab(tab) {
    if (tab === 'signup') {
      tabSignup?.classList.add('active');
      tabSignin?.classList.remove('active');
      if (signupForm) signupForm.style.display = 'flex';
      if (signinForm) signinForm.style.display = 'none';
      if (switchSignupText) switchSignupText.style.display = '';
      if (switchSigninText) switchSigninText.style.display = 'none';
    } else {
      tabSignin?.classList.add('active');
      tabSignup?.classList.remove('active');
      if (signinForm) signinForm.style.display = 'flex';
      if (signupForm) signupForm.style.display = 'none';
      if (switchSigninText) switchSigninText.style.display = '';
      if (switchSignupText) switchSignupText.style.display = 'none';
    }
    // Efface les erreurs au changement d'onglet
    document.querySelectorAll('.login-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
  }

  tabSignin?.addEventListener('click', () => showTab('signin'));
  tabSignup?.addEventListener('click', () => showTab('signup'));
  document.getElementById('switchToSignup')?.addEventListener('click', (e) => { e.preventDefault(); showTab('signup'); });
  document.getElementById('switchToSignin')?.addEventListener('click', (e) => { e.preventDefault(); showTab('signin'); });

  // Helper erreur sur la page login (différents IDs des éléments dans la modale)
  function showLoginError(formId, msg) {
    const el = document.getElementById(formId === 'signinForm' ? 'signinError' : 'signupError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function setLoginLoading(btnId, loading, originalHtml) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="login-spinner"></span><span>Chargement…</span>' : originalHtml;
  }

  const signinBtnHtml = document.getElementById('signinSubmit')?.innerHTML || '';
  const signupBtnHtml = document.getElementById('signupSubmit')?.innerHTML || '';

  signinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmailInput')?.value.trim();
    const password = document.getElementById('authPasswordInput')?.value;
    if (!email || !password) return showLoginError('signinForm', 'Veuillez remplir tous les champs.');

    if (!window._supabaseClient) {
      // Mode démo : accès direct sans auth
      window.location.replace('index.html');
      return;
    }

    setLoginLoading('signinSubmit', true, signinBtnHtml);
    const { error } = await window._supabaseClient.auth.signInWithPassword({ email, password });
    setLoginLoading('signinSubmit', false, signinBtnHtml);
    if (error) {
      const msg = error.message.includes('Invalid login') ? 'Email ou mot de passe incorrect.' : error.message;
      return showLoginError('signinForm', msg);
    }
    window.location.replace('index.html');
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pseudo = document.getElementById('signupPseudoInput')?.value.trim();
    const email = document.getElementById('signupEmailInput')?.value.trim();
    const password = document.getElementById('signupPasswordInput')?.value;
    if (!pseudo || !email || !password) return showLoginError('signupForm', 'Veuillez remplir tous les champs.');
    if (password.length < 6) return showLoginError('signupForm', 'Le mot de passe doit faire au moins 6 caractères.');

    if (!window._supabaseClient) {
      window.location.replace('index.html');
      return;
    }

    setLoginLoading('signupSubmit', true, signupBtnHtml);
    const { error } = await window._supabaseClient.auth.signUp({
      email, password, options: { data: { pseudo } }
    });
    setLoginLoading('signupSubmit', false, signupBtnHtml);
    if (error) return showLoginError('signupForm', error.message);
    window.location.replace('index.html');
  });
}

// Utilitaire d'échappement HTML local
function escapeHtmlAuth(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Exports globaux
window.initAuth = initAuth;
window.getCurrentUser = getCurrentUser;
window.openAuthModal = openAuthModal;
