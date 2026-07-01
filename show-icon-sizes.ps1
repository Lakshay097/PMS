<#
show-icon-sizes.ps1
Prints the full multi-line JSX block for each icon usage found in the
Tasks-related files, so we can see the actual size classes/props applied
(e.g. w-8 h-8 vs w-4 h-4) instead of just knowing "sized" vs "unsized".

Usage:
  .\show-icon-sizes.ps1
#>

param(
    [string[]]$Targets = @(
        "src\components\features\tasks\TaskFilters.tsx",
        "src\components\features\tasks\TaskList.tsx",
        "src\components\tasks\TasksList.tsx",
        "src\components\shared\MultiselectDropdown.tsx",
        "src\components\AdminPanel.tsx"
    ),
    [string[]]$IconNames = @("Trash2", "Trash", "Filter", "ChevronDown")
)

foreach ($rel in $Targets) {
    $path = Resolve-Path -Path $rel -ErrorAction SilentlyContinue
    if (-not $path) {
        Write-Host "SKIP (not found): $rel" -ForegroundColor Yellow
        continue
    }

    $lines = Get-Content -Path $path
    Write-Host "`n==================================================" -ForegroundColor Cyan
    Write-Host " $rel" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan

    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($icon in $IconNames) {
            if ($lines[$i] -match "<$icon\b") {
                $start = $i
                # Grab up to 4 lines forward in case the JSX tag spans multiple lines (props on separate lines)
                $end = [Math]::Min($i + 4, $lines.Count - 1)
                Write-Host "`n--- Line $($start + 1): <$icon> ---" -ForegroundColor Green
                for ($j = $start; $j -le $end; $j++) {
                    Write-Host ("{0,4}: {1}" -f ($j + 1), $lines[$j])
                    # Stop early if we hit the closing of the tag
                    if ($lines[$j] -match '/>|>\s*$') { break }
                }
            }
        }
    }
}