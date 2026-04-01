// options.js

const DEFAULT_SERVER = 'http://localhost:5001';

const serverInput = document.getElementById('serverUrl');
const testBtn = document.getElementById('testBtn');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');

// Load saved settings
chrome.storage.local.get('serverUrl', (data) => {
  serverInput.value = data.serverUrl || DEFAULT_SERVER;
});

// Test connection
testBtn.addEventListener('click', async () => {
  const url = serverInput.value.trim().replace(/\/$/, '');
  statusMsg.textContent = 'Testing…';
  statusMsg.className = 'status-msg';

  try {
    const res = await fetch(`${url}/api/check-dependencies`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      statusMsg.textContent = `✓ Connected! yt-dlp: ${data.yt_dlp ? 'ok' : 'missing'}, ffmpeg: ${data.ffmpeg ? 'ok' : 'missing'}`;
      statusMsg.className = 'status-msg ok';
    } else {
      statusMsg.textContent = `Server responded with status ${res.status}`;
      statusMsg.className = 'status-msg err';
    }
  } catch (err) {
    statusMsg.textContent = `✕ Could not connect: ${err.message}`;
    statusMsg.className = 'status-msg err';
  }
});

// Save settings
saveBtn.addEventListener('click', () => {
  const url = serverInput.value.trim().replace(/\/$/, '') || DEFAULT_SERVER;
  chrome.storage.local.set({ serverUrl: url }, () => {
    statusMsg.textContent = '✓ Settings saved!';
    statusMsg.className = 'status-msg ok';
    setTimeout(() => { statusMsg.textContent = ''; statusMsg.className = 'status-msg'; }, 2000);
  });
});
