const functions = require('@google-cloud/functions-framework');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');

// Initialize CORS middleware
const corsHandler = cors({
  origin: true,
  credentials: true
});

// OAuth configuration - must be set via environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing required environment variables: CLIENT_ID, CLIENT_SECRET');
  process.exit(1);
}

// Main Cloud Function entry point for participant count
functions.http('getParticipantCount', (req, res) => {
  corsHandler(req, res, async () => {
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

      // Set up OAuth2 client with the access token
      const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
      oauth2Client.setCredentials({
        access_token: accessToken
      });

      // Initialize Google Meet API client
      const meet = google.meet({ version: 'v2', auth: oauth2Client });

      let participantCount = 0;
      let nextPageToken = null;

      // Fetch all participants (handle pagination)
      do {
        const response = await meet.conferenceRecords.participants.list({
          parent: `conferenceRecords/${conferenceId}`,
          pageSize: 100,
          pageToken: nextPageToken
        });

        const participants = response.data.participants || [];
        participantCount += participants.length;
        nextPageToken = response.data.nextPageToken;

        console.log(`Fetched ${participants.length} participants, total so far: ${participantCount}`);

      } while (nextPageToken);

      console.log(`Total participant count for ${conferenceId}: ${participantCount}`);

      res.json({
        conferenceId,
        participantCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error fetching participant count:', error);

      // Handle specific Google API errors
      if (error.code === 401) {
        return res.status(401).json({
          error: 'Unauthorized - invalid or expired access token',
          details: error.message
        });
      } else if (error.code === 403) {
        return res.status(403).json({
          error: 'Forbidden - insufficient permissions or invalid conference ID',
          details: error.message
        });
      } else if (error.code === 404) {
        return res.status(404).json({
          error: 'Conference not found',
          details: error.message
        });
      }

      res.status(500).json({
        error: 'Failed to fetch participant count',
        details: error.message
      });
    }
  });
});

// Health check endpoint
functions.http('health', (req, res) => {
  corsHandler(req, res, () => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'meet-ticker-participants'
    });
  });
});