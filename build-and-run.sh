#!/bin/bash

echo "🐳 Building Video Downloader with Tor..."

# Detect host IP
if [[ "$OSTYPE" == "darwin"* ]]; then
    HOST_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    HOST_IP=$(hostname -I | awk '{print $1}')
else
    HOST_IP="192.168.1.100"
fi

echo "🌐 Detected Host IP: $HOST_IP"

# Build image
docker build -t video-downloader .

# Stop old container
docker stop video-downloader 2>/dev/null
docker rm video-downloader 2>/dev/null

# Run new container
docker run -d \
  --name video-downloader \
  -p 5001:5001 \
  -e HOST_IP=$HOST_IP \
  -v $(pwd)/downloads:/app/downloads \
  -v $(pwd)/download_history.json:/app/download_history.json \
  --cap-add=NET_ADMIN \
  --restart unless-stopped \
  video-downloader

echo ""
echo "✅ Container started!"
echo "🧅 Tor is running inside the container"
echo ""
echo "📱 Access URLs:"
echo "   • Local:   http://localhost:5001"
echo "   • Network: http://$HOST_IP:5001"
echo ""
echo "🔍 View logs: docker logs -f video-downloader"
echo "🛑 Stop:      docker stop video-downloader"
echo ""
echo "💡 In the web UI, select proxy: 'Tor (port 9050)'"
