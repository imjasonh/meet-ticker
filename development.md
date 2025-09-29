# Meeting Cost Ticker - Development & Deployment Guide

## Overview

This document outlines the complete development and deployment process for the Meeting Cost Ticker Google Meet add-on.

## Architecture

**Single Server Design**: Both frontend and backend are served from a single Google Cloud Function for simplified deployment and management.

- **Frontend**: HTML/CSS/JavaScript served as static files
- **Backend**: Node.js Cloud Function handling OAuth and API requests
- **Hosting**: Google Cloud Functions Gen2
- **Authentication**: Google OAuth 2.0 with Meet API access

## Prerequisites

1. **Google Cloud Project** with billing enabled
2. **gcloud CLI** installed and authenticated
3. **Firebase CLI** installed (for potential future use)
4. **Node.js 18+** for local development

## Initial Setup

### 1. Google Cloud Configuration

```bash
# Authenticate with Google Cloud
gcloud auth login --update-adc

# Set your project
gcloud config set project PROJECT_ID

# Enable required APIs
gcloud services enable meet.googleapis.com
gcloud services enable appsmarket-component.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable firebase.googleapis.com
```

### 2. OAuth 2.0 Setup

**Manual steps in Google Cloud Console:**

1. Go to **APIs & Services** → **OAuth consent screen**
   - Select "External" user type
   - App name: "Meeting Cost Ticker"
   - User support email: your email
   - Add scope: `https://www.googleapis.com/auth/meet.meetings.read`
   - Add your email as Test User

2. Go to **APIs & Services** → **Credentials**
   - Create OAuth 2.0 Client IDs for "Web application"
   - Add authorized redirect URI: `https://REGION-PROJECT_ID.cloudfunctions.net/meet-ticker/oauthcallback`

3. Store credentials in `info` file:
   ```
   client id = YOUR_CLIENT_ID
   client secret = YOUR_CLIENT_SECRET
   ```

## Project Structure

```
meet-ticker/
├── index.js              # Main Cloud Function (backend + static serving)
├── participants.js       # Participant count logic (currently demo)
├── package.json          # Node.js dependencies
├── index.html            # Frontend UI
├── main.js               # Frontend application logic
├── config.js             # Frontend configuration
├── styles.css            # UI styling
├── meet-ticker.png       # App icon
├── deploy.sh             # Deployment script
├── workspace-deployment-manifest.json  # Google Workspace add-on manifest
├── firebase.json         # Firebase configuration (unused)
├── .gitignore            # Git ignore rules
├── info                  # OAuth credentials (not committed)
└── README.md             # Project documentation
```

## Key Implementation Details

### Frontend Features

- **Smart Unit Switching**:
  - `< 1 minute`: person-seconds
  - `1-59 minutes`: person-minutes (whole numbers)
  - `≥ 60 minutes`: person-hours (whole numbers)

- **Dynamic Update Intervals**:
  - `< 3 person-minutes`: Updates every second
  - `≥ 3 person-minutes`: Updates every minute

- **Meet SDK Integration**:
  - Uses Google Meet add-ons SDK: `https://www.gstatic.com/meetjs/addons/1.1.0/meet.addons.js`
  - Proper initialization sequence: `createAddonSession()` → `createSidePanelClient()`
  - Automatically starts with 1 participant (current user)

### Backend Features

- **Single Server Architecture**: Serves both frontend static files and API endpoints
- **OAuth Flow**: Complete authentication flow with token management
- **Participant Polling**: Hardcoded refresh intervals
- **Static File Serving**: No-cache headers for development
- **Error Handling**: Comprehensive error handling and logging

### API Endpoints

All served from: `https://REGION-PROJECT_ID.cloudfunctions.net/meet-ticker`

- `/` - Frontend application
- `/auth` - OAuth authentication initiation
- `/oauthcallback` - OAuth callback handler
- `/token` - Access token retrieval
- `/participants` - Participant count API (currently demo mode)
- `/meet-ticker.png` - App icon
- Static files: `main.js`, `config.js`, `styles.css`

## Deployment Process

### 1. Install Dependencies

```bash
npm install
```

### 2. Deploy to Google Cloud Functions

```bash
./deploy.sh
```

This script:
- Deploys a single Cloud Function with both frontend and backend
- Sets environment variables for OAuth credentials
- Configures 512MB memory and 60s timeout
- Uses Node.js 20 runtime

### 3. Google Workspace Marketplace Configuration

1. Go to **Google Cloud Console** → **APIs & Services** → **Google Workspace Marketplace SDK**
2. Upload the `workspace-deployment-manifest.json` file

## Development Workflow

### Making Changes

1. **Edit files** in the root directory
2. **Test locally** if needed (optional)
3. **Deploy with**: `./deploy.sh`
4. **Test in Google Meet** add-on

### Debugging

- **Cloud Function logs**: `gcloud functions logs read meet-ticker --region us-central1 --limit 20`
- **Browser DevTools**: Check console in Meet add-on iframe
- **Debug indicator**: Green/red status indicator in top-right corner

### Cache Management

- **No-cache headers** set for HTML, CSS, and JS files during development
- **Version parameters** in script tags (`?v=2`) for cache busting
- **Short cache** (5 minutes) for images and other assets

## Troubleshooting

### Common Issues

1. **404 errors for static files**
   - Check file paths in `index.js` static serving logic
   - Ensure files exist in root directory

2. **Meet SDK not loading**
   - Verify SDK URL: `https://www.gstatic.com/meetjs/addons/1.1.0/meet.addons.js`
   - Check browser console for loading errors

3. **OAuth redirect errors**
   - Ensure redirect URI matches in Google Cloud Console credentials
   - Check `REDIRECT_URI` environment variable in deployment

4. **Add-on manifest errors**
   - Verify manifest structure follows Google Workspace requirements
   - Ensure all URLs are HTTPS and accessible

### Key Debugging Commands

```bash
# Check deployment status
gcloud functions describe meet-ticker --region us-central1

# View logs
gcloud functions logs read meet-ticker --region us-central1 --limit 30

# Test endpoints
curl -I https://REGION-PROJECT_ID.cloudfunctions.net/meet-ticker
curl -I https://REGION-PROJECT_ID.cloudfunctions.net/meet-ticker/main.js

# Check deployed files
gcloud functions describe meet-ticker --region us-central1 --format="value(sourceArchiveUrl)"
```

## Configuration Values

### Environment Variables (set in deploy.sh)

- `CLIENT_ID`: OAuth 2.0 client ID
- `CLIENT_SECRET`: OAuth 2.0 client secret
- `REDIRECT_URI`: OAuth callback URL

### Constants (in main.js)

- `POLLING_INTERVAL_SECONDS`: 20 (participant polling frequency)
- Update intervals: 1 second (< 3 person-minutes), 60 seconds (≥ 3 person-minutes)

## Security Considerations

- **OAuth credentials** stored as environment variables
- **Access tokens** stored in memory with 1-hour TTL
- **CORS enabled** for Meet add-on context
- **No caching** of sensitive data
- **HTTPS required** for all endpoints

## Future Enhancements

1. **Real Participant API**: Replace demo participant counting with actual Google Meet API integration
2. **Persistent Storage**: Use Firestore for longer-term token storage
3. **Enhanced Error Handling**: Better user feedback for API failures
4. **Performance Optimization**: Optimize for larger meetings
5. **Analytics**: Track usage and performance metrics

## Production Deployment

When ready for production:

1. **Update OAuth consent screen** to "Published" status
2. **Submit for Google verification** (required for sensitive scopes)
3. **Enable production caching** headers
4. **Set up monitoring** and alerting
5. **Configure backup/disaster recovery**

## Support

- **Cloud Function URL**: https://REGION-PROJECT_ID.cloudfunctions.net/meet-ticker
- **Google Cloud Console**: https://console.cloud.google.com/functions/details/us-central1/meet-ticker
- **Repository**: This git repository contains all source code and configuration
