/**
 * InsightLoop — Landing Page Interactions
 * =========================================
 * Handles: navbar scroll effect, scroll reveal animations, and mouse glow.
 * No framework — pure vanilla JS.
 */

// ── Navbar scroll effect ────────────────────────────────────────────────────

const nav = document.querySelector('.landing-nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
}


// ── Scroll reveal animation ─────────────────────────────────────────────────
// Elements with class "reveal" fade in when they enter the viewport.

const revealElements = document.querySelectorAll('.reveal');

if (revealElements.length > 0) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target);  // Only animate once
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  });

  revealElements.forEach(el => observer.observe(el));
}


// ── Staggered reveal for feature cards ──────────────────────────────────────

const featureCards = document.querySelectorAll('.feature-card');
if (featureCards.length > 0) {
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger: each card fades in 100ms after the previous
        setTimeout(() => {
          entry.target.classList.add('active');
        }, i * 100);
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  featureCards.forEach(card => {
    card.classList.add('reveal');
    cardObserver.observe(card);
  });
}


// ── Mouse glow effect on feature cards ──────────────────────────────────────
// Cards have a subtle radial gradient that follows the mouse cursor.

document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  });
});


// ── Smooth scroll for anchor links ──────────────────────────────────────────

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
