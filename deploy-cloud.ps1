# Deploy PMS TaskFlow to Google Cloud Run
# Windows PowerShell version

$PROJECT_ID = "556944241861"
$REGION = "us-central1"
$SERVICE_NAME = "pms-taskflow"

Write-Host "Deploying PMS TaskFlow to Google Cloud Run..." -ForegroundColor Green
Write-Host "This will make the app work independently of your local device" -ForegroundColor Yellow

# Build and push Docker image
Write-Host "Building Docker image with optimizations..." -ForegroundColor Cyan
gcloud builds submit --config cloudbuild.yaml

# Get the service URL
Write-Host "Getting service URL..." -ForegroundColor Cyan
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)'

Write-Host "Deployment successful!" -ForegroundColor Green
Write-Host "Your app is now available at: $SERVICE_URL" -ForegroundColor Cyan
Write-Host "The app will work on any device, even when your device is powered off" -ForegroundColor Yellow
Write-Host "Database: Google Sheets (cloud-based)" -ForegroundColor Yellow
Write-Host "Real-time sync via Server-Sent Events" -ForegroundColor Yellow

# Make the service publicly accessible
Write-Host "Ensuring public access..." -ForegroundColor Cyan
gcloud run services update $SERVICE_NAME --region=$REGION --allow-unauthenticated

Write-Host "Configuration complete!" -ForegroundColor Green
Write-Host "Your PMS TaskFlow is now fully cloud-hosted and independent!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Share this URL with your team: $SERVICE_URL" -ForegroundColor White
Write-Host "2. The app works 24/7 regardless of your device status" -ForegroundColor White
Write-Host "3. All data is stored in Google Sheets (accessible from anywhere)" -ForegroundColor White
Write-Host "4. No local server or database dependency" -ForegroundColor White
