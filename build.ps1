# Build script: creates a clean .zip package for Chrome Web Store upload.
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Stop"

$root     = $PSScriptRoot
$manifest = Get-Content "$root\manifest.json" | ConvertFrom-Json
$version  = $manifest.version
$outName  = "more-export-for-gemini-v$version.zip"
$outPath  = Join-Path $root "store\$outName"

if (Test-Path $outPath) { Remove-Item $outPath -Force }

# Derive the packaged file list straight from manifest.json so it can never
# drift out of sync with the actual content scripts / background worker.
$cs = $manifest.content_scripts[0]
$include = @(
    "manifest.json",
    "icons\icon16.png",
    "icons\icon48.png",
    "icons\icon128.png",
    $manifest.background.service_worker
)
$include += $cs.js
$include += $cs.css
$include += @(
    # Shared by the popup and options pages via <script>, but NOT a content
    # script — so it isn't covered by $cs.js and must be listed explicitly.
    "src\lib\links.js",
    "src\popup\popup.html",
    "src\popup\popup.css",
    "src\popup\popup.js",
    "src\options\options.html",
    "src\options\options.css",
    "src\options\options.js"
)

$tempDir = Join-Path $env:TEMP "gep-build-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir | Out-Null

foreach ($file in $include) {
    $src  = Join-Path $root $file
    $dest = Join-Path $tempDir $file
    $dir  = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item $src $dest
}

Compress-Archive -Path "$tempDir\*" -DestinationPath $outPath -Force
Remove-Item $tempDir -Recurse -Force

$size = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
Write-Host ""
Write-Host "  Package built: store\$outName ($size KB)" -ForegroundColor Green
Write-Host "  Files included: $($include.Count)" -ForegroundColor DarkGray
Write-Host ""
