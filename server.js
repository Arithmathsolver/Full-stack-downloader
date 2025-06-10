const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/download', async (req, res) => {
  const { videoUrl } = req.body;
  const apifyApiKey = process.env.APIFY_API_KEY;

  try {
    const response = await axios.post(
      `https://api.apify.com/v2/acts/apify~video-downloader/run-sync-get-dataset-items?token=${apifyApiKey}`,
      { url: videoUrl },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data.length > 0 && response.data[0].videoUrl) {
      return res.json({ success: true, downloadUrl: response.data[0].videoUrl });
    } else {
      return res.status(400).json({ success: false, message: 'No video found or unsupported URL.' });
    }
  } catch (error) {
    console.error('Apify error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Server error while fetching video.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
