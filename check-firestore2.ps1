# Firebase project is pms-taskflow-aa254 (from Cloud Run env FIREBASE_PROJECT_ID)
$PROJECT = "pms-taskflow-aa254"
$token = (gcloud auth print-access-token)
$headers = @{ "Authorization" = "Bearer $token" }

Write-Host "=== team_report_config ===" -ForegroundColor Cyan
$url = "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/team_report_config"
$configs = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop

$configs.documents | ForEach-Object {
    $d = $_.fields
    $name = $_.name -replace ".*/",""
    [PSCustomObject]@{
        teamId      = $name
        teamName    = $d.teamName.stringValue
        reminderDay = $d.reminderDay.stringValue
        meetingDay  = $d.meetingDay.stringValue
        timezone    = $d.timezone.stringValue
        reminderTime = $d.reminderTime.stringValue
        active      = $d.active.booleanValue
        entityType  = $d.entityType.stringValue
    }
} | Format-Table -AutoSize

$today = (Get-Date -AsUTC).ToString("yyyy-MM-dd")
Write-Host "`n=== report_reminder_sent_log for today ($today) ===" -ForegroundColor Cyan
$sentUrl = "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/report_reminder_sent_log"
try {
    $sentLogs = Invoke-RestMethod -Uri $sentUrl -Headers $headers -Method Get -ErrorAction Stop
    $todayDocs = $sentLogs.documents | Where-Object { $_.name -like "*$today*" }
    if ($todayDocs) {
        $todayDocs | ForEach-Object {
            $d = $_.fields
            $name = $_.name -replace ".*/",""
            [PSCustomObject]@{
                Doc       = $name
                teamId    = $d.teamId.stringValue
                status    = $d.status.stringValue
                claimedAt = $d.claimedAt.stringValue
                sentAt    = $d.sentAt.stringValue
            }
        } | Format-Table -AutoSize
    } else {
        Write-Host "No sent log entries for today - all teams eligible"
    }
} catch {
    Write-Host "No sent log collection or empty - all teams eligible"
}

Write-Host "`n=== Firestore: email_enabled_scheduled_reports ===" -ForegroundColor Cyan
$settingUrl = "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/settings/email_enabled_scheduled_reports"
try {
    $setting = Invoke-RestMethod -Uri $settingUrl -Headers $headers -Method Get -ErrorAction Stop
    $val = $setting.fields.Value.stringValue
    Write-Host "Value: $val -> $(if($val -eq 'true'){'ENABLED'}else{'DISABLED'})"
} catch {
    Write-Host "Setting not found (defaults to ENABLED)"
}
