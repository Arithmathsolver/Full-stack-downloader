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
  fs.mkdirSync(DOWNLOAD_FOLDER);
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Platform detection functions
function isYouTube(url) {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function isTikTok(url) {
  return url.includes('tiktok.com');
}

function isInstagram(url) {
  return url.includes('instagram.com');
}

function isFacebook(url) {
  return url.includes('facebook.com') || url.includes('fb.watch');
}

// Download endpoint (changed from /api/download to /download)
app.post('/download', async (req, res) => {
  const { url, quality } = req.body; // Changed from videoUrl to url to match frontend

  try {
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    if (isYouTube(url)) {
      const filename = `yt_${Date.now()}.mp4`;
      const filepath = path.join(DOWNLOAD_FOLDER, filename);

      exec(`yt-dlp -f "${quality || 'best'}" -o "${filepath}" ${url}`, (error, stdout, stderr) => {
        if (error) {
          console.error('Download error:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'YouTube download failed: ' + (stderr || error.message) 
          });
        }

        if (!fs.existsSync(filepath)) {
          return res.status(500).json({ 
            success: false, 
            message: 'File was not created' 
          });
        }

        return res.json({ 
          success: true, 
          filename: filename,
          message: 'Download completed successfully'
        });
      });
    } 
    else if (isTikTok(url) || isInstagram(url) || isFacebook(url)) {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.goto('https://ssstik.io/en', { waitUntil: 'networkidle2' });

      await page.type('#main_page_text', url);
      await page.click('#submit');
      await page.waitForSelector('.result_overlay', { timeout: 15000 });

      const downloadUrl = await page.evaluate(() => {
        const link = document.querySelector('a[href*="https"]');
        return link ? link.href : null;
      });

      await browser.close();

      if (downloadUrl) {
        return res.json({ success: true, downloadUrl });
      } else {
        return res.status(400).json({ success: false, message: 'Could not extract video link' });
      }
    } 
    else {
      return res.status(400).json({ success: false, message: 'Unsupported platform' });
    }
  } catch (error) {
    console.error('Server error:', error);
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

  if (fs.existsSync(filepath)) {
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ success: false, message: 'File download failed' });
      }
    });
  } else {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
