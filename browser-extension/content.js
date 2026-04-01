// content.js — Scans the DOM for video elements and reports their sources

const REPORTED_URLS = new Set();

function getVideoType(url) {
  if (/\.m3u8/i.test(url)) return 'HLS';
  if (/\.mpd/i.test(url)) return 'DASH';
  if (/\.mp4/i.test(url)) return 'MP4';
  if (/\.webm/i.test(url)) return 'WebM';
  if (/\.flv/i.test(url)) return 'FLV';
  if (/\.ts(\?|$)/i.test(url)) return 'TS';
  return 'Video';
}

function reportUrl(url) {
  if (!url) return;
  // Skip blob URLs (we can't download those directly) and data URIs
  if (url.startsWith('blob:') || url.startsWith('data:')) return;

  try {
    const abs = new URL(url, window.location.href).href;
    if (REPORTED_URLS.has(abs)) return;
    REPORTED_URLS.add(abs);
    chrome.runtime.sendMessage({
      type: 'VIDEO_DETECTED',
      url: abs,
      videoType: getVideoType(abs),
    }).catch(() => {});
  } catch (_) {
    // Invalid URL — skip
  }
}

// ─── Download overlay button ───────────────────────────────────────────────────
// Appended to document.body with position:fixed so it always floats on top,
// even if the video player (JavPlayer, etc.) has its own overlay divs.

function injectStyles() {
  if (document.getElementById('vd-styles')) return;
  const style = document.createElement('style');
  style.id = 'vd-styles';
  style.textContent = `
    .vd-float-btn {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(15, 23, 42, 0.92);
      color: #60a5fa;
      border: 1px solid rgba(96, 165, 250, 0.5);
      border-radius: 7px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      cursor: pointer;
      letter-spacing: 0.3px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      transition: opacity 0.2s ease, background 0.15s, color 0.15s;
      pointer-events: all;
      white-space: nowrap;
      opacity: 0;
    }
    .vd-float-btn:hover {
      background: rgba(37, 99, 235, 0.95);
      color: #fff;
      border-color: rgba(255,255,255,0.3);
    }
    .vd-float-btn.visible { opacity: 1; }
    .vd-float-btn svg { flex-shrink: 0; }
  `;
  document.head.appendChild(style);
}

// Map videoEl -> { btn, positionBtn }
const videoButtons = new Map();

function addOverlayToVideo(videoEl) {
  if (videoEl.dataset.vdDone) return;
  videoEl.dataset.vdDone = '1';

  injectStyles();

  const btn = document.createElement('button');
  btn.className = 'vd-float-btn';
  btn.title = 'Download this video';
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download Video
  `;
  document.body.appendChild(btn);

  function positionBtn() {
    const rect = videoEl.getBoundingClientRect();
    if (rect.width === 0) return;
    btn.style.top  = (rect.top  + window.scrollY + 10) + 'px';
    btn.style.left = (rect.right + window.scrollX - btn.offsetWidth - 10) + 'px';
    // Switch to fixed positioning so it tracks the viewport
    btn.style.position = 'fixed';
    btn.style.top  = (rect.top  + 10) + 'px';
    btn.style.left = (rect.right - btn.offsetWidth - 10) + 'px';
  }

  videoButtons.set(videoEl, { btn, positionBtn });

  // ── Show/hide: use document mousemove so player overlays can't block us ──
  let hideTimer;
  document.addEventListener('mousemove', (e) => {
    const rect = videoEl.getBoundingClientRect();
    const overVideo = e.clientX >= rect.left && e.clientX <= rect.right &&
                      e.clientY >= rect.top  && e.clientY <= rect.bottom;
    if (overVideo) {
      clearTimeout(hideTimer);
      positionBtn();
      btn.classList.add('visible');
    } else if (!btn.matches(':hover')) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!btn.matches(':hover')) btn.classList.remove('visible');
      }, 500);
    }
  }, { passive: true });

  btn.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => btn.classList.remove('visible'), 500);
  });

  // Re-position on scroll/resize
  window.addEventListener('scroll',  positionBtn, { passive: true });
  window.addEventListener('resize',  positionBtn, { passive: true });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const url = videoEl.currentSrc || videoEl.src;
    if (url) reportUrl(url);
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Open popup to download
    `;
    btn.style.color = '#34d399';
    setTimeout(() => {
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download Video
      `;
      btn.style.color = '';
    }, 2500);
  });
}

// ─── DOM scanning ──────────────────────────────────────────────────────────────

function scanPage() {
  document.querySelectorAll('video').forEach(video => {
    // Report the video src/currentSrc
    if (video.src) reportUrl(video.src);
    if (video.currentSrc && video.currentSrc !== video.src) reportUrl(video.currentSrc);
    video.querySelectorAll('source').forEach(s => { if (s.src) reportUrl(s.src); });
    addOverlayToVideo(video);
  });
}

// Watch for dynamically added/modified video elements
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === 'VIDEO') {
        if (node.src) reportUrl(node.src);
        addOverlayToVideo(node);
      }
      node.querySelectorAll?.('video').forEach(v => {
        if (v.src) reportUrl(v.src);
        addOverlayToVideo(v);
      });
    }
    // Catch src attribute changes on existing video elements
    if (
      mutation.type === 'attributes' &&
      mutation.target.tagName === 'VIDEO' &&
      mutation.attributeName === 'src'
    ) {
      const v = mutation.target;
      if (v.src) reportUrl(v.src);
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

// Initial scan + delayed scans for late-loading players
scanPage();
setTimeout(scanPage, 1500);
setTimeout(scanPage, 4000);
