# Cloud Deployment Guide

## Overview
Your PMS TaskFlow application is configured to run on Google Cloud Run, making it completely independent of your local device. This means:

- ✅ Works 24/7 regardless of your device status
- ✅ No dependency on your local machine being powered on
- ✅ Accessible from any device with internet connection
- ✅ Cloud-based database (Google Sheets)
- ✅ Real-time synchronization across all users

## Quick Deployment

Run the deployment script:
```bash
chmod +x deploy-cloud.sh
./deploy-cloud.sh
```

Or manually:
```bash
gcloud builds submit --config cloudbuild.yaml
```

## What Gets Deployed

### Infrastructure
- **Google Cloud Run**: Serverless container hosting
- **Google Artifact Registry**: Docker image storage
- **Google Cloud Build**: Automated build pipeline
- **Google Sheets**: Cloud-based database

### Application Features
- **Frontend**: React + Vite (optimized for production)
- **Backend**: Node.js + Express
- **Database**: Google Sheets API
- **Authentication**: JWT tokens
- **Real-time sync**: Server-Sent Events (SSE)

## Environment Variables

All sensitive data is stored in Google Secret Manager:
- `GOOGLE_PRIVATE_KEY`: Service account key
- `JWT_SECRET`: JWT signing secret

Non-sensitive config is set directly:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Service account email
- `GOOGLE_SPREADSHEET_ID`: Your Google Sheet ID
- `NODE_ENV`: production
- `PORT`: 3000

## Accessing Your App

After deployment, you'll get a URL like:
```
https://pms-taskflow-xxxxx-xxxxx.run.app
```

This URL:
- Works on any device (desktop, mobile, tablet)
- Requires no local server
- Is accessible 24/7
- Supports multiple simultaneous users

## Database Independence

Your data is stored in Google Sheets, which means:
- No local database dependency
- Accessible from Google Sheets interface
- Automatic backups by Google
- Can be shared with team members
- Exportable to other formats

## Scaling

The current configuration:
- **Min instances**: 1 (always available)
- **Max instances**: 10 (auto-scales with traffic)
- **CPU**: 1 vCPU with boost
- **Memory**: 512Mi
- **Concurrency**: 80 requests per instance

## Cost

Google Cloud Run pricing:
- Free tier: 2 million requests per month
- Beyond free tier: ~$0.40 per million requests
- Storage: Minimal (Docker images)
- Database: Free (Google Sheets)

## Monitoring

View logs:
```bash
gcloud logging tail "projects/$PROJECT_ID/logs/cloudrun.googleapis.com%2Frun"
```

Check service status:
```bash
gcloud run services describe pms-taskflow --region=us-central1
```

## Troubleshooting

### Service not responding
```bash
gcloud run services update pms-taskflow --region=us-central1 --max-instances=10
```

### Check logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pms-taskflow" --limit 50
```

### Redeploy
```bash
./deploy-cloud.sh
```

## Security

- ✅ Authentication required for all operations
- ✅ Secrets stored in Google Secret Manager
- ✅ HTTPS only
- ✅ Rate limiting enabled
- ✅ CORS configured for production

## Backup & Recovery

Your data is automatically backed up:
- Google Sheets version history
- Google Cloud retention policies
- Can export to Excel/CSV anytime
- Service account has backup access

## Team Access

To give team members access:
1. Share the Cloud Run URL
2. Add them to your Google Sheet
3. They can use the app immediately
4. No additional setup required

## Maintenance

The app requires minimal maintenance:
- Automatic scaling
- No server management
- Google handles infrastructure
- Updates via redeployment script
- Monitoring via Google Cloud Console

## Support

If issues occur:
1. Check Cloud Run logs
2. Verify Google Sheets access
3. Ensure service account permissions
4. Redeploy if needed
5. Check Google Cloud status page
