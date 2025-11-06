#!/usr/bin/env python3
"""
downloader.py
Simple cross-platform CLI downloader using yt-dlp + ffmpeg.
Usage:
  python downloader.py --url URL [--format FORMAT_ID] [--output DIR] [--subtitles]
  python downloader.py --list-formats --url URL
"""

import argparse
import os
import sys
import threading
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadCancelled
from tqdm import tqdm

def list_formats(url):
    ydl_opts = {
        'quiet': True,
        'skip_download': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://missav.ws'
        },
    }
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        print(f"Title: {info.get('title')}\n")
        print(f"{'format_id':12} {'ext':6} {'tbr':6} {'vcodec':10} {'acodec':10} {'note'}")
        for f in formats:
            print(f"{str(f.get('format_id')):12} {f.get('ext', ''):6} {str(f.get('tbr','')):6} "
                  f"{f.get('vcodec',''):10} {f.get('acodec',''):10} {f.get('format_note','')}")
        return info

def download(url, format_id=None, out_dir='downloads', subtitles=False, merge_output_format=None):
    os.makedirs(out_dir, exist_ok=True)
    # Output template
    outtmpl = os.path.join(out_dir, '%(title).200s [%(id)s].%(ext)s')

    ydl_opts = {
        'outtmpl': outtmpl,
        'noplaylist': False,  # set to True if you want single video only
        'continuedl': True,
        'no_warnings': True,
        'ignoreerrors': False,
        'progress_hooks': [progress_hook],
        'format': format_id or 'bestvideo+bestaudio/best',
        # Use ffmpeg to merge if needed
        'postprocessors': [{
            'key': 'FFmpegVideoConvertor',
            'preferedformat': 'mp4'
        }],
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://missav.ws'
        },
    }

    if subtitles:
        ydl_opts.update({
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitlesformat': 'srt',
            'subtitlelangs': ['all'],
        })

    if merge_output_format:
        # let yt-dlp merge using this format if merging required
        ydl_opts['merge_output_format'] = merge_output_format

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            print("Download completed.")
            return info
    except DownloadCancelled:
        print("Download cancelled.")
    except Exception as e:
        print("Error:", e)

# Minimal progress hook using tqdm
progress_bars = {}

def progress_hook(d):
    if d['status'] == 'downloading':
        id_ = d.get('info_dict', {}).get('id', 'global')
        total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
        downloaded = d.get('downloaded_bytes') or 0
        if id_ not in progress_bars:
            progress_bars[id_] = tqdm(total=total or None, unit='B', unit_scale=True, desc=d.get('filename', id_)[:40])
        bar = progress_bars[id_]
        bar.total = total or bar.total
        bar.n = downloaded
        bar.refresh()
    elif d['status'] == 'finished':
        id_ = d.get('info_dict', {}).get('id', 'global')
        bar = progress_bars.get(id_)
        if bar:
            bar.n = bar.total or bar.n
            bar.close()
            del progress_bars[id_]

def main():
    parser = argparse.ArgumentParser(description="Simple downloader using yt-dlp + ffmpeg")
    parser.add_argument('--url', required=True, help="Video/page URL")
    parser.add_argument('--list-formats', action='store_true', help="List available formats and exit")
    parser.add_argument('--format', help="Format ID to download (see --list-formats). Default: bestvideo+bestaudio/best")
    parser.add_argument('--output', '-o', default='downloads', help="Output directory")
    parser.add_argument('--subtitles', action='store_true', help="Download subtitles if available")
    parser.add_argument('--merge', help="Preferred merge output format (e.g., mp4, mkv). Optional.")
    args = parser.parse_args()

    if args.list_formats:
        list_formats(args.url)
        return

    print("Starting download...")
    download(args.url, format_id=args.format, out_dir=args.output, subtitles=args.subtitles, merge_output_format=args.merge)

if __name__ == '__main__':
    main()
