#!/bin/bash
# install.sh — Register the Video Downloader native messaging host with Brave/Chrome
set -e

HOST_NAME="com.videodownloader.host"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/native_host.py"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Video Downloader — Native Host Installer    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── OS detection ──────────────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
    BRAVE_NMH="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    CHROME_NMH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    BRAVE_NMH="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    CHROME_NMH="$HOME/.config/google-chrome/NativeMessagingHosts"
else
    echo "❌  Unsupported OS: $OSTYPE"
    exit 1
fi

# ── Python check ──────────────────────────────────────────────────────────────
PYTHON=$(which python3 2>/dev/null || which python 2>/dev/null || echo "")
if [ -z "$PYTHON" ]; then
    echo "❌  Python not found. Please install Python 3."
    exit 1
fi
echo "✓ Python: $PYTHON"

# ── yt-dlp check ─────────────────────────────────────────────────────────────
YTDLP=$(which yt-dlp 2>/dev/null || echo "")
if [ -z "$YTDLP" ]; then
    echo "⚠  yt-dlp not found on PATH. Trying to install..."
    pip3 install yt-dlp || pip install yt-dlp || {
        echo "❌  Could not install yt-dlp. Run: pip install yt-dlp"
        exit 1
    }
fi
echo "✓ yt-dlp: $(which yt-dlp 2>/dev/null || echo 'installed via pip')"

# ── Make host executable ──────────────────────────────────────────────────────
chmod +x "$HOST_SCRIPT"
echo "✓ Host script: $HOST_SCRIPT"

# ── Get extension ID ──────────────────────────────────────────────────────────
echo ""
echo "To find your extension ID:"
echo "  1. Open Brave → brave://extensions"
echo "  2. Enable Developer mode (top-right toggle)"
echo "  3. Find 'Video Downloader - IDM Style'"
echo "  4. Copy the ID shown below the name (looks like: abcdefghijklmnopqrstuvwxyzabcdef)"
echo ""
read -rp "Paste your extension ID: " EXT_ID

EXT_ID="${EXT_ID// /}"  # strip spaces
if [ -z "$EXT_ID" ]; then
    echo "❌  Extension ID is required."
    exit 1
fi

# ── Write manifest ────────────────────────────────────────────────────────────
write_manifest() {
    local NMH_DIR="$1"
    mkdir -p "$NMH_DIR"
    cat > "$NMH_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Video Downloader native host — downloads videos via yt-dlp",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF
    echo "✓ Manifest written: $NMH_DIR/$HOST_NAME.json"
}

write_manifest "$BRAVE_NMH"

# Also install for Chrome if directory exists
if [ -d "$(dirname "$CHROME_NMH")" ]; then
    write_manifest "$CHROME_NMH"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "✅  Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Go to brave://extensions"
echo "  2. Click the refresh icon on 'Video Downloader - IDM Style'"
echo "  3. Visit any page with a video and try downloading"
echo ""
echo "Downloads will be saved to: ~/Downloads/VideoDownloader/"
echo ""
