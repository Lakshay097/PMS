<#
fix-icon-sizes.ps1
Fixes the oversized icon bug: `sm:size-16` is a Tailwind spacing-scale class
(size-16 = 4rem = 64px), not a pixel value. It overrides the `size={14}` /
`size={16}` prop at the sm breakpoint (>=640px), which is why icons balloon
to 64px on desktop. This replaces sm:size-16 -> sm:size-4 (1rem = 16px)
and sm:size-14 -> sm:size-3.5 (0.875rem = 14px) to match the intended prop sizes.

Usage:
  .\fix-icon-sizes.ps1            # preview changes (dry run)
  .\fix-icon-sizes.ps1 -Apply     # actually write changes
#>

param(
    [switch]$Apply
)

$targets = @(
    "src\components\features\tasks\TaskFilters.tsx",
    "src\components\features\tasks\TaskList.tsx"
)

$replacements = @(
    @{ Old = 'sm:size-16'; New = 'sm:size-4' },
    @{ Old = 'sm:size-14'; New = 'sm:size-3.5' }
)

foreach ($rel in $targets) {
    $path = Resolve-Path -Path $rel -ErrorAction SilentlyContinue
    if (-not $path) {
        Write-Host "SKIP (not found): $rel" -ForegroundColor Yellow
        continue
    }

    $content = Get-Content -Path $path -Raw
    $original = $content
    $changed = $false

    foreach ($r in $replacements) {
        if ($content -match [regex]::Escape($r.Old)) {
            $content = $content -replace [regex]::Escape($r.Old), $r.New
            $changed = $true
        }
    }

    if ($changed) {
        Write-Host "`n--- $rel ---" -ForegroundColor Cyan
        $diffLines = Compare-Object (Get-Content $path) ($content -split "`r?`n")
        $diffLines | ForEach-Object {
            $marker = if ($_.SideIndicator -eq "=>") { "+" } else { "-" }
            $color = if ($_.SideIndicator -eq "=>") { "Green" } else { "Red" }
            Write-Host "$marker $($_.InputObject)" -ForegroundColor $color
        }

        if ($Apply) {
            Set-Content -Path $path -Value $content -NoNewline
            Write-Host "Applied." -ForegroundColor Green
        } else {
            Write-Host "(dry run - use -Apply to write changes)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "No changes needed: $rel" -ForegroundColor DarkGray
    }
}