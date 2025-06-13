const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const proxyChain = require('proxy-chain');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
require('dotenv').config();

// Configure puppeteer with stealth plugin
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

// Proxy configuration
const PROXY_LIST = process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',') : [];
let currentProxyIndex = 0;

const getNextProxy = () => {
  if (PROXY_LIST.length === 0) return null;
  currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;
  return PROXY_LIST[currentProxyIndex];
};

// Create downloads folder if not exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Enhanced platform detection
const platformDetectors = {
  youtube: url => url.includes('youtube.com') || url.includes('youtu.be'),
  tiktok: url => url.includes('tiktok.com'),
  instagram: url => url.includes('instagram.com'),
  facebook: url => url.includes('facebook.com') || url.includes('fb.watch')
};

// Turbo YouTube download handler with proxy support
async function handleYouTubeDownload(url, quality, res) {
  const filename = `yt_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const proxyUrl = getNextProxy();

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
    -f "bestvideo[height<=720]+bestaudio/best[height<=720]" \
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

// Turbo download handler for TikTok/Facebook/Instagram
async function handleSocialDownload(url, platform, res) {
  const filename = `${platform}_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const proxyUrl = getNextProxy();

  try {
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
    
    // Set realistic viewport and user agent
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
      } 
      else if (platform === 'facebook') {
        await page.goto('https://fdown.net', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[name="URLz"]', url);
        await page.click('button[type="submit"]');
        await page.waitForSelector('.btns-download a', { timeout: 30000 });
        downloadUrl = await page.$eval('.btns-download a', el => el.href);
      }
      else if (platform === 'instagram') {
        await page.goto('https://snapinsta.app', { waitUntil: 'networkidle2', timeout: 30000 });
        await page.type('input[name="url"]', url);
        await page.click('button[type="submit"]');
        await page.waitForSelector('.download-result a[download]', { timeout: 30000 });
        downloadUrl = await page.$eval('.download-result a[download]', el => el.href);
      }

      if (!downloadUrl) throw new Error('Download link not found');

      // Download the file directly
      const viewSource = await page.goto(downloadUrl, { waitUntil: 'domcontentloaded' });
      fs.writeFileSync(filepath, await viewSource.buffer());

      return res.json({
        success: true,
        filename: filename,
        message: 'Download completed successfully'
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(`${platform} Download Error:`, error);
    return res.status(500).json({
      success: false,
      message: `${platform} download failed: ${error.message}`
    });
  }
}

// Unified download endpoint
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

// File download endpoint (unchanged)
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
    
    // Clean up file after download completes
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
  
  // Auto-update yt-dlp on startup
  exec('yt-dlp -U', (error, stdout, stderr) => {
    if (error) {
      console.error('Failed to update yt-dlp:', error);
    } else {
      console.log('yt-dlp update check:', stdout || stderr);
    }
  });
});
