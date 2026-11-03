/* Design B — "Golden Hour". Runs after polish.js. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Film grain ---------- */
  const grain = document.createElement('div');
  grain.className = 'gh-grain'; grain.setAttribute('aria-hidden', 'true');
  document.body.append(grain);

  /* ---------- Hero: letterbox + light leak ---------- */
  const hero = document.querySelector('.page-hero');
  if (hero) {
    hero.classList.add('gh-bars');
    const leak = document.createElement('div');
    leak.className = 'gh-leak'; leak.setAttribute('aria-hidden', 'true');
    (hero.querySelector('.shade') || hero.firstElementChild).after(leak);
  }

  /* ---------- Inertial scrolling (mouse wheel / trackpad on desktop only) ---------- */
  if (fine && !reduced) {
    let target = scrollY, current = scrollY, raf = 0, ours = false;
    const max = () => document.documentElement.scrollHeight - innerHeight;
    const step = () => {
      current += (target - current) * .1;
      if (Math.abs(target - current) < .5) current = target;
      ours = true;
      scrollTo(0, current);
      raf = current !== target ? requestAnimationFrame(step) : 0;
    };
    addEventListener('wheel', e => {
      if (e.ctrlKey || e.defaultPrevented || document.documentElement.classList.contains('menu-open')) return;
      if (e.target.closest?.('textarea, select, [data-native-scroll]')) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1;
      if (!raf) current = scrollY;
      target = clamp(target + e.deltaY * unit, 0, max());
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: false });
    // Keyboard, scrollbar, anchor links and find-in-page keep working natively.
    addEventListener('scroll', () => {
      if (ours) { ours = false; return; }
      if (!raf) target = current = scrollY;
    }, { passive: true });
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      const el = a && document.querySelector(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      current = scrollY;
      target = clamp(el.getBoundingClientRect().top + scrollY - 20, 0, max());
      if (!raf) raf = requestAnimationFrame(step);
      history.pushState(null, '', a.getAttribute('href'));
    });
  }

  /* ---------- Words light up as you read ---------- */
  const lit = [...document.querySelectorAll('.chapter-lead, .goal-statement, .home-next .lead, .team-intro-copy p, .team-section-head .lead')];
  if (!reduced) {
    lit.forEach(p => {
      const words = p.textContent.trim().split(/\s+/);
      p.setAttribute('aria-label', p.textContent.trim());
      p.innerHTML = words.map(w => `<span class="gl" aria-hidden="true">${w}</span>`).join(' ');
      p.classList.add('gh-lit');
    });
  }
  const updateLit = () => {
    lit.forEach(p => {
      const r = p.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const progress = clamp((innerHeight * .82 - r.top) / (r.height + innerHeight * .3), 0, 1);
      const spans = p.children;
      const n = Math.round(progress * spans.length);
      for (let i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i < n);
    });
  };

  /* ---------- Pinned filmstrip ---------- */
  const film = document.querySelector('.gh-film');
  let updateFilm = () => {};
  if (film && !reduced) {
    const track = film.querySelector('.gh-film-track');
    const imgs = [...track.querySelectorAll('img')];
    const desktop = matchMedia('(min-width: 901px)');
    let distance = 0;
    const measure = () => {
      film.classList.toggle('gh-pinned', desktop.matches);
      if (!desktop.matches) { film.style.height = ''; return; }
      distance = Math.max(0, track.scrollWidth - innerWidth);
      film.style.height = `${innerHeight + distance}px`;
    };
    updateFilm = () => {
      if (!desktop.matches) return;
      const r = film.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, distance), 0, 1);
      film.style.setProperty('--film-x', `${(-p * distance).toFixed(1)}px`);
      film.style.setProperty('--film', p.toFixed(4));
      imgs.forEach(img => {
        const b = img.parentElement.getBoundingClientRect();
        if (b.right < 0 || b.left > innerWidth) return;
        const c = (b.left + b.width / 2 - innerWidth / 2) / innerWidth;
        img.style.setProperty('--px', `${(-c * 40).toFixed(1)}px`);
      });
    };
    measure();
    addEventListener('resize', () => { measure(); updateFilm(); });
    addEventListener('load', () => { measure(); updateFilm(); });
    desktop.addEventListener('change', measure);
  }

  let frame = 0;
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; updateLit(); updateFilm(); }); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
})();
