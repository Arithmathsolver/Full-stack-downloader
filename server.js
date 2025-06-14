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
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Enhanced stealth plugins
puppeteer.use(StealthPlugin());
puppeteer.use(require('puppeteer-extra-plugin-anonymize-ua')());

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many requests, please try again later'
});
app.use('/download', limiter);

// Enhanced proxy handling with validation
const PROXY_LIST = process.env.PROXY_LIST 
  ? process.env.PROXY_LIST.split(',').filter(proxy => {
      try {
        const url = new URL(proxy.includes('://') ? proxy : `http://${proxy}`);
        return !isNaN(url.port) && url.port > 0;
      } catch (e) {
        console.error(`Invalid proxy URL skipped: ${proxy}`);
        return false;
      }
    })
  : [];

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

  // Enhanced YouTube download command
  let command = `yt-dlp \
    --no-playlist \
    --force-ipv4 \
    ${proxyUrl ? `--proxy ${proxyUrl}` : ''} \
    --socket-timeout 30 \
    --retries 5 \
    --throttled-rate 2M \
    --limit-rate 3M \
    --no-check-certificates \
    --geo-bypass \
    --extractor-args "youtube:player_client=android,skip=webpage" \
    --user-agent "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    --sleep-interval 5 \
    --max-sleep-interval 15 \
    -f "${quality === '1080p' ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' : 'bestvideo[height<=720]+bestaudio/best[height<=720]'}" \
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
    const browserOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    };

    if (proxyUrl) {
      browserOptions.args.push(`--proxy-server=${proxyUrl}`);
    }

    const browser = await puppeteer.launch(browserOptions);
    const page = await browser.newPage();

    // Enhanced stealth settings
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      let downloadUrl;

      if (platform === 'tiktok') {
        // Enhanced TikTok download with retries
        await page.goto('https://snaptik.app/en', { 
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        await page.waitForSelector('input[name="url"]', { timeout: 30000 });
        await page.type('input[name="url"]', url, { delay: 100 });
        
        await page.click('button[type="submit"]');
        
        await page.waitForSelector('.download-link, .result_overlay a', { 
          timeout: 60000 
        });
        
        downloadUrl = await page.evaluate(() => {
          return document.querySelector('.download-link, .result_overlay a')?.href;
        });
      } 
      else if (platform === 'facebook') {
        // Enhanced Facebook download
        await page.goto('https://www.getfvid.com/downloader', {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        await page.waitForSelector('input[name="url"]', { timeout: 30000 });
        await page.type('input[name="url"]', url, { delay: 100 });
        
        await page.click('button[type="submit"]');
        
        await page.waitForSelector(
          '.btn-group a, .download-link, a[href*="download"]', 
          { timeout: 60000 }
        );
        
        downloadUrl = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          return links.find(a => a.href.includes('download'))?.href;
        });
      }
      else if (platform === 'instagram') {
        // Enhanced Instagram download
        await page.goto('https://snapinsta.app', {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        await page.waitForSelector('input[name="url"]', { timeout: 30000 });
        await page.type('input[name="url"]', url, { delay: 100 });
        
        await page.click('button[type="submit"]');
        
        await page.waitForSelector('.download-result a[download], .download-items a', {
          timeout: 60000
        });
        
        downloadUrl = await page.evaluate(() => {
          return document.querySelector('.download-result a[download], .download-items a')?.href;
        });
      }

      if (!downloadUrl) throw new Error('Download link not found');

      // Enhanced file download with progress
      const file = fs.createWriteStream(filepath);
      https.get(downloadUrl, (response) => {
        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = (downloadedBytes / totalBytes * 100).toFixed(2);
          console.log(`Download progress: ${progress}%`);
        });
        
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
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    if (platformDetectors.youtube(url)) {
      return await handleYouTubeDownload(url, quality, res);
    } else if (platformDetectors.tiktok(url)) {
      return await handleSocialDownload(url, 'tiktok', res);
    } else if (platformDetectors.facebook(url)) {
      return await handleSocialDownload(url, 'facebook', res);
    } else if (platformDetectors.instagram(url)) {
      return await handleSocialDownload(url, 'instagram', res);
    }

    return res.status(400).json({ success: false, message: 'Unsupported platform' });

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
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  res.download(filepath, filename, (err) => {
    if (err) {
      console.error('File Download Error:', err);
      res.status(500).json({ success: false, message: 'File download failed' });
    }

    try {
      fs.unlinkSync(filepath);
    } catch (cleanupError) {
      console.error('File Cleanup Error:', cleanupError);
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    success: false,
    message: 'Download failed. Please try a different URL or try again later.',
    debug: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
  console.log(`🔄 Using ${PROXY_LIST.length} valid proxies`);
  
  if (process.env.PROXY_LIST && PROXY_LIST.length < process.env.PROXY_LIST.split(',').length) {
    console.warn('⚠️ Some proxies were invalid and skipped');
  }

  exec('yt-dlp -U', (error, stdout, stderr) => {
    if (error) {
      console.error('Failed to update yt-dlp:', error);
    } else {
      console.log('yt-dlp update check:', stdout || stderr);
    }
  });
});
