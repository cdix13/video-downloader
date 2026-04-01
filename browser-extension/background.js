// background.js — Service worker that intercepts network requests to detect video streams

// tabId -> Map<url, videoInfo>
const detectedVideos = new Map();

// ─── Persistent download state (survives popup open/close) ────────────────────
// jobId -> { jobId, url, audioOnly, title, percent, speed, eta, size, label, status, filename, download_dir }
const activeDownloads = new Map();

// ─── Known video sites — pass the PAGE URL directly to yt-dlp ─────────────────
// These sites use encrypted/adaptive streaming that can't be captured via network
// interception. yt-dlp already knows how to download from all of them.
const KNOWN_VIDEO_SITES = [
  { pattern: /youtube\.com\/watch\?.*v=/, name: 'YouTube', type: 'YouTube' },
  { pattern: /youtu\.be\//, name: 'YouTube', type: 'YouTube' },
  { pattern: /vimeo\.com\/\d+/, name: 'Vimeo', type: 'Vimeo' },
  { pattern: /dailymotion\.com\/video\//, name: 'Dailymotion', type: 'Dailymotion' },
  { pattern: /twitch\.tv\/videos\//, name: 'Twitch', type: 'Twitch' },
  { pattern: /bilibili\.com\/video\//, name: 'Bilibili', type: 'Bilibili' },
  { pattern: /tiktok\.com\/@.*\/video\//, name: 'TikTok', type: 'TikTok' },
  { pattern: /instagram\.com\/(p|reel)\//, name: 'Instagram', type: 'Instagram' },
  { pattern: /twitter\.com\/.*\/status\//, name: 'Twitter', type: 'Twitter' },
  { pattern: /x\.com\/.*\/status\//, name: 'Twitter/X', type: 'Twitter' },
  { pattern: /facebook\.com\/.*\/videos\//, name: 'Facebook', type: 'Facebook' },
  { pattern: /nicovideo\.jp\/watch\//, name: 'NicoVideo', type: 'NicoVideo' },
  { pattern: /missav\.com\//, name: 'MissAV', type: 'MissAV' },
  { pattern: /javdb\.com\//, name: 'JavDB', type: 'JavDB' },
];

// YouTube itag → quality label
const ITAG_QUALITY = {
  '137': '1080p (video only)', '248': '1080p WebM (video only)',
  '136': '720p (video only)',  '247': '720p WebM (video only)',
  '135': '480p (video only)',  '244': '480p WebM (video only)',
  '134': '360p (video only)',  '243': '360p WebM (video only)',
  '133': '240p (video only)',  '242': '240p WebM (video only)',
  '160': '144p (video only)',  '278': '144p WebM (video only)',
  '140': '🎵 128kbps AAC',    '251': '🎵 160kbps Opus',
  '250': '🎵 70kbps Opus',    '249': '🎵 50kbps Opus',
  '18':  '360p (video+audio)','22':  '720p (video+audio)',
};

function matchKnownSite(pageUrl) {
  try {
    for (const site of KNOWN_VIDEO_SITES) {
      if (site.pattern.test(pageUrl)) return site;
    }
  } catch (_) {}
  return null;
}

// URL patterns that indicate a video stream
const VIDEO_URL_PATTERNS = [
  /\.m3u8(\?|#|$)/i,
  /\.mpd(\?|#|$)/i,
  /\.mp4(\?|#|$)/i,
  /\.webm(\?|#|$)/i,
  /\.flv(\?|#|$)/i,
  /\.mkv(\?|#|$)/i,
  /\.ts(\?|#|$)/i,
  /\/hls\//i,
  /\/dash\//i,
  /\/manifest\.m3u8/i,
  /\/playlist\.m3u8/i,
  /\/index\.m3u8/i,
  /googlevideo\.com\/videoplayback/i,  // YouTube adaptive stream
  /\/videoplayback(\?|$)/i,
];

// Content-Type values that indicate video
const VIDEO_CONTENT_TYPES = [
  'video/',
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'application/dash+xml',
  'application/octet-stream', // some HLS servers use this
];

// URLs to always ignore (ads, trackers, tiny segments, etc.)
const IGNORED_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot)(\?|$)/i,
  /\/ads?\//i,
  /\/analytics\//i,
  /\/beacon/i,
  /\/ping/i,
  /\/tracking/i,
];

function isVideoUrl(url) {
  if (IGNORED_PATTERNS.some(p => p.test(url))) return false;
  return VIDEO_URL_PATTERNS.some(p => p.test(url));
}

function isVideoContentType(contentType) {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return VIDEO_CONTENT_TYPES.some(t => ct.includes(t));
}

function getVideoType(url) {
  if (/\.m3u8/i.test(url) || /m3u8/i.test(url)) return 'HLS';
  if (/\.mpd/i.test(url) || /\.dash/i.test(url)) return 'DASH';
  if (/\.mp4/i.test(url)) return 'MP4';
  if (/\.webm/i.test(url)) return 'WebM';
  if (/\.flv/i.test(url)) return 'FLV';
  if (/\.mkv/i.test(url)) return 'MKV';
  if (/\.ts(\?|$)/i.test(url)) return 'TS';
  return 'Video';
}

function addVideoForTab(tabId, videoInfo) {
  if (!detectedVideos.has(tabId)) {
    detectedVideos.set(tabId, new Map());
  }
  const videos = detectedVideos.get(tabId);
  if (!videos.has(videoInfo.url)) {
    videos.set(videoInfo.url, videoInfo);
    updateBadge(tabId, videos.size);
    // Notify popup if it's open
    chrome.runtime.sendMessage({ type: 'VIDEOS_UPDATED', tabId }).catch(() => {});
  }
}

function updateBadge(tabId, count) {
  const text = count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb', tabId }).catch(() => {});
}

// ─── Network request interception ─────────────────────────────────────────────

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return; // Ignore background requests

    const url = details.url;
    let isVideo = isVideoUrl(url);

    // Also check response Content-Type header
    if (!isVideo && details.responseHeaders) {
      const ctHeader = details.responseHeaders.find(
        h => h.name.toLowerCase() === 'content-type'
      );
      if (ctHeader && isVideoContentType(ctHeader.value)) {
        isVideo = true;
      }
    }

    if (isVideo) {
      // Capture file size from Content-Length header
      const clHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-length');
      const size = clHeader ? parseInt(clHeader.value, 10) : null;

      // Capture content type
      const ctHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');
      const contentType = ctHeader?.value?.split(';')[0].trim() || null;

      // Parse quality hints from URL params (YouTube itag, mime, etc.)
      let quality = null;
      try {
        const u = new URL(url);
        const mime = u.searchParams.get('mime');
        const itag = u.searchParams.get('itag');
        const ql = u.searchParams.get('quality_label') || u.searchParams.get('quality');
        if (ql) quality = ql;
        else if (itag) quality = ITAG_QUALITY[itag] || `itag ${itag}`;
        else if (mime) quality = mime.replace('video/', '').replace('audio/', '🎵 ');
      } catch (_) {}

      // Store the page origin as referer so yt-dlp can authenticate
      const referer = details.initiator || details.documentUrl || null;

      addVideoForTab(details.tabId, {
        url,
        type: getVideoType(url),
        timestamp: Date.now(),
        source: 'network',
        size: isNaN(size) ? null : size,
        contentType,
        quality,
        referer,
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ─── Tab lifecycle ─────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    // Clear old videos for this tab on navigation
    detectedVideos.delete(tabId);
    updateBadge(tabId, 0);
  }

  // When the page finishes loading, check if it's a known video site
  if (changeInfo.status === 'complete' && tab.url) {
    const site = matchKnownSite(tab.url);
    if (site) {
      // Clean the tab title (strip " - YouTube", " - Vimeo" etc. suffixes)
      let title = tab.title || '';
      title = title.replace(/\s[-–|]\s*(YouTube|Vimeo|Dailymotion|Twitch|Bilibili|TikTok|Instagram|Twitter|Facebook|NicoVideo)$/i, '').trim();

      addVideoForTab(tabId, {
        url: tab.url,
        type: site.type,
        name: site.name,
        title: title || site.name,
        timestamp: Date.now(),
        source: 'page',
      });
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detectedVideos.delete(tabId);
});

// ─── Message handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script reporting a <video> src
  if (message.type === 'VIDEO_DETECTED') {
    const tabId = sender.tab?.id;
    if (tabId && message.url) {
      addVideoForTab(tabId, {
        url: message.url,
        type: message.videoType || 'Video',
        timestamp: Date.now(),
        source: 'dom',
      });
    }
    return;
  }

  // Popup requesting the video list for the current tab
  if (message.type === 'GET_VIDEOS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const tabId = tab?.id;

      // If on a known video site but page entry not yet stored (e.g. popup opened
      // before tab finished loading, or extension was reloaded), add it now.
      if (tab?.url) {
        const site = matchKnownSite(tab.url);
        if (site) {
          const existing = detectedVideos.get(tabId);
          const alreadyHasPage = existing && Array.from(existing.values()).some(v => v.source === 'page');
          if (!alreadyHasPage) {
            let title = tab.title || '';
            title = title.replace(/\s[-–|]\s*(YouTube|Vimeo|Dailymotion|Twitch|Bilibili|TikTok|Instagram|Twitter|Facebook|NicoVideo|MissAV|JavDB)$/i, '').trim();
            addVideoForTab(tabId, {
              url: tab.url, type: site.type, name: site.name,
              title: title || site.name, timestamp: Date.now(), source: 'page',
            });
          }
        }
      }

      const videos = tabId && detectedVideos.has(tabId)
        ? Array.from(detectedVideos.get(tabId).values())
        : [];

      // Sort: page URL entries first (most reliable), then by timestamp
      videos.sort((a, b) => {
        if (a.source === 'page' && b.source !== 'page') return -1;
        if (b.source === 'page' && a.source !== 'page') return 1;
        return b.timestamp - a.timestamp;
      });

      sendResponse({ videos });
    });
    return true; // Keep message channel open for async response
  }

  // Popup requesting a download — use connectNative for streaming progress
  if (message.type === 'NATIVE_DOWNLOAD') {
    const { url, audioOnly, referer, jobId, title } = message;

    let port;
    try {
      port = chrome.runtime.connectNative('com.videodownloader.host');
    } catch (e) {
      sendResponse({ success: false, error: 'Native host not installed. Run install.sh.' });
      return true;
    }

    // Register job state immediately so popup can restore it if reopened
    activeDownloads.set(jobId, {
      jobId, url, audioOnly, title: title || url,
      percent: 0, speed: '', eta: '', size: '', label: 'Starting…',
      status: 'downloading', filename: '', download_dir: '',
    });

    // Acknowledge so popup can switch to progress UI
    sendResponse({ success: true, jobId });

    function updateJob(patch) {
      const job = activeDownloads.get(jobId);
      if (job) activeDownloads.set(jobId, { ...job, ...patch });
    }

    port.onMessage.addListener((msg) => {
      // Update persisted state
      if (msg.msgType === 'progress') {
        updateJob({ percent: msg.percent, speed: msg.speed, eta: msg.eta, size: msg.size, label: msg.size || '' });
      } else if (msg.msgType === 'status') {
        updateJob({ label: msg.message });
      } else if (msg.msgType === 'done') {
        updateJob({ status: 'done', percent: 100, label: `Done! ${msg.filename || ''}`, filename: msg.filename, download_dir: msg.download_dir });
        // Auto-remove from active list after 30s
        setTimeout(() => activeDownloads.delete(jobId), 30000);
        port.disconnect();
      } else if (msg.msgType === 'error') {
        updateJob({ status: 'error', label: msg.error });
        setTimeout(() => activeDownloads.delete(jobId), 30000);
        port.disconnect();
      }

      // Forward to popup if it's open
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, ...msg }).catch(() => {});
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        const errMsg = 'Native host disconnected: ' + chrome.runtime.lastError.message;
        updateJob({ status: 'error', label: errMsg });
        setTimeout(() => activeDownloads.delete(jobId), 30000);
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_PROGRESS', jobId, msgType: 'error', error: errMsg,
        }).catch(() => {});
      }
    });

    port.postMessage({ action: 'download', url, audio_only: audioOnly, referer: referer || null });
    return true;
  }

  // Popup requesting all active downloads on open
  if (message.type === 'GET_ACTIVE_DOWNLOADS') {
    sendResponse({ jobs: Array.from(activeDownloads.values()) });
    return true;
  }

  // Popup pinging the native host to check it is installed
  if (message.type === 'NATIVE_PING') {
    chrome.runtime.sendNativeMessage(
      'com.videodownloader.host',
      { action: 'ping' },
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, ...response });
        }
      }
    );
    return true;
  }

  // Popup requesting clear
  if (message.type === 'CLEAR_VIDEOS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        detectedVideos.delete(tabId);
        updateBadge(tabId, 0);
      }
      sendResponse({ success: true });
    });
    return true;
  }
});
