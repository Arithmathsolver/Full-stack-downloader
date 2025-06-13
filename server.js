const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');

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

// Updated YouTube download handler with improved error handling
async function handleYouTubeDownload(url, quality, res) {
  const filename = `yt_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const cookiesPath = path.join(__dirname, 'cookies.txt');

  // Updated command with better format selection and bot avoidance
  let command = `yt-dlp \
    --no-playlist \
    --force-ipv4 \
    --socket-timeout 30 \
    --retries 5 \
    --throttled-rate 1M \
    --limit-rate 2M \
    --sleep-interval 5 \
    --max-sleep-interval 15 \
    --fragment-retries 10 \
    --buffer-size 32K \
    --extractor-args "youtube:player_client=android" \
    --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" \
    -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"`;

  // Add cookies if available with improved error handling
  if (fs.existsSync(cookiesPath)) {
    command += ` --cookies ${cookiesPath}`;
  } else {
    console.warn('No cookies.txt found - adding additional bot avoidance measures');
    command += ` --extractor-args "youtube:skip=webpage"`;
  }

  command += ` -o "${filepath}" ${url}`;

  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('YouTube Download Error:', stderr || error.message);
        
        // Enhanced error handling
        if (stderr.includes('429') || stderr.includes('Too Many Requests')) {
          return res.status(429).json({
            success: false,
            message: 'YouTube rate limit exceeded. Please try again later or use updated cookies for authentication.'
          });
        }
        
        if (stderr.includes('Sign in to confirm you\'re not a bot')) {
          return res.status(403).json({
            success: false,
            message: 'YouTube requires authentication. Please provide valid cookies in cookies.txt file.'
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

// Download endpoint (updated for TikTok and Facebook)
app.post('/download', async (req, res) => {
  const { url, quality } = req.body;

  try {
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL is required' 
      });
    }

    // YouTube handling
    if (platformDetectors.youtube(url)) {
      return await handleYouTubeDownload(url, quality, res);
    }

    // TikTok handling
    if (platformDetectors.tiktok(url)) {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      try {
        await page.goto('https://ssstik.io/en', {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });

        await page.waitForSelector('input[name="id"]', { timeout: 10000 });
        await page.type('input[name="id"]', url);
        await page.click('button[type="submit"]');

        await page.waitForSelector('.result a.pure-button-primary', { timeout: 20000 });

        const downloadUrl = await page.evaluate(() => {
          const link = document.querySelector('.result a.pure-button-primary');
          return link ? link.href : null;
        });

        if (!downloadUrl) {
          throw new Error('Could not extract TikTok download link');
        }

        return res.json({
          success: true,
          downloadUrl
        });
      } finally {
        await browser.close();
      }
    }

    // Facebook/Instagram handling
    if (platformDetectors.facebook(url) || platformDetectors.instagram(url)) {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      try {
        await page.goto('https://fdown.net', {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });

        await page.waitForSelector('input[name="URLz"]', { timeout: 10000 });
        await page.type('input[name="URLz"]', url);
        await page.click('button[type="submit"]');

        await page.waitForSelector('.btns-download a', { timeout: 20000 });

        const downloadUrl = await page.evaluate(() => {
          const link = document.querySelector('.btns-download a');
          return link ? link.href : null;
        });

        if (!downloadUrl) {
          throw new Error('Could not extract Facebook download link');
        }

        return res.json({
          success: true,
          downloadUrl
        });
      } finally {
        await browser.close();
      }
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
  
  // Auto-update yt-dlp on startup
  exec('yt-dlp -U', (error, stdout, stderr) => {
    if (error) {
      console.error('Failed to update yt-dlp:', error);
    } else {
      console.log('yt-dlp update check:', stdout || stderr);
    }
  });
});
