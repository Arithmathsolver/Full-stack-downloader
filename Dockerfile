# Use Node base image
FROM node:18

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Install yt-dlp, ffmpeg, and Chromium for Puppeteer
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg chromium \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libasound2 \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libxshmfence1 \
    && pip3 install yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Copy app source
COPY . .

# Expose port and start server
EXPOSE 3000
CMD ["node", "server.js"]
