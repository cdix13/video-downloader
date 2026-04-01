#!/usr/bin/env python3
"""
Universal Video Downloader - Web UI
A modern web interface for downloading videos with parallel processing
"""

import os
import json
import subprocess
import threading
import time
import re
import socket
import io
import base64
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory
from werkzeug.utils import secure_filename
import uuid

# Try to import qrcode, install if not available
try:
    import qrcode
    QRCODE_AVAILABLE = True
except ImportError:
    QRCODE_AVAILABLE = False
    print("⚠️  qrcode library not found. QR codes will be disabled.")
    print("   Install with: pip install qrcode[pil]")

# Check if React frontend build exists
FRONTEND_DIR = Path(__file__).parent / 'frontend' / 'dist'
USE_REACT_FRONTEND = FRONTEND_DIR.exists()

if USE_REACT_FRONTEND:
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path='')
else:
    app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

# ── CORS + Private Network Access ──────────────────────────────────────────────
# Allows browser extensions (Brave/Chrome) to call the local Flask API.
# Private Network Access (PNA) requires Access-Control-Allow-Private-Network: true
# on both the OPTIONS preflight and the actual response.

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Access-Control-Request-Private-Network',
    'Access-Control-Allow-Private-Network': 'true',
}

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        for key, value in CORS_HEADERS.items():
            response.headers[key] = value
        return response

@app.after_request
def add_cors_headers(response):
    for key, value in CORS_HEADERS.items():
        response.headers[key] = value
    return response

# Configuration
BASE_DIR = Path.cwd()
DOWNLOAD_DIR = BASE_DIR / 'downloads'
VIDEO_DIR = DOWNLOAD_DIR / 'videos'
AUDIO_DIR = DOWNLOAD_DIR / 'audio'
HISTORY_FILE = BASE_DIR / 'download_history.json'
QUEUE_FILE = BASE_DIR / 'download_queue.json'

# Create directories
VIDEO_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Global variables
download_queue = {}
download_history = []
download_processes = {}

# Supported file extensions
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.ts', '.mpg', '.mpeg'}
AUDIO_EXTENSIONS = {'.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.opus', '.wma'}

def load_history():
    """Load download history from actual files in download folders"""
    global download_history
    download_history = []

    # Scan video folder
    for video_file in VIDEO_DIR.glob('*'):
        if video_file.is_file() and video_file.suffix.lower() in VIDEO_EXTENSIONS:
            try:
                stat = video_file.stat()
                download_history.append({
                    'id': str(hash(str(video_file))),  # Unique ID based on path
                    'filename': video_file.name,
                    'filepath': str(video_file.relative_to(DOWNLOAD_DIR)),
                    'type': 'video',
                    'size': stat.st_size,
                    'timestamp': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'date': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                })
            except Exception as e:
                print(f"Error reading file {video_file}: {e}")

    # Scan audio folder
    for audio_file in AUDIO_DIR.glob('*'):
        if audio_file.is_file() and audio_file.suffix.lower() in AUDIO_EXTENSIONS:
            try:
                stat = audio_file.stat()
                download_history.append({
                    'id': str(hash(str(audio_file))),  # Unique ID based on path
                    'filename': audio_file.name,
                    'filepath': str(audio_file.relative_to(DOWNLOAD_DIR)),
                    'type': 'audio',
                    'size': stat.st_size,
                    'timestamp': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'date': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                })
            except Exception as e:
                print(f"Error reading file {audio_file}: {e}")
    
    # Sort by modification time (newest first)
    download_history.sort(key=lambda x: x['timestamp'], reverse=True)

def save_history():
    """No longer needed - files are read directly from folders"""
    pass

def save_queue():
    """Save download queue to file for persistence"""
    try:
        # Only save jobs that can be resumed (cancelled, failed, queued)
        # Don't save completed or actively downloading jobs
        saveable_statuses = {'cancelled', 'failed', 'queued'}
        queue_to_save = {
            job_id: {
                'url': job['url'],
                'options': job['options'],
                'status': job['status'],
                'error': job.get('error'),
                'progress': job.get('progress', 0),
            }
            for job_id, job in download_queue.items()
            if job['status'] in saveable_statuses
        }
        with open(QUEUE_FILE, 'w') as f:
            json.dump(queue_to_save, f, indent=2)
    except Exception as e:
        print(f"Error saving queue: {e}")

def load_queue():
    """Load download queue from file"""
    global download_queue
    if QUEUE_FILE.exists():
        try:
            with open(QUEUE_FILE, 'r') as f:
                saved_queue = json.load(f)

            # Restore jobs to queue with full structure
            for job_id, job_data in saved_queue.items():
                download_queue[job_id] = {
                    'url': job_data['url'],
                    'options': job_data.get('options', {}),
                    'status': job_data['status'],
                    'progress': job_data.get('progress', 0),
                    'speed': None,
                    'eta': None,
                    'error': job_data.get('error'),
                    'file_info': None,
                    'downloaded': None,
                    'total_size': None,
                }
            print(f"Loaded {len(saved_queue)} jobs from queue file")
        except Exception as e:
            print(f"Error loading queue: {e}")

def get_local_ip():
    """Get local IP address - works correctly in Docker and native"""
    try:
        # Check if running in Docker and HOST_IP is provided
        host_ip = os.environ.get('HOST_IP')
        if host_ip and host_ip != '':
            # Validate it's a proper IP
            parts = host_ip.split('.')
            if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
                return host_ip
        
        # Native execution - use original simple method
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        try:
            # Connect to external server to get local IP
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            
            # Filter out Docker internal IPs
            if local_ip.startswith('172.17.') or local_ip.startswith('172.18.'):
                # Try alternative method for Docker
                hostname = socket.gethostname()
                ip_list = socket.gethostbyname_ex(hostname)[2]
                for ip in ip_list:
                    if not ip.startswith('127.') and not ip.startswith('172.17.') and not ip.startswith('172.18.'):
                        return ip
                return "127.0.0.1"
            
            return local_ip
        finally:
            s.close()
            
    except Exception as e:
        print(f"Warning: Could not detect local IP: {e}")
        return "127.0.0.1"

def generate_qr_code(data):
    """Generate QR code and return as base64 image"""
    if not QRCODE_AVAILABLE:
        return None
    
    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return f"data:image/png;base64,{img_base64}"
    except Exception as e:
        print(f"Error generating QR code: {e}")
        return None

def check_dependencies():
    """Check if required tools are installed"""
    missing = []
    try:
        subprocess.run(['yt-dlp', '--version'], capture_output=True, check=True)
    except:
        missing.append('yt-dlp')
    
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
    except:
        missing.append('ffmpeg')
    
    try:
        import curl_cffi
    except ImportError:
        missing.append('curl_cffi')
    
    return missing

def parse_size_to_bytes(size_str):
    """Convert size string like '150.5MiB' to bytes"""
    if not size_str:
        return 0
    size_str = size_str.strip()
    match = re.match(r'([\d.]+)\s*([KMG]i?B)?', size_str, re.IGNORECASE)
    if not match:
        return 0
    value = float(match.group(1))
    unit = (match.group(2) or 'B').upper()
    multipliers = {
        'B': 1,
        'KB': 1024,
        'KIB': 1024,
        'MB': 1024 * 1024,
        'MIB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024,
        'GIB': 1024 * 1024 * 1024,
    }
    return int(value * multipliers.get(unit, 1))

def format_bytes(size_bytes):
    """Format bytes to human-readable string"""
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GiB"
    elif size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MiB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.2f} KiB"
    else:
        return f"{size_bytes} B"

def parse_progress_line(line):
    """Parse yt-dlp progress output to extract useful information"""
    info = {}

    # Extract percentage
    percent_match = re.search(r'(\d+\.?\d*)%', line)
    if percent_match:
        info['progress'] = float(percent_match.group(1))
    
    # Extract download speed - multiple formats
    # Format: "at 2.5MiB/s" or "2.5MiB/s" or "at 500KiB/s"
    speed_match = re.search(r'(?:at\s+)?([\d.]+\s*[KMG]i?B/s)', line, re.IGNORECASE)
    if speed_match:
        info['speed'] = speed_match.group(1)
    
    # Extract ETA
    # Format: "ETA 00:05" or "in 00:05"
    eta_match = re.search(r'(?:ETA|in)\s+([\d:]+)', line)
    if eta_match:
        info['eta'] = eta_match.group(1)
    
    # Extract total file size - multiple formats
    # Format: "of 150.5MiB" or "~150.5MiB" or "/150.5MiB"
    size_match = re.search(r'(?:of|~|/)\s*([\d.]+\s*[KMG]i?B)', line, re.IGNORECASE)
    if size_match:
        info['total_size'] = size_match.group(1)
    
    # Alternative: Extract from format like "[download] 45.2MiB of 150.5MiB"
    if 'total_size' not in info:
        full_size_match = re.search(r'([\d.]+[KMG]i?B)\s+of\s+([\d.]+[KMG]i?B)', line, re.IGNORECASE)
        if full_size_match:
            info['downloaded'] = full_size_match.group(1)
            info['total_size'] = full_size_match.group(2)
    
    # Extract downloaded size
    # Format: "[download] 45.2MiB" or "45.2MiB of"
    if 'downloaded' not in info:
        downloaded_match = re.search(r'\[download\]\s+([\d.]+\s*[KMG]i?B)', line, re.IGNORECASE)
        if downloaded_match:
            info['downloaded'] = downloaded_match.group(1)
    
    # Alternative: Just the size before "of"
    if 'downloaded' not in info:
        downloaded_match = re.search(r'([\d.]+[KMG]i?B)\s+of\s+', line, re.IGNORECASE)
        if downloaded_match:
            info['downloaded'] = downloaded_match.group(1)
    
    # Extract from progress line format: "[download]  45.2% of 150.5MiB at 2.5MiB/s ETA 00:30"
    comprehensive_match = re.search(
        r'\[download\]\s+[\d.]+%\s+(?:of\s+)?([\d.]+[KMG]i?B)',
        line,
        re.IGNORECASE
    )
    if comprehensive_match and 'total_size' not in info:
        info['total_size'] = comprehensive_match.group(1)

    # Calculate downloaded size from percentage and total_size if not directly available
    if 'downloaded' not in info and 'progress' in info and 'total_size' in info:
        total_bytes = parse_size_to_bytes(info['total_size'])
        if total_bytes > 0:
            downloaded_bytes = int((info['progress'] / 100) * total_bytes)
            info['downloaded'] = format_bytes(downloaded_bytes)

    return info

def download_worker(job_id, url, options):
    """Worker function to download video/audio"""
    try:
        download_queue[job_id]['status'] = 'downloading'
        download_queue[job_id]['progress'] = 0
        download_queue[job_id]['speed'] = 'Calculating...'
        download_queue[job_id]['eta'] = 'Calculating...'
        download_queue[job_id]['total_size'] = 'Calculating...'
        download_queue[job_id]['downloaded'] = '0 B'
        
        # Determine output directory
        output_dir = AUDIO_DIR if options['audio_only'] else VIDEO_DIR
        
        # Build yt-dlp command
        cmd = [
            'yt-dlp',
            '--no-check-certificate',
            '--newline',
            '--progress',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--referer', url,
            '--add-header', 'Accept-Language:en-US,en;q=0.9',
        ]
        
        # Add proxy if specified
        if options.get('proxy'):
            cmd.extend(['--proxy', options['proxy']])
        
        # Add impersonation for Cloudflare bypass
        if options.get('use_impersonate', True):
            cmd.extend(['--extractor-args', 'generic:impersonate=chrome'])
        
        # For sites that require cookies or have video protection
        # cmd.extend([
        #     '--geo-bypass',
        #     '--age-limit', '0',
        # ])
        
        # Audio or video mode
        if options['audio_only']:
            cmd.extend([
                '-x',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--embed-thumbnail',
                '--add-metadata',
                '-o', str(output_dir / '%(title)s.%(ext)s')
            ])
        else:
            # SponsorBlock for video
            if options.get('use_sponsorblock', False):
                cmd.extend(['--sponsorblock-remove', 'all'])
            
            if options.get('format_id'):
                cmd.extend(['-f', options['format_id']])
            else:
                cmd.extend(['-f', 'bestvideo+bestaudio/best'])
            
            cmd.extend([
                '--merge-output-format', 'mp4',
                '-o', str(output_dir / '%(title)s.%(ext)s')
            ])
        
        cmd.append(url)
        
        # Execute download
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True
        )
        
        # Store process for cancellation
        download_processes[job_id] = process
        
        filename = None
        line_count = 0
        for line in process.stdout:
            line_count += 1
            
            # Check if cancelled
            if download_queue[job_id]['status'] == 'cancelled':
                process.terminate()
                process.wait()
                return
            
            # Parse progress information
            progress_info = parse_progress_line(line)
            if progress_info:
                if 'progress' in progress_info:
                    download_queue[job_id]['progress'] = progress_info['progress']
                if 'speed' in progress_info:
                    download_queue[job_id]['speed'] = progress_info['speed']
                if 'eta' in progress_info:
                    download_queue[job_id]['eta'] = progress_info['eta']
                if 'total_size' in progress_info:
                    download_queue[job_id]['total_size'] = progress_info['total_size']
                if 'downloaded' in progress_info:
                    download_queue[job_id]['downloaded'] = progress_info['downloaded']
            
            # Update status text for initial lines
            if line_count < 5 and '[download]' not in line:
                if 'Downloading' in line or 'Extracting' in line:
                    download_queue[job_id]['speed'] = 'Fetching info...'
            
            # Get filename
            if '[download] Destination:' in line:
                filename = line.split('Destination:')[1].strip()
            elif 'Merging formats into' in line:
                filename = line.split('into')[1].strip().strip('"')
            elif '[ExtractAudio] Destination:' in line:
                filename = line.split('Destination:')[1].strip()
        
        process.wait()
        
        # Remove from processes dict
        if job_id in download_processes:
            del download_processes[job_id]
        
        if process.returncode == 0 and download_queue[job_id]['status'] != 'cancelled':
            download_queue[job_id]['status'] = 'completed'
            download_queue[job_id]['progress'] = 100
            download_queue[job_id]['speed'] = 'Complete'
            download_queue[job_id]['eta'] = '00:00'
            
            # Find the downloaded file
            if not filename:
                # Search for most recent file
                files = sorted(output_dir.glob('*'), key=os.path.getmtime, reverse=True)
                if files:
                    filename = str(files[0])
            
            if filename:
                file_path = Path(filename)
                if not file_path.exists():
                    # Try to find in output directory
                    file_path = output_dir / file_path.name
                
                if file_path.exists():
                    # Update total size with actual file size
                    actual_size = file_path.stat().st_size
                    if actual_size > 1024 * 1024:
                        download_queue[job_id]['total_size'] = f"{actual_size / 1024 / 1024:.2f} MiB"
                    elif actual_size > 1024:
                        download_queue[job_id]['total_size'] = f"{actual_size / 1024:.2f} KiB"
                    else:
                        download_queue[job_id]['total_size'] = f"{actual_size} B"
                    
                    # Store file info (no need to add to history - it will be scanned from folder)
                    download_queue[job_id]['file_info'] = {
                        'filename': file_path.name,
                        'filepath': str(file_path.relative_to(DOWNLOAD_DIR)),
                        'size': actual_size
                    }
            
            # Auto-remove completed download after 1 second
            threading.Timer(1.0, lambda: download_queue.pop(job_id, None)).start()
            
        elif download_queue[job_id]['status'] != 'cancelled':
            download_queue[job_id]['status'] = 'failed'
            download_queue[job_id]['error'] = 'Download failed'
            save_queue()

    except Exception as e:
        download_queue[job_id]['status'] = 'failed'
        download_queue[job_id]['error'] = str(e)
        save_queue()
        if job_id in download_processes:
            del download_processes[job_id]

@app.route('/')
def index():
    """Main page - serves React frontend if available, otherwise template"""
    if USE_REACT_FRONTEND:
        return send_from_directory(app.static_folder, 'index.html')
    return render_template('index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files for React frontend"""
    if USE_REACT_FRONTEND:
        file_path = FRONTEND_DIR / path
        if file_path.exists() and file_path.is_file():
            return send_from_directory(app.static_folder, path)
        # For SPA routing, return index.html for non-file paths
        if not path.startswith('api/'):
            return send_from_directory(app.static_folder, 'index.html')
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/check-dependencies')
def api_check_dependencies():
    """Check if dependencies are installed"""
    missing = check_dependencies()
    return jsonify({
        'success': len(missing) == 0,
        'missing': missing
    })

@app.route('/api/server-info')
def api_server_info():
    """Get server information including local IP"""
    local_ip = get_local_ip()
    port = request.environ.get('SERVER_PORT', '5001')
    local_url = f'http://{local_ip}:{port}'
    
    # Generate QR code for network URL
    qr_code = generate_qr_code(local_url) if QRCODE_AVAILABLE else None
    
    return jsonify({
        'success': True,
        'local_ip': local_ip,
        'port': port,
        'local_url': local_url,
        'localhost_url': f'http://localhost:{port}',
        'qr_code': qr_code,
        'qr_available': QRCODE_AVAILABLE
    })

@app.route('/api/download', methods=['POST'])
def api_download():
    """Start a new download"""
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({'success': False, 'error': 'URL is required'}), 400
    
    # Create job
    job_id = str(uuid.uuid4())
    options = {
        'audio_only': data.get('audio_only', False),
        'use_sponsorblock': data.get('use_sponsorblock', False),
        'use_impersonate': data.get('use_impersonate', True),
        'proxy': data.get('proxy', ''),
        'format_id': data.get('format_id', '')
    }
    
    download_queue[job_id] = {
        'url': url,
        'status': 'queued',
        'progress': 0,
        'speed': 'N/A',
        'eta': 'N/A',
        'total_size': 'N/A',
        'downloaded': '0 B',
        'options': options,
        'created_at': datetime.now().isoformat()
    }
    
    # Start download in background thread
    thread = threading.Thread(target=download_worker, args=(job_id, url, options))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'job_id': job_id
    })

@app.route('/api/download-from-extension')
def download_from_extension():
    """
    Browser extension downloads via this GET endpoint to avoid CORS/PNA issues.
    The extension opens this URL in a tab; it queues the download and shows a
    self-closing confirmation page.
    """
    url = request.args.get('url', '').strip()
    audio_only = request.args.get('audio', 'false').lower() == 'true'

    if not url:
        return '<script>window.close();</script>Invalid URL', 400

    job_id = str(uuid.uuid4())
    options = {
        'audio_only': audio_only,
        'use_sponsorblock': False,
        'use_impersonate': True,
        'proxy': '',
        'format_id': '',
    }
    download_queue[job_id] = {
        'url': url,
        'status': 'queued',
        'progress': 0,
        'speed': 'N/A',
        'eta': 'N/A',
        'total_size': 'N/A',
        'downloaded': '0 B',
        'options': options,
        'created_at': datetime.now().isoformat(),
    }
    thread = threading.Thread(target=download_worker, args=(job_id, url, options))
    thread.daemon = True
    thread.start()

    mode = 'Audio (MP3)' if audio_only else 'Video'
    return f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Download queued</title>
  <style>
    body {{ margin:0; background:#0f172a; color:#e2e8f0;
           font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
           display:flex; align-items:center; justify-content:center;
           height:100vh; flex-direction:column; gap:12px; }}
    .icon {{ font-size:40px; }}
    h2 {{ margin:0; font-size:18px; }}
    p {{ margin:0; color:#64748b; font-size:13px; max-width:400px; text-align:center; word-break:break-all; }}
    .badge {{ background:#1e3a5f; color:#60a5fa; padding:3px 10px; border-radius:6px; font-size:12px; }}
  </style>
</head>
<body>
  <div class="icon">⬇️</div>
  <h2>Download queued!</h2>
  <span class="badge">{mode}</span>
  <p>{url[:120]}{'...' if len(url) > 120 else ''}</p>
  <p style="color:#475569;font-size:11px;margin-top:8px;">This tab will close automatically…</p>
  <script>
    setTimeout(() => {{
      // Try to close; if opener exists go back, else close tab
      if (window.opener) {{ window.close(); }}
      else {{ window.location.href = '/'; }}
    }}, 2000);
  </script>
</body>
</html>'''

@app.route('/api/cancel/<job_id>', methods=['POST'])
def api_cancel_download(job_id):
    """Cancel a download"""
    if job_id not in download_queue:
        return jsonify({'success': False, 'error': 'Job not found'}), 404
    
    download_queue[job_id]['status'] = 'cancelled'
    
    # Terminate process if exists
    if job_id in download_processes:
        try:
            download_processes[job_id].terminate()
            download_processes[job_id].wait(timeout=5)
        except:
            try:
                download_processes[job_id].kill()
            except:
                pass
        
        if job_id in download_processes:
            del download_processes[job_id]

    save_queue()
    return jsonify({'success': True})

@app.route('/api/remove/<job_id>', methods=['DELETE'])
def api_remove_download(job_id):
    """Remove a download from queue"""
    if job_id not in download_queue:
        return jsonify({'success': False, 'error': 'Job not found'}), 404
    
    # Cancel if still downloading
    if download_queue[job_id]['status'] == 'downloading':
        if job_id in download_processes:
            try:
                download_processes[job_id].terminate()
                download_processes[job_id].wait(timeout=5)
            except:
                try:
                    download_processes[job_id].kill()
                except:
                    pass
            
            if job_id in download_processes:
                del download_processes[job_id]
    
    # Remove from queue
    del download_queue[job_id]

    save_queue()
    return jsonify({'success': True})

@app.route('/api/resume/<job_id>', methods=['POST'])
def api_resume_download(job_id):
    """Resume a cancelled or failed download"""
    if job_id not in download_queue:
        return jsonify({'success': False, 'error': 'Job not found'}), 404

    resumable_statuses = {'cancelled', 'failed'}
    if download_queue[job_id]['status'] not in resumable_statuses:
        return jsonify({'success': False, 'error': 'Download cannot be resumed'}), 400
    
    # Restart download
    url = download_queue[job_id]['url']
    options = download_queue[job_id]['options']
    
    download_queue[job_id]['status'] = 'queued'
    download_queue[job_id]['error'] = None
    download_queue[job_id]['progress'] = 0

    save_queue()

    thread = threading.Thread(target=download_worker, args=(job_id, url, options))
    thread.daemon = True
    thread.start()

    return jsonify({'success': True})

@app.route('/api/status/<job_id>')
def api_status(job_id):
    """Get download status"""
    if job_id not in download_queue:
        return jsonify({'success': False, 'error': 'Job not found'}), 404
    
    return jsonify({
        'success': True,
        'job': download_queue[job_id]
    })

@app.route('/api/queue')
def api_queue():
    """Get all downloads in queue"""
    return jsonify({
        'success': True,
        'queue': download_queue
    })

@app.route('/api/history')
def api_history():
    """Get download history from actual files"""
    # Reload from folders to get fresh list
    load_history()
    return jsonify({
        'success': True,
        'history': download_history
    })

@app.route('/api/history/<history_id>', methods=['DELETE'])
def api_delete_history(history_id):
    """Delete a history entry and its actual file"""
    global download_history
    
    # Find the file to delete
    file_to_delete = None
    for item in download_history:
        if item['id'] == history_id:
            file_to_delete = DOWNLOAD_DIR / item['filepath']
            break
    
    if file_to_delete and file_to_delete.exists():
        try:
            # Delete the actual file
            file_to_delete.unlink()
            print(f"Deleted file: {file_to_delete}")
            
            # Reload history from folders
            load_history()
            
            return jsonify({
                'success': True,
                'message': 'File deleted successfully'
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Failed to delete file: {str(e)}'
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': 'File not found'
        }), 404

@app.route('/api/file/<path:filepath>')
def api_serve_file(filepath):
    """Serve downloaded file"""
    file_path = DOWNLOAD_DIR / filepath
    if file_path.exists():
        return send_file(file_path)
    return jsonify({'success': False, 'error': 'File not found'}), 404

@app.route('/api/download-file/<path:filepath>')
def api_download_file(filepath):
    """Download file with proper headers (force download)"""
    file_path = DOWNLOAD_DIR / filepath
    if file_path.exists():
        return send_file(
            file_path,
            as_attachment=True,
            download_name=file_path.name
        )
    return jsonify({'success': False, 'error': 'File not found'}), 404

@app.route('/api/formats', methods=['POST'])
def api_get_formats():
    """Get available formats for a URL"""
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({'success': False, 'error': 'URL is required'}), 400
    
    try:
        cmd = [
            'yt-dlp',
            '-J',
            '--no-check-certificate',
            '--extractor-args', 'generic:impersonate=chrome',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--referer', url,
            '--geo-bypass',
            '--age-limit', '0',
            url
        ]
        
        if data.get('proxy'):
            cmd.insert(-1, '--proxy')
            cmd.insert(-1, data['proxy'])
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            info = json.loads(result.stdout)
            formats = []
            
            for f in info.get('formats', []):
                if f.get('vcodec') != 'none':
                    formats.append({
                        'format_id': f.get('format_id'),
                        'ext': f.get('ext'),
                        'resolution': f.get('resolution', 'unknown'),
                        'filesize': f.get('filesize', 0),
                        'fps': f.get('fps', 0),
                        'note': f.get('format_note', '')
                    })
            
            return jsonify({
                'success': True,
                'title': info.get('title', 'Unknown'),
                'formats': formats
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Could not fetch video information. The site may require special handling or authentication.'
            }), 400
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Request timed out. Try using a proxy or the site may be blocked.'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Load history from actual files
    load_history()
    # Load saved queue (cancelled/failed downloads)
    load_queue()

    local_ip = get_local_ip()
    port = 5001

    print("=" * 80)
    print("🎬 Universal Video Downloader - Web UI")
    print("=" * 80)
    print("\n📡 Server Information:")
    print(f"   • Local Access:   http://localhost:{port}")
    print(f"   • Network Access: http://{local_ip}:{port}")
    print("\n📱 Access from other devices:")
    print(f"   Open browser and go to: http://{local_ip}:{port}")
    if QRCODE_AVAILABLE:
        print(f"   OR scan the QR code shown in the web interface")
    else:
        print(f"\n💡 Install qrcode for QR code feature:")
        print(f"   pip install qrcode[pil]")
    print("\n📁 Download Locations:")
    print(f"   • Videos: {VIDEO_DIR}")
    print(f"   • Audio:  {AUDIO_DIR}")
    print(f"\n📚 Download History:")
    print(f"   • Loaded {len(download_history)} files from disk")
    print(f"   • Files are read directly from folders")
    print(f"   • Deleting from history also deletes the file!")
    if download_queue:
        print(f"\n📥 Download Queue:")
        print(f"   • Loaded {len(download_queue)} pending/cancelled jobs")
        print(f"   • Use Resume button to restart cancelled downloads")
    print("\n⚠️  Keep Server Running (Prevent Sleep):")
    print("   macOS:   Run 'caffeinate -i python app.py' instead")
    print("   Windows: Disable sleep in Power Settings")
    print("   Linux:   Run 'systemd-inhibit python app.py' instead")
    print("\n💡 Press Ctrl+C to stop the server")
    print("=" * 80)
    print()
    
    app.run(debug=False, host='0.0.0.0', port=port, threaded=True)