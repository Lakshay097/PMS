#!/bin/bash

# Setup Cloud Scheduler job for report reminders
# This script creates the Cloud Scheduler job that triggers daily report reminder checks at 9AM IST.
# The actual send logic filters by each team's configured reminderDay, reminderTime, and timezone
# (stored in Firestore team_report_config), so running daily covers all teams on any day.

set -e

PROJECT_ID="project-4d15c10f-d947-4431-b51"
REGION="us-central1"
SERVICE_NAME="pms-taskflow"
SERVICE_URL="https://pms-taskflow-556944241861.us-central1.run.app"
SCHEDULER_SERVICE_ACCOUNT="pms-scheduler-sa@project-4d15c10f-d947-4431-b51.iam.gserviceaccount.com"
JOB_NAME="weekly-report-reminders"

echo "🔧 Setting up Cloud Scheduler job for weekly report reminders..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo "Scheduler SA: $SCHEDULER_SERVICE_ACCOUNT"
echo ""

# Check if the job already exists
echo "🔍 Checking if scheduler job already exists..."
if gcloud scheduler jobs describe $JOB_NAME --location=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    echo "⚠️  Job '$JOB_NAME' already exists. Deleting it first..."
    gcloud scheduler jobs delete $JOB_NAME --location=$REGION --project=$PROJECT_ID --quiet
    echo "✅ Old job deleted"
fi

# Create the Cloud Scheduler job
echo "📅 Creating Cloud Scheduler job..."
gcloud scheduler jobs create http $JOB_NAME \
    --location=$REGION \
    --project=$PROJECT_ID \
    --schedule="0 9 * * *" \
    --time-zone="Asia/Kolkata" \
    --uri="$SERVICE_URL/api/internal/run-weekly-reminders" \
    --http-method=POST \
    --oidc-service-account-email="$SCHEDULER_SERVICE_ACCOUNT" \
    --oidc-token-audience="$SERVICE_URL" \
    --description="Daily report reminder check for PMS teams at 9AM IST (per-team day/time/timezone filter applied server-side)"

echo "✅ Cloud Scheduler job created successfully!"
echo ""
echo "📋 Job Details:"
echo "  Name: $JOB_NAME"
echo "  Schedule: Daily at 9AM IST (0 9 * * *) — per-team day/time/timezone filter applied server-side"
echo "  Timezone: Asia/Kolkata"
echo "  Endpoint: $SERVICE_URL/api/internal/run-weekly-reminders"
echo "  Method: POST"
echo "  Auth: OIDC with service account $SCHEDULER_SERVICE_ACCOUNT"
echo ""

# Test the job immediately
echo "🧪 Would you like to test the job now? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "🚀 Running the job manually..."
    gcloud scheduler jobs run $JOB_NAME --location=$REGION --project=$PROJECT_ID
    echo "✅ Job triggered! Check Cloud Run logs for results."
else
    echo "⏭️  Skipping test. You can run it manually with:"
    echo "   gcloud scheduler jobs run $JOB_NAME --location=$REGION --project=$PROJECT_ID"
fi

echo ""
echo "🎉 Cloud Scheduler setup complete!"
echo "📌 Next steps:"
echo "1. Monitor job runs: gcloud scheduler jobs describe $JOB_NAME --location=$REGION --project=$PROJECT_ID"
echo "2. View job history: gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID"
echo "3. Check Cloud Run logs: gcloud logging tail 'resource.type=cloud_run_revision'"
