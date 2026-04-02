// offscreen.js — Runs in a window context (has URL.createObjectURL, Blob, etc.)
// Background service worker delegates HLS browser-downloads here.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'HLS_DOWNLOAD') {
    doHlsDownload(message)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (message.type === 'REVOKE_BLOB') {
    try { URL.revokeObjectURL(message.blobUrl); } catch (_) {}
    return;
  }
});

function report(jobId, patch) {
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_PROGRESS', jobId, ...patch }).catch(() => {});
}

async function doHlsDownload({ jobId, m3u8Url, referer, title }) {
  const headers = referer ? { Referer: referer } : {};

  try {
    report(jobId, { msgType: 'status', message: 'Fetching playlist…', label: 'Fetching playlist…' });

    // ── Fetch m3u8 ────────────────────────────────────────────────────────────
    const res = await fetch(m3u8Url, { headers });
    if (!res.ok) throw new Error(`Playlist fetch failed: HTTP ${res.status}`);
    let text = await res.text();
    let baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    // Handle master playlist → pick highest-bandwidth variant
    if (text.includes('#EXT-X-STREAM-INF')) {
      const variants = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
          const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || '0');
          const u = lines[i + 1]?.trim();
          if (u && !u.startsWith('#'))
            variants.push({ bw, url: u.startsWith('http') ? u : baseUrl + u });
        }
      }
      variants.sort((a, b) => b.bw - a.bw);
      if (variants[0]) {
        const vr = await fetch(variants[0].url, { headers });
        if (!vr.ok) throw new Error(`Variant playlist failed: HTTP ${vr.status}`);
        text = await vr.text();
        baseUrl = variants[0].url.substring(0, variants[0].url.lastIndexOf('/') + 1);
      }
    }

    // Parse media segment URLs
    const segUrls = text.split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => l.startsWith('http') ? l : baseUrl + l);

    if (!segUrls.length) throw new Error('No segments found in playlist');

    // ── Download segments in parallel batches ─────────────────────────────────
    const BATCH = 8;
    const chunks = [];
    for (let i = 0; i < segUrls.length; i += BATCH) {
      const batch = segUrls.slice(i, i + BATCH);
      const bufs = await Promise.all(batch.map((u, bi) =>
        fetch(u, { headers }).then(r => {
          if (!r.ok) throw new Error(`Segment ${i + bi} HTTP ${r.status}`);
          return r.arrayBuffer();
        })
      ));
      chunks.push(...bufs);
      const done = Math.min(i + BATCH, segUrls.length);
      report(jobId, {
        msgType: 'progress',
        percent: Math.round((done / segUrls.length) * 95),
        speed: '', eta: '',
        size: `${done}/${segUrls.length} segments`,
        label: `${done}/${segUrls.length} segments`,
      });
    }

    // ── Concatenate and save ──────────────────────────────────────────────────
    report(jobId, { msgType: 'status', message: 'Combining segments…', label: 'Combining…' });
    const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const buf of chunks) { combined.set(new Uint8Array(buf), offset); offset += buf.byteLength; }

    const blob = new Blob([combined], { type: 'video/mp2t' });
    const blobUrl = URL.createObjectURL(blob);
    // Strip site-name suffixes (" - XVIDEOS.COM", " | Pornhub", etc.) from title
    const cleanedTitle = (title || 'video')
      .replace(/\s*[-–—|]\s*[A-Za-z0-9][\w.\- ]{0,40}(\.COM|\.NET|\.ORG|\.TV|\.ME|\.CC|\.TO)?\s*$/i, '')
      .replace(/\s*[-–|]\s*(Free Porn|HD Porn|Free Videos?|Watch Online)\s*$/i, '')
      .trim() || 'video';
    const safeName = cleanedTitle.replace(/[/\\?%*:|"<>]/g, '_').substring(0, 100);

    // chrome.downloads is not available in offscreen documents — delegate to background.js
    report(jobId, { msgType: 'status', message: 'Saving to disk…', label: 'Saving to disk…' });
    chrome.runtime.sendMessage({
      type: 'BROWSER_DL_URL',
      jobId,
      blobUrl,
      filename: safeName + '.ts',
    }).catch(() => {});

  } catch (err) {
    report(jobId, { msgType: 'error', error: err.message, status: 'error', label: err.message });
  }
}
