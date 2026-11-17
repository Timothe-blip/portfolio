// Nach dem Neuladen immer oben starten (Browser merken sich sonst die Scrollposition)
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) window.scrollTo(0, 0);

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
  // Banner und Vorschau anhalten, solange der Film mit Ton läuft
  document.querySelectorAll('video').forEach(v => {
    if (!v.paused) { v.dataset.resume = '1'; v.pause(); }
  });
  lightbox.querySelector('.lightbox-close').focus();
}

function closeVideo() {
  lightbox.hidden = true;
  frame.innerHTML = '';
  document.body.style.overflow = '';
  // Angehaltene Videos wieder starten
  document.querySelectorAll('video[data-resume]').forEach(v => {
    delete v.dataset.resume; v.play().catch(() => {});
  });
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
    if (!lightbox.hidden) return;
    entry.isIntersecting ? bgVideo.play().catch(() => {}) : bgVideo.pause();
  }).observe(document.querySelector('.hero'));
}

// ---------- Viewer + Timeline (Selected work) ----------
// Scrollen bewegt die Timeline unter dem Abspielkopf. Jedes Projekt bekommt gleich viel
// Scrollweg und der Abspielkopf "hält" kurz in der Clipmitte. Der Viewer oben zeigt das
// Projekt unter dem Abspielkopf (Vorschau-Loop, falls vorhanden, sonst Standbild).
const work = document.getElementById('work');
if (work) {
  const sticky = work.querySelector('.tl-sticky');
  const viewport = work.querySelector('.tl-viewport');
  const track = work.querySelector('.tl-track');
  const ruler = work.querySelector('.tl-ruler');
  const clips = [...work.querySelectorAll('.clip')];
  const viewer = work.querySelector('.tl-viewer');
  const still = viewer.querySelector('.vw-still');
  const vVideo = viewer.querySelector('.vw-video');
  const tcEl = work.querySelector('.vw-tc');
  const countEl = work.querySelector('.tl-count');
  const awardEl = work.querySelector('.tl-award');
  const titleEl = work.querySelector('.tl-title');
  const metaEl = work.querySelector('.tl-meta');
  const FPS = 25, TC_START = 3600;      // Timelines beginnen wie in Resolve bei 01:00:00:00
  const SCROLL_PER_CLIP = 0.6;          // Scrollweg pro Projekt in Bildschirmhöhen

  const p2 = n => String(n).padStart(2, '0');
  const fmt = (sec, frames = true) => {
    const t = Math.floor(sec), hms = `${p2(Math.floor(t / 3600))}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`;
    return frames ? `${hms}:${p2(Math.floor((sec % 1) * FPS))}` : hms;
  };
  const dur = c => Number(c.dataset.duration) || 60;
  const short = sec => `${p2(Math.floor(sec / 60))}:${p2(Math.floor(sec % 60))}`;
  // langsam in der Mitte, schnell an den Rändern → Abspielkopf "hält" auf jedem Projekt
  const hold = t => 0.5 + 0.5 * Math.sign(t - 0.5) * Math.pow(Math.abs(2 * t - 1), 2.6);

  let acc = 0;
  clips.forEach(c => {
    c.tcStart = acc; acc += dur(c);
    c.style.setProperty('--thumb', `url("${c.dataset.thumb}")`);
    const name = c.dataset.title.toUpperCase().replace(/[^A-Z0-9ÄÖÜ]+/g, '_').replace(/^_|_$/g, '');
    const right = c.dataset.status === 'in-post' ? 'IN POST' : short(dur(c));
    c.innerHTML = `<span class="clip-frames"></span><span class="clip-label"><span>${name}</span><span>${right}</span></span>`;
    c.setAttribute('aria-label', `${c.dataset.title} – ${c.dataset.meta}`);
    if (c.dataset.status === 'in-post') c.setAttribute('aria-disabled', 'true');
    if (c.dataset.thumb) new Image().src = c.dataset.thumb; // Standbilder vorladen
  });

  let geo = [], active = null, segH = 0;

  function layout() {
    const h = clips[0].getBoundingClientRect().height;
    clips.forEach(c => { c.style.width = Math.round(h * (1.2 + 0.16 * Math.sqrt(dur(c)))) + 'px'; });
    geo = clips.map(c => {
      const [nameEl, durEl] = c.querySelectorAll('.clip-label span');
      return { c, x: c.offsetLeft, w: c.offsetWidth, nameEl, nameW: nameEl.scrollWidth, durW: durEl.offsetWidth, shift: 0 };
    });
    ruler.innerHTML = geo.map(g => `<span style="left:${g.x}px">${fmt(TC_START + g.c.tcStart, false)}</span>`).join('');
    segH = window.innerHeight * SCROLL_PER_CLIP;
    work.style.height = `${sticky.offsetHeight + segH * clips.length}px`;
    placeSnaps();
    curPos = null;
    update();
  }

  // Erst das Thumbnail zeigen, nach THUMB_HOLD ms weich in den Vorschau-Loop überblenden
  const THUMB_HOLD = 1500;
  function showInViewer(c) {
    viewer.classList.add('is-switching');
    clearTimeout(viewer._t); clearTimeout(viewer._v);
    viewer.classList.remove('has-video');
    vVideo.pause();
    viewer._t = setTimeout(() => {
      still.src = c.dataset.thumb || '';
      still.alt = c.dataset.title;
      viewer.classList.toggle('is-offline', c.dataset.status === 'in-post');
      viewer.classList.remove('is-switching');
      if (!c.dataset.preview) return;
      if (vVideo.getAttribute('src') !== c.dataset.preview) { vVideo.src = c.dataset.preview; vVideo.load(); }
      scheduleVideo();
    }, 180);
  }
  // Der Countdown fürs Thumbnail läuft nur, solange der Viewer wirklich im Bild ist.
  // Ist er nicht sichtbar, bleibt das Thumbnail stehen und der Loop wird zurückgesetzt.
  let viewerVisible = false;
  function scheduleVideo() {
    clearTimeout(viewer._v);
    if (!viewerVisible || !active?.dataset.preview) return;
    const c = active;
    viewer._v = setTimeout(() => {
      if (active !== c || !viewerVisible || !lightbox.hidden) return;
      vVideo.currentTime = 0;
      vVideo.play().then(() => viewer.classList.add('has-video')).catch(() => {});
    }, THUMB_HOLD);
  }
  new IntersectionObserver(([en]) => {
    viewerVisible = en.intersectionRatio >= 0.75;
    if (viewerVisible) { if (!viewer.classList.contains('has-video')) scheduleVideo(); }
    else { clearTimeout(viewer._v); vVideo.pause(); viewer.classList.remove('has-video'); }
  }, { threshold: [0, 0.75, 1] }).observe(viewer);

  function setActive(g, within) {
    tcEl.textContent = fmt(TC_START + g.c.tcStart + within * dur(g.c));
    if (active === g.c) return;
    active?.classList.remove('is-active');
    active = g.c; active.classList.add('is-active');
    titleEl.textContent = active.dataset.title;
    metaEl.textContent = active.dataset.meta;
    awardEl.hidden = !active.dataset.award;
    awardEl.textContent = active.dataset.award ? `★ ${active.dataset.award}` : '';
    countEl.textContent = `${p2(clips.indexOf(active) + 1)} / ${p2(clips.length)}`;
    showInViewer(active);
  }

  // Scrollen gibt nur das Ziel vor; die Timeline gleitet weich dorthin (gleich weich mit Maus, Trackpad und Finger)
  const LERP = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.14;
  let curPos = null, tgtPos = 0, anim = null;
  function targetFromScroll() {
    const y = Math.min(Math.max(window.scrollY - work.offsetTop, 0), segH * clips.length - 0.001);
    const i = Math.min(Math.max(Math.floor(y / segH), 0), geo.length - 1), t = Math.min(Math.max((y - i * segH) / segH, 0), 1);
    return geo[i].x + hold(t) * geo[i].w;
  }
  function render(pos) {
    const tx = viewport.clientWidth / 2 - pos;
    track.style.transform = `translate3d(${tx.toFixed(2)}px,0,0)`;
    // Clipname bleibt am linken Bildrand sichtbar, solange der Clip im Bild ist (wie in Resolve)
    geo.forEach(g => {
      const left = g.x + tx, max = Math.max(0, g.w - (g.nameW || 0) - (g.durW || 0) - 28);
      const shift = left < 0 ? Math.min(-left, max) : 0;
      if (g.shift !== shift) { g.shift = shift; g.nameEl.style.transform = shift ? `translateX(${shift.toFixed(1)}px)` : ''; }
    });
    const g = geo.find(g => pos >= g.x && pos < g.x + g.w + 3) || (pos < geo[0].x ? geo[0] : geo.at(-1));
    setActive(g, Math.min(Math.max((pos - g.x) / g.w, 0), 1));
  }
  function step() {
    const d = tgtPos - curPos;
    curPos += Math.abs(d) < 0.5 ? d : d * LERP;
    render(curPos);
    anim = Math.abs(tgtPos - curPos) > 0.5 ? requestAnimationFrame(step) : null;
  }
  function update() {
    if (!geo.length || !segH) return;
    tgtPos = targetFromScroll();
    if (curPos === null) { curPos = tgtPos; render(curPos); return; }
    if (!anim) anim = requestAnimationFrame(step);
  }

  // Klick auf einen anderen Clip → dorthin scrollen; Klick auf den aktiven → Film öffnen
  clips.forEach((c, i) => c.addEventListener('click', e => {
    if (c === active) return;
    e.stopImmediatePropagation();
    window.scrollTo({ top: work.offsetTop + segH * (i + 0.5), behavior: 'smooth' });
  }, true));
  const openActive = () => active?.dataset.video && openVideo(active);
  viewer.addEventListener('click', openActive);


  // ---------- Handy: zügiger Wisch = nächstes Projekt, langsames Wischen = frei ----------
  // Das iPhone scrollt ganz normal. Erst beim Loslassen wird die Fingergeschwindigkeit geprüft:
  // schnell genug → weich zur Mitte des nächsten/vorigen Projekts gleiten; langsam → bleibt, wo man loslässt.
  const placeSnaps = () => {};
  if (window.matchMedia('(pointer: coarse)').matches) {
    const FLICK_VEL = 0.22;            // px/ms Fingergeschwindigkeit beim Loslassen
    const FLICK_DIST = 24, FLICK_TIME = 260; // oder: kurzer, schneller Wisch (px in ms)
    const centerOf = i => work.offsetTop + segH * (i + 0.5);
    const inZone = y => y >= work.offsetTop - 1 && y <= work.offsetTop + segH * clips.length;
    let touch = null, glide = null, catchDir = 0, catchUntil = 0, lastY = window.scrollY;

    // Den eingebauten Schwung des iPhones stoppen, damit nur EINE Bewegung zum Ziel läuft.
    // (overflow:hidden beendet den Schwung sofort; per Skript lässt sich trotzdem weiterscrollen.)
    const root = document.documentElement;
    const lockMomentum = () => { root.style.overflow = 'hidden'; };
    const unlockMomentum = () => { root.style.overflow = ''; };

    const glideTo = y => {
      cancelAnimationFrame(glide);
      lockMomentum();
      const from = window.scrollY, dist = y - from, t0 = performance.now(), dur = 420;
      const ease = k => 1 - Math.pow(1 - k, 3);
      const tick = now => {
        const k = Math.min((now - t0) / dur, 1);
        window.scrollTo(0, from + dist * ease(k));
        if (k < 1) glide = requestAnimationFrame(tick);
        else { glide = null; unlockMomentum(); }
      };
      glide = requestAnimationFrame(tick);
    };

    window.addEventListener('touchstart', e => {
      cancelAnimationFrame(glide); glide = null; catchDir = 0; unlockMomentum();
      const y = e.touches[0].clientY;
      touch = { y0: y, t0: e.timeStamp, samples: [[e.timeStamp, y]] };
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (!touch) return;
      touch.samples.push([e.timeStamp, e.touches[0].clientY]);
      if (touch.samples.length > 6) touch.samples.shift();
    }, { passive: true });

    window.addEventListener('touchend', e => {
      if (!touch || !lightbox.hidden) { touch = null; return; }
      const sm = touch.samples, [tA, yA] = sm[0], [tB, yB] = sm[sm.length - 1];
      const vel = (yA - yB) / Math.max(tB - tA, 1);           // >0 = Finger nach oben = vorwärts
      const total = touch.y0 - yB, dur = e.timeStamp - touch.t0;
      touch = null;
      const flick = Math.abs(vel) > FLICK_VEL || (Math.abs(total) > FLICK_DIST && dur < FLICK_TIME);
      if (!flick) return;
      const dir = Math.sign(vel) || Math.sign(total), y = window.scrollY;
      if (inZone(y)) {
        // Immer ein ganzes Projekt weiter/zurück, ausgehend vom Projekt unter dem Abspielkopf
        const idx = Math.min(Math.max(Math.floor((y - work.offsetTop) / segH), 0), clips.length - 1);
        const next = idx + dir;
        if (next >= 0 && next < clips.length) glideTo(centerOf(next));   // sonst: normal raus zum Banner bzw. zu About
      } else {
        // Schwung von außen: beim Hineinrollen am ersten (bzw. letzten) Projekt abfangen
        catchDir = dir; catchUntil = performance.now() + 2500;
      }
    }, { passive: true });

    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (catchDir && !touch && !glide && performance.now() < catchUntil) {
        const first = centerOf(0), last = centerOf(clips.length - 1);
        if (catchDir > 0 && lastY < first && y >= first - segH * 0.35) { catchDir = 0; glideTo(first); }
        else if (catchDir < 0 && lastY > last && y <= last + segH * 0.35) { catchDir = 0; glideTo(last); }
      }
      lastY = y;
    }, { passive: true });
  }

  window.addEventListener('scroll', update, { passive: true });
  // Nur bei echter Größenänderung neu berechnen (nicht wenn am Handy die Adressleiste ein-/ausfährt)
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== lastW || !segH) { lastW = window.innerWidth; layout(); } });
  layout();
  window.addEventListener('load', layout);
}

// ---------- Eigener Cursor über Viewer und Clips ----------
const cursor = document.querySelector('.cursor');
if (cursor && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const label = cursor.querySelector('.cursor-label');
  let tx = -200, ty = -200, cx = -200, cy = -200, raf = null;
  const ease = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.22;
  const loop = () => {
    cx += (tx - cx) * ease; cy += (ty - cy) * ease;
    cursor.style.setProperty('--x', cx + 'px'); cursor.style.setProperty('--y', cy + 'px');
    raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3 ? requestAnimationFrame(loop) : null;
  };
  // Was zeigt der Cursor über welchem Element?
  const describe = el => {
    const v = el.closest('.tl-viewer');
    if (v) return v.classList.contains('is-offline') ? ['offline', 'In post'] : ['play', 'Play'];
    const c = el.closest('.clip');
    if (c) {
      if (c.dataset.status === 'in-post') return ['offline', 'In post'];
      return c.classList.contains('is-active') ? ['play', 'Play'] : ['view', 'View'];
    }
    return null;
  };
  let lastEl = null;
  const refresh = () => {
    const d = lastEl && describe(lastEl);
    cursor.classList.toggle('is-on', !!d);
    if (d) { cursor.dataset.kind = d[0]; label.textContent = d[1]; }
  };
  document.addEventListener('mousemove', e => {
    tx = e.clientX; ty = e.clientY;
    if (!cursor.classList.contains('is-on')) { cx = tx; cy = ty; }
    lastEl = e.target; refresh();
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  document.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
  // Beim Scrollen ändert sich, was unter der Maus liegt (z. B. aktiver Clip)
  window.addEventListener('scroll', () => {
    lastEl = document.elementFromPoint(tx, ty); refresh();
  }, { passive: true });
}

// ---------- Einblenden beim Scrollen ----------
const revealEls = document.querySelectorAll('.about-body, .about .section-title, .portrait');
revealEls.forEach(el => el.classList.add('reveal'));
const io = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
  });
}, { threshold: 0.12 });
revealEls.forEach(el => io.observe(el));
