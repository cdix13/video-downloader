// content.js — Scans the DOM for video elements and reports their sources

const REPORTED_URLS = new Set();

// ─── Overlay toggle state ──────────────────────────────────────────────────────
// Default OFF: no buttons in the DOM until toggled on (Alt+D or popup message).
let overlayForceVisible = false;

const trackedVideos = new Set();           // every video seen on the page
const videoButtons = new Map();            // videoEl -> { btn, onScroll, onResize }

function setOverlayForceVisible(val) {
  overlayForceVisible = val;
  if (val) {
    for (const videoEl of trackedVideos) createButtonForVideo(videoEl);
  } else {
    for (const videoEl of [...videoButtons.keys()]) removeButtonForVideo(videoEl);
  }
}

// Alt+D toggles the overlay on/off
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.code === 'KeyD' && !e.ctrlKey && !e.metaKey) {
    setOverlayForceVisible(!overlayForceVisible);
  }
}, { capture: true });

// Respond to messages from the popup or background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_OVERLAY') {
    setOverlayForceVisible(msg.visible !== undefined ? msg.visible : !overlayForceVisible);
  }
});

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
  } catch (_) {}
}

// ─── Download overlay button ───────────────────────────────────────────────────

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

function createButtonForVideo(videoEl) {
  if (videoButtons.has(videoEl)) return;

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
    btn.style.position = 'fixed';
    btn.style.top  = (rect.top  + 10) + 'px';
    btn.style.left = (rect.right - btn.offsetWidth - 10) + 'px';
  }

  const onScroll = () => positionBtn();
  const onResize = () => positionBtn();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  videoButtons.set(videoEl, { btn, onScroll, onResize });

  positionBtn();
  btn.classList.add('visible');

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

function removeButtonForVideo(videoEl) {
  const entry = videoButtons.get(videoEl);
  if (!entry) return;
  const { btn, onScroll, onResize } = entry;
  btn.remove();
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onResize);
  videoButtons.delete(videoEl);
}

// Track video elements; create button immediately only when overlay is ON.
function addOverlayToVideo(videoEl) {
  if (trackedVideos.has(videoEl)) return;
  trackedVideos.add(videoEl);
  if (overlayForceVisible) createButtonForVideo(videoEl);
}

// ─── DOM scanning ──────────────────────────────────────────────────────────────

function scanPage() {
  document.querySelectorAll('video').forEach(video => {
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

// ─── Performance entry scan ────────────────────────────────────────────────────

function scanPerformanceEntries() {
  try {
    for (const entry of performance.getEntries()) {
      if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch' ||
          entry.initiatorType === 'other' || entry.initiatorType === '') {
        if (/\.m3u8/i.test(entry.name) || /\.mpd/i.test(entry.name)) {
          reportUrl(entry.name);
        }
      }
    }
  } catch (_) {}
}

try {
  const perfObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (/\.m3u8/i.test(entry.name) || /\.mpd/i.test(entry.name)) {
        reportUrl(entry.name);
      }
    }
  });
  perfObserver.observe({ entryTypes: ['resource'] });
} catch (_) {}

scanPage();
scanPerformanceEntries();
setTimeout(() => { scanPage(); scanPerformanceEntries(); }, 1500);
setTimeout(() => { scanPage(); scanPerformanceEntries(); }, 4000);
