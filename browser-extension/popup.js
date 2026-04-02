// popup.js — Popup UI logic (native messaging / IDM-style)

const NATIVE_HOST = 'com.videodownloader.host';

let videos = [];
let nativeOk = false; // whether native host is reachable

// ─── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('refreshBtn').addEventListener('click', triggerRescan);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsLink').addEventListener('click', openSettings);
  document.getElementById('openAppBtn').addEventListener('click', openSettings);

  await checkNativeHost();
  await restoreActiveDownloads(); // restore in-progress jobs before rendering videos
  await loadVideos();
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

// ─── Native host health check ─────────────────────────────────────────────────

async function checkNativeHost() {
  const dot = document.getElementById('serverDot');
  const label = document.getElementById('serverUrl');

  label.textContent = 'Checking native host…';

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'NATIVE_PING' }, (response) => {
      if (response?.ok && response?.ytdlp) {
        dot.classList.add('online');
        label.textContent = `Native host ready  •  yt-dlp ✓`;
        nativeOk = true;
      } else if (response?.ok && !response?.ytdlp) {
        dot.classList.remove('online');
        label.textContent = 'Native host found but yt-dlp missing';
        nativeOk = false;
      } else {
        dot.classList.remove('online');
        label.textContent = 'Native host not installed — run install.sh';
        nativeOk = false;
      }
      resolve();
    });
  });
}

// ─── Load detected videos from background ─────────────────────────────────────

async function loadVideos() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_VIDEOS' }, (response) => {
      videos = response?.videos || [];
      renderVideos();
      resolve();
    });
  });
}

// ─── Restore active downloads from background ─────────────────────────────────

// jobId -> DOM elements (for live updates), populated by restoreActiveDownloads + startDownload
const activeJobs = new Map();

async function restoreActiveDownloads() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_DOWNLOADS' }, (response) => {
      const jobs = response?.jobs || [];
      if (jobs.length === 0) { resolve(); return; }

      // Render a persistent "Active Downloads" section above the video list
      const content = document.getElementById('content');
      const section = document.createElement('div');
      section.id = 'active-downloads-section';
      section.innerHTML = `<div class="list-header"><span class="list-title">Active Downloads</span></div>
        <div style="padding:0 10px 6px" id="active-downloads-list"></div>`;
      content.prepend(section);

      const list = document.getElementById('active-downloads-list');
      jobs.forEach(job => {
        const card = buildJobCard(job);
        list.appendChild(card);
      });

      resolve();
    });
  });
}

function buildJobCard(job) {
  const { jobId, title, percent = 0, speed = '', eta = '', label = '', status, download_dir = '' } = job;

  const card = document.createElement('div');
  card.className = 'video-card';
  card.id = `job-card-${jobId}`;
  card.style.marginBottom = '6px';

  const pct = Math.min(100, Math.max(0, percent));
  const isDone  = status === 'done';
  const isError = status === 'error';
  const fillClass = isDone ? 'done' : isError ? 'error-bar' : '';

  card.innerHTML = `
    <div class="video-title" style="margin-bottom:5px" title="${escapeHtml(job.url)}">${escapeHtml(title)}</div>
    <div class="progress-wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="progress-label" id="lbl-${jobId}">${escapeHtml(label || (isDone ? `Done! ${job.filename||''}` : 'In progress…'))}</span>
        <span class="progress-label" id="pct-${jobId}" style="color:${isDone?'#34d399':isError?'#ef4444':'#60a5fa'};font-weight:700">${isDone?'100%':isError?'✕':pct.toFixed(1)+'%'}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${fillClass}" id="fill-${jobId}" style="width:${pct}%"></div>
      </div>
      <div class="progress-stats">
        <span id="stat-left-${jobId}">${escapeHtml(isDone ? download_dir : (speed||'—'))}</span>
        <span id="stat-right-${jobId}">${escapeHtml(isDone ? '' : (eta ? 'ETA '+eta : ''))}</span>
      </div>
    </div>
  `;

  // Store elements for live updates
  activeJobs.set(jobId, {
    fill:  card.querySelector(`#fill-${jobId}`),
    lbl:   card.querySelector(`#lbl-${jobId}`),
    pct:   card.querySelector(`#pct-${jobId}`),
    left:  card.querySelector(`#stat-left-${jobId}`),
    right: card.querySelector(`#stat-right-${jobId}`),
    wrap:  card,
  });

  return card;
}

// ─── Rescan page ──────────────────────────────────────────────────────────────

async function triggerRescan() {
  const btn = document.getElementById('refreshBtn');
  btn.style.opacity = '0.4';
  btn.style.pointerEvents = 'none';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    }).catch(() => {});
  }

  setTimeout(async () => {
    await loadVideos();
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
  }, 800);
}

// ─── Render ────────────────────────────────────────────────────────────────────

function renderVideos() {
  const content = document.getElementById('content');
  const countLabel = document.getElementById('countLabel');

  if (!nativeOk) {
    countLabel.textContent = 'Setup required';
    content.innerHTML = `
      <div class="empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style="color:#f87171">Native host not installed</p>
        <small>Open a terminal in the <strong>browser-extension/native-host/</strong> folder and run:<br><br>
        <code style="background:#1e293b;padding:4px 8px;border-radius:4px;color:#60a5fa">bash install.sh</code><br><br>
        Then reload the extension.</small>
        <button class="dl-btn" style="margin-top:12px;max-width:200px" onclick="chrome.runtime.openOptionsPage()">Open Settings</button>
      </div>
    `;
    return;
  }

  if (videos.length === 0) {
    countLabel.textContent = 'No videos detected';
    content.innerHTML = `
      <div class="empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
        <p>No videos detected on this page yet.</p>
        <small>Play a video, then click the refresh button above.</small>
      </div>
    `;
    return;
  }

  const plural = videos.length === 1 ? '1 video detected' : `${videos.length} videos detected`;
  countLabel.textContent = plural;

  content.innerHTML = `
    <div class="list-header">
      <span class="list-title">Detected Videos</span>
      <button class="clear-btn" id="clearBtn">Clear all</button>
    </div>
    <div class="video-list" id="videoList"></div>
  `;

  document.getElementById('clearBtn').addEventListener('click', clearVideos);

  const list = document.getElementById('videoList');
  videos.forEach((video, index) => {
    list.appendChild(buildVideoCard(video, index));
  });
}

function buildVideoCard(video, index) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.dataset.index = index;

  const isPageUrl = video.source === 'page';
  const typeClass = isPageUrl ? 'page'
    : video.type === 'HLS' ? 'hls'
    : video.type === 'DASH' ? 'dash'
    : video.source === 'dom' ? 'dom' : '';

  const displayTitle = isPageUrl
    ? (video.title || video.name || video.type)
    : shortenUrl(video.url);

  const meta = [];
  if (video.quality) meta.push(video.quality);
  if (video.size) meta.push(formatBytes(video.size));
  if (!isPageUrl && video.contentType) meta.push(video.contentType.replace('video/', '').replace('audio/', '🎵 '));

  const browserDl = video.hlsFallback ? 'true' : 'false';
  const subMeta = isPageUrl
    ? (video.hlsFallback
        ? `<div class="video-meta" style="color:#f59e0b">⚡ Direct HLS — saved as .ts</div>`
        : `<div class="video-meta" style="color:#34d399">Best quality — yt-dlp auto-selects</div>`)
    : '';

  card.innerHTML = `
    <div class="card-top">
      <span class="type-badge ${typeClass}">${isPageUrl ? '⭐ ' : ''}${video.type}</span>
      <div style="flex:1;min-width:0">
        <div class="video-title" title="${escapeHtml(video.url)}">${escapeHtml(displayTitle)}</div>
        ${meta.length ? `<div class="video-meta">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
        ${subMeta}
      </div>
    </div>
    <div class="card-actions">
      <button class="dl-btn" data-url="${escapeHtml(video.url)}" data-audio="false" data-referer="${escapeHtml(video.referer || '')}" data-browser-dl="${browserDl}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download Video
      </button>
      <button class="dl-audio-btn" data-url="${escapeHtml(video.url)}" data-audio="true" data-referer="${escapeHtml(video.referer || '')}" data-browser-dl="${browserDl}" title="Download audio only (MP3)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        MP3
      </button>
    </div>
  `;

  card.querySelectorAll('[data-url]').forEach(btn => {
    btn.addEventListener('click', () => startDownload(btn));
  });

  return card;
}

// ─── Download via native messaging ────────────────────────────────────────────

function startDownload(btn) {
  const url = btn.dataset.url;
  const audioOnly = btn.dataset.audio === 'true';
  const referer = btn.dataset.referer || null;
  const useBrowserDownload = btn.dataset.browserDl === 'true';
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Read the title from the card
  const videoCard = btn.closest('.video-card');
  const title = videoCard?.querySelector('.video-title')?.textContent?.trim() || url;

  // Ensure "Active Downloads" section exists
  let section = document.getElementById('active-downloads-section');
  if (!section) {
    section = document.createElement('div');
    section.id = 'active-downloads-section';
    section.innerHTML = `<div class="list-header"><span class="list-title">Active Downloads</span></div>
      <div style="padding:0 10px 6px" id="active-downloads-list"></div>`;
    document.getElementById('content').prepend(section);
  }

  // Build and insert the job card into the active section
  const jobCard = buildJobCard({ jobId, url, title, percent: 0, speed: '', eta: '', label: 'Starting…', status: 'downloading' });
  document.getElementById('active-downloads-list').appendChild(jobCard);

  // Hide the buttons on the video card so it's clear it's downloading
  btn.closest('.card-actions').innerHTML =
    `<span class="progress-label" style="color:#60a5fa;padding:2px 0">↓ Downloading — see above</span>`;

  chrome.runtime.sendMessage(
    { type: 'NATIVE_DOWNLOAD', url, audioOnly, referer, jobId, title, useBrowserDownload },
    (response) => {
      if (!response?.success) {
        showError(jobId, response?.error || 'Native host not installed. Run install.sh.');
      }
    }
  );
}

function updateProgress(jobId, msg) {
  const els = activeJobs.get(jobId);
  if (!els) return;

  if (msg.msgType === 'progress') {
    const pct = Math.min(100, Math.max(0, msg.percent || 0));
    els.fill.style.width = pct + '%';
    els.pct.textContent = pct.toFixed(1) + '%';
    if (msg.speed) els.left.textContent = msg.speed;
    if (msg.eta && msg.eta !== '00:00') els.right.textContent = 'ETA ' + msg.eta;
    if (msg.size) els.lbl.textContent = msg.size;
    if (pct >= 100) {
      els.lbl.textContent = 'Finishing…';
      els.right.textContent = '';
    }
  } else if (msg.msgType === 'status') {
    els.lbl.textContent = msg.message || '';
  } else if (msg.msgType === 'done') {
    els.fill.style.width = '100%';
    els.fill.classList.add('done');
    els.pct.textContent = '100%';
    els.pct.style.color = '#34d399';
    els.lbl.textContent = `✓ Done! ${msg.filename || ''}`;
    els.left.textContent = msg.download_dir || '';
    els.right.textContent = '';
    activeJobs.delete(jobId);
    // Fade out the card after 30s
    setTimeout(() => els.wrap?.remove(), 30000);
  } else if (msg.msgType === 'error') {
    showError(jobId, msg.error);
  }
}

function showError(jobId, error) {
  const els = activeJobs.get(jobId);
  if (!els) return;
  els.fill.style.width = '100%';
  els.fill.classList.add('error-bar');
  els.pct.textContent = '✕';
  els.pct.style.color = '#ef4444';
  els.lbl.textContent = error || 'Failed';
  els.lbl.style.color = '#f87171';
  els.left.textContent = '';
  els.right.textContent = '';
  activeJobs.delete(jobId);
  setTimeout(() => els.wrap?.remove(), 30000);
}

// ─── Clear ─────────────────────────────────────────────────────────────────────

function clearVideos() {
  chrome.runtime.sendMessage({ type: 'CLEAR_VIDEOS' }, () => {
    videos = [];
    renderVideos();
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 50 ? '…' + u.pathname.slice(-40) : u.pathname;
    return u.hostname + path;
  } catch {
    return url.length > 70 ? url.slice(0, 67) + '…' : url;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Live updates from background ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'VIDEOS_UPDATED') {
    loadVideos();
  }
  if (message.type === 'DOWNLOAD_PROGRESS') {
    updateProgress(message.jobId, message);
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

init();
