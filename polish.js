/* ICAV SPI — polish layer (2026-11). Runs after site.js.
   Progressive: if this file fails to load, the site looks and works as before. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const motion = () => !reduced.matches;
  const hasIO = 'IntersectionObserver' in window;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  root.classList.add('polish');
  const syncMotion = () => root.classList.toggle('polish-motion', motion());
  syncMotion();

  /* ---------- Header, scroll progress, hero parallax ---------- */
  const nav = document.querySelector('.nav');
  const menu = document.querySelector('.menu');
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.page-hero');

  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);

  if (hero) {
    const cue = document.createElement('div');
    cue.className = 'scroll-cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML = '<span>Scroll</span><i></i>';
    hero.append(cue);
  }

  let lastY = scrollY;
  let velocity = 0;
  let scrollFrame = 0;
  const photoWindows = [...document.querySelectorAll('.chapter-photo-window')];

  function onScrollFrame() {
    scrollFrame = 0;
    const y = scrollY;
    const dy = y - lastY;
    velocity = dy;
    const max = root.scrollHeight - innerHeight;
    root.style.setProperty('--scroll', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : '0');
    root.classList.toggle('is-scrolled', y > 40);

    const menuOpen = nav?.classList.contains('open');
    const focusInHeader = header?.contains(document.activeElement) && document.activeElement !== document.body;
    if (!menuOpen && !focusInHeader && y > innerHeight * .6 && dy > 3) root.classList.add('header-hidden');
    else if (dy < -3 || y < innerHeight * .6 || menuOpen || focusInHeader) root.classList.remove('header-hidden');
    lastY = y;

    if (!motion()) return;
    if (hero) {
      const h = hero.offsetHeight || innerHeight;
      if (y <= h * 1.1) {
        hero.style.setProperty('--hero-shift', `${(y * .28).toFixed(1)}px`);
        hero.style.setProperty('--hero-lift', `${(-y * .12).toFixed(1)}px`);
        hero.style.setProperty('--hero-fade', clamp(1 - (y / h) * 1.25, 0, 1).toFixed(3));
      }
    }
    photoWindows.forEach(win => {
      const r = win.getBoundingClientRect();
      if (r.bottom < -60 || r.top > innerHeight + 60) return;
      const p = clamp((r.top + r.height / 2 - innerHeight / 2) / innerHeight, -1, 1);
      win.style.setProperty('--py', `${(-p * r.height * .045).toFixed(2)}px`);
    });
  }
  const requestScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(onScrollFrame); };
  addEventListener('scroll', requestScroll, { passive: true });
  addEventListener('resize', requestScroll);
  header?.addEventListener('focusin', () => root.classList.remove('header-hidden'));
  onScrollFrame();

  /* ---------- Mobile menu: label + scroll lock (site.js owns open/close) ---------- */
  if (nav && menu) {
    const syncMenu = () => {
      const open = nav.classList.contains('open');
      menu.textContent = open ? 'Close' : 'Menu';
      root.classList.toggle('menu-open', open);
      if (open) root.classList.remove('header-hidden');
    };
    new MutationObserver(syncMenu).observe(nav, { attributes: true, attributeFilter: ['class'] });
    syncMenu();
  }

  /* ---------- Headline word reveal ---------- */
  function splitWords(el) {
    let index = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const outer = document.createElement('span');
            const inner = document.createElement('span');
            outer.className = 'w';
            inner.className = 'wi';
            inner.style.setProperty('--i', index++);
            inner.textContent = part;
            outer.append(inner);
            frag.append(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    el.classList.add('wsplit');
  }

  const headings = [...document.querySelectorAll('.page-hero h1, .display')];
  if (motion() && hasIO) {
    headings.forEach(splitWords);
    const headingObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('words-in');
        headingObserver.unobserve(entry.target);
      });
    }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    headings.forEach(h => headingObserver.observe(h));
  }

  /* ---------- Staggered reveals for lists and cards ---------- */
  const groups = [
    '.goal-facts > div', '.home-explore .row', '.timeline-row', '.stats .stat',
    '.news-list > *'
  ];
  const revealItems = [];
  groups.forEach(selector => {
    const items = [...document.querySelectorAll(selector)];
    items.forEach((el, i) => {
      if (el.matches('[data-reveal]') || el.closest('[data-reveal]')) return;
      el.classList.add('pr');
      el.style.setProperty('--d', String(i % 4));
      revealItems.push(el);
    });
  });
  if (motion() && hasIO) {
    const prObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('pr-in');
        prObserver.unobserve(el);
        // Drop the stagger delay afterwards so hover effects respond instantly.
        setTimeout(() => el.style.setProperty('--d', '0'), 1600);
      });
    }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
    revealItems.forEach(el => prObserver.observe(el));
  } else revealItems.forEach(el => el.classList.add('pr-in'));

  /* ---------- Count-up numbers ---------- */
  function prepareCount(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const match = node.textContent.match(/\d[\d,]*(?:\.\d+)?/);
      if (!match) continue;
      const raw = match[0];
      // <data> rather than <span>: the site styles every span inside .goal-facts/.stat.
      const span = document.createElement('data');
      span.className = 'count';
      span.value = raw.replace(/,/g, '');
      span.textContent = raw;
      const before = node.textContent.slice(0, match.index);
      const after = node.textContent.slice(match.index + raw.length);
      node.replaceWith(before, span, after);
      const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
      return { span, raw, target: parseFloat(raw.replace(/,/g, '')), decimals, commas: raw.includes(',') };
    }
    return null;
  }
  const format = (value, c) => {
    const fixed = value.toFixed(c.decimals);
    return c.commas ? Number(fixed).toLocaleString('en-GB', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals }) : fixed;
  };
  const counters = [...document.querySelectorAll('.goal-facts strong, .stats .stat strong, .goal-number')]
    .map(el => ({ el, c: prepareCount(el) })).filter(item => item.c);
  function runCount(c) {
    const duration = c.target >= 50 ? 2000 : 1500;
    const start = performance.now();
    const tick = now => {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      c.span.textContent = t === 1 ? c.raw : format(c.target * eased, c);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  if (motion() && hasIO && counters.length) {
    counters.forEach(({ c }) => { c.span.textContent = format(0, c); });
    const countObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const item = counters.find(x => x.el === entry.target);
        if (item) runCount(item.c);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: .6 });
    counters.forEach(({ el }) => countObserver.observe(el));
  }

  /* ---------- Marquee: drifts on its own, speeds up and follows your scroll ---------- */
  const track = document.querySelector('.marquee-track');
  if (track) {
    const group = track.querySelector('.marquee-group');
    track.append(group.cloneNode(true));
    let x = 0, rate = 1, direction = 1, visible = false, last = 0, raf = 0;
    const step = now => {
      raf = 0;
      if (!visible || !motion()) { last = 0; return; }
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      if (Math.abs(velocity) > 1) direction = velocity > 0 ? 1 : -1;
      const target = direction * (1 + Math.min(6, Math.abs(velocity) / 10));
      rate += (target - rate) * .08;
      velocity *= .9;
      const width = group.offsetWidth || 1;
      x -= rate * dt * .06;
      if (x <= -width) x += width;
      if (x > 0) x -= width;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      raf = requestAnimationFrame(step);
    };
    if (hasIO) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(step);
      }).observe(track);
    }
  }

  /* ---------- Explore cards: load their photos just before they are needed ---------- */
  const cards = [...document.querySelectorAll('[data-card-img]')];
  const loadCard = el => el.style.setProperty('--card-img', `url("${el.dataset.cardImg}")`);
  if (hasIO) {
    const cardObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        loadCard(entry.target);
        cardObserver.unobserve(entry.target);
      });
    }, { rootMargin: '600px 0px' });
    cards.forEach(el => cardObserver.observe(el));
  } else cards.forEach(loadCard);

  /* ---------- Pointer effects (mouse/trackpad only) ---------- */
  if (finePointer.matches) {
    document.querySelectorAll('.goal-facts > div').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
    document.querySelectorAll('.button, .slideshow-toggle').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        if (!motion()) return;
        const r = btn.getBoundingClientRect();
        const dx = clamp((e.clientX - (r.left + r.width / 2)) * .22, -8, 8);
        const dy = clamp((e.clientY - (r.top + r.height / 2)) * .3, -6, 6);
        btn.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  /* ---------- Slideshow dots: show time left on the current slide ---------- */
  const dots = [...document.querySelectorAll('.home-hero-dot')];
  const toggle = document.querySelector('.slideshow-toggle');
  if (dots.length) {
    let lastKey = '';
    const restartDots = force => {
      const playing = toggle?.dataset.state !== 'play' && !document.hidden && motion();
      // Only restart when the slide or play state really changed: our own
      // 'run' class toggles also trigger the observers below.
      const key = `${dots.findIndex(d => d.classList.contains('active'))}:${playing}`;
      if (force !== true && key === lastKey) return;
      lastKey = key;
      dots.forEach(dot => {
        dot.classList.remove('run');
        if (playing && dot.classList.contains('active')) {
          void dot.offsetWidth; // restart the CSS animation
          dot.classList.add('run');
        }
      });
    };
    const onChange = () => restartDots(false);
    dots.forEach(dot => new MutationObserver(onChange).observe(dot, { attributes: true, attributeFilter: ['class'] }));
    if (toggle) new MutationObserver(onChange).observe(toggle, { attributes: true, attributeFilter: ['data-state'] });
    // Clicking a dot or play restarts site.js's timer even on the same slide.
    dots.forEach(dot => dot.addEventListener('click', () => restartDots(true)));
    toggle?.addEventListener('click', () => restartDots(true));
    document.addEventListener('visibilitychange', () => restartDots(true));
    restartDots(true);
  }

  /* ---------- If the visitor switches on "reduce motion", settle everything ---------- */
  reduced.addEventListener('change', () => {
    syncMotion();
    if (!motion()) {
      headings.forEach(h => h.classList.add('words-in'));
      revealItems.forEach(el => el.classList.add('pr-in'));
      counters.forEach(({ c }) => { c.span.textContent = c.raw; });
      if (hero) ['--hero-shift', '--hero-lift', '--hero-fade'].forEach(p => hero.style.removeProperty(p));
      if (track) track.style.transform = '';
    }
  });
})();
