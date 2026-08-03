$PROJECT = "project-4d15c10f-d947-4431-b51"
$token = (gcloud auth print-access-token)
$headers = @{ "Authorization" = "Bearer $token" }

# Fetch team_report_config
$url = "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/team_report_config"
$configs = Invoke-RestMethod -Uri $url -Headers $headers -Method Get

Write-Host "=== team_report_config ===" -ForegroundColor Cyan
$configs.documents | ForEach-Object {
    $d = $_.fields
    $name = $_.name -replace ".*/",""
    [PSCustomObject]@{
        Doc         = $name
        teamName    = $d.teamName.stringValue
        reminderDay = $d.reminderDay.stringValue
        meetingDay  = $d.meetingDay.stringValue
        timezone    = $d.timezone.stringValue
        reminderTime = $d.reminderTime.stringValue
        active      = $d.active.booleanValue
        entityType  = $d.entityType.stringValue
    }
} | Format-Table -AutoSize

# Fetch today's sent log
$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
Write-Host "`n=== report_reminder_sent_log for today ($today) ===" -ForegroundColor Cyan
$sentUrl = "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/report_reminder_sent_log"
$sentLogs = Invoke-RestMethod -Uri $sentUrl -Headers $headers -Method Get
if ($sentLogs.documents) {
    $sentLogs.documents | Where-Object {
        $_.name -like "*$today*"
    } | ForEach-Object {
        $d = $_.fields
        $name = $_.name -replace ".*/",""
        [PSCustomObject]@{
            Doc       = $name
            teamId    = $d.teamId.stringValue
            date      = $d.date.stringValue
            status    = $d.status.stringValue
            claimedAt = $d.claimedAt.stringValue
            sentAt    = $d.sentAt.stringValue
        }
    } | Format-Table -AutoSize
} else {
    Write-Host "No sent log entries found for today"
}

# Also fetch Settings from Firestore (email_enabled_scheduled_reports)
Write-Host "`n=== Firestore settings/email_enabled_scheduled_reports ===" -ForegroundColor Cyan
$settingUrl = "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/settings/email_enabled_scheduled_reports"
try {
    $setting = Invoke-RestMethod -Uri $settingUrl -Headers $headers -Method Get
    $setting.fields | ConvertTo-Json
} catch {
    Write-Host "Setting not found (defaults to enabled)"
}
