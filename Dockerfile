# Use Node base image
FROM node:18

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Install yt-dlp, ffmpeg, and Chromium for Puppeteer
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg wget gnupg ca-certificates && \
    wget -qO - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libasound2 \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libxshmfence1 && \
    pip3 install yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
