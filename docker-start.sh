#!/bin/bash

# Auto-detect host IP
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    HOST_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    HOST_IP=$(hostname -I | awk '{print $1}')
fi

echo "🌐 Detected Host IP: $HOST_IP"

# Run docker with detected IP
export HOST_IP=$HOST_IP
docker-compose up --build -d

echo "✅ Server started at http://$HOST_IP:5001"