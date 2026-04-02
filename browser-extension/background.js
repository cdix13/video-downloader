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
  // General
  { pattern: /youtube\.com\/watch\?.*v=/, name: 'YouTube',     type: 'YouTube'     },
  { pattern: /youtu\.be\//,               name: 'YouTube',     type: 'YouTube'     },
  { pattern: /vimeo\.com\/\d+/,           name: 'Vimeo',       type: 'Vimeo'       },
  { pattern: /dailymotion\.com\/video\//,  name: 'Dailymotion', type: 'Dailymotion' },
  { pattern: /twitch\.tv\/videos\//,       name: 'Twitch',      type: 'Twitch'      },
  { pattern: /bilibili\.com\/video\//,     name: 'Bilibili',    type: 'Bilibili'    },
  { pattern: /tiktok\.com\/@.*\/video\//,  name: 'TikTok',      type: 'TikTok'      },
  { pattern: /instagram\.com\/(p|reel)\//,name: 'Instagram',   type: 'Instagram'   },
  { pattern: /twitter\.com\/.*\/status\//, name: 'Twitter',     type: 'Twitter'     },
  { pattern: /x\.com\/.*\/status\//,       name: 'Twitter/X',   type: 'Twitter'     },
  { pattern: /facebook\.com\/.*\/videos\//, name: 'Facebook',   type: 'Facebook'    },
  { pattern: /nicovideo\.jp\/watch\//,     name: 'NicoVideo',   type: 'NicoVideo'   },
  // Adult / JAV sites supported by yt-dlp
  { pattern: /missav\.com\//,              name: 'MissAV',      type: 'MissAV'      },
  { pattern: /javdb\.com\//,               name: 'JavDB',       type: 'JavDB'       },
  { pattern: /xvideos\.com\/video/,        name: 'XVideos',     type: 'XVideos'     },
  { pattern: /xhamster\.com\/videos\//,    name: 'xHamster',    type: 'xHamster'    },
  { pattern: /pornhub\.com\/view_video/,   name: 'PornHub',     type: 'PornHub'     },
  { pattern: /redtube\.com\/\d+/,          name: 'RedTube',     type: 'RedTube'     },
  { pattern: /youporn\.com\/watch\//,      name: 'YouPorn',     type: 'YouPorn'     },
  { pattern: /tube8\.com\/.*\/\d+\//,      name: 'Tube8',       type: 'Tube8'       },
  { pattern: /spankbang\.com\/.*\/video\//, name: 'SpankBang',  type: 'SpankBang'   },
  { pattern: /eporner\.com\/hd-porn\//,    name: 'EPorner',     type: 'EPorner'     },
  { pattern: /javhd\.com\//,               name: 'JavHD',       type: 'JavHD'       },
  { pattern: /javfull\.net\//,             name: 'JavFull',     type: 'JavFull'     },
  { pattern: /javmost\.com\//,             name: 'JavMost',     type: 'JavMost'     },
  { pattern: /fc2\.com\/.*\//,             name: 'FC2',         type: 'FC2'         },
  { pattern: /dmm\.co\.jp\//,              name: 'DMM',         type: 'DMM'         },
  { pattern: /caribbeancom\.com\//,        name: 'Caribbean',   type: 'Caribbean'   },
  { pattern: /1pondo\.tv\//,               name: '1Pondo',      type: '1Pondo'      },
  { pattern: /heyzo\.com\//,               name: 'Heyzo',       type: 'Heyzo'       },
  { pattern: /mgstage\.com\//,             name: 'MGStage',     type: 'MGStage'     },
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

// Strip website-name suffixes from tab titles so filenames are clean.
// Handles patterns like: " - YouTube", " | XVIDEOS.COM", " — Pornhub", etc.
function cleanTitle(raw) {
  if (!raw) return '';
  return raw
    // Remove trailing " - SiteName", " | SiteName", " — SiteName" etc.
    .replace(/\s*[-–—|]\s*[A-Za-z0-9][\w.\- ]{0,40}(\.COM|\.NET|\.ORG|\.TV|\.ME|\.CC|\.TO)?\s*$/i, '')
    // Remove "Free Porn" / "HD Porn" / "Free Videos" cruft some sites append
    .replace(/\s*[-–|]\s*(Free Porn|HD Porn|Free Videos?|Watch Online|Free Download)\s*$/i, '')
    .trim();
}

function matchKnownSite(pageUrl) {
  try {
    for (const site of KNOWN_VIDEO_SITES) {
      if (site.pattern.test(pageUrl)) return site;
    }
  } catch (_) {}
  return null;
}

// For sites where the main domain may be blocked at the OS level (e.g. xvideos.com),
// try to find a direct CDN HLS stream URL from captured network requests instead.
// Returns { url, referer } or null.
function findBestHlsUrl(tabId) {
  const videos = detectedVideos.get(tabId);
  if (!videos) return null;
  const all = Array.from(videos.values()).filter(v => v.source !== 'page');

  // Prefer any directly captured m3u8
  const m3u8 = all.find(v => /\.m3u8/i.test(v.url));
  if (m3u8) return { url: m3u8.url, referer: m3u8.referer };

  // Reconstruct m3u8 from the first TS segment URL
  // Pattern: .../mainNNNN.ts  →  .../main.m3u8
  const tsEntries = all.filter(v => /\.ts(\?|$)/i.test(v.url));
  for (const seg of tsEntries) {
    const m = seg.url.match(/^(https?:\/\/.+\/)main\d+\.ts(\?.*)?$/i);
    if (m) return { url: m[1] + 'main.m3u8', referer: seg.referer, reconstructed: true };
    // Variant: segment_NNN.ts → playlist.m3u8
    const m2 = seg.url.match(/^(https?:\/\/.+\/)segment_?\d+\.ts(\?.*)?$/i);
    if (m2) return { url: m2[1] + 'playlist.m3u8', referer: seg.referer, reconstructed: true };
  }

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
      title = cleanTitle(title);

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

// ─── ffmpeg .ts → .mp4 conversion via native host ─────────────────────────────

function triggerFfmpegConversion(jobId, tsFilePath) {
  function updateJob(patch) {
    const job = activeDownloads.get(jobId);
    if (job) activeDownloads.set(jobId, { ...job, ...patch });
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, ...patch }).catch(() => {});
  }

  let port;
  try {
    port = chrome.runtime.connectNative('com.videodownloader.host');
  } catch (e) {
    // ffmpeg unavailable — mark done with the .ts file
    const tsName = tsFilePath.split('/').pop();
    updateJob({ status: 'done', percent: 100, label: `Saved as ${tsName}`, filename: tsName });
    setTimeout(() => activeDownloads.delete(jobId), 30000);
    return;
  }

  port.onMessage.addListener((msg) => {
    if (msg.msgType === 'status') {
      updateJob({ label: msg.message });
    } else if (msg.msgType === 'done') {
      updateJob({ status: 'done', percent: 100,
        label: `Done! ${msg.filename || ''}`, filename: msg.filename, download_dir: msg.download_dir });
      setTimeout(() => activeDownloads.delete(jobId), 30000);
      port.disconnect();
    } else if (msg.msgType === 'error') {
      // Conversion failed — .ts file still exists, mark as done
      const tsName = tsFilePath.split('/').pop();
      updateJob({ status: 'done', percent: 100,
        label: `Saved as ${tsName} (MP4 convert failed: ${msg.error})`, filename: tsName });
      setTimeout(() => activeDownloads.delete(jobId), 30000);
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
      const tsName = tsFilePath.split('/').pop();
      updateJob({ status: 'done', percent: 100, label: `Saved as ${tsName}`, filename: tsName });
      setTimeout(() => activeDownloads.delete(jobId), 30000);
    }
  });

  port.postMessage({ action: 'convert', input_path: tsFilePath });
}

// ─── Browser-assisted HLS download (via offscreen document) ───────────────────
// Service workers lack URL.createObjectURL, so we delegate blob creation and
// chrome.downloads to an offscreen document which runs in a window context.

async function downloadHlsViaBrowser(jobId, m3u8Url, referer, title) {
  function updateJob(patch) {
    const job = activeDownloads.get(jobId);
    if (job) activeDownloads.set(jobId, { ...job, ...patch });
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, ...patch }).catch(() => {});
  }

  try {
    // Create offscreen document if not already open
    const existing = await chrome.offscreen.hasDocument();
    if (!existing) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Create blob URLs for HLS video download',
      });
      // Wait for offscreen.js to register its message listener
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    // Delegate the download to the offscreen document
    chrome.runtime.sendMessage({
      type: 'HLS_DOWNLOAD',
      jobId, m3u8Url, referer, title,
    }).catch(err => {
      updateJob({ msgType: 'error', error: err.message, status: 'error', label: err.message });
      setTimeout(() => activeDownloads.delete(jobId), 30000);
    });

  } catch (err) {
    updateJob({ msgType: 'error', error: err.message, status: 'error', label: err.message });
    setTimeout(() => activeDownloads.delete(jobId), 30000);
  }
}

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

      // Trigger a performance-entry scan in the page to catch m3u8 URLs that
      // webRequest may have missed (cached responses, service worker interceptions).
      if (tabId) {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            try {
              for (const entry of performance.getEntries()) {
                if (/\.m3u8/i.test(entry.name) || /\.mpd/i.test(entry.name)) {
                  chrome.runtime.sendMessage({
                    type: 'VIDEO_DETECTED',
                    url: entry.name,
                    videoType: /\.m3u8/i.test(entry.name) ? 'HLS' : 'DASH',
                  }).catch(() => {});
                }
              }
            } catch (_) {}
          },
        }).catch(() => {});
      }

      // If on a known video site but page entry not yet stored (e.g. popup opened
      // before tab finished loading, or extension was reloaded), add it now.
      if (tab?.url) {
        const site = matchKnownSite(tab.url);
        if (site) {
          const existing = detectedVideos.get(tabId);
          const alreadyHasPage = existing && Array.from(existing.values()).some(v => v.source === 'page');
          if (!alreadyHasPage) {
            let title = tab.title || '';
            title = cleanTitle(title);
            addVideoForTab(tabId, {
              url: tab.url, type: site.type, name: site.name,
              title: title || site.name, timestamp: Date.now(), source: 'page',
            });
          }
        }
      }

      let videos = tabId && detectedVideos.has(tabId)
        ? Array.from(detectedVideos.get(tabId).values())
        : [];

      // For known sites, if we have a CDN HLS stream, replace the page entry URL
      // with it so yt-dlp downloads directly from CDN (bypasses cases where the
      // main domain is blocked at the OS/DNS level for the native host process).
      if (tabId) {
        const hls = findBestHlsUrl(tabId);
        if (hls) {
          videos = videos.map(v => {
            if (v.source === 'page') {
              return {
                ...v,
                url: hls.url,
                type: 'HLS',
                referer: hls.referer || v.url, // page URL as referer
                hlsFallback: true,
              };
            }
            return v;
          });
        }
      }

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

  // Popup requesting a download
  if (message.type === 'NATIVE_DOWNLOAD') {
    const { url, audioOnly, referer, jobId, title, useBrowserDownload } = message;

    // Register job state immediately so popup can restore it if reopened
    activeDownloads.set(jobId, {
      jobId, url, audioOnly, title: title || url,
      percent: 0, speed: '', eta: '', size: '', label: 'Starting…',
      status: 'downloading', filename: '', download_dir: '',
    });

    sendResponse({ success: true, jobId });

    // Browser-assisted HLS download: browser fetch() bypasses system-level firewalls/DNS blocks
    if (useBrowserDownload) {
      downloadHlsViaBrowser(jobId, url, referer, title);
      return true;
    }

    // Native yt-dlp download via connectNative
    let port;
    try {
      port = chrome.runtime.connectNative('com.videodownloader.host');
    } catch (e) {
      const errMsg = 'Native host not installed. Run install.sh.';
      activeDownloads.get(jobId) && activeDownloads.set(jobId, { ...activeDownloads.get(jobId), status: 'error', label: errMsg });
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, msgType: 'error', error: errMsg }).catch(() => {});
      return true;
    }

    function updateJob(patch) {
      const job = activeDownloads.get(jobId);
      if (job) activeDownloads.set(jobId, { ...job, ...patch });
    }

    port.onMessage.addListener((msg) => {
      if (msg.msgType === 'progress') {
        updateJob({ percent: msg.percent, speed: msg.speed, eta: msg.eta, size: msg.size, label: msg.size || '' });
      } else if (msg.msgType === 'status') {
        updateJob({ label: msg.message });
      } else if (msg.msgType === 'done') {
        updateJob({ status: 'done', percent: 100, label: `Done! ${msg.filename || ''}`, filename: msg.filename, download_dir: msg.download_dir });
        setTimeout(() => activeDownloads.delete(jobId), 30000);
        port.disconnect();
      } else if (msg.msgType === 'error') {
        updateJob({ status: 'error', label: msg.error });
        setTimeout(() => activeDownloads.delete(jobId), 30000);
        port.disconnect();
      }
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, ...msg }).catch(() => {});
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        const errMsg = 'Native host disconnected: ' + chrome.runtime.lastError.message;
        updateJob({ status: 'error', label: errMsg });
        setTimeout(() => activeDownloads.delete(jobId), 30000);
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, msgType: 'error', error: errMsg }).catch(() => {});
      }
    });

    port.postMessage({ action: 'download', url, audio_only: audioOnly, referer: referer || null });
    return true;
  }

  // Offscreen document sends us the blob URL to trigger download (chrome.downloads unavailable there)
  if (message.type === 'BROWSER_DL_URL') {
    const { jobId, blobUrl, filename } = message;
    sendResponse({ ok: true });

    chrome.downloads.download({ url: blobUrl, filename, saveAs: false }, (dlId) => {
      if (chrome.runtime.lastError || dlId === undefined) {
        const err = chrome.runtime.lastError?.message || 'Download failed to start';
        const job = activeDownloads.get(jobId);
        if (job) activeDownloads.set(jobId, { ...job, status: 'error', label: err });
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, msgType: 'error', error: err }).catch(() => {});
        chrome.runtime.sendMessage({ type: 'REVOKE_BLOB', blobUrl }).catch(() => {});
        setTimeout(() => activeDownloads.delete(jobId), 30000);
        return;
      }

      const onChanged = (delta) => {
        if (delta.id !== dlId) return;
        if (delta.state?.current === 'complete') {
          chrome.downloads.onChanged.removeListener(onChanged);
          chrome.runtime.sendMessage({ type: 'REVOKE_BLOB', blobUrl }).catch(() => {});
          // Get the actual file path then trigger ffmpeg conversion
          chrome.downloads.search({ id: dlId }, (items) => {
            const filePath = items?.[0]?.filename;
            if (filePath) {
              const job = activeDownloads.get(jobId);
              if (job) activeDownloads.set(jobId, { ...job, percent: 99, label: 'Converting .ts → .mp4…' });
              chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, msgType: 'status', message: 'Converting .ts → .mp4…', label: 'Converting .ts → .mp4…' }).catch(() => {});
              triggerFfmpegConversion(jobId, filePath);
            } else {
              const job = activeDownloads.get(jobId);
              if (job) activeDownloads.set(jobId, { ...job, status: 'done', percent: 100, label: `Saved as ${filename}`, filename });
              chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, msgType: 'done', percent: 100, label: `Saved as ${filename}`, filename, download_dir: '' }).catch(() => {});
              setTimeout(() => activeDownloads.delete(jobId), 30000);
            }
          });
        } else if (delta.error?.current) {
          chrome.downloads.onChanged.removeListener(onChanged);
          chrome.runtime.sendMessage({ type: 'REVOKE_BLOB', blobUrl }).catch(() => {});
          const err = delta.error.current;
          const job = activeDownloads.get(jobId);
          if (job) activeDownloads.set(jobId, { ...job, status: 'error', label: err });
          chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, msgType: 'error', error: err }).catch(() => {});
          setTimeout(() => activeDownloads.delete(jobId), 30000);
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
    });
    return true;
  }

  // Progress forwarded from offscreen document for browser HLS downloads
  if (message.type === 'OFFSCREEN_PROGRESS') {
    const { jobId } = message;
    const job = activeDownloads.get(jobId);
    if (job) {
      const patch = {};
      if (message.msgType === 'progress') {
        Object.assign(patch, { percent: message.percent, speed: message.speed, eta: message.eta, size: message.size, label: message.label });
      } else if (message.msgType === 'status') {
        patch.label = message.label || message.message;
      } else if (message.msgType === 'done') {
        Object.assign(patch, { status: 'done', percent: 100, label: message.label, filename: message.filename, download_dir: message.download_dir || '' });
        setTimeout(() => activeDownloads.delete(jobId), 30000);
      } else if (message.msgType === 'error') {
        Object.assign(patch, { status: 'error', label: message.error });
        setTimeout(() => activeDownloads.delete(jobId), 30000);
      }
      activeDownloads.set(jobId, { ...job, ...patch });
    }
    // Forward to popup if open — exclude 'type' from message so it doesn't override DOWNLOAD_PROGRESS
    const { type: _t, ...rest } = message;
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', jobId, ...rest }).catch(() => {});
    return;
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
