# Use Zenika base image with Chrome and Node.js
FROM zenika/alpine-chrome:with-node

# Switch to root for package install
USER root

# Create app directory
WORKDIR /app

# Install required packages
RUN apk update && \
    apk add --no-cache python3 py3-pip ffmpeg curl chromium && \
    ln -sf python3 /usr/bin/python && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PYTHONIOENCODING=utf-8

# Copy and install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
