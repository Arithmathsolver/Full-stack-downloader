const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const proxyChain = require('proxy-chain');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const https = require('https');
const fetch = require('node-fetch');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

const PROXY_LIST = process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : [];
let currentProxyIndex = 0;

const getNextProxy = () => {
  if (PROXY_LIST.length === 0) return null;
  currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;
  return PROXY_LIST[currentProxyIndex];
};

if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const platformDetectors = {
  youtube: url => url.includes('youtube.com') || url.includes('youtu.be'),
  tiktok: url => url.includes('tiktok.com'),
  instagram: url => url.includes('instagram.com'),
  facebook: url => url.includes('facebook.com') || url.includes('fb.watch')
};

async function handleYouTubeDownload(url, quality, res) {
  const filename = `yt_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const proxyUrl = getNextProxy();

  const formatSelector = quality === '1080p'
    ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
    : 'bestvideo[height<=720]+bestaudio/best[height<=720]';

  let command = `yt-dlp \
    --no-playlist \
    --force-ipv4 \
    ${proxyUrl ? `--proxy ${proxyUrl}` : ''} \
    --socket-timeout 20 \
    --retries 3 \
    --throttled-rate 2M \
    --limit-rate 5M \
    --no-check-certificates \
    --geo-bypass \
    --extractor-args "youtube:player_client=android" \
    --user-agent "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36" \
    -f "${formatSelector}" \
    -o "${filepath}"`;

  if (fs.existsSync(cookiesPath)) {
    command += ` --cookies ${cookiesPath}`;
  }

  command += ` ${url}`;

  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('YouTube Download Error:', stderr || error.message);

        if (stderr.includes('429') || stderr.includes('Too Many Requests')) {
          return res.status(429).json({
            success: false,
            message: 'YouTube rate limit exceeded. Try again later or use proxies.'
          });
        }

        return res.status(500).json({
          success: false,
          message: 'YouTube download failed: ' + (stderr || error.message)
        });
      }

      if (!fs.existsSync(filepath)) {
        return res.status(500).json({
          success: false,
          message: 'Downloaded file not found'
        });
      }

      resolve(res.json({
        success: true,
        filename: filename,
        message: 'Download completed successfully'
      }));
    });
  });
}

async function handleSocialDownload(url, platform, res) {
  const filename = `${platform}_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const proxyUrl = getNextProxy();

  try {
    if (platform === 'facebook') {
      const apifyUrl = `https://api.apify.com/v2/acts/epctex~facebook-downloader/runs?token=${process.env.APIFY_TOKEN}`;

      const runRes = await fetch(apifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { videoUrl: url },
        }),
      });

      const runData = await runRes.json();
      const runId = runData.data.id;

      let videoInfo = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const resultRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${process.env.APIFY_TOKEN}`);
        const resultData = await resultRes.json();

        if (resultData.length > 0 && resultData[0].videoUrl) {
          videoInfo = resultData[0];
          break;
        }
      }

      if (!videoInfo || !videoInfo.videoUrl) {
        throw new Error('Failed to get video from Apify');
      }

      const file = fs.createWriteStream(filepath);
      https.get(videoInfo.videoUrl, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            return res.json({
              success: true,
              filename: filename,
              message: 'Download completed successfully'
            });
          });
        });
      }).on('error', (err) => {
        fs.unlinkSync(filepath);
        throw new Error('HTTPS download failed: ' + err.message);
      });

    } else {
      const browserOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      };

      if (proxyUrl) {
        browserOptions.args.push(`--proxy-server=${proxyUrl}`);
      }

      const browser = await puppeteer.launch(browserOptions);
      const page = await browser.newPage();

      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      try {
        let downloadUrl;

        if (platform === 'tiktok') {
          await page.goto('https://snaptik.app/en', { waitUntil: 'networkidle2', timeout: 30000 });
          await page.type('input[name="url"]', url);
          await page.click('button[type="submit"]');
          await page.waitForSelector('.download-link', { timeout: 30000 });
          downloadUrl = await page.$eval('.download-link', el => el.href);
        } else if (platform === 'instagram') {
          await page.goto('https://snapinsta.app', { waitUntil: 'networkidle2', timeout: 30000 });
          await page.type('input[name="url"]', url);
          await page.click('button[type="submit"]');
          await page.waitForSelector('.download-result a[download]', { timeout: 30000 });
          downloadUrl = await page.$eval('.download-result a[download]', el => el.href);
        }

        if (!downloadUrl) throw new Error('Download link not found');

        const file = fs.createWriteStream(filepath);
        https.get(downloadUrl, (response) => {
          response.pipe(file);
          file.on('finish', () => {
            file.close(() => {
              return res.json({
                success: true,
                filename: filename,
                message: 'Download completed successfully'
              });
            });
          });
        }).on('error', (err) => {
          fs.unlinkSync(filepath);
          throw new Error('HTTPS download failed: ' + err.message);
        });

      } finally {
        await browser.close();
      }
    }
  } catch (error) {
    console.error(`${platform} Download Error:`, error);
    return res.status(500).json({
      success: false,
      message: `${platform} download failed: ${error.message}`
    });
  }
}

app.post('/download', async (req, res) => {
  const { url, quality } = req.body;

  try {
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL is required'
      });
    }

    if (platformDetectors.youtube(url)) {
      return await handleYouTubeDownload(url, quality, res);
    }
    else if (platformDetectors.tiktok(url)) {
      return await handleSocialDownload(url, 'tiktok', res);
    }
    else if (platformDetectors.facebook(url)) {
      return await handleSocialDownload(url, 'facebook', res);
    }
    else if (platformDetectors.instagram(url)) {
      return await handleSocialDownload(url, 'instagram', res);
    }

    return res.status(400).json({
      success: false,
      message: 'Unsupported platform'
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

app.get('/downloads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  res.download(filepath, filename, (err) => {
    if (err) {
      console.error('File Download Error:', err);
      res.status(500).json({
        success: false,
        message: 'File download failed'
      });
    }

    try {
      fs.unlinkSync(filepath);
    } catch (cleanupError) {
      console.error('File Cleanup Error:', cleanupError);
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
  console.log(`🔄 Using ${PROXY_LIST.length} proxies`);

  exec('yt-dlp -U', (error, stdout, stderr) => {
    if (error) {
      console.error('Failed to update yt-dlp:', error);
    } else {
      console.log('yt-dlp update check:', stdout || stderr);
    }
  });
});
