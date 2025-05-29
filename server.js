require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Promisify exec for better async handling
const execPromise = util.promisify(exec);

// Enhanced error handling for process-level errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Perform cleanup if needed
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && req.body.url) {
    console.log(`Request URL: ${req.body.url.substring(0, 50)}...`);
  }
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Configure downloads directory
const downloadDir = process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads');

// Ensure download directory exists and is writable
const initializeDownloadDir = () => {
  try {
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
      console.log(`Created download directory at: ${downloadDir}`);
    }

    // Test write permissions
    const testFile = path.join(downloadDir, 'permission-test.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`Verified write permissions for: ${downloadDir}`);

  } catch (err) {
    console.error(`Failed to initialize download directory (${downloadDir}):`, err);
    process.exit(1);
  }
};

initializeDownloadDir();

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check yt-dlp availability
    const { stdout: version } = await execPromise('yt-dlp --version');
    
    res.json({
      status: 'healthy',
      ytDlpVersion: version.trim(),
      downloadDir,
      diskSpace: await getDiskSpace(),
      platform: process.platform,
      nodeVersion: process.version
    });

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'yt-dlp not available',
      details: error.message,
      solution: 'Ensure yt-dlp is installed in your PATH or in ./bin directory'
    });
  }
});

// Download endpoint with enhanced error handling
app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ 
      success: false,
      error: 'URL is required',
      example: { "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
    });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid URL format',
      supportedPlatforms: ['YouTube', 'TikTok', 'Instagram', 'Facebook']
    });
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
      data: {
        ...result,
        downloadDir,
        filePath: result._filename ? path.join(downloadDir, result._filename) : null
      }
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
      url: url,
      possibleSolutions: [
        'Check if the URL is correct and public',
        'Verify yt-dlp supports this platform',
        'Check server storage space'
      ]
    });
  }
});

// Helper functions
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (_) {
    return false;
  }
}

async function getDiskSpace() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execPromise('wmic logicaldisk get size,freespace');
      return stdout;
    } else {
      const { stdout } = await execPromise('df -h');
      return stdout;
    }
  } catch (error) {
    return `Could not check disk space: ${error.message}`;
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  Server running on http://localhost:${PORT}
  Download directory: ${downloadDir}
  Node version: ${process.version}
  Platform: ${process.platform}
  `);
});

// Export for testing
module.exports = app;
