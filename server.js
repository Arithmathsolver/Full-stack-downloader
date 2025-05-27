const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const Insta = require('insta-fetcher');
const puppeteer = require('puppeteer');
const app = express();

app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// === YOUTUBE ===
app.get('/api/youtube', async (req, res) => {
  try {
    const videoURL = req.query.url;
    if (!ytdl.validateURL(videoURL)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    const info = await ytdl.getInfo(videoURL);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
    res.json({ url: format.url });
  } catch (error) {
    res.status(500).json({ error: 'YouTube download failed', details: error.message });
  }
});

// === INSTAGRAM ===
app.get('/api/instagram', async (req, res) => {
  try {
    const { url } = req.query;
    const insta = new Insta();
    const data = await insta.fetchPost(url);
    res.json({ url: data.media });
  } catch (error) {
    res.status(500).json({ error: 'Instagram download failed', details: error.message });
  }
});

// === TIKTOK ===
app.get('/api/tiktok', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.includes('tiktok.com')) {
    return res.status(400).json({ error: 'Invalid TikTok URL' });
  }

  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('video');
    const videoUrl = await page.$eval('video', (video) => video.src);
    await browser.close();

    res.json({ url: videoUrl });
  } catch (error) {
    res.status(500).json({ error: 'TikTok download failed', details: error.message });
  }
});

// === FACEBOOK ===
app.get('/api/facebook', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.includes('facebook.com')) {
    return res.status(400).json({ error: 'Invalid Facebook URL' });
  }

  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForSelector('video');
    const videoUrl = await page.$eval('video', (video) => video.src);
    await browser.close();

    res.json({ url: videoUrl });
  } catch (error) {
    res.status(500).json({ error: 'Facebook download failed', details: error.message });
  }
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
