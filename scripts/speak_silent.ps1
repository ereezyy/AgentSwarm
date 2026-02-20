# scripts/speak_silent.ps1
param([string]$filePath)

try {
    $player = New-Object System.Media.SoundPlayer
    $player.SoundLocation = $filePath
    $player.PlaySync() # PlaySync waits for completion, Play() is background
}
catch {
    Write-Error "Failed to play audio: $_"
}
