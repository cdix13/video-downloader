FROM python:3.11-slim

# Install system dependencies including Tor
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    tor \
    && rm -rf /var/lib/apt/lists/*

# Configure Tor
RUN echo "SocksPort 0.0.0.0:9050" >> /etc/tor/torrc && \
    echo "ControlPort 9051" >> /etc/tor/torrc && \
    echo "CookieAuthentication 0" >> /etc/tor/torrc

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY templates/ templates/

# Create downloads directory
RUN mkdir -p downloads/videos downloads/audio

# Create startup script
RUN echo '#!/bin/bash\n\
echo "🧅 Starting Tor service..."\n\
service tor start\n\
sleep 2\n\
echo "✅ Tor is running on port 9050"\n\
echo "🎬 Starting Video Downloader..."\n\
python app.py\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose ports
EXPOSE 5001

# Run the startup script
CMD ["/app/start.sh"]