const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// API Route
app.post('/api/download', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).send('URL is required');
  }

  exec(`yt-dlp -o "downloads/%(title)s.%(ext)s" ${url}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Download error: ${error}`);
      return res.status(500).send('Download failed');
    }
    res.status(200).send('Download started successfully!');
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
