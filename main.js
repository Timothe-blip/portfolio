// Jahr im Footer
document.getElementById('year').textContent = new Date().getFullYear();

// Header erst nach dem Video-Bereich einblenden
const topbar = document.querySelector('.topbar');
const heroEl = document.querySelector('.hero');
const toggleTopbar = () => topbar.classList.toggle('is-visible', window.scrollY > heroEl.offsetHeight * 0.85);
window.addEventListener('scroll', toggleTopbar, { passive: true });
toggleTopbar();

// ---------- Video-Lightbox ----------
const lightbox = document.getElementById('lightbox');
const frame = lightbox.querySelector('.lightbox-frame');
let lastFocus = null;

function embedUrl(spec) {
  const [platform, id, hash] = spec.split(':');
  if (platform === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  }
  if (platform === 'vimeo') {
    return `https://player.vimeo.com/video/${id}?${hash ? `h=${hash}&` : ''}autoplay=1&dnt=1&title=0&byline=0&portrait=0`;
  }
  return null;
}

function openVideo(card) {
  const url = embedUrl(card.dataset.video || '');
  if (!url) return;
  lastFocus = card;
  const title = card.dataset.title || card.querySelector('h3')?.textContent || 'Video';
  frame.innerHTML = `<iframe src="${url}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${title}"></iframe>`;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
  lightbox.querySelector('.lightbox-close').focus();
}

function closeVideo() {
  lightbox.hidden = true;
  frame.innerHTML = '';
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

document.querySelectorAll('[data-video]').forEach(card => {
  card.addEventListener('click', () => openVideo(card));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openVideo(card); }
  });
});
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeVideo(); });
lightbox.querySelector('.lightbox-close').addEventListener('click', closeVideo);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lightbox.hidden) closeVideo(); });

// ---------- Hintergrund-Video im Startbereich ----------
// Querformat-Fenster → 16:9-Loop, Hochformat (Handy) → 9:16-Loop (falls vorhanden).
// Der Browser nimmt automatisch die beste Datei, die er abspielen kann: AV1 → HEVC → H.264.
const bg = document.querySelector('.hero-media');
const bgVideo = bg && bg.querySelector('video');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (bgVideo) {
  const portraitMQ = window.matchMedia('(orientation: portrait)');
  const loadBanner = () => {
    const base = (portraitMQ.matches && bg.dataset.portrait) ? bg.dataset.portrait : bg.dataset.landscape;
    if (bgVideo.dataset.current === base) return;
    bgVideo.dataset.current = base;
    bgVideo.poster = `${base}-poster.jpg`;
    bgVideo.innerHTML = `
      <source src="${base}-av1.mp4" type='video/mp4; codecs="av01.0.08M.08"'>
      <source src="${base}-hevc.mp4" type='video/mp4; codecs="hvc1.1.6.L120.90"'>
      <source src="${base}-h264.mp4" type="video/mp4">`;
    bgVideo.muted = true;
    bgVideo.load();
    if (!reduceMotion) bgVideo.play().catch(() => {});
  };
  loadBanner();
  portraitMQ.addEventListener('change', loadBanner);

  // Nur abspielen, solange der Startbereich sichtbar ist (spart Akku)
  new IntersectionObserver(([entry]) => {
    if (reduceMotion) return;
    entry.isIntersecting ? bgVideo.play().catch(() => {}) : bgVideo.pause();
  }).observe(document.querySelector('.hero'));
}

// ---------- Filter ----------
const buttons = document.querySelectorAll('.filters button');
buttons.forEach(btn => btn.addEventListener('click', () => {
  buttons.forEach(b => b.classList.toggle('is-active', b === btn));
  const f = btn.dataset.filter;
  document.querySelectorAll('.work-card').forEach(card => {
    const tags = (card.dataset.tags || '').split(' ');
    card.classList.toggle('is-hidden', f !== 'all' && !tags.includes(f));
  });
}));

// ---------- Einblenden beim Scrollen ----------
const revealEls = document.querySelectorAll('.soon-card, .work-card, .about-body, .section-head');
revealEls.forEach(el => el.classList.add('reveal'));
const io = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
  });
}, { threshold: 0.12 });
revealEls.forEach(el => io.observe(el));
