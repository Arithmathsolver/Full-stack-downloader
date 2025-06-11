# ✅ Use Zenika image with Node.js + Chrome preinstalled
FROM zenika/alpine-chrome:with-node

# Switch to root to install packages
USER root

# Create app directory
WORKDIR /app

# Install yt-dlp and ffmpeg
RUN apk update && \
    apk add --no-cache python3 py3-pip ffmpeg && \
    pip3 install yt-dlp

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Set Puppeteer environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy the rest of your app
COPY . .

# Expose your port
EXPOSE 3000

# Start your app
CMD ["node", "server.js"]
