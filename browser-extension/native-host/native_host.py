#!/usr/bin/env python3
"""
Video Downloader - Native Messaging Host
Each connectNative() call spawns a fresh process.
- ping  → respond once and exit
- download → stream progress messages then exit
"""

import sys
import json
import struct
import subprocess
import shutil
import os
import re
import threading
from pathlib import Path

DOWNLOAD_DIR = Path.home() / 'Downloads' / 'VideoDownloader'

# ─── Protocol ─────────────────────────────────────────────────────────────────

_write_lock = threading.Lock()

def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack('<I', raw)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode('utf-8'))

def send_message(obj):
    encoded = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    with _write_lock:
        sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()

# ─── yt-dlp discovery ─────────────────────────────────────────────────────────

def find_ytdlp():
    if shutil.which('yt-dlp'):
        return ['yt-dlp']
    candidates = [
        '/opt/homebrew/bin/yt-dlp',
        '/usr/local/bin/yt-dlp',
        os.path.expanduser('~/.local/bin/yt-dlp'),
        os.path.expanduser('~/bin/yt-dlp'),
        os.path.expanduser('~/miniforge3/bin/yt-dlp'),
        os.path.expanduser('~/miniforge/bin/yt-dlp'),
        os.path.expanduser('~/miniconda3/bin/yt-dlp'),
        os.path.expanduser('~/miniconda/bin/yt-dlp'),
        os.path.expanduser('~/anaconda3/bin/yt-dlp'),
        os.path.expanduser('~/anaconda/bin/yt-dlp'),
        os.path.expanduser('~/opt/miniforge3/bin/yt-dlp'),
        os.path.expanduser('~/opt/miniconda3/bin/yt-dlp'),
        os.path.expanduser('~/opt/anaconda3/bin/yt-dlp'),
        os.path.expanduser('~/.pyenv/shims/yt-dlp'),
    ]
    for p in candidates:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return [p]
    try:
        subprocess.run([sys.executable, '-m', 'yt_dlp', '--version'],
                       capture_output=True, check=True)
        return [sys.executable, '-m', 'yt_dlp']
    except Exception:
        pass
    return None

# ─── Progress parsing ─────────────────────────────────────────────────────────

# Matches: [download]  45.3% of  123.45MiB at  1.23MiB/s ETA 00:30
PROGRESS_RE = re.compile(
    r'\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*\S+)\s+at\s+([\d.]+\s*\S+)\s+ETA\s+(\S+)'
)
# Matches: [download] 100% of 123.45MiB in 00:30 at 1.23MiB/s
DONE_RE = re.compile(r'\[download\]\s+100(?:\.0)?%')
# Destination line: extract filename
DEST_RE = re.compile(r'\[download\] Destination:\s+(.+)')
MERGER_RE = re.compile(r'\[Merger\] Merging formats into "(.+)"')
ALREADY_RE = re.compile(r'\[download\] (.+) has already been downloaded')

def run_download(url, audio_only=False, download_dir=None, referer=None):
    ytdlp = find_ytdlp()
    if not ytdlp:
        send_message({'msgType': 'error', 'error': 'yt-dlp not found. Run: pip install yt-dlp'})
        return

    out_dir = Path(download_dir) if download_dir else DOWNLOAD_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = ytdlp[:]
    if audio_only:
        cmd += ['-x', '--audio-format', 'mp3', '--audio-quality', '0']
    else:
        cmd += ['-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4']

    cmd += [
        '-o', str(out_dir / '%(title)s.%(ext)s'),
        '--no-playlist',
        '--newline',
        '--no-warnings',
    ]

    # Pass Referer header so CDNs that check it (e.g. surrit.com) allow the request
    if referer:
        cmd += ['--referer', referer]
    else:
        # Use the URL's own origin as a fallback referer
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            cmd += ['--referer', f'{parsed.scheme}://{parsed.netloc}/']
        except Exception:
            pass

    # Use browser cookies so CDN-gated / authenticated streams work.
    # We try brave first, then fall back. If none work yt-dlp continues without cookies.
    for browser in ('brave', 'chrome', 'chromium'):
        cookie_test = ytdlp + ['--cookies-from-browser', browser, '--version']
        try:
            r = subprocess.run(cookie_test, capture_output=True, timeout=5)
            if r.returncode == 0:
                cmd += ['--cookies-from-browser', browser]
                break
        except Exception:
            pass

    cmd += [url]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
    except Exception as e:
        send_message({'msgType': 'error', 'error': str(e)})
        return

    filename = None
    last_percent = -1

    for raw_line in proc.stdout:
        line = raw_line.strip()
        if not line:
            continue

        # Destination / merger lines (track filename)
        m = DEST_RE.search(line)
        if m:
            filename = os.path.basename(m.group(1))
            send_message({'msgType': 'status', 'message': f'Downloading: {filename}'})
            continue

        m = MERGER_RE.search(line)
        if m:
            filename = os.path.basename(m.group(1))
            send_message({'msgType': 'status', 'message': f'Merging: {filename}'})
            continue

        m = ALREADY_RE.search(line)
        if m:
            send_message({'msgType': 'progress', 'percent': 100, 'speed': '', 'eta': '', 'size': ''})
            continue

        # Progress line
        m = PROGRESS_RE.search(line)
        if m:
            percent = float(m.group(1))
            if percent != last_percent:  # avoid flooding with identical updates
                last_percent = percent
                send_message({
                    'msgType': 'progress',
                    'percent': round(percent, 1),
                    'size':    m.group(2),
                    'speed':   m.group(3),
                    'eta':     m.group(4),
                })
            continue

        if DONE_RE.search(line):
            send_message({'msgType': 'progress', 'percent': 100, 'speed': '', 'eta': '', 'size': ''})
            continue

    stderr_output = proc.stderr.read().strip() if proc.stderr else ''
    proc.wait()

    if proc.returncode == 0:
        send_message({
            'msgType': 'done',
            'success': True,
            'filename': filename or '',
            'download_dir': str(out_dir),
        })
    else:
        # Show the actual yt-dlp error so it's actionable
        err_lines = [l for l in stderr_output.splitlines() if l.strip() and not l.startswith('WARNING')]
        err_msg = err_lines[-1] if err_lines else f'yt-dlp exited with code {proc.returncode}'
        send_message({'msgType': 'error', 'error': err_msg})


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    msg = read_message()
    if not msg:
        sys.exit(0)

    action = msg.get('action', '')

    if action == 'ping':
        ytdlp = find_ytdlp()
        send_message({'success': True, 'message': 'pong', 'ytdlp': bool(ytdlp),
                      'ytdlp_cmd': ytdlp[0] if ytdlp else None})

    elif action == 'download':
        url = msg.get('url', '').strip()
        if not url:
            send_message({'msgType': 'error', 'error': 'No URL provided'})
            return
        run_download(url, msg.get('audio_only', False), msg.get('download_dir'), msg.get('referer'))

    else:
        send_message({'msgType': 'error', 'error': f'Unknown action: {action}'})


if __name__ == '__main__':
    main()
