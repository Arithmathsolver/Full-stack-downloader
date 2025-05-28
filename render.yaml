FROM node:18

# Install Python and yt-dlp
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    pip3 install yt-dlp

WORKDIR /app
COPY . .

RUN npm install

CMD ["npm", "start"]
