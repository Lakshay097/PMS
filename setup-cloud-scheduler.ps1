# Setup Cloud Scheduler job for report reminders
# This script creates the Cloud Scheduler job that triggers daily report reminder checks at 9AM IST.
# The actual send logic filters by each team's configured reminderDay, reminderTime, and timezone
# (stored in Firestore team_report_config), so running daily covers all teams on any day.

$ErrorActionPreference = "Stop"

$PROJECT_ID = "project-4d15c10f-d947-4431-b51"
$REGION = "us-central1"
$SERVICE_NAME = "pms-taskflow"
$SERVICE_URL = "https://pms-taskflow-556944241861.us-central1.run.app"
$SCHEDULER_SERVICE_ACCOUNT = "pms-scheduler-sa@project-4d15c10f-d947-4431-b51.iam.gserviceaccount.com"
$JOB_NAME = "weekly-report-reminders"

Write-Host "🔧 Setting up Cloud Scheduler job for weekly report reminders..." -ForegroundColor Cyan
Write-Host "Project: $PROJECT_ID" -ForegroundColor White
Write-Host "Region: $REGION" -ForegroundColor White
Write-Host "Service: $SERVICE_NAME" -ForegroundColor White
Write-Host "Scheduler SA: $SCHEDULER_SERVICE_ACCOUNT" -ForegroundColor White
Write-Host ""

# Check if the job already exists
Write-Host "🔍 Checking if scheduler job already exists..." -ForegroundColor Yellow
$jobExists = gcloud scheduler jobs describe $JOB_NAME --location=$REGION --project=$PROJECT_ID 2>$null
if ($jobExists) {
    Write-Host "⚠️  Job '$JOB_NAME' already exists. Deleting it first..." -ForegroundColor Yellow
    gcloud scheduler jobs delete $JOB_NAME --location=$REGION --project=$PROJECT_ID --quiet
    Write-Host "✅ Old job deleted" -ForegroundColor Green
}

# Create the Cloud Scheduler job
Write-Host "📅 Creating Cloud Scheduler job..." -ForegroundColor Yellow
gcloud scheduler jobs create http $JOB_NAME `
    --location=$REGION `
    --project=$PROJECT_ID `
    --schedule="0 9 * * *" `
    --time-zone="Asia/Kolkata" `
    --uri="$SERVICE_URL/api/internal/run-weekly-reminders" `
    --http-method=POST `
    --oidc-service-account-email="$SCHEDULER_SERVICE_ACCOUNT" `
    --oidc-token-audience="$SERVICE_URL" `
    --description="Daily report reminder check for PMS teams at 9AM IST (per-team day/time/timezone filter applied server-side)"

Write-Host "✅ Cloud Scheduler job created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Job Details:" -ForegroundColor Cyan
Write-Host "  Name: $JOB_NAME" -ForegroundColor White
Write-Host "  Schedule: Daily at 9AM IST (0 9 * * *) — per-team day/time/timezone filter applied server-side" -ForegroundColor White
Write-Host "  Endpoint: $SERVICE_URL/api/internal/run-weekly-reminders" -ForegroundColor White
Write-Host "  Method: POST" -ForegroundColor White
Write-Host "  Auth: OIDC with service account $SCHEDULER_SERVICE_ACCOUNT" -ForegroundColor White
Write-Host ""

# Test the job immediately
Write-Host "🧪 Would you like to test the job now? (y/n)" -ForegroundColor Yellow
$response = Read-Host
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host "🚀 Running the job manually..." -ForegroundColor Yellow
    gcloud scheduler jobs run $JOB_NAME --location=$REGION --project=$PROJECT_ID
    Write-Host "✅ Job triggered! Check Cloud Run logs for results." -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping test. You can run it manually with:" -ForegroundColor Yellow
    Write-Host "   gcloud scheduler jobs run $JOB_NAME --location=$REGION --project=$PROJECT_ID" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎉 Cloud Scheduler setup complete!" -ForegroundColor Green
Write-Host "📌 Next steps:" -ForegroundColor Cyan
Write-Host "1. Monitor job runs: gcloud scheduler jobs describe $JOB_NAME --location=$REGION --project=$PROJECT_ID" -ForegroundColor White
Write-Host "2. View job history: gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID" -ForegroundColor White
Write-Host "3. Check Cloud Run logs: gcloud logging tail resource.type=cloud_run_revision" -ForegroundColor White
