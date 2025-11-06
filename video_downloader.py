#!/usr/bin/env python3
"""
Universal Video Downloader CLI
A user-friendly command-line tool to download videos from various websites
Supports Tor, SOCKS5, HTTP proxies for bypassing geo-restrictions
"""

import sys
import os
import subprocess
import json
from pathlib import Path

def check_dependencies():
    """Check if yt-dlp, ffmpeg, and curl_cffi are installed"""
    missing = []
    
    try:
        subprocess.run(['yt-dlp', '--version'], 
                      capture_output=True, 
                      check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        missing.append('yt-dlp')
    
    try:
        subprocess.run(['ffmpeg', '-version'], 
                      capture_output=True, 
                      check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        missing.append('ffmpeg')
    
    # Check for curl_cffi (required for Cloudflare bypass)
    try:
        import curl_cffi
        impersonate_support = True
    except ImportError:
        missing.append('curl_cffi')
        impersonate_support = False
    
    return missing, impersonate_support

def check_tor_running():
    """Check if Tor is running on common ports"""
    import socket
    
    # Common Tor ports
    # 9050 = System Tor service
    # 9150 = Tor Browser (Windows/Linux)
    # 9250 = Tor Browser alternative port
    tor_ports = [9050, 9150, 9250]
    
    for port in tor_ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            if result == 0:
                return port
        except:
            continue
    
    return None

def install_yt_dlp():
    """Install yt-dlp using pip"""
    print("\n📦 Installing yt-dlp...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 
                             'install', '-U', 'yt-dlp'])
        print("✅ yt-dlp installed successfully!\n")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install yt-dlp. Please install manually:")
        print("   pip install -U yt-dlp")
        return False

def install_curl_cffi():
    """Install curl_cffi for Cloudflare bypass"""
    print("\n📦 Installing curl_cffi (for Cloudflare bypass)...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 
                             'install', '-U', 'curl_cffi'])
        print("✅ curl_cffi installed successfully!")
        print("💡 This enables browser impersonation to bypass Cloudflare protection.\n")
        return True
    except subprocess.CalledProcessError:
        print("❌ Failed to install curl_cffi. Please install manually:")
        print("   pip install -U curl_cffi")
        return False

def get_download_preferences():
    """Get user preferences for ad-blocking and sponsorship skipping"""
    print("\n📥 Download Type:")
    print("=" * 90)
    print("1. 🎬 Video (with video and audio)")
    print("2. 🎵 Audio Only (MP3)")
    print("=" * 90)
    
    download_type = input("\n👉 Select download type (1-2, default: 1): ").strip()
    
    audio_only = False
    if download_type == '2':
        print("\n✅ Audio-only mode enabled (will convert to MP3)")
        audio_only = True
    else:
        print("\n🎬 Video mode selected")
    
    # Ad-blocking options (only for video)
    use_sponsorblock = False
    if not audio_only:
        print("\n🚫 Ad-Blocking & Content Options:")
        print("=" * 90)
        print("1. 📺 Skip in-video sponsors/ads (using SponsorBlock)")
        print("2. 🎯 No ad-blocking (download as-is)")
        print("=" * 90)
        
        choice = input("\n👉 Select option (1-2, default: 2): ").strip()
        
        if choice == '1':
            print("\n✅ SponsorBlock enabled!")
            print("💡 This will remove:")
            print("   • Sponsor segments")
            print("   • Unpaid/Self promotions")
            print("   • Interaction reminders (subscribe, like, etc.)")
            print("   • Intro/Outro animations")
            use_sponsorblock = True
        else:
            print("\n📥 Downloading original content without modifications")
    
    return use_sponsorblock, audio_only

def get_proxy_settings():
    """Get proxy configuration from user"""
    print("\n🌐 Proxy/Network Options:")
    print("=" * 90)
    print("1. 🧅 Use Tor (auto-detect port)")
    print("2. 🔒 Use custom SOCKS5 proxy")
    print("3. 🌍 Use custom HTTP/HTTPS proxy")
    print("4. ⚡ No proxy (direct connection)")
    print("=" * 90)
    
    choice = input("\n👉 Select option (1-4): ").strip()
    
    if choice == '1':
        tor_port = check_tor_running()
        if tor_port:
            proxy = f'socks5://127.0.0.1:{tor_port}'
            print(f"✅ Tor detected on port {tor_port}!")
            return proxy
        else:
            print("\n⚠️  Tor is not running on any common port (9050, 9150, 9250)!")
            print("📖 To use Tor on Mac:")
            print("   1. Open Tor Browser")
            print("   2. Wait for it to connect (check the onion icon)")
            print("   3. Keep Tor Browser running in background")
            print("\n💡 Tor Browser usually runs on port 9150 or 9250")
            
            # Offer manual port entry
            manual = input("\nEnter custom Tor port (or press ENTER to cancel): ").strip()
            if manual and manual.isdigit():
                return f'socks5://127.0.0.1:{manual}'
            
            use_anyway = input("\nTry port 9150 anyway? (y/n): ").lower()
            if use_anyway == 'y':
                return 'socks5://127.0.0.1:9150'
            return None
    
    elif choice == '2':
        proxy = input("\n🔒 Enter SOCKS5 proxy (e.g., socks5://user:pass@host:port): ").strip()
        return proxy if proxy else None
    
    elif choice == '3':
        proxy = input("\n🌍 Enter HTTP proxy (e.g., http://user:pass@host:port): ").strip()
        return proxy if proxy else None
    
    elif choice == '4':
        print("⚡ Using direct connection (no proxy)")
        return None
    
    else:
        print("⚠️  Invalid choice! Using direct connection.")
        return None
    """Get proxy configuration from user"""
    print("\n🌐 Proxy/Network Options:")
    print("=" * 90)
    print("1. 🧅 Use Tor (auto-detect port)")
    print("2. 🔒 Use custom SOCKS5 proxy")
    print("3. 🌍 Use custom HTTP/HTTPS proxy")
    print("4. ⚡ No proxy (direct connection)")
    print("=" * 90)
    
    choice = input("\n👉 Select option (1-4): ").strip()
    
    if choice == '1':
        tor_port = check_tor_running()
        if tor_port:
            proxy = f'socks5://127.0.0.1:{tor_port}'
            print(f"✅ Tor detected on port {tor_port}!")
            return proxy
        else:
            print("\n⚠️  Tor is not running on any common port (9050, 9150, 9250)!")
            print("📖 To use Tor on Mac:")
            print("   1. Open Tor Browser")
            print("   2. Wait for it to connect (check the onion icon)")
            print("   3. Keep Tor Browser running in background")
            print("\n💡 Tor Browser usually runs on port 9150 or 9250")
            
            # Offer manual port entry
            manual = input("\nEnter custom Tor port (or press ENTER to cancel): ").strip()
            if manual and manual.isdigit():
                return f'socks5://127.0.0.1:{manual}'
            
            use_anyway = input("\nTry port 9150 anyway? (y/n): ").lower()
            if use_anyway == 'y':
                return 'socks5://127.0.0.1:9150'
            return None
    
    elif choice == '2':
        proxy = input("\n🔒 Enter SOCKS5 proxy (e.g., socks5://user:pass@host:port): ").strip()
        return proxy if proxy else None
    
    elif choice == '3':
        proxy = input("\n🌍 Enter HTTP proxy (e.g., http://user:pass@host:port): ").strip()
        return proxy if proxy else None
    
    elif choice == '4':
        print("⚡ Using direct connection (no proxy)")
        return None
    
    else:
        print("⚠️  Invalid choice! Using direct connection.")
        return None

def get_video_formats(url, proxy=None, use_impersonate=True):
    """Fetch available video formats for the given URL"""
    try:
        # Enhanced command with more options for difficult websites
        cmd = [
            'yt-dlp',
            '-J',
            '--no-check-certificate',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--referer', url,
            '--geo-bypass',
        ]
        
        # Add Cloudflare bypass (impersonation)
        if use_impersonate:
            cmd.extend(['--extractor-args', 'generic:impersonate=chrome'])
        
        # Add proxy if specified
        if proxy:
            cmd.extend(['--proxy', proxy])
            print(f"🌐 Using proxy: {proxy}")
        
        cmd.append(url)
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode != 0:
            print(f"\n⚠️  Detailed error message:")
            print(result.stderr)
            return None, None, result.stderr
        
        data = json.loads(result.stdout)
        formats = data.get('formats', [])
        
        # Filter and organize formats
        video_formats = []
        for f in formats:
            if f.get('vcodec') != 'none':  # Has video
                format_info = {
                    'format_id': f.get('format_id'),
                    'ext': f.get('ext'),
                    'resolution': f.get('resolution') or f"{f.get('width', '?')}x{f.get('height', '?')}",
                    'filesize': f.get('filesize', 0),
                    'vcodec': f.get('vcodec', 'unknown'),
                    'acodec': f.get('acodec', 'none'),
                    'fps': f.get('fps', 0),
                    'quality': f.get('quality', 0),
                    'note': f.get('format_note', '')
                }
                video_formats.append(format_info)
        
        return video_formats, data.get('title', 'Unknown'), None
    
    except subprocess.TimeoutExpired:
        return None, None, "Request timed out. The website might be slow or blocking requests."
    except json.JSONDecodeError:
        return None, None, "Could not parse video information. The website might not be supported."
    except Exception as e:
        return None, None, str(e)

def format_filesize(bytes_size):
    """Convert bytes to human-readable format"""
    if not bytes_size or bytes_size == 0:
        return "Unknown"
    
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} TB"

def display_formats(formats):
    """Display available formats in a user-friendly way"""
    print("\n📋 Available Formats:")
    print("-" * 90)
    print(f"{'#':<4} {'Resolution':<15} {'Ext':<8} {'Size':<12} {'FPS':<6} {'Note':<20} {'Format ID':<12}")
    print("-" * 90)
    
    for idx, fmt in enumerate(formats, 1):
        size = format_filesize(fmt['filesize'])
        fps = f"{fmt['fps']}" if fmt['fps'] else "N/A"
        note = fmt.get('note', '')[:18]
        print(f"{idx:<4} {fmt['resolution']:<15} {fmt['ext']:<8} "
              f"{size:<12} {fps:<6} {note:<20} {fmt['format_id']:<12}")
    
    print("-" * 90)

def download_video(url, format_id=None, output_path=None, proxy=None, use_impersonate=True, use_sponsorblock=False, audio_only=False):
    """Download video with specified format"""
    cmd = [
        'yt-dlp',
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', url,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        '--geo-bypass',
    ]
    
    # Add Cloudflare bypass (impersonation)
    if use_impersonate:
        cmd.extend(['--extractor-args', 'generic:impersonate=chrome'])
    
    # Add proxy if specified
    if proxy:
        cmd.extend(['--proxy', proxy])
    
    # Add SponsorBlock integration (only for video)
    if use_sponsorblock and not audio_only:
        cmd.extend([
            '--sponsorblock-remove', 'all',
            '--sponsorblock-chapter-title', '[SponsorBlock]: %(category_names)l'
        ])
    
    # Audio-only or video mode
    if audio_only:
        cmd.extend([
            '-x',  # Extract audio
            '--audio-format', 'mp3',  # Convert to MP3
            '--audio-quality', '0',  # Best quality (0-9, 0 is best)
            '--embed-thumbnail',  # Embed thumbnail as album art
            '--add-metadata',  # Add metadata
        ])
        if output_path:
            cmd.extend(['-o', output_path])
        else:
            cmd.extend(['-o', '%(title)s.%(ext)s'])
    else:
        # Video mode
        if format_id:
            cmd.extend(['-f', format_id])
        else:
            # Download best quality by default (best video + best audio)
            cmd.extend(['-f', 'bestvideo+bestaudio/best'])
        
        if output_path:
            cmd.extend(['-o', output_path])
        else:
            cmd.extend(['-o', '%(title)s.%(ext)s'])
        
        # Merge to mp4 if possible
        cmd.extend(['--merge-output-format', 'mp4'])
    
    # Add progress display
    cmd.append('--progress')
    
    # Add the URL
    cmd.append(url)
    
    print("\n🚀 Starting download...\n")
    if audio_only:
        print(f"🎵 Downloading audio only (MP3 format)")
    if proxy:
        print(f"🌐 Using proxy: {proxy}")
    if use_impersonate:
        print(f"🛡️  Using Chrome impersonation (Cloudflare bypass)")
    if use_sponsorblock and not audio_only:
        print(f"🚫 SponsorBlock enabled (removing sponsors/ads)")
    print()
    
    try:
        subprocess.run(cmd, check=True)
        print("\n✅ Download completed successfully!")
        if audio_only:
            print("🎵 Audio has been extracted and converted to MP3")
        if use_sponsorblock and not audio_only:
            print("💡 Sponsor segments and ads have been removed from the video")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Download failed with error code: {e.returncode}")
        return False

def try_simple_download(url, proxy=None, use_impersonate=True, use_sponsorblock=False, audio_only=False):
    """Try a simple download without format selection"""
    print("\n🔄 Attempting direct download with best available quality...")
    
    cmd = [
        'yt-dlp',
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', url,
        '--geo-bypass',
    ]
    
    # Add Cloudflare bypass (impersonation)
    if use_impersonate:
        cmd.extend(['--extractor-args', 'generic:impersonate=chrome'])
    
    # Add proxy if specified
    if proxy:
        cmd.extend(['--proxy', proxy])
    
    # Add SponsorBlock integration (only for video)
    if use_sponsorblock and not audio_only:
        cmd.extend([
            '--sponsorblock-remove', 'all',
            '--sponsorblock-chapter-title', '[SponsorBlock]: %(category_names)l'
        ])
    
    # Audio-only or video mode
    if audio_only:
        cmd.extend([
            '-x',  # Extract audio
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--embed-thumbnail',
            '--add-metadata',
        ])
    else:
        cmd.extend(['-f', 'best'])
    
    cmd.extend([
        '-o', '%(title)s.%(ext)s',
        '--progress',
        url
    ])
    
    try:
        subprocess.run(cmd, check=True)
        print("\n✅ Download completed successfully!")
        if audio_only:
            print("🎵 Audio has been extracted and converted to MP3")
        if use_sponsorblock and not audio_only:
            print("💡 Sponsor segments and ads have been removed from the video")
        return True
    except subprocess.CalledProcessError:
        print("\n❌ Direct download also failed!")
        return False

def main():
    """Main application function"""
    print("=" * 90)
    print("🎬 Universal Video Downloader CLI (Proxy/Tor/Cloudflare/Ad-Block)")
    print("=" * 90)
    
    # Check dependencies
    missing, impersonate_support = check_dependencies()
    
    if 'yt-dlp' in missing:
        print("\n⚠️  yt-dlp is not installed.")
        response = input("Would you like to install it now? (y/n): ").lower()
        if response == 'y':
            if not install_yt_dlp():
                sys.exit(1)
        else:
            sys.exit(1)
    
    if 'curl_cffi' in missing:
        print("\n⚠️  curl_cffi is not installed (required for Cloudflare bypass).")
        print("💡 This website uses Cloudflare protection and requires browser impersonation.")
        response = input("\nWould you like to install curl_cffi now? (y/n): ").lower()
        if response == 'y':
            if install_curl_cffi():
                impersonate_support = True
            else:
                print("⚠️  Continuing without Cloudflare bypass (may fail on protected sites)")
                impersonate_support = False
        else:
            print("⚠️  Continuing without Cloudflare bypass (may fail on protected sites)")
            impersonate_support = False
    
    if 'ffmpeg' in missing:
        print("\n⚠️  ffmpeg is not installed (required for merging video/audio).")
        print("📖 Install instructions:")
        print("   - Windows: Download from https://ffmpeg.org/download.html")
        print("   - Mac: brew install ffmpeg")
        print("   - Linux: sudo apt install ffmpeg")
        print("\n💡 You can continue, but some features may not work.\n")
    
    # Get ad-blocking preferences and download type
    use_sponsorblock, audio_only = get_download_preferences()
    
    # Get proxy settings
    proxy = get_proxy_settings()
    
    # Get URL from user
    url = input("\n🔗 Enter video URL: ").strip()
    
    if not url:
        print("❌ No URL provided!")
        sys.exit(1)
    
    print("\n⏳ Fetching video information...")
    if impersonate_support:
        print("   🛡️  Using Chrome impersonation (Cloudflare bypass enabled)")
    if use_sponsorblock and not audio_only:
        print("   🚫 Ad-blocking enabled (will remove sponsor segments)")
    if audio_only:
        print("   🎵 Audio-only mode (will convert to MP3)")
    print("   (This may take a moment, especially through Tor...)")
    
    # Get available formats
    formats, title, error = get_video_formats(url, proxy, impersonate_support)
    
    if not formats:
        print(f"\n⚠️  Could not retrieve format information.")
        if error:
            print(f"📋 Error details: {error}")
            
            # Check if it's a Cloudflare error
            if "403" in error and "Cloudflare" in error and not impersonate_support:
                print("\n🛡️  This is a Cloudflare protection issue!")
                print("💡 Install curl_cffi to bypass: pip install curl_cffi")
                print("   Then restart the app.")
        
        print("\n💡 Troubleshooting:")
        print("   • If you got a 403/404 error, the website might be geo-blocked")
        print("   • Try using Tor or a VPN")
        print("   • Install curl_cffi for Cloudflare bypass")
        print("   • The URL might be incorrect or the video removed")
        
        if not proxy:
            retry = input("\n❓ Would you like to retry with Tor/Proxy? (y/n): ").lower()
            if retry == 'y':
                proxy = get_proxy_settings()
                if proxy:
                    formats, title, error = get_video_formats(url, proxy, impersonate_support)
        
        if not formats:
            response = input("\n❓ Would you like to try direct download anyway? (y/n): ").lower()
            if response == 'y':
                success = try_simple_download(url, proxy, impersonate_support, use_sponsorblock, audio_only)
                sys.exit(0 if success else 1)
            else:
                print("\n💡 Additional tips:")
                print("   1. Install curl_cffi: pip install curl_cffi")
                print("   2. Make sure Tor Browser is running (for Tor option)")
                print("   3. Use: yt-dlp --cookies-from-browser chrome [URL]")
                print("   4. Check if you need a VPN for your region")
                sys.exit(1)
    
    print(f"\n📹 Video Title: {title}")
    print(f"✅ Found {len(formats)} format(s)")
    
    # Skip format selection for audio-only mode
    if audio_only:
        print("\n🎵 Audio-only mode: Will extract best audio quality and convert to MP3")
        custom_path = input("\n📁 Custom filename (or press ENTER for auto): ").strip()
        output_path = custom_path if custom_path else None
        download_video(url, None, output_path, proxy, impersonate_support, use_sponsorblock, audio_only)
        sys.exit(0)
    
    # Display formats for video mode
    display_formats(formats)
    
    # Ask user for format choice
    print("\n📌 Options:")
    print(f"  • Enter format number (1-{len(formats)}) to download specific format")
    print("  • Press ENTER for best quality (video + audio merged)")
    print("  • Type 'q' to quit")
    
    choice = input("\n👉 Your choice: ").strip().lower()
    
    if choice == 'q':
        print("👋 Goodbye!")
        sys.exit(0)
    
    format_id = None
    
    if choice and choice.isdigit():
        choice_num = int(choice)
        if 1 <= choice_num <= len(formats):
            format_id = formats[choice_num - 1]['format_id']
            print(f"\n✓ Selected format: {formats[choice_num - 1]['resolution']} "
                  f"({formats[choice_num - 1]['ext']})")
        else:
            print("⚠️  Invalid choice! Downloading best quality instead.")
    elif choice == '':
        print("\n✓ Downloading best quality (auto-merged)")
    else:
        print("⚠️  Invalid input! Downloading best quality instead.")
    
    # Optional: Ask for custom output path
    custom_path = input("\n📁 Custom filename (or press ENTER for auto): ").strip()
    output_path = custom_path if custom_path else None
    
    # Download the video
    download_video(url, format_id, output_path, proxy, impersonate_support, use_sponsorblock)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Download cancelled by user!")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)