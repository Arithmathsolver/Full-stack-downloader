# Use Zenika image with Node.js and Chrome
FROM zenika/alpine-chrome:with-node

# Switch to root to install packages
USER root

# Create app directory
WORKDIR /app

# Install yt-dlp and ffmpeg using apk (no pip needed)
RUN apk update && \
    apk add --no-cache python3 py3-pip yt-dlp ffmpeg

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Puppeteer config
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
