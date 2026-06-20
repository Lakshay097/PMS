# Google Cloud Run Deployment Guide

## Prerequisites

1. **Google Cloud Account** - Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
2. **Google Cloud SDK** - Install the gcloud CLI: [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
3. **Docker** - Install Docker Desktop: [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)

## Step 1: Set Up Google Cloud Project

```bash
# Initialize gcloud (if not already done)
gcloud init

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

## Step 2: Create Artifact Registry Repository

```bash
# Create a Docker repository
gcloud artifacts repositories create PMS-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="TrustGrid TaskFlow Docker repository"

# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev
```

## Step 3: Build and Push Docker Image

```bash
# Build the Docker image
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/PMS-repo/PMS-taskflow:latest .

# Push the image to Artifact Registry
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/PMS-repo/PMS-taskflow:latest
```

## Step 4: Deploy to Cloud Run (Free Tier Optimized)

```bash
# Deploy the service with free tier optimized settings
gcloud run deploy PMS-taskflow \
    --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/PMS-repo/PMS-taskflow:latest \
    --platform=managed \
    --region=us-central1 \
    --allow-unauthenticated \
    --port=3000 \
    --memory=512Mi \
    --cpu=0.5 \
    --max-instances=10 \
    --min-instances=0 \
    --timeout=300 \
    --concurrency=80 \
    --cpu-boost
```

## Step 5: Set Environment Variables

```bash
# Get your service URL
SERVICE_URL=$(gcloud run services describe PMS-taskflow \
    --platform=managed \
    --region=us-central1 \
    --format="value(status.url)")

# Set environment variables
gcloud run services update PMS-taskflow \
    --platform=managed \
    --region=us-central1 \
    --set-env-vars="NODE_ENV=production" \
    --set-env-vars="PORT=3000" \
    --set-env-vars="APP_URL=$SERVICE_URL" \
    --set-env-vars="GEMINI_API_KEY=your_gemini_api_key" \
    --set-env-vars="GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email" \
    --set-env-vars="GOOGLE_PRIVATE_KEY=your_private_key" \
    --set-env-vars="GOOGLE_SPREADSHEET_ID=your_spreadsheet_id"
```

**Important:** Replace the placeholder values with your actual API keys and configuration.

## Step 6: Verify Deployment

```bash
# Check service status
gcloud run services describe PMS-taskflow \
    --platform=managed \
    --region=us-central1

# Get the service URL
gcloud run services describe PMS-taskflow \
    --platform=managed \
    --region=us-central1 \
    --format="value(status.url)"
```

## Environment Variables Reference

Create these in Google Cloud Console or via CLI:

- **NODE_ENV**: `production`
- **PORT**: `3000`
- **APP_URL**: Your Cloud Run service URL
- **GEMINI_API_KEY**: Your Google Gemini API key
- **GOOGLE_SERVICE_ACCOUNT_EMAIL**: Your Google Service Account email
- **GOOGLE_PRIVATE_KEY**: Your Google Service Account private key (use `\n` for line breaks)
- **GOOGLE_SPREADSHEET_ID**: Your Google Spreadsheet ID (optional)

## Alternative: Automated Deployment with Cloud Build

Create `cloudbuild.yaml` (free tier optimized):

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'us-central1-docker.pkg.dev/$PROJECT_ID/PMS-repo/PMS-taskflow:latest', '.']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/$PROJECT_ID/PMS-repo/PMS-taskflow:latest']

  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'PMS-taskflow'
      - '--image=us-central1-docker.pkg.dev/$PROJECT_ID/PMS-repo/PMS-taskflow:latest'
      - '--platform=managed'
      - '--region=us-central1'
      - '--allow-unauthenticated'
      - '--port=3000'
      - '--memory=512Mi'
      - '--cpu=0.5'
      - '--max-instances=10'
      - '--min-instances=0'
      - '--timeout=300'
      - '--concurrency=80'
      - '--cpu-boost'
```

Deploy with Cloud Build:

```bash
gcloud builds submit --config cloudbuild.yaml
```

## Cost Optimization (Free Tier)

Cloud Run free tier includes:
- **2 million requests per month**
- **200,000 GB-seconds of CPU time**
- **1 GB of network egress per month**

Your free tier optimized configuration:
- **Memory**: 512Mi (minimum recommended, stays within free tier)
- **CPU**: 0.5 vCPU (reduced from 1 for free tier optimization)
- **Min instances**: 0 (scales to zero when not in use - no cost when idle)
- **Max instances**: 10 (auto-scales with traffic)
- **Concurrency**: 80 (handles more requests per instance)
- **CPU boost**: Enabled (better performance during traffic spikes)

**Estimated monthly cost for typical usage:**
- With 0-1000 requests/day: $0 (within free tier)
- With 10,000 requests/day: ~$2-5 (if exceeding free tier)
- With 100,000 requests/day: ~$20-50 (if exceeding free tier)

**Tips to stay within free tier:**
- Keep min-instances at 0 to scale to zero when idle
- Use 0.5 vCPU instead of 1 vCPU
- Monitor usage in Google Cloud Console
- Set up budget alerts to avoid unexpected charges

## Troubleshooting

**Build fails:**
```bash
# Check build logs
gcloud builds log BUILD_ID
```

**Deployment fails:**
```bash
# Check service logs
gcloud run services logs PMS-taskflow --platform=managed --region=us-central1
```

**Environment variables not working:**
- Ensure private key uses `\n` for line breaks, not actual newlines
- Verify all required variables are set
- Check Cloud Run service configuration in console

## Next Steps

1. Set up continuous deployment from GitHub
2. Configure custom domain (optional)
3. Set up monitoring and alerting
4. Configure Firebase for production environment
