# Universal Video Downloader

A modern, full-stack web application for downloading videos and audio from various platforms including YouTube, Twitter, Instagram, TikTok, and many more. Features a beautiful dark-themed React frontend with real-time progress tracking.

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC.svg)

## Features

- **Multi-Platform Support**: Download from YouTube, Twitter/X, Instagram, TikTok, Vimeo, and 1000+ other sites
- **Video & Audio**: Download as video (best quality) or extract audio only (MP3)
- **Format Selection**: Choose specific video/audio quality and format
- **Real-time Progress**: Live progress bar with speed, ETA, and downloaded size
- **SponsorBlock Integration**: Automatically skip sponsored segments (YouTube)
- **Proxy Support**: Built-in Tor proxy support for privacy, plus custom proxy option
- **QR Code Access**: Scan QR code to access from mobile devices on the same network
- **Download History**: Browse, play, download, and delete completed files
- **Resume Downloads**: Cancelled or failed downloads can be resumed
- **Persistent Queue**: Download queue survives page refresh and server restart
- **Mobile Responsive**: Optimized layout for both desktop and mobile devices
- **Dark Theme**: Modern, eye-friendly dark UI with gradient accents

## Tech Stack

### Backend

- **Flask** - Python web framework
- **yt-dlp** - Video/audio downloading engine
- **FFmpeg** - Media processing
- **curl-cffi** - Browser impersonation for bypassing restrictions

### Frontend

- **React 19** - UI framework
- **TypeScript 5.8** - Type-safe JavaScript
- **Vite 6** - Build tool and dev server
- **Tailwind CSS 3.4** - Utility-first styling
- **TanStack Query 5** - Server state management with polling
- **Zustand 5** - Client state management

## Installation

### Prerequisites

- Python 3.11+
- Node.js 20+
- FFmpeg
- yt-dlp

### Native Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/video-downloader.git
   cd video-downloader
   ```

2. **Install Python dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Install yt-dlp and FFmpeg**

   ```bash
   # macOS
   brew install yt-dlp ffmpeg

   # Ubuntu/Debian
   sudo apt install ffmpeg
   pip install yt-dlp

   # Windows
   # Download from https://github.com/yt-dlp/yt-dlp/releases
   # Download FFmpeg from https://ffmpeg.org/download.html
   ```

4. **Build the frontend**

   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

5. **Run the application**

   ```bash
   python app.py
   ```

6. **Access the web UI**
   - Local: http://localhost:5001
   - Network: http://YOUR_IP:5001 (shown in terminal)

### Easy Script Installation

If using Mac/Linux we can use script to install and build app quickly

1. **Build and run with script**
   ```bash
   ./build-and-run.sh
   ```

### Docker Installation

1. **Build and run with Docker**

   ```bash
   docker build -t video-downloader .
   docker run -d -p 5001:5001 -v $(pwd)/downloads:/app/downloads video-downloader
   ```

2. **Or use Docker Compose**
   ```bash
   docker-compose up -d
   ```

The Docker image includes:

- Multi-stage build (Node.js for frontend, Python for backend)
- Built-in Tor proxy on port 9050
- FFmpeg and yt-dlp pre-installed

## Usage

### Basic Download

1. Paste a video URL in the input field
2. Select **Video** or **Audio** mode
3. Click **Start Download**

### Advanced Options

- **SponsorBlock**: Enable to skip sponsored segments (YouTube only)
- **Proxy**: Choose between:
  - None (direct connection)
  - Tor 9050 (built-in Tor, Docker only)
  - Tor 9150 (Tor Browser)
  - Custom (enter your own proxy URL)
- **Format Selection**: Click "Fetch Formats" to see available quality options

### Download History

- **Play**: Stream video/audio directly in browser
- **Download**: Save file to your device
- **Delete**: Remove file from server (requires confirmation)

### Download Queue

- Active downloads show real-time progress
- **Cancel**: Stop an active download
- **Resume**: Restart a cancelled or failed download
- **Remove**: Clear from queue

## Project Structure

```
video-downloader/
├── app.py                 # Flask backend
├── requirements.txt       # Python dependencies
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Docker Compose config
├── downloads/            # Downloaded files
│   ├── videos/          # Video files
│   └── audio/           # Audio files
├── templates/            # Legacy HTML template
│   └── index.html
└── frontend/             # React frontend
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/          # API client
        ├── hooks/        # React Query hooks
        ├── stores/       # Zustand stores
        ├── components/
        │   ├── ui/       # Reusable UI components
        │   ├── layout/   # Header, Container
        │   ├── download/ # Download form
        │   ├── queue/    # Active downloads
        │   ├── history/  # Download history
        │   ├── player/   # Video/audio player
        │   └── notifications/
        ├── utils/        # Formatters, helpers
        └── types/        # TypeScript interfaces
```

## API Endpoints

| Endpoint                   | Method | Description                      |
| -------------------------- | ------ | -------------------------------- |
| `/api/server-info`         | GET    | Server URLs and QR code          |
| `/api/check-dependencies`  | GET    | Verify yt-dlp, ffmpeg installed  |
| `/api/download`            | POST   | Start a new download             |
| `/api/queue`               | GET    | Get all downloads in queue       |
| `/api/status/:id`          | GET    | Get single job status            |
| `/api/cancel/:id`          | POST   | Cancel active download           |
| `/api/resume/:id`          | POST   | Resume cancelled/failed download |
| `/api/remove/:id`          | DELETE | Remove job from queue            |
| `/api/history`             | GET    | Get download history             |
| `/api/history/:id`         | DELETE | Delete file from history         |
| `/api/file/:path`          | GET    | Stream file for playback         |
| `/api/download-file/:path` | GET    | Download file                    |
| `/api/formats`             | POST   | Get available formats for URL    |

## Configuration

### Environment Variables

| Variable  | Description                  | Default       |
| --------- | ---------------------------- | ------------- |
| `HOST_IP` | Override detected IP address | Auto-detected |

### Supported File Formats

**Video**: `.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`, `.flv`, `.wmv`, `.m4v`, `.ts`, `.mpg`, `.mpeg`

**Audio**: `.mp3`, `.m4a`, `.wav`, `.flac`, `.ogg`, `.aac`, `.opus`, `.wma`

## Development

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on http://localhost:5173 and proxies API requests to Flask on port 5001.

### Building for Production

```bash
cd frontend
npm run build
```

Built files go to `frontend/dist/` and are served by Flask.

## Keeping Server Alive

To prevent your computer from sleeping during long downloads:

```bash
# macOS
caffeinate -i python app.py

# Linux
systemd-inhibit python app.py

# Windows
# Disable sleep in Power Settings
```

## Troubleshooting

### "yt-dlp not found"

Install yt-dlp: `pip install yt-dlp` or `brew install yt-dlp`

### "ffmpeg not found"

Install FFmpeg: `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux)

### Download fails with 403 error

Try enabling browser impersonation (uses curl-cffi) or use a proxy.

### Slow downloads

Some sites throttle downloads. Try using Tor proxy or wait and retry.

### Files not showing in history

Only video/audio files with supported extensions are shown. System files like `.DS_Store` are filtered out.

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - The amazing download engine
- [FFmpeg](https://ffmpeg.org/) - Media processing
- [SponsorBlock](https://sponsor.ajay.app/) - Crowdsourced sponsor segment database
