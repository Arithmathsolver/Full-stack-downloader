require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');

const app = express();
const PORT = process.env.PORT || 5000;

// Promisify exec for better async handling
const execPromise = util.promisify(exec);

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Configure downloads directory
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
  console.log(`Created download directory at: ${downloadDir}`);
}

// Check directory permissions
try {
  fs.accessSync(downloadDir, fs.constants.W_OK);
  console.log(`Write permissions confirmed for: ${downloadDir}`);
} catch (err) {
  console.error(`Directory not writable: ${downloadDir}`, err);
  process.exit(1);
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check yt-dlp availability
    const { stdout } = await execPromise('yt-dlp --version');
    res.json({
      status: 'healthy',
      ytDlpVersion: stdout.trim(),
      downloadDir,
      writable: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'yt-dlp not available',
      details: error.message
    });
  }
});

// Download endpoint with enhanced error handling
app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL format
  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    console.log(`Starting download for: ${url}`);
    
    // Sanitize URL to prevent command injection
    const sanitizedUrl = url.replace(/[;&|$`]/g, '');
    
    // Download command with progress and JSON output
    const command = `yt-dlp -o "${downloadDir}/%(title)s.%(ext)s" --no-warnings --print-json ${sanitizedUrl}`;
    
    console.log(`Executing command: ${command}`);
    const { stdout, stderr } = await execPromise(command);
    
    // Parse output
    let result;
    try {
      const jsonLine = stdout.split('\n').find(line => line.startsWith('{'));
      result = jsonLine ? JSON.parse(jsonLine) : { status: 'completed', output: stdout };
    } catch (e) {
      result = { status: 'completed', output: stdout };
    }

    console.log('Download completed:', result);
    res.json({ 
      success: true,
      message: 'Download completed',
      data: result
    });

  } catch (error) {
    console.error('Download failed:', {
      url,
      error: error.message,
      stderr: error.stderr,
      stdout: error.stdout
    });

    res.status(500).json({ 
      success: false,
      error: 'Download failed',
      details: error.stderr || error.message,
      url: url
    });
  }
});

// Helper function to validate URLs
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Download directory: ${downloadDir}`);
});     }
