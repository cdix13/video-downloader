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

import platform as _platform

_home = Path.home()
_system = _platform.system()
_BROWSER_PROFILES = {
    'Darwin': {
        'chrome':   _home / 'Library/Application Support/Google/Chrome',
        'chromium': _home / 'Library/Application Support/Chromium',
        'brave':    _home / 'Library/Application Support/BraveSoftware/Brave-Browser',
        'safari':   _home / 'Library/Safari',
        'firefox':  _home / 'Library/Application Support/Firefox',
    },
    'Linux': {
        'chrome':   _home / '.config/google-chrome',
        'chromium': _home / '.config/chromium',
        'brave':    _home / '.config/BraveSoftware/Brave-Browser',
        'firefox':  _home / '.mozilla/firefox',
    },
}.get(_system, {})

# Detected once at startup; cached for the whole process lifetime.
_IMPERSONATE_SUPPORTED = None

def _supports_impersonate(ytdlp):
    global _IMPERSONATE_SUPPORTED
    if _IMPERSONATE_SUPPORTED is None:
        try:
            r = subprocess.run(ytdlp + ['--impersonate', 'chrome', '--version'],
                               capture_output=True, timeout=5)
            _IMPERSONATE_SUPPORTED = (r.returncode == 0)
        except Exception:
            _IMPERSONATE_SUPPORTED = False
    return _IMPERSONATE_SUPPORTED

def _cookie_browser(is_tiktok):
    order = ('chrome', 'chromium', 'brave', 'safari', 'firefox') if is_tiktok \
            else ('chrome', 'chromium', 'brave')
    for b in order:
        p = _BROWSER_PROFILES.get(b)
        if p and p.exists():
            return b
    return None

def _build_cmd(ytdlp, url, audio_only, out_dir, referer, is_tiktok):
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
        '--socket-timeout', '30',
        '--retries', '3',
        '--force-ipv4',
        '--user-agent', (
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/124.0.0.0 Safari/537.36'
        ),
    ]

    if _supports_impersonate(ytdlp):
        cmd += ['--impersonate', 'chrome']

    # Referer
    if is_tiktok:
        cmd += ['--referer', 'https://www.tiktok.com/']
    elif referer:
        cmd += ['--referer', referer]
    else:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            cmd += ['--referer', f'{parsed.scheme}://{parsed.netloc}/']
        except Exception:
            pass

    browser = _cookie_browser(is_tiktok)
    if browser:
        cmd += ['--cookies-from-browser', browser]

    cmd += [url]
    return cmd


def _run_ytdlp(cmd):
    """Run yt-dlp, stream progress messages, return (returncode, stderr, filename)."""
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, bufsize=1)
    except Exception as e:
        send_message({'msgType': 'error', 'error': str(e)})
        return None, '', None

    filename = None
    last_percent = -1

    for raw_line in proc.stdout:
        line = raw_line.strip()
        if not line:
            continue

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

        m = PROGRESS_RE.search(line)
        if m:
            percent = float(m.group(1))
            if percent != last_percent:
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

    stderr_output = proc.stderr.read().strip() if proc.stderr else ''
    proc.wait()
    return proc.returncode, stderr_output, filename


TIKTOK_EXTRACTOR_ERROR = 'Unexpected response from webpage request'


def _try_update_ytdlp(ytdlp):
    """Run yt-dlp -U. Returns True if an update was applied."""
    try:
        r = subprocess.run(ytdlp + ['-U'], capture_output=True, text=True, timeout=60)
        output = r.stdout + r.stderr
        return 'Updated yt-dlp' in output or 'Updating to' in output
    except Exception:
        return False


def run_download(url, audio_only=False, download_dir=None, referer=None):
    ytdlp = find_ytdlp()
    if not ytdlp:
        send_message({'msgType': 'error', 'error': 'yt-dlp not found. Run: pip install yt-dlp'})
        return

    out_dir = Path(download_dir) if download_dir else DOWNLOAD_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    is_tiktok = 'tiktok.com' in url
    cmd = _build_cmd(ytdlp, url, audio_only, out_dir, referer, is_tiktok)
    returncode, stderr_output, filename = _run_ytdlp(cmd)

    if returncode is None:
        return  # Popen failed, error already sent

    # TikTok extractor errors are almost always fixed by updating yt-dlp.
    # Retry once after a self-update when we see the known error string.
    if returncode != 0 and is_tiktok and TIKTOK_EXTRACTOR_ERROR in stderr_output:
        send_message({'msgType': 'status', 'message': 'TikTok error — updating yt-dlp and retrying…'})
        _try_update_ytdlp(ytdlp)
        cmd = _build_cmd(ytdlp, url, audio_only, out_dir, referer, is_tiktok)
        returncode, stderr_output, filename = _run_ytdlp(cmd)

    if returncode == 0:
        send_message({
            'msgType': 'done',
            'success': True,
            'filename': filename or '',
            'download_dir': str(out_dir),
        })
    else:
        err_lines = [l for l in stderr_output.splitlines()
                     if l.strip() and not l.startswith('WARNING')]
        err_msg = err_lines[-1] if err_lines else f'yt-dlp exited with code {returncode}'
        if is_tiktok and TIKTOK_EXTRACTOR_ERROR in stderr_output:
            err_msg += ' — TikTok blocked the request. Try logging in to TikTok in Chrome and retry.'
        send_message({'msgType': 'error', 'error': err_msg})


# ─── ffmpeg discovery & conversion ───────────────────────────────────────────

def find_ffmpeg():
    found = shutil.which('ffmpeg')
    if found:
        return found
    candidates = [
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        os.path.expanduser('~/.local/bin/ffmpeg'),
        os.path.expanduser('~/bin/ffmpeg'),
        os.path.expanduser('~/miniforge3/bin/ffmpeg'),
        os.path.expanduser('~/miniconda3/bin/ffmpeg'),
        os.path.expanduser('~/anaconda3/bin/ffmpeg'),
    ]
    for p in candidates:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None

def run_convert(input_path):
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        send_message({'msgType': 'error',
                      'error': 'ffmpeg not found. Install with: brew install ffmpeg'})
        return

    output_path = os.path.splitext(input_path)[0] + '.mp4'
    send_message({'msgType': 'status', 'message': 'Converting .ts → .mp4…'})

    try:
        result = subprocess.run(
            [ffmpeg, '-i', input_path, '-c', 'copy',
             '-movflags', '+faststart', '-y', output_path],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            try:
                os.remove(input_path)
            except Exception:
                pass
            send_message({
                'msgType': 'done',
                'success': True,
                'filename': os.path.basename(output_path),
                'download_dir': str(Path(output_path).parent),
            })
        else:
            err_lines = [l for l in result.stderr.splitlines()
                         if l.strip() and not l.startswith('WARNING')]
            err_msg = err_lines[-1] if err_lines else f'ffmpeg exited with code {result.returncode}'
            send_message({'msgType': 'error', 'error': err_msg})
    except Exception as e:
        send_message({'msgType': 'error', 'error': str(e)})


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

    elif action == 'convert':
        input_path = msg.get('input_path', '').strip()
        if not input_path:
            send_message({'msgType': 'error', 'error': 'No input path provided'})
            return
        run_convert(input_path)

    else:
        send_message({'msgType': 'error', 'error': f'Unknown action: {action}'})


if __name__ == '__main__':
    main()
