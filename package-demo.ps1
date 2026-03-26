# Zip the full artauctiondemo project for sharing or backup.
#
# Default: entire source tree (keeps server\data, server\uploads), excludes node_modules + .git + .cursor,
#          and adds one root folder "artauctiondemo" inside the zip.
#
#   powershell -ExecutionPolicy Bypass -File .\package-demo.ps1
#   powershell -ExecutionPolicy Bypass -File .\package-demo.ps1 -WithNodeModules    # huge; runnable without npm install
#   powershell -ExecutionPolicy Bypass -File .\package-demo.ps1 -StripLocalData     # omit DB + uploaded images
#   powershell -ExecutionPolicy Bypass -File .\package-demo.ps1 -OutPath "D:\Exports\artauctiondemo.zip"
#
# Output default: .\artauctiondemo.zip (next to this script)

param(
  [string] $OutPath = "",
  [switch] $WithNodeModules = $false,
  [switch] $StripLocalData = $false
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $OutPath) {
  $OutPath = Join-Path $root "artauctiondemo.zip"
}

$temp = Join-Path $env:TEMP ("momas-pack-" + [guid]::NewGuid().ToString("n"))
$inner = Join-Path $temp "artauctiondemo"
New-Item -ItemType Directory -Path $inner -Force | Out-Null

$excludeDirs = @('.git', '.cursor')
if (-not $WithNodeModules) {
  $excludeDirs += 'node_modules'
}

Write-Host "Copying project into staging..."
Write-Host "  From: $root"
Write-Host "  Exclude dirs: $($excludeDirs -join ', ')"
$rcArgs = @($root, $inner, '/E', '/NFL', '/NDL', '/NJH', '/NJS')
foreach ($d in $excludeDirs) {
  $rcArgs += '/XD'
  $rcArgs += $d
}
# Do not pack loose .zip files from the repo into the archive (e.g. old exports)
$rcArgs += '/XF'
$rcArgs += '*.zip'

& robocopy @rcArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

if ($StripLocalData) {
  Write-Host "StripLocalData: removing SQLite files and upload binaries from staging..."
  $dbDir = Join-Path $inner "server\data"
  if (Test-Path $dbDir) {
    Get-ChildItem -Path $dbDir -Filter "auction.db*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $dbDir -Filter "*.db-wal" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $dbDir -Filter "*.db-shm" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  }
  $uploads = Join-Path $inner "server\uploads"
  if (Test-Path $uploads) {
    Get-ChildItem -Path $uploads -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -ne '.gitkeep' } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  }
}

$outDir = [System.IO.Path]::GetDirectoryName($OutPath)
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
if (Test-Path $OutPath) { Remove-Item -LiteralPath $OutPath -Force }

Write-Host "Creating archive: $OutPath"
# Zip root folder is exactly "artauctiondemo" (one top-level folder when unzipped)
Compress-Archive -Path $inner -DestinationPath $OutPath -CompressionLevel Optimal

Remove-Item -Path $temp -Recurse -Force

Write-Host "Done."
Write-Host "  Zip: $OutPath"
if (-not $WithNodeModules) {
  Write-Host "  Recipients still run:  cd server`n                           npm install`n                           npm run dev"
  Write-Host "                        cd client`n                           npm install`n                           npm run dev"
}
