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
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Enhanced stealth plugins
puppeteer.use(StealthPlugin());
puppeteer.use(require('puppeteer-extra-plugin-anonymize-ua')());

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

// Security middleware
app.use(helmet());
app.use(morgan('combined'));

// Enhanced rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/download', limiter);

// Improved proxy handling
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
  const proxyUrl = getNextProxy();

  try {
    const command = `yt-dlp \
      --no-playlist \
      --force-ipv4 \
      ${proxyUrl ? `--proxy ${proxyUrl}` : ''} \
      --socket-timeout 30 \
      --retries 5 \
      -f "${quality === '1080p' ? 
        'bestvideo[height<=1080]+bestaudio/best[height<=1080]' : 
        'bestvideo[height<=720]+bestaudio/best[height<=720]'}" \
      --merge-output-format mp4 \
      -o "${filepath}" \
      "${url}"`;

    const childProcess = exec(command);

    const timeout = setTimeout(() => {
      childProcess.kill();
      res.status(408).json({ success: false, message: 'Download timed out' });
    }, 300000);

    childProcess.on('exit', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        return res.status(500).json({
          success: false,
          message: 'YouTube download failed'
        });
      }

      if (!fs.existsSync(filepath)) {
        return res.status(500).json({
          success: false,
          message: 'Downloaded file not found'
        });
      }

      res.json({
        success: true,
        filename: filename,
        message: 'Download completed successfully'
      });
    });

  } catch (error) {
    console.error('YouTube Download Error:', error);
    res.status(500).json({
      success: false,
      message: 'YouTube download failed: ' + error.message
    });
  }
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

    // Manual resource blocking
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    try {
      let downloadUrl;

      if (platform === 'tiktok') {
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

      const fileStream = fs.createWriteStream(filepath);
      const requestOptions = proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : {};
      
      https.get(downloadUrl, requestOptions, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => {
            res.json({
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
    res.status(500).json({
      success: false,
      message: `${platform} download failed: ${error.message}`
    });
  }
}

app.post('/download', async (req, res) => {
  const { url, quality = '720p' } = req.body;

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
    res.status(500).json({ 
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

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
  console.log(`🔄 Using ${PROXY_LIST.length} proxies`);
});
