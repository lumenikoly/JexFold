[CmdletBinding()]
param(
    [string]$Executable = "target/release/jexfold.exe",
    [string]$OutputDirectory = "target/release/bundle/portable"
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq "Core") {
    throw "The portable package is currently supported only on Windows."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
$executablePath = Join-Path $projectRoot $Executable
$codecsPath = Join-Path $projectRoot "src-tauri/resources/codecs"
$outputPath = Join-Path $projectRoot $OutputDirectory
$stagingPath = Join-Path $outputPath "JexFold"

if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Desktop executable was not found: $executablePath"
}

$requiredCodecs = @("cjxl.exe", "djxl.exe")
foreach ($codec in $requiredCodecs) {
    if (-not (Test-Path -LiteralPath (Join-Path $codecsPath $codec) -PathType Leaf)) {
        throw "Required codec was not found: $codec. Run pnpm run codecs:build first."
    }
}

$architecture = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "x64" }
    "ARM64" { "arm64" }
    default { $env:PROCESSOR_ARCHITECTURE.ToLowerInvariant() }
}
$archiveName = "JexFold_$($package.version)_windows_${architecture}_portable.zip"
$archivePath = Join-Path $outputPath $archiveName

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
if (Test-Path -LiteralPath $stagingPath) {
    Remove-Item -LiteralPath $stagingPath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stagingPath "codecs") | Out-Null

Copy-Item -LiteralPath $executablePath -Destination (Join-Path $stagingPath "JexFold.exe")
Copy-Item -Path (Join-Path $codecsPath "*") -Destination (Join-Path $stagingPath "codecs") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination $stagingPath
Copy-Item -LiteralPath (Join-Path $projectRoot "THIRD_PARTY.md") -Destination $stagingPath

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
Compress-Archive -LiteralPath $stagingPath -DestinationPath $archivePath -CompressionLevel Optimal
Remove-Item -LiteralPath $stagingPath -Recurse -Force

Write-Host "Portable package created: $archivePath"
