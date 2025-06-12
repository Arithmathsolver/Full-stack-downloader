er running on port ${PORT}`);
}const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

// Enhanced stealth mode for Puppeteer
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');
const PROXY_SERVERS = process.env.PROXY_SERVERS ? process.env.PROXY_SERVERS.split(',') : [];

// Create downloads folder if not exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rotating proxy function
function getRandomProxy() {
  if (PROXY_SERVERS.length === 0) return '';
  return `--proxy ${PROXY_SERVERS[Math.floor(Math.random() * PROXY_SERVERS.length)]}`;
}

// YouTube download through multiple methods
async function youtubeBrowserDownload(url, quality, res) {
  const methods = [
    attemptYtDlpDirectDownload,
    attemptBrowserAutomationDownload,
    attemptThirdPartyApiDownload
  ];

  for (const method of methods) {
    try {
      const result = await method(url, quality);
      if (result.success) return res.json(result);
    } catch (error) {
      console.log(`Method failed: ${method.name}`, error.message);
    }
  }

  return res.status(500).json({
    success: false,
    message: 'All download methods failed. Please try again later.'
  });
}

// Method 1: Direct yt-dlp download with proxy rotation
async function attemptYtDlpDirectDownload(url, quality) {
  return new Promise((resolve, reject) => {
    const filename = `yt_${Date.now()}.mp4`;
    const filepath = path.join(DOWNLOAD_FOLDER, filename);
    const proxy = getRandomProxy();
    
    const command = `yt-dlp \
      ${proxy} \
      --no-playlist \
      --geo-bypass \
      --force-ipv4 \
      --socket-timeout 30 \
      --retries 3 \
      --throttled-rate 1M \
      --limit-rate 2M \
      --sleep-interval 10 \
      --max-sleep-interval 30 \
      -f "${quality || 'best'}" \
      -o "${filepath}" \
      ${url}`;

    exec(command, (error, stdout, stderr) => {
      if (error || !fs.existsSync(filepath)) {
        return reject(new Error(stderr || 'Direct download failed'));
      }

      resolve({
        success: true,
        filename: filename,
        message: 'Download completed via direct method'
      });
    });
  });
}

// Method 2: Browser automation (existing method)
async function attemptBrowserAutomationDownload(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ],
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('https://en.savefrom.net/', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    await page.type('#sf_url', url);
    await page.click('#sf_submit');
    await page.waitForSelector('.def-btn-box', { timeout: 60000 });
    
    const downloadUrl = await page.evaluate(() => {
      const link = document.querySelector('.def-btn[name="download"]');
      return link ? link.href : null;
    });

    if (!downloadUrl) throw new Error('Download link not found');
    
    return {
      success: true,
      downloadUrl: downloadUrl,
      message: 'Download available via browser automation'
    };
  } finally {
    await browser.close();
  }
}

// Method 3: Third-party API fallback
async function attemptThirdPartyApiDownload(url) {
  const response = await axios.get(`https://api.vevioz.com/api/button/mp4/${encodeURIComponent(url)}`);
  if (response.data?.url) {
    return {
      success: true,
      downloadUrl: response.data.url,
      message: 'Download available via third-party API'
    };
  }
  throw new Error('Third-party API failed');
}

// Existing download endpoint (updated to use multi-method system)
app.post('/download', async (req, res) => {
  const { url, quality } = req.body;

  try {
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL is required' 
      });
    }

    // YouTube handling with multiple fallback methods
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return await youtubeBrowserDownload(url, quality, res);
    }

    // Other platforms handling...
    // ... (keep your existing TikTok/Instagram/Facebook code here)

  } catch (error) {
    console.error('Download Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message.includes('timeout') ? 
        'Connection timeout. Please try again.' : 
        error.message 
    });
  }
});

// Keep all other existing endpoints and functionality
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
