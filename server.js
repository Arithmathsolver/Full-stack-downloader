const express = require('express');
const cors = require('cors');
const path = require('path');
const ytdlp = require('yt-dlp-exec');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

app.post('/api/download', async (req, res) => {
  const { videoUrl, quality } = req.body;

  try {
    if (isYouTube(videoUrl)) {
      const info = await ytdlp(videoUrl, {
        format: quality || 'best',
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
      });

      const video = info.url || info.formats?.find(f => f.url)?.url;
      if (video) {
        return res.json({ success: true, downloadUrl: video });
      } else {
        return res.status(400).json({ success: false, message: 'Could not find video URL' });
      }
    }

    if (isTikTok(videoUrl) || isInstagram(videoUrl) || isFacebook(videoUrl)) {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.goto('https://ssstik.io/en', { waitUntil: 'networkidle2' });

      await page.type('#main_page_text', videoUrl);
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

    return res.status(400).json({ success: false, message: 'Unsupported platform.' });
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching video.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
