node_require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/download', async (req, res) => {
  const videoUrl = req.body.url;
  const apifyToken = process.env.APIFY_TOKEN;

  try {
    const response = await fetch(`https://api.apify.com/v2/acts/hariprasadh10792~ultimate-youtube-downloader/run-sync-get-dataset-items?token=${apifyToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [videoUrl] })
    });

    const data = await response.json();

    if (data && data.length > 0 && data[0].downloadUrl) {
      res.json({ success: true, downloadUrl: data[0].downloadUrl });
    } else {
      res.json({ success: false, message: 'Unable to fetch video link.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
