// ═══════════════════════════════════════════════
//  GOLDEN HOUR — interactions
// ═══════════════════════════════════════════════

// ── Theme (respects saved choice, falls back to system) ──
const toggle = document.getElementById('themeToggle');

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  localStorage.setItem('theme', theme);
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

const saved = localStorage.getItem('theme');
if (saved) {
  applyTheme(saved);
} else {
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
}

toggle.addEventListener('click', () => {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  applyTheme(next);
});

// ── 3D hero (Spline) ──
// Activates only when data-spline-url is set. Loads the runtime on demand,
// then fades the scene in over the CSS-sun fallback.
(function initSpline() {
  const host = document.getElementById('hero3d');
  if (!host) return;
  const url = host.dataset.splineUrl?.trim();
  if (!url) return; // no scene yet → keep CSS fallback

  document.querySelector('.hero')?.classList.add('has-3d');

  const runtime = document.createElement('script');
  runtime.type = 'module';
  runtime.src = 'https://unpkg.com/@splinetool/viewer@1.9.48/build/spline-viewer.js';
  runtime.onload = () => {
    const viewer = document.createElement('spline-viewer');
    viewer.setAttribute('url', url);
    viewer.setAttribute('loading-anim-type', 'none');
    viewer.addEventListener('load', () => host.classList.add('loaded'));
    host.appendChild(viewer);
    // safety: reveal even if 'load' doesn't fire
    setTimeout(() => host.classList.add('loaded'), 4000);
  };
  document.head.appendChild(runtime);
})();

// ── Hamburger / mobile drawer ──
(function initDrawer() {
  const btn = document.getElementById('navHamburger');
  const drawer = document.getElementById('navDrawer');
  if (!btn || !drawer) return;

  function openDrawer() {
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    drawer.style.display = 'flex';
    requestAnimationFrame(() => drawer.classList.add('open'));
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    drawer.addEventListener('transitionend', () => {
      if (!drawer.classList.contains('open')) drawer.style.display = '';
    }, { once: true });
  }

  btn.addEventListener('click', () => {
    btn.classList.contains('open') ? closeDrawer() : openDrawer();
  });

  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });
})();

// ── Nav border on scroll ──
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// ── Scroll reveal ──
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.14 });
revealEls.forEach(el => io.observe(el));

// ── Hero title staggered entrance ──
window.addEventListener('load', () => {
  document.querySelectorAll('.hero-title .line').forEach((line, i) => {
    const inner = document.createElement('span');
    inner.style.display = 'inline-block';
    inner.style.transform = 'translateY(110%)';
    inner.style.transition = `transform 1s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.12}s`;
    inner.innerHTML = line.innerHTML;
    line.innerHTML = '';
    line.appendChild(inner);
    requestAnimationFrame(() => { inner.style.transform = 'translateY(0)'; });
  });
});

// ── Subtle parallax on the hero horizon glow ──
const horizon = document.querySelector('.hero-horizon');
if (horizon && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y < window.innerHeight) {
      horizon.style.transform = `translateY(${y * 0.18}px)`;
      horizon.style.opacity = String(Math.max(0, 1 - y / 500));
    }
  }, { passive: true });
}
