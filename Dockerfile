# Use Node base image
FROM node:18-slim

# Create app directory
WORKDIR /app

# Install yt-dlp, ffmpeg, and Google Chrome for Puppeteer
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg wget gnupg ca-certificates && \
    # Add Google Chrome signing key
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    # Add Google Chrome repository
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libasound2 \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libxshmfence1 && \
    pip3 install yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Set environment variables for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
