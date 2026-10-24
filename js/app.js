/**
 * ==========================================================================
 * APP.JS - POINT D'ENTRÉE & LOGIQUE GLOBALE MULTI-PAGES
 * Saint Loup a de la moustache - Édition Movember
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // Animations au scroll (AOS, chargé via CDN) — ignoré si le CDN est indisponible
  if (window.AOS) {
    window.AOS.init({ duration: 600, once: true });
  }
  initMobileNavigation();
  initScrollSpy();
  // Authentification Supabase (toutes les pages)
  if (typeof initAuth === 'function') {
    initAuth();
  }
});

/**
 * Gestion du menu burger mobile
 */
function initMobileNavigation() {
  const menuToggle = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNav');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  if (!menuToggle || !mobileNav) return;

  function toggleMenu() {
    const isOpen = mobileNav.classList.toggle('is-open');
    menuToggle.classList.toggle('is-active', isOpen);
    menuToggle.setAttribute('aria-expanded', isOpen.toString());
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  function closeMenu() {
    mobileNav.classList.remove('is-open');
    menuToggle.classList.remove('is-active');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  menuToggle.addEventListener('click', toggleMenu);

  mobileLinks.forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

/**
 * Mise en surbrillance automatique des sections au scroll (si ancres présentes)
 */
function initScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const internalAnchorLinks = document.querySelectorAll('.nav-link[href^="#"], .nav-link[href^="index.html#"]');

  if (!sections.length || !internalAnchorLinks.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const currentId = entry.target.getAttribute('id');
        internalAnchorLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href === `#${currentId}` || href === `index.html#${currentId}`) {
            link.classList.add('active');
          } else if (href.includes('#')) {
            link.classList.remove('active');
          }
        });
      }
    });
  }, {
    threshold: 0.25,
    rootMargin: "-20% 0px -50% 0px"
  });

  sections.forEach(section => observer.observe(section));
}

/**
 * Utilitaire global d'affichage des notifications Toast
 * @param {string} message - Texte de la notification
 * @param {string} type - 'success' | 'info' | 'warning'
 */
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="color: var(--color-accent-cyan); flex-shrink: 0;">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
};
