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
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file, url_for
from werkzeug.utils import secure_filename
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

# Configuration
BASE_DIR = Path.cwd()
DOWNLOAD_DIR = BASE_DIR / 'downloads'
VIDEO_DIR = DOWNLOAD_DIR / 'videos'
AUDIO_DIR = DOWNLOAD_DIR / 'audio'
HISTORY_FILE = BASE_DIR / 'download_history.json'

# Create directories
VIDEO_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Global variables
download_queue = {}
download_history = []
download_processes = {}

def load_history():
    """Load download history from file"""
    global download_history
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, 'r') as f:
            download_history = json.load(f)
    else:
        download_history = []

def save_history():
    """Save download history to file"""
    with open(HISTORY_FILE, 'w') as f:
        json.dump(download_history, f, indent=2)

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

def parse_progress_line(line):
    """Parse yt-dlp progress output to extract useful information"""
    info = {}
    
    # Extract percentage
    percent_match = re.search(r'(\d+\.?\d*)%', line)
    if percent_match:
        info['progress'] = float(percent_match.group(1))
    
    # Extract download speed
    speed_match = re.search(r'at\s+([\d.]+\s*[KMG]iB/s)', line)
    if speed_match:
        info['speed'] = speed_match.group(1)
    
    # Extract ETA
    eta_match = re.search(r'ETA\s+([\d:]+)', line)
    if eta_match:
        info['eta'] = eta_match.group(1)
    
    # Extract file size
    size_match = re.search(r'of\s+([\d.]+\s*[KMG]iB)', line)
    if size_match:
        info['total_size'] = size_match.group(1)
    
    # Extract downloaded size
    downloaded_match = re.search(r'\[download\]\s+([\d.]+\s*[KMG]iB)', line)
    if downloaded_match:
        info['downloaded'] = downloaded_match.group(1)
    
    return info

def download_worker(job_id, url, options):
    """Worker function to download video/audio"""
    try:
        download_queue[job_id]['status'] = 'downloading'
        download_queue[job_id]['progress'] = 0
        download_queue[job_id]['speed'] = 'N/A'
        download_queue[job_id]['eta'] = 'N/A'
        download_queue[job_id]['total_size'] = 'N/A'
        download_queue[job_id]['downloaded'] = '0 B'
        
        # Determine output directory
        output_dir = AUDIO_DIR if options['audio_only'] else VIDEO_DIR
        
        # Build yt-dlp command
        cmd = [
            'yt-dlp',
            '--no-check-certificate',
            '--newline',
            '--progress',
        ]
        
        # Add proxy if specified
        if options.get('proxy'):
            cmd.extend(['--proxy', options['proxy']])
        
        # Add impersonation for Cloudflare bypass
        if options.get('use_impersonate', True):
            cmd.extend(['--extractor-args', 'generic:impersonate=chrome'])
        
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
        for line in process.stdout:
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
                    # Add to history
                    history_entry = {
                        'id': str(uuid.uuid4()),
                        'url': url,
                        'filename': file_path.name,
                        'filepath': str(file_path.relative_to(DOWNLOAD_DIR)),
                        'type': 'audio' if options['audio_only'] else 'video',
                        'size': file_path.stat().st_size,
                        'timestamp': datetime.now().isoformat(),
                        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    }
                    download_history.insert(0, history_entry)
                    save_history()
                    
                    download_queue[job_id]['file_info'] = history_entry
            
            # Auto-remove completed download after 3 seconds
            def remove_completed():
                time.sleep(1)
                if job_id in download_queue and download_queue[job_id]['status'] == 'completed':
                    del download_queue[job_id]
            
            removal_thread = threading.Thread(target=remove_completed)
            removal_thread.daemon = True
            removal_thread.start()
            
        elif download_queue[job_id]['status'] != 'cancelled':
            download_queue[job_id]['status'] = 'failed'
            download_queue[job_id]['error'] = 'Download failed'
            
    except Exception as e:
        download_queue[job_id]['status'] = 'failed'
        download_queue[job_id]['error'] = str(e)
        if job_id in download_processes:
            del download_processes[job_id]

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/check-dependencies')
def api_check_dependencies():
    """Check if dependencies are installed"""
    missing = check_dependencies()
    return jsonify({
        'success': len(missing) == 0,
        'missing': missing
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
    
    return jsonify({'success': True})

@app.route('/api/resume/<job_id>', methods=['POST'])
def api_resume_download(job_id):
    """Resume a cancelled download"""
    if job_id not in download_queue:
        return jsonify({'success': False, 'error': 'Job not found'}), 404
    
    if download_queue[job_id]['status'] != 'cancelled':
        return jsonify({'success': False, 'error': 'Download is not cancelled'}), 400
    
    # Restart download
    url = download_queue[job_id]['url']
    options = download_queue[job_id]['options']
    
    download_queue[job_id]['status'] = 'queued'
    
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
    """Get download history"""
    return jsonify({
        'success': True,
        'history': download_history
    })

@app.route('/api/history/<history_id>', methods=['DELETE'])
def api_delete_history(history_id):
    """Delete a history entry"""
    global download_history
    download_history = [h for h in download_history if h['id'] != history_id]
    save_history()
    return jsonify({'success': True})

@app.route('/api/file/<path:filepath>')
def api_serve_file(filepath):
    """Serve downloaded file"""
    file_path = DOWNLOAD_DIR / filepath
    if file_path.exists():
        return send_file(file_path)
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
            url
        ]
        
        if data.get('proxy'):
            cmd.extend(['--proxy', data['proxy']])
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
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
                'error': 'Could not fetch video information'
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    load_history()
    print("=" * 80)
    print("🎬 Universal Video Downloader - Web UI")
    print("=" * 80)
    print("\n🌐 Server starting at: http://localhost:5001")
    print("📁 Downloads folder:", DOWNLOAD_DIR)
    print("🎥 Videos folder:", VIDEO_DIR)
    print("🎵 Audio folder:", AUDIO_DIR)
    print("\n💡 Press Ctrl+C to stop the server\n")
    
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)