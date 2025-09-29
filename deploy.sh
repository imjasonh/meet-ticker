#!/bin/bash

set -e

echo "Deploying Meeting Cost Ticker..."

# Source config.env file if it exists
if [ -f "config.env" ]; then
    echo "Loading configuration from config.env file..."
    source config.env
else
    echo "No config.env file found. Using environment variables..."
fi

# Get the current project ID
PROJECT_ID=$(gcloud config get-value project)
echo "Project ID: $PROJECT_ID"

# Check required environment variables
if [ -z "$CLIENT_ID" ]; then
    echo "Error: CLIENT_ID environment variable is required"
    echo "Set it with: export CLIENT_ID=your_client_id"
    exit 1
fi

if [ -z "$CLIENT_SECRET" ]; then
    echo "Error: CLIENT_SECRET environment variable is required"
    echo "Set it with: export CLIENT_SECRET=your_client_secret"
    exit 1
fi

# Set default region if not provided
REGION=${REGION:-us-central1}

# Construct redirect URI
REDIRECT_URI="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/meet-ticker/oauthcallback"

echo "Deploying meet-ticker server..."
gcloud functions deploy meet-ticker \
  --gen2 \
  --runtime nodejs20 \
  --region ${REGION} \
  --trigger-http \
  --allow-unauthenticated \
  --source . \
  --entry-point auth \
  --set-env-vars "CLIENT_ID=${CLIENT_ID},CLIENT_SECRET=${CLIENT_SECRET},REDIRECT_URI=${REDIRECT_URI}" \
  --memory 512MB \
  --timeout 60s

echo "Getting function URL..."
APP_URL=$(gcloud functions describe meet-ticker --region ${REGION} --format="value(url)")

echo ""
echo "Deployment complete!"
echo "Meeting Cost Ticker URL: $APP_URL"
echo ""
echo "This single URL serves both frontend and backend:"
echo "  - Frontend: $APP_URL"
echo "  - Auth API: $APP_URL/auth"
echo "  - OAuth Callback: $APP_URL/oauthcallback"
echo "  - Token API: $APP_URL/token"
echo "  - Participants API: $APP_URL/participants"

echo ""
echo "Updating workspace deployment manifest..."

# Generate the workspace deployment manifest with correct URLs
cat > workspace-deployment-manifest.json << EOF
{
  "addOns": {
    "common": {
      "name": "Meeting Cost Ticker",
      "logoUrl": "${APP_URL}/meet-ticker.png",
      "layoutProperties": {
        "primaryColor": "#1a73e8",
        "secondaryColor": "#4285f4"
      }
    },
    "meet": {
      "Web": [{
        "sidePanelUrl": "${APP_URL}/",
        "addOnOrigins": ["$(echo $APP_URL | sed 's|/meet-ticker||')"]
      }]
    }
  }
}
EOF

echo "Workspace deployment manifest updated:"
echo "  - Side Panel URL: ${APP_URL}/"
echo "  - Logo URL: ${APP_URL}/meet-ticker.png"
echo "  - Add-on Origin: $(echo $APP_URL | sed 's|/meet-ticker||')"
echo ""
echo "Upload workspace-deployment-manifest.json to Google Workspace Marketplace SDK"
