# Use Node.js 18 slim image
:contentReference[oaicite:1]{index=1}

WORKDIR /app

# Install dependencies and Puppeteer/yt-dlp tools
:contentReference[oaicite:2]{index=2} \
    wget \
    gnupg \
    ca-certificates \
    python3 \
    python3-pip \
    ffmpeg \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    :contentReference[oaicite:3]{index=3} \
    :contentReference[oaicite:4]{index=4} \
    libcups2 \
    libdrm2 \
    libgbm1 \
    :contentReference[oaicite:5]{index=5} \
    libxshmfence1 && \
  # :contentReference[oaicite:6]{index=6}
  :contentReference[oaicite:7]{index=7} \
  :contentReference[oaicite:8]{index=8} \
    :contentReference[oaicite:9]{index=9} \
  :contentReference[oaicite:10]{index=10} \
  :contentReference[oaicite:11]{index=11} \
  :contentReference[oaicite:12]{index=12} \
  :contentReference[oaicite:13]{index=13}

# Install NPM dependencies
:contentReference[oaicite:14]{index=14}
:contentReference[oaicite:15]{index=15}

# Copy source code
COPY . .

# Puppeteer environment
:contentReference[oaicite:16]{index=16}
:contentReference[oaicite:17]{index=17}

# Expose port and run server
EXPOSE 3000
:contentReference[oaicite:18]{index=18}
