<#
check-icons.ps1
Scans a frontend project for icon usages (Filter, Trash2, svg tags) that
may be missing explicit width/height/className sizing — the likely cause
of oversized icons in the Tasks tab.

Usage:
  cd path\to\your\project
  .\check-icons.ps1
#>

param(
    [string]$RootPath = ".",
    [string[]]$IconNames = @("Trash2", "Trash", "Filter", "ChevronDown")
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Icon Size Audit" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# File types to scan
$extensions = @("*.jsx", "*.tsx", "*.js", "*.ts", "*.html", "*.vue")

# Collect matching files, skipping node_modules/dist/build
$files = Get-ChildItem -Path $RootPath -Recurse -Include $extensions -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\build\\|\.next\\' }

if (-not $files) {
    Write-Host "No matching source files found under '$RootPath'." -ForegroundColor Yellow
    exit
}

Write-Host "`nScanning $($files.Count) files...`n" -ForegroundColor DarkGray

$results = @()

foreach ($file in $files) {
    $lines = Get-Content -Path $file.FullName -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]

        foreach ($icon in $IconNames) {
            if ($line -match "<$icon\b") {
                $hasSizeClass = $line -match 'className\s*=\s*"[^"]*\b(w-\d+|h-\d+|size-\d+)\b'
                $hasSizeProp  = $line -match '\bsize\s*=\s*\{?\d+\}?'
                $hasInlineStyle = $line -match 'width\s*:\s*\d+' -or $line -match 'height\s*:\s*\d+'

                $status = if ($hasSizeClass -or $hasSizeProp -or $hasInlineStyle) {
                    "OK - sized"
                } else {
                    "MISSING SIZE"
                }

                $results += [PSCustomObject]@{
                    File   = $file.FullName.Replace((Resolve-Path $RootPath).Path, ".")
                    Line   = $i + 1
                    Icon   = $icon
                    Status = $status
                    Code   = $line.Trim()
                }
            }
        }
    }

    # Also flag raw <svg> tags with no width/height/viewBox-based sizing
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match '<svg\b' -and $line -notmatch 'width\s*=|className\s*=\s*"[^"]*\b(w-\d+|h-\d+)\b') {
            $results += [PSCustomObject]@{
                File   = $file.FullName.Replace((Resolve-Path $RootPath).Path, ".")
                Line   = $i + 1
                Icon   = "<svg>"
                Status = "MISSING SIZE"
                Code   = $line.Trim()
            }
        }
    }
}

if ($results.Count -eq 0) {
    Write-Host "No icon usages found matching: $($IconNames -join ', ')" -ForegroundColor Yellow
    exit
}

# Print missing-size issues first (the likely culprits)
$missing = $results | Where-Object { $_.Status -eq "MISSING SIZE" }
$ok      = $results | Where-Object { $_.Status -eq "OK - sized" }

Write-Host "---- Icons WITHOUT explicit size (likely oversized) ----" -ForegroundColor Red
if ($missing.Count -eq 0) {
    Write-Host "  None found." -ForegroundColor Green
} else {
    $missing | ForEach-Object {
        Write-Host "`n[$($_.Icon)] $($_.File):$($_.Line)" -ForegroundColor Red
        Write-Host "  $($_.Code)" -ForegroundColor DarkGray
    }
}

Write-Host "`n---- Icons WITH explicit size (probably fine) ----" -ForegroundColor Green
if ($ok.Count -eq 0) {
    Write-Host "  None found." -ForegroundColor Yellow
} else {
    $ok | ForEach-Object {
        Write-Host "[$($_.Icon)] $($_.File):$($_.Line)" -ForegroundColor DarkGray
    }
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host " Summary: $($missing.Count) unsized icon(s), $($ok.Count) sized icon(s)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Export full results to CSV for review
$csvPath = Join-Path $RootPath "icon-audit-results.csv"
$results | Export-Csv -Path $csvPath -NoTypeInformation
Write-Host "`nFull results exported to: $csvPath" -ForegroundColor Cyan