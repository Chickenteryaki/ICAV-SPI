(() => {
  'use strict';
  const menu = document.querySelector('.menu');
  const nav = document.querySelector('.nav');
  const closeMenu = () => { nav?.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); };
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav?.classList.contains('open')) { closeMenu(); menu.focus(); }
  });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const slides = [...document.querySelectorAll('.home-hero-slide')];
  const dots = [...document.querySelectorAll('.home-hero-dot')];
  const pause = document.querySelector('.slideshow-toggle');
  let slideIndex = 0, timer, paused = reduced.matches;

  function showSlide(index) {
    slideIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === slideIndex);
      slide.setAttribute('aria-hidden', String(i !== slideIndex));
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === slideIndex);
      dot.setAttribute('aria-pressed', String(i === slideIndex));
    });
  }

  function scheduleSlides() {
    clearInterval(timer);
    if (pause) {
      pause.textContent = paused ? 'Play' : 'Pause';
      pause.dataset.state = paused ? 'play' : 'pause';
      pause.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
    }
    if (slides.length > 1 && !paused && !document.hidden) {
      timer = setInterval(() => showSlide(slideIndex + 1), 6500);
    }
  }

  if (slides.length) {
    showSlide(0);
    scheduleSlides();
    dots.forEach((dot, i) => dot.addEventListener('click', () => { showSlide(i); scheduleSlides(); }));
    pause?.addEventListener('click', () => { paused = !paused; scheduleSlides(); });
    document.addEventListener('visibilitychange', scheduleSlides);
  }

  const story = document.querySelector('.flight-story');
  if (!story) return;

  const chapters = [...story.querySelectorAll('[data-flight-stop]')];
  const hourLabel = story.querySelector('[data-flight-hours]');
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  let markers = [];
  let storyTop = 0;
  let storyHeight = 0;
  let frame = 0;

  function measure() {
    storyTop = story.getBoundingClientRect().top + scrollY;
    storyHeight = story.offsetHeight;
    markers = chapters.map(chapter => ({
      y: chapter.getBoundingClientRect().top + scrollY - storyTop,
      h: Number(chapter.dataset.flightStop)
    }));
    markers.push({
      y: Math.max(markers[markers.length - 1].y + 1, storyHeight - innerHeight),
      h: 100
    });
    update();
  }

  function update() {
    frame = 0;
    if (reduced.matches || !markers.length) return;

    const offset = scrollY - storyTop;
    if (offset < -innerHeight || offset > storyHeight) return;

    const maxPosition = Math.max(1, markers[markers.length - 1].y);
    const position = clamp(offset, 0, maxPosition);
    const progress = clamp(position / maxPosition);

    let segment = 0;
    while (segment < markers.length - 2 && position > markers[segment + 1].y) segment++;
    const from = markers[segment];
    const to = markers[segment + 1];
    const t = clamp((position - from.y) / Math.max(1, to.y - from.y));
    const elapsed = from.h + (to.h - from.h) * t;

    const totalMinutes = Math.floor((6 + elapsed) * 60);
    const clock = (totalMinutes % 1440) / 60;
    const daylight = clamp((Math.sin((clock - 6) / 12 * Math.PI) + .25) / 1.25);
    const blend = daylight * daylight * (3 - 2 * daylight);
    const night = [15, 25, 38];
    const day = [238, 234, 224];
    const rgb = night.map((v, i) => Math.round(v + (day[i] - v) * blend));
    const linear = rgb.map(v => {
      v /= 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;

    story.style.setProperty('--flight-bg', `rgb(${rgb.join(',')})`);
    story.style.setProperty('--flight-fg', luminance > .18 ? '#111a22' : '#f6f3eb');
    story.style.setProperty('--flight-daylight', blend.toFixed(3));
    story.style.setProperty('--flight-progress', (elapsed / 100).toFixed(4));

    const landing = clamp((progress - .78) / .22);
    const mobile = innerWidth <= 900;
    const lateral = (Math.sin(progress * Math.PI * 2.05) * 7 + Math.sin(progress * Math.PI * 4.4) * 1.7) * (1 - landing);
    const x = mobile ? 86 - landing * 36 : 50 + lateral;
    const y = 27 + progress * 31 + Math.sin(progress * Math.PI * 3) * 2 + landing * 13;
    const bank = 180 + Math.cos(progress * Math.PI * 2.05) * (mobile ? 5 : 9) * (1 - landing);
    const scale = 1 + landing * (mobile ? 1.05 : 1.85);
    const trail = .46 - landing * .31;

    story.style.setProperty('--aircraft-x', `${x.toFixed(2)}%`);
    story.style.setProperty('--aircraft-y', `${y.toFixed(2)}%`);
    story.style.setProperty('--aircraft-bank', `${bank.toFixed(2)}deg`);
    story.style.setProperty('--aircraft-scale', scale.toFixed(3));
    story.style.setProperty('--trail-opacity', trail.toFixed(3));
    story.style.setProperty('--landing', landing.toFixed(3));
    story.style.setProperty('--cloud-drift', `${(Math.sin(position / 620) * 68).toFixed(1)}px`);
    story.style.setProperty('--cloud-rise', `${(Math.sin(position / 510) * 7 + Math.cos(position / 980) * 3).toFixed(1)}px`);

    if (hourLabel) hourLabel.textContent = String(Math.floor(elapsed + .0001)).padStart(3, '0');
  }

  function requestUpdate() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function setMotion() {
    story.classList.toggle('motion-ready', !reduced.matches);
    if (reduced.matches) {
      paused = true;
      scheduleSlides();
    }
    measure();
  }

  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', measure);
  addEventListener('pageshow', measure);
  reduced.addEventListener('change', setMotion);

  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(story);

  if ('IntersectionObserver' in window) {
    const reveals = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (!reduced.matches) entry.target.classList.add('is-revealed');
        reveals.unobserve(entry.target);
      });
    }, { threshold: .12 });
    story.querySelectorAll('[data-reveal]').forEach(el => reveals.observe(el));
  }

  setMotion();
})();
