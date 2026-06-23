#!/bin/bash

# Deploy PMS TaskFlow to Google Cloud Run
# This script ensures the app works independently of your local device

set -e

PROJECT_ID="556944241861"
REGION="us-central1"
SERVICE_NAME="pms-taskflow"
REPO_NAME="pms-repo"
IMAGE_NAME="pms-taskflow"

echo "🚀 Deploying PMS TaskFlow to Google Cloud Run..."
echo "This will make the app work independently of your local device"

# Build and push Docker image
echo "📦 Building Docker image with optimizations..."
gcloud builds submit --config cloudbuild.yaml

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format='value(status.url)')

echo "✅ Deployment successful!"
echo "🌐 Your app is now available at: $SERVICE_URL"
echo "📱 The app will work on any device, even when your device is powered off"
echo "🔐 No dependency on your local machine - fully cloud-hosted"
echo "🗄️  Database: Google Sheets (cloud-based)"
echo "🔄 Real-time sync via Server-Sent Events"

# Make the service publicly accessible
echo "🔓 Ensuring public access..."
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --allow-unauthenticated

echo "✅ Configuration complete!"
echo "🎉 Your PMS TaskFlow is now fully cloud-hosted and independent!"
echo ""
echo "📋 Next steps:"
echo "1. Share this URL with your team: $SERVICE_URL"
echo "2. The app works 24/7 regardless of your device status"
echo "3. All data is stored in Google Sheets (accessible from anywhere)"
echo "4. No local server or database dependency"
