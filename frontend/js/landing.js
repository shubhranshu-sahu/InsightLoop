/**
 * InsightLoop — Landing Page Interactions
 * =========================================
 * Handles:
 *   - Lucide icon initialization
 *   - Navbar scroll effect
 *   - Scroll reveal animations (staggered for cards/steps)
 *   - Animated stats counter
 *   - Mouse glow on feature cards
 *   - Smooth anchor scroll
 */


// ── Lucide icons ────────────────────────────────────────────────────────────
if (window.lucide) {
  window.lucide.createIcons();
}


// ── Navbar scroll effect ─────────────────────────────────────────────────────

const nav = document.querySelector('.landing-nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
}


// ── Scroll reveal (generic) ───────────────────────────────────────────────────
// Elements with class "reveal" animate in when entering the viewport.

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('active');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));


// ── Staggered reveal for feature cards ───────────────────────────────────────

const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      // Find index among siblings for stagger offset
      const siblings = [...entry.target.parentElement.children];
      const i = siblings.indexOf(entry.target);
      setTimeout(() => entry.target.classList.add('active'), i * 90);
      cardObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .step').forEach(el => {
  el.classList.add('reveal');
  cardObserver.observe(el);
});


// ── Animated stats counter ────────────────────────────────────────────────────
// Counts up from 0 to data-target when the stats strip enters viewport.

function animateCounter(el, target, duration = 1800) {
  const start = performance.now();
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target);
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = target;
  };
  requestAnimationFrame(update);
}

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.stat-number[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target, 10);
        animateCounter(el, target);
      });
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });

const statsStrip = document.querySelector('.stats-strip');
if (statsStrip) statsObserver.observe(statsStrip);


// ── Mouse glow on feature cards ───────────────────────────────────────────────

document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  });
});


// ── Smooth anchor scroll ──────────────────────────────────────────────────────

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});


// ── Smooth scroll for "See How It Works" on history state ────────────────────

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('ref') === 'how') {
  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  history.replaceState(null, '', window.location.pathname);
}
