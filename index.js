const functions = require('@google-cloud/functions-framework');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize CORS middleware for all origins
const corsHandler = cors({
  origin: true,
  credentials: true
});

// OAuth configuration - must be set via environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('Missing required environment variables: CLIENT_ID, CLIENT_SECRET, REDIRECT_URI');
  process.exit(1);
}

// In-memory token storage (for development only)
const tokenStore = new Map();

// Initialize OAuth2 client
const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Generate a simple session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Main Cloud Function entry point
functions.http('auth', (req, res) => {
  corsHandler(req, res, () => {
    const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;

    if (urlPath === '/auth') {
      handleAuth(req, res);
    } else if (urlPath === '/oauthcallback') {
      handleOAuthCallback(req, res);
    } else if (urlPath === '/token') {
      handleGetToken(req, res);
    } else if (urlPath === '/participants') {
      handleParticipantCount(req, res);
    } else {
      // Serve static files
      serveStaticFile(req, res, urlPath);
    }
  });
});

// Handle initial auth request - redirect to Google OAuth
function handleAuth(req, res) {
  try {
    const scopes = ['https://www.googleapis.com/auth/meet.meetings.read'];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: generateSessionId() // Use as session identifier
    });

    console.log('Generated auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}

// Handle OAuth callback from Google
async function handleOAuthCallback(req, res) {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('OAuth error:', error);
      return res.status(400).json({ error: `OAuth error: ${error}` });
    }

    if (!code) {
      return res.status(400).json({ error: 'Authorization code not provided' });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Received tokens:', { ...tokens, refresh_token: tokens.refresh_token ? '[REDACTED]' : undefined });

    // Store tokens with session ID (from state parameter)
    const sessionId = state || generateSessionId();
    tokenStore.set(sessionId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      created_at: Date.now()
    });

    // Set token expiration (clean up after 1 hour)
    setTimeout(() => {
      tokenStore.delete(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }, 60 * 60 * 1000);

    // Return success page with session ID
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Success</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
          .success { color: green; }
          .session-id { background: #f0f0f0; padding: 10px; margin: 20px; font-family: monospace; }
        </style>
      </head>
      <body>
        <h1 class="success">Authentication Successful!</h1>
        <p>You can now close this window and return to the Meeting Cost Ticker.</p>
        <div class="session-id">
          <strong>Session ID:</strong> ${sessionId}
        </div>
        <script>
          // Try to communicate back to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'auth_success',
              sessionId: '${sessionId}'
            }, '*');
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Failed to exchange authorization code' });
  }
}

// Handle token retrieval requests
function handleGetToken(req, res) {
  try {
    const sessionId = req.query.sessionId || req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const tokenData = tokenStore.get(sessionId);
    if (!tokenData) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    // Check if token is expired
    if (tokenData.expiry_date && Date.now() >= tokenData.expiry_date) {
      tokenStore.delete(sessionId);
      return res.status(401).json({ error: 'Token expired' });
    }

    res.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expiry_date ? Math.floor((tokenData.expiry_date - Date.now()) / 1000) : 3600
    });
  } catch (error) {
    console.error('Token retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve token' });
  }
}

// Handle participant count requests (moved from participants.js)
async function handleParticipantCount(req, res) {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required in Authorization header' });
    }

    const accessToken = authHeader.substring(7);

    // Extract conferenceId from request body
    const { conferenceId } = req.body;
    if (!conferenceId) {
      return res.status(400).json({ error: 'conferenceId is required in request body' });
    }

    console.log(`Fetching participant count for conference: ${conferenceId}`);

    // For demo purposes, return a simulated participant count
    // In production, this would call the Google Meet API
    const participantCount = Math.floor(Math.random() * 8) + 2; // 2-9 participants

    console.log(`Demo participant count for ${conferenceId}: ${participantCount}`);

    res.json({
      conferenceId,
      participantCount,
      timestamp: new Date().toISOString(),
      demo: true
    });

  } catch (error) {
    console.error('Error fetching participant count:', error);
    res.status(500).json({
      error: 'Failed to fetch participant count',
      details: error.message
    });
  }
}

// Serve static files from the frontend directory
function serveStaticFile(req, res, urlPath) {
  try {
    console.log('Serving static file:', urlPath);

    // Default to index.html for root path
    if (urlPath === '/' || urlPath === '') {
      urlPath = '/index.html';
    }

    // Map file extensions to content types
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    // Get file extension
    const ext = path.extname(urlPath).toLowerCase();
    const contentType = contentTypes[ext] || 'text/plain';

    // Construct file path (frontend files should be in the same directory as this function)
    // Remove leading slash from urlPath for proper path joining
    const cleanPath = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;
    const filePath = path.join(__dirname, cleanPath);

    console.log('Looking for file at:', filePath);
    console.log('File exists:', fs.existsSync(filePath));

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // If file doesn't exist, serve index.html for SPA routing
      const indexPath = path.join(__dirname, 'index.html');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath);
        res.setHeader('Content-Type', 'text/html');
        res.send(content);
        return;
      } else {
        res.status(404).json({ error: 'File not found' });
        return;
      }
    }

    // Read and serve the file
    const content = fs.readFileSync(filePath);
    res.setHeader('Content-Type', contentType);

    // Set cache headers for static assets
    if (ext === '.html') {
      // HTML files - no cache
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (ext === '.js' || ext === '.css') {
      // JavaScript and CSS - no cache during development
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      // Other assets (images, etc.) - short cache
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    }

    res.send(content);

  } catch (error) {
    console.error('Error serving static file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
}

// Export for local testing
module.exports = { auth: functions.http };
