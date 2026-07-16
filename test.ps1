# ===== Confirmed values (real project, not pms-taskflow) =====
$PROJECT_ID = "project-4d15c10f-d947-4431-b51"
$SERVICE_NAME = "pms-taskflow"
$REGION = "us-central1"
# =============================

Write-Host "`n===== 1. Cloud Run service config (env vars, secrets, service account) =====" -ForegroundColor Cyan
gcloud run services describe $SERVICE_NAME `
  --project $PROJECT_ID `
  --region $REGION `
  --format="yaml(spec.template.spec.containers[0].env, spec.template.spec.serviceAccountName)"

Write-Host "`n===== 2. Attached service account details =====" -ForegroundColor Cyan
$SA = gcloud run services describe $SERVICE_NAME `
  --project $PROJECT_ID --region $REGION `
  --format="value(spec.template.spec.serviceAccountName)"
Write-Host "Service account: $SA"

Write-Host "`n===== 3. IAM roles bound to that service account =====" -ForegroundColor Cyan
gcloud projects get-iam-policy $PROJECT_ID `
  --flatten="bindings[].members" `
  --filter="bindings.members:$SA" `
  --format="table(bindings.role)"

Write-Host "`n===== 4. Is the Gmail API enabled? =====" -ForegroundColor Cyan
gcloud services list --project $PROJECT_ID --filter="config.name:gmail.googleapis.com" --format="table(config.name, state)"

Write-Host "`n===== 5. Is IAM Service Account Credentials API enabled? (needed for domain-wide delegation / impersonation) =====" -ForegroundColor Cyan
gcloud services list --project $PROJECT_ID --filter="config.name:iamcredentials.googleapis.com" --format="table(config.name, state)"

Write-Host "`n===== 6. Recent logs mentioning email/auth failures (last 6 hours) =====" -ForegroundColor Cyan
gcloud logging read `
  "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME AND (textPayload:(email OR smtp OR gmail OR oauth OR invalid_grant OR unauthorized OR 403 OR 401 OR credentials) OR jsonPayload.message:(email OR smtp OR gmail OR oauth OR invalid_grant OR credentials))" `
  --project $PROJECT_ID `
  --freshness=6h `
  --limit=100 `
  --format="table(timestamp, severity, textPayload, jsonPayload.message)" `
  --order=asc

Write-Host "`n===== 7. Latest revision status (is it even healthy?) =====" -ForegroundColor Cyan
gcloud run revisions list --project $PROJECT_ID --region $REGION --service $SERVICE_NAME --limit=3 `
  --format="table(metadata.name, status.conditions[0].type, status.conditions[0].status, status.conditions[0].message)"

Write-Host "`n===== 8. Secret Manager secrets referenced by the service (names only) =====" -ForegroundColor Cyan
gcloud run services describe $SERVICE_NAME `
  --project $PROJECT_ID --region $REGION `
  --format="yaml(spec.template.spec.containers[0].env)" | Select-String "secretKeyRef" -Context 2,2

Write-Host "`n===== 9. Overall service status/conditions (why the X?) =====" -ForegroundColor Cyan
gcloud run services describe $SERVICE_NAME `
  --project $PROJECT_ID --region $REGION `
  --format="yaml(status.conditions)"