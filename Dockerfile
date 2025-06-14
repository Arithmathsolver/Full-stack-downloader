# Use Zenika base image with Chrome and Node.js
FROM zenika/alpine-chrome:with-node

# Switch to root for package install
USER root

# Create app directory
WORKDIR /app

# Install required system packages with retries
RUN set -eux; \
    for i in 1 2 3; do \
        apk update && \
        apk add --no-cache \
            python3 \
            py3-pip \
            ffmpeg \
            curl \
            chromium \
            make \
            g++ \
            yarn && \
        ln -sf python3 /usr/bin/python && \
        break || sleep 30; \
    done

# Install yt-dlp with retries
RUN set -eux; \
    for i in 1 2 3 4 5; do \
        curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
        chmod a+rx /usr/local/bin/yt-dlp && \
        yt-dlp -U && \
        break || sleep 30; \
    done

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PYTHONIOENCODING=utf-8
ENV NODE_ENV=production

# Install Node.js dependencies with cache optimization
COPY package*.json ./
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm install --legacy-peer-deps --no-optional && \
    npm cache clean --force

# Copy application source
COPY . .

# Clean up to reduce image size
RUN apk del make g++ && \
    rm -rf /var/cache/apk/* && \
    rm -rf /tmp/*

# Create non-root user and switch to it
RUN chown -R chrome:chrome /app
USER chrome

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the server
CMD ["node", "server.js"]
