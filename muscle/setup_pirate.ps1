# muscle/setup_pirate.ps1 - Simplified Installer
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "🏴‍☠️ HOISTING THE COLORS: Installing Pirate Tools..." -ForegroundColor Cyan
try {
    pip install yt-dlp --upgrade
}
catch {
    Write-Error "pip failed."
}

$binDir = Join-Path $PSScriptRoot "bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir | Out-Null }

$ffmpegExe = Join-Path $binDir "ffmpeg.exe"

if (Test-Path $ffmpegExe) {
    Write-Host "FFmpeg already installed."
}
else {
    Write-Host "Downloading FFmpeg..."
    $url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    $zipPath = Join-Path $binDir "ffmpeg.zip"
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $zipPath
        Write-Host "Extracting..."
        Expand-Archive -Path $zipPath -DestinationPath $binDir -Force
        
        $extracted = Get-ChildItem -Path $binDir -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
        if ($extracted) {
            Move-Item -Path $extracted.FullName -Destination $binDir -Force
            Write-Host "FFmpeg installed successfully."
        }
        else {
            Write-Error "ffmpeg.exe not found in zip."
        }
    }
    catch {
        Write-Error "Download/Extract failed: $_"
    }
    
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Get-ChildItem -Path $binDir -Directory | Remove-Item -Recurse -Force
}
