param(
    [string]$Root = "C:\Users\winha\Documents\Imagus-Reborn",
    [string]$OutFile = "C:\Users\winha\Documents\Imagus-Reborn\new_code.txt",
    [int]$MaxBytes = 1MB
)

# Exclusions
$excludeDirs = @("node_modules","build", ".git", "data", "_locales", "dist", "old")
$excludeFiles = @("new_code.txt","old_code.txt","llm_export_new.txt","app.js", "export_for_llms.ps1", "llm_export.txt", "LLM_AGENT_OVERVIEW.md", "package.json", "package-lock.json", ".gitignore")

# Prepare output
if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
"Project export generated: $(Get-Date -Format o)" | Out-File -FilePath $OutFile -Encoding utf8
"Root: $Root`n" | Out-File -FilePath $OutFile -Append -Encoding utf8

"--- FILE LIST ---" | Out-File -FilePath $OutFile -Append -Encoding utf8

# Gather files, applying exclusions
$files = Get-ChildItem -Path $Root -Recurse -File -Force |
    Where-Object {
        $full = $_.FullName
        foreach ($d in $excludeDirs) {
            if ($full -like "*\$d\*") { return $false }
        }
        if ($excludeFiles -contains $_.Name) { return $false }
        return $true
    } | Sort-Object FullName

# Write file list
foreach ($f in $files) {
    $rel = $f.FullName.Substring($Root.Length).TrimStart('\','/')
    $rel | Out-File -FilePath $OutFile -Append -Encoding utf8
}

"`n--- FILE CONTENTS ---`n" | Out-File -FilePath $OutFile -Append -Encoding utf8

# Dump each file with header, skip large/binary files
foreach ($f in $files) {
    $rel = $f.FullName.Substring($Root.Length).TrimStart('\','/')
    "----- BEGIN FILE: $rel -----" | Out-File -FilePath $OutFile -Append -Encoding utf8

    if ($f.Length -gt $MaxBytes) {
        "SKIPPED: file size $($f.Length) bytes exceeds $MaxBytes bytes limit." | Out-File -FilePath $OutFile -Append -Encoding utf8
    } else {
        try {
            $text = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop
            # If file contains NUL bytes it's likely binary; detect and skip
            if ($text -match "`0") {
                "SKIPPED: binary or contains NUL bytes." | Out-File -FilePath $OutFile -Append -Encoding utf8
            } else {
                $text | Out-File -FilePath $OutFile -Append -Encoding utf8
            }
        } catch {
            "SKIPPED: unable to read file: $($_.Exception.Message)" | Out-File -FilePath $OutFile -Append -Encoding utf8
        }
    }

    "----- END FILE: $rel -----`n" | Out-File -FilePath $OutFile -Append -Encoding utf8
}

"Export complete. Files written to $OutFile" | Out-File -FilePath $OutFile -Append -Encoding utf8
Write-Output "Export complete. Files written to $OutFile"