const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Ensure downloads directory exists
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// API Route
app.post('/api/download', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).send('URL is required');
  }

  const command = `yt-dlp -o "${downloadDir}/%(title)s.%(ext)s" ${url}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Download error:', error.message || error);
      return res.status(500).send('Download failed');
    }
    console.log('Download started:\n', stdout);
    res.status(200).send('Download started successfully!');
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
