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

// YouTube download handler with bot avoidance
async function handleYouTubeDownload(url, quality, res) {
  const filename = `yt_${Date.now()}.mp4`;
  const filepath = path.join(DOWNLOAD_FOLDER, filename);
  const cookiesPath = path.join(__dirname, 'cookies.txt');

  // Base command with bot avoidance measures
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
    -f "${quality || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'}" \
    -o "${filepath}"`;

  // Add cookies if available
  if (fs.existsSync(cookiesPath)) {
    command += ` --cookies ${cookiesPath}`;
  } else {
    console.warn('No cookies.txt found - some videos may require authentication');
  }

  command += ` ${url}`;

  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('YouTube Download Error:', stderr || error.message);

        // Handle rate limiting specifically
        if (stderr.includes('429') || stderr.includes('Too Many Requests')) {
          return res.status(429).json({
            success: false,
            message: 'YouTube rate limit exceeded. Please try again later or use cookies for authentication.'
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

// Download endpoint
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

    // TikTok / Instagram / Facebook
    if (platformDetectors.tiktok(url) || 
        platformDetectors.instagram(url) || 
        platformDetectors.facebook(url)) {

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
        let toolUrl = '';
        let inputSelector = '';
        let buttonSelector = '';
        let resultSelector = '';
        let evaluateFn;

        if (platformDetectors.tiktok(url)) {
          toolUrl = 'https://ssstik.io/en';
          inputSelector = '#main_page_text';
          buttonSelector = '#submit';
          resultSelector = '.result_overlay';
          evaluateFn = () => {
            const link = document.querySelector('a.pure-button-primary');
            return link ? link.href : null;
          };
        } else if (platformDetectors.instagram(url)) {
          toolUrl = 'https://save-insta.app/en';
          inputSelector = 'input[name="url"]';
          buttonSelector = 'button[type="submit"]';
          resultSelector = '.download-items a';
          evaluateFn = () => {
            const link = document.querySelector('.download-items a');
            return link ? link.href : null;
          };
        } else if (platformDetectors.facebook(url)) {
          toolUrl = 'https://fdown.net/';
          inputSelector = 'input[name="URLz"]';
          buttonSelector = 'button[type="submit"]';
          resultSelector = '.results-download a';
          evaluateFn = () => {
            const link = document.querySelector('.results-download a');
            return link ? link.href : null;
          };
        }

        await page.goto(toolUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        await page.type(inputSelector, url);
        await page.click(buttonSelector);
        await page.waitForSelector(resultSelector, { timeout: 30000 });

        const downloadUrl = await page.evaluate(evaluateFn);

        if (!downloadUrl) {
          throw new Error('Could not extract download link');
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

// File download endpoint
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
});
