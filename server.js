const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const puppeteer = require('puppeteer');
const TikTokScraper = require('tiktok-scraper');
const Insta = require('insta-fetcher');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

app.post('/download', async (req, res) => {
    const { url } = req.body;

    try {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const info = await ytdl.getInfo(url);
            res.json({ download: ytdl.chooseFormat(info.formats, { quality: 'highest' }).url });
        } else if (url.includes('tiktok.com')) {
            const videoMeta = await TikTokScraper.getVideoMeta(url);
            res.json({ download: videoMeta.videoUrl });
        } else if (url.includes('instagram.com')) {
            const media = await Insta.fetchPost(url);
            res.json({ download: media.media });
        } else if (url.includes('facebook.com')) {
            const browser = await puppeteer.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto(url);
            const vidUrl = await page.evaluate(() => {
                const video = document.querySelector('video');
                return video ? video.src : null;
            });
            await browser.close();
            res.json({ download: vidUrl });
        } else if (url.includes('twitter.com')) {
            // Suggest using an external API or a headless browser
            res.json({ download: "Use Twitter API or external tool for video" });
        } else {
            res.status(400).json({ error: 'Unsupported URL' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to process the link' });
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
