require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { URL } = require('url');

// Initialize Express app
const app = express();

// ======================
// Middleware Setup
// ======================
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST']
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});
app.use('/api/', limiter);

// Request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  next();
});

// ======================
// Download Functionality
// ======================
const validateUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const detectPlatform = (url) => {
  const domain = new URL(url).hostname.toLowerCase();
  if (domain.includes('tiktok')) return 'tiktok';
  if (domain.includes('instagram')) return 'instagram';
  if (domain.includes('youtube') || domain.includes('youtu.be')) return 'youtube';
  if (domain.includes('facebook') || domain.includes('fb.com')) return 'facebook';
  throw new Error('Unsupported platform');
};

const downloadVideo = async (platform, url) => {
  // Mock implementation - replace with real API calls
  return {
    downloadUrl: `https://cdn.example.com/${platform}/${Date.now()}.mp4`,
    noWatermark: true,
    quality: 'hd'
  };
};

// Download endpoint
app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!validateUrl(url)) {
      return res.status(400).json({ 
        error: 'Invalid URL format',
        example: 'https://www.tiktok.com/@username/video/123456789'
      });
    }

    const platform = detectPlatform(url);
    const result = await downloadVideo(platform, url);

    res.json({
      success: true,
      downloadUrl: result.downloadUrl,
      platform,
      noWatermark: result.noWatermark,
      quality: result.quality
    });

  } catch (error) {
    console.error(`[${req.id}] Download error:`, error.message);
    res.status(500).json({
      error: error.message || 'Download failed',
      retry: true
    });
  }
});

// ======================
// Additional Routes
// ======================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================
// Error Handling
// ======================
app.use((err, req, res, next) => {
  console.error(`[${req.id}] Error:`, err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    requestId: req.id
  });
});

// ======================
// Server Startup
// ======================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle process events
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});
