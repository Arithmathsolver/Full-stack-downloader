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

// Enhanced stealth plugins with additional protections
puppeteer.use(StealthPlugin());
puppeteer.use(require('puppeteer-extra-plugin-anonymize-ua')());
puppeteer.use(require('puppeteer-extra-plugin-block-resources')({
  blockedTypes: new Set(['image', 'font', 'stylesheet'])
}));

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

// Security middleware
app.use(helmet());
app.use(morgan('combined'));

// Enhanced rate limiting with Redis store option
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/download', limiter);

// Improved proxy handling with health checks
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

const proxyHealth = {};
let currentProxyIndex = 0;

const getHealthyProxy = () => {
  if (PROXY_LIST.length === 0) return null;
  
  // Rotate through proxies, skipping known unhealthy ones
  for (let i = 0; i < PROXY_LIST.length; i++) {
    currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;
    const proxy = PROXY_LIST[currentProxyIndex];
    
    if (!proxyHealth[proxy] || 
        (proxyHealth[proxy].lastFailure && 
         Date.now() - proxyHealth[proxy].lastFailure > 300000)) {
      return proxy;
    }
  }
  
  return PROXY_LIST[currentProxyIndex]; // Fallback to current if all marked unhealthy
};

const markProxyUnhealthy = (proxy) => {
  if (!proxy) return;
  proxyHealth[proxy] = proxyHealth[proxy] || { failureCount: 0 };
  proxyHealth[proxy].failureCount++;
  proxyHealth[proxy].lastFailure = Date.now();
};

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Enhanced platform detection with URL validation
const platformDetectors = {
  youtube: url => {
    try {
      const parsed = new URL(url);
      return (parsed.hostname.includes('youtube.com') || 
              parsed.hostname.includes('youtu.be')) &&
             parsed.pathname !== '/';
    } catch {
      return false;
    }
  },
  tiktok: url => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('tiktok.com') && 
             parsed.pathname.includes('/video/');
    } catch {
      return false;
    }
  },
  instagram: url => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('instagram.com') && 
             (parsed.pathname.includes('/p/') || parsed.pathname.includes('/reel/'));
    } catch {
      return false;
    }
  },
  facebook: url => {
    try {
      const parsed = new URL(url);
      return (parsed.hostname.includes('facebook.com') || 
              parsed.hostname.includes('fb.watch')) &&
             parsed.pathname.includes('/watch');
    } catch {
      return false;
    }
  }
};

// Enhanced YouTube download with fallback qualities
async function handleYouTubeDownload(url, quality, res) {
  const filename = `yt_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const proxyUrl = getHealthyProxy();

  try {
    // Build yt-dlp command with fallback options
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
      -f "${quality === '1080p' ? 
        'bestvideo[height<=1080][vcodec^=avc1]+bestaudio/best[height<=1080]' : 
        'bestvideo[height<=720][vcodec^=avc1]+bestaudio/best[height<=720]'}" \
      --merge-output-format mp4 \
      -o "${filepath}"`;

    if (fs.existsSync(cookiesPath)) {
      command += ` --cookies ${cookiesPath}`;
    }

    command += ` "${url}"`;

    const childProcess = exec(command);

    // Timeout handling
    const timeout = setTimeout(() => {
      childProcess.kill();
      markProxyUnhealthy(proxyUrl);
      throw new Error('YouTube download timed out');
    }, 300000);

    childProcess.on('exit', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        throw new Error(`yt-dlp exited with code ${code}`);
      }

      if (!fs.existsSync(filepath)) {
        throw new Error('Downloaded file not found');
      }

      res.json({
        success: true,
        filename: filename,
        message: 'Download completed successfully'
      });
    });

  } catch (error) {
    console.error('YouTube Download Error:', error);
    
    // Clean up partial files
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
      markProxyUnhealthy(proxyUrl);
      return res.status(429).json({
        success: false,
        message: 'YouTube rate limit exceeded. Try again later or use proxies.'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'YouTube download failed: ' + error.message
    });
  }
}

// Enhanced social media download with multiple service fallbacks
async function handleSocialDownload(url, platform, res) {
  const filename = `${platform}_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const proxyUrl = getHealthyProxy();

  try {
    const browserOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      ignoreHTTPSErrors: true
    };

    if (proxyUrl) {
      browserOptions.args.push(`--proxy-server=${proxyUrl}`);
    }

    const browser = await puppeteer.launch(browserOptions);
    const page = await browser.newPage();

    // Enhanced stealth settings
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    });
    
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    try {
      let downloadUrl;
      const services = getServicesForPlatform(platform);
      
      // Try each service until one works
      for (const service of services) {
        try {
          console.log(`Trying ${service.name} for ${platform} download`);
          
          await page.goto(service.url, { 
            waitUntil: 'networkidle2',
            timeout: 60000
          });
          
          await page.waitForSelector(service.inputSelector, { timeout: 30000 });
          await page.type(service.inputSelector, url, { delay: 100 });
          
          await page.click(service.submitSelector);
          
          await page.waitForSelector(service.resultSelector, { 
            timeout: 60000 
          });
          
          downloadUrl = await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            return element?.href || element?.getAttribute('data-url');
          }, service.resultSelector);
          
          if (downloadUrl) break;
        } catch (serviceError) {
          console.log(`Service ${service.name} failed: ${serviceError.message}`);
          continue;
        }
      }

      if (!downloadUrl) throw new Error('All download services failed');

      // Enhanced file download with proper streaming
      const fileStream = fs.createWriteStream(filepath);
      const requestOptions = proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : {};
      
      https.get(downloadUrl, requestOptions, (response) => {
        if (response.statusCode !== 200) {
          throw new Error(`HTTP ${response.statusCode} when fetching video`);
        }
        
        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const progress = (downloadedBytes / totalBytes * 100).toFixed(2);
            console.log(`Download progress: ${progress}%`);
          }
        });
        
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
        throw new Error('HTTPS download failed: ' + err.message);
      });

    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(`${platform} Download Error:`, error);
    
    // Clean up partial files
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    
    markProxyUnhealthy(proxyUrl);
    
    return res.status(500).json({
      success: false,
      message: `${platform} download failed: ${error.message}`
    });
  }
}

// Service definitions for fallback options
function getServicesForPlatform(platform) {
  const services = {
    tiktok: [
      {
        name: 'SnapTik',
        url: 'https://snaptik.app/en',
        inputSelector: 'input[name="url"]',
        submitSelector: 'button[type="submit"]',
        resultSelector: '.download-link, .result_overlay a'
      },
      {
        name: 'TTDownloader',
        url: 'https://ttdownloader.com/',
        inputSelector: '#main_url',
        submitSelector: '#btn-submit',
        resultSelector: '.result .download-link'
      }
    ],
    facebook: [
      {
        name: 'GetFVID',
        url: 'https://www.getfvid.com/downloader',
        inputSelector: 'input[name="url"]',
        submitSelector: 'button[type="submit"]',
        resultSelector: '.btn-group a, .download-link, a[href*="download"]'
      },
      {
        name: 'FBDown',
        url: 'https://fbdown.net/',
        inputSelector: '#url',
        submitSelector: '#submit',
        resultSelector: '.download-link-item a'
      }
    ],
    instagram: [
      {
        name: 'SnapInsta',
        url: 'https://snapinsta.app',
        inputSelector: 'input[name="url"]',
        submitSelector: 'button[type="submit"]',
        resultSelector: '.download-result a[download], .download-items a'
      },
      {
        name: 'InstaDownloader',
        url: 'https://instadownloader.com/',
        inputSelector: '#link',
        submitSelector: '#submit',
        resultSelector: '.download-btn'
      }
    ]
  };
  
  return services[platform] || [];
}

// Enhanced download endpoint with URL validation
app.post('/download', async (req, res) => {
  const { url, quality = '720p' } = req.body;

  try {
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid URL format' });
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

    return res.status(400).json({ 
      success: false, 
      message: 'Unsupported platform or invalid URL' 
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
});

// Enhanced file download endpoint
app.get('/downloads/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Validate filename to prevent directory traversal
  if (!/^[a-z0-9_\-]+\.(mp4|mov|avi)$/i.test(filename)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid filename format' 
    });
  }

  const filepath = path.join(DOWNLOAD_FOLDER, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ 
      success: false, 
      message: 'File not found' 
    });
  }

  // Set proper headers
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  const fileStream = fs.createReadStream(filepath);
  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    console.error('File Stream Error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'File download failed' 
    });
  });

  fileStream.on('end', () => {
    try {
      fs.unlinkSync(filepath);
    } catch (cleanupError) {
      console.error('File Cleanup Error:', cleanupError);
    }
  });
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    success: false,
    message: 'Download failed. Please try a different URL or try again later.',
    debug: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Server startup with health checks
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 Download folder: ${DOWNLOAD_FOLDER}`);
  console.log(`🔄 Using ${PROXY_LIST.length} valid proxies`);
  
  if (process.env.PROXY_LIST && PROXY_LIST.length < process.env.PROXY_LIST.split(',').length) {
    console.warn('⚠️ Some proxies were invalid and skipped');
  }

  // Async yt-dlp version check
  checkYtDlpVersion();
});

async function checkYtDlpVersion() {
  if (process.env.YT_DLP_SKIP_UPDATE_CHECK) {
    console.log('yt-dlp update checks disabled via YT_DLP_SKIP_UPDATE_CHECK');
    return;
  }

  try {
    const version = await new Promise((resolve, reject) => {
      exec('yt-dlp --version', (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });

    console.log(`Using yt-dlp version: ${version}`);

    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_YT_DLP_UPDATES) {
      exec('yt-dlp -U --no-warnings', (updateError, updateStdout) => {
        if (updateError) {
          console.log('Note: yt-dlp update check failed (may be rate limited)');
        } else if (updateStdout && !updateStdout.includes('up to date')) {
          console.log('yt-dlp updated:', updateStdout.trim());
        }
      });
    }
  } catch (error) {
    console.warn('Could not check yt-dlp version:', error.message);
  }
}
