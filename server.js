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
  fs.mkdirSync(downloadDir, { recursive: true });
  console.log(`Created download directory at: ${downloadDir}`);
} else {
  console.log(`Download directory exists: ${downloadDir}`);
}

// Ensure downloads directory is writable
fs.access(downloadDir, fs.constants.W_OK, (err) => {
  if (err) {
    console.error(`No write permission for downloads directory: ${downloadDir}`);
  } else {
    console.log(`Write permission confirmed for: ${downloadDir}`);
  }
});

// API Route
app.post('/api/download', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  // Check yt-dlp version
  exec('yt-dlp --version', (versionErr, versionStdout, versionStderr) => {
    if (versionErr) {
      console.error('yt-dlp not installed or not accessible:', versionStderr || versionErr.message);
      return res.status(500).send('yt-dlp is not installed or not accessible. Please install it first.');
    }

    console.log(`yt-dlp version: ${versionStdout.trim()}`);

    // Download command
    const command = `yt-dlp -o "${downloadDir}/%(title)s.%(ext)s" ${url}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Download error:', stderr || error.message);
        return res.status(500).send(`Download failed: ${stderr || error.message}`);
      }

      console.log('Download started successfully.\nOutput:\n', stdout);
      res.status(200).send('Download started successfully!');
    });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
