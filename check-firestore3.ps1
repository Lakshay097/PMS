$PROJECT = "pms-taskflow-aa254"
$token = (gcloud auth print-access-token)
$headers = @{ "Authorization" = "Bearer $token" }
$today = "2026-08-03"

Write-Host "=== report_reminder_sent_log for TODAY ($today) ===" -ForegroundColor Cyan
$sentUrl = "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/report_reminder_sent_log"
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
        }
    } | Format-Table -AutoSize
} else {
    Write-Host "No entries for today - all Monday teams are eligible to receive reminders"
}
